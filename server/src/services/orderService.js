// Checkout and order lifecycle. This is the most transaction-heavy service in the app:
// placing an order touches six tables, must re-derive every price from the database
// (never trusting the client), locks stock to prevent overselling, applies any coupon,
// and clears the cart — all or nothing. The whole thing runs on ONE connection so a
// failure anywhere rolls the lot back (spec §6 & §12).
import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/httpResponse.js';
import * as orderModel from '../models/orderModel.js';
import * as cartModel from '../models/cartModel.js';
import * as couponModel from '../models/couponModel.js';
import { evaluateCoupon, computeShipping, round2, CURRENCY } from '../utils/pricing.js';

// The only forward moves the status machine accepts. Anything else is a 409, so a
// typo in the admin UI (or a malicious PATCH) can never teleport an order to
// 'delivered' or resurrect a cancelled one (docs/ARCHITECTURE.md §5).
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

// A shopper may pull the plug themselves only while the parcel is still in the shop.
const CUSTOMER_CANCELLABLE = ['pending', 'confirmed'];

// ── Public projection ──────────────────────────────────────────────────────────
function toPublicOrder(o) {
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    subtotal: money(o.subtotal),
    discountAmount: money(o.discount_amount),
    shippingFee: money(o.shipping_fee),
    totalAmount: money(o.total_amount),
    currency: CURRENCY,
    couponCode: o.coupon_code,
    paymentMethod: o.payment_method,
    delivery: {
      recipient: o.recipient,
      contactPhone: o.contact_phone,
      addressLine1: o.address_line1,
      addressLine2: o.address_line2,
      city: o.city,
      province: o.province,
      postalCode: o.postal_code,
      country: o.country,
    },
    notes: o.notes,
    itemCount: o.item_count !== undefined ? Number(o.item_count) : undefined,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

function toPublicItem(i) {
  return {
    productId: i.product_id,
    name: i.product_name,
    slug: i.slug,
    imageUrl: i.image_url,
    unitPrice: money(i.price_at_purchase),
    quantity: Number(i.quantity),
    lineTotal: money(i.line_total),
  };
}

function toPublicDetail(order, items, payment, shipment, history) {
  return {
    ...toPublicOrder(order),
    items: items.map(toPublicItem),
    payment: payment
      ? { method: payment.method, amount: money(payment.amount), currency: payment.currency,
          status: payment.status, providerRef: payment.provider_ref, paidAt: payment.paid_at }
      : null,
    shipment: shipment
      ? { carrier: shipment.carrier, trackingNumber: shipment.tracking_number,
          shippedAt: shipment.shipped_at, deliveredAt: shipment.delivered_at }
      : null,
    history: history.map((h) => ({
      fromStatus: h.from_status, toStatus: h.to_status, note: h.note,
      changedBy: h.changed_by, changedByName: h.changed_by_name, createdAt: h.created_at,
    })),
  };
}

// ── Placing an order (the checkout transaction) ─────────────────────────────────
export async function placeOrder({ userId, addressId, paymentMethod, couponCode, notes }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // The customer's persistent cart (login already merged any anonymous basket).
    const [cartRows] = await conn.query('SELECT id FROM carts WHERE user_id = ? LIMIT 1', [userId]);
    let cartId;
    if (cartRows.length) {
      cartId = cartRows[0].id;
    } else {
      const [ins] = await conn.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      cartId = ins.insertId;
    }

    // Lock the product rows behind every cart line, then re-derive price + verify
    // stock from the LIVE values. Because these rows are locked FOR UPDATE, a second
    // concurrent checkout of the same product blocks here until we commit.
    const lines = await orderModel.lockCartLinesForCheckout(conn, cartId);
    if (!lines.length) throw new ApiError(409, 'Your cart is empty.');

    let subtotal = 0;
    const checkoutLines = lines.map((l) => {
      if (l.is_archived) throw new ApiError(409, `"${l.name}" is no longer available. Please remove it.`);
      const stock = Number(l.stock);
      const qty = Number(l.quantity);
      if (stock <= 0) throw new ApiError(409, `"${l.name}" is out of stock.`);
      if (qty > stock) throw new ApiError(409, `Only ${stock} of "${l.name}" left in stock.`);
      const price = money(l.price);
      const discountPrice = money(l.discount_price);
      const unitPrice = discountPrice ?? price;
      const lineTotal = round2(unitPrice * qty);
      subtotal += lineTotal;
      return { productId: l.product_id, name: l.name, priceAtPurchase: unitPrice, quantity: qty };
    });
    subtotal = round2(subtotal);

    // Snapshot the chosen address onto the order (address edits later won't change it).
    const address = await orderModel.lockAddressForCheckout(conn, userId, addressId);
    if (!address) throw new ApiError(404, 'That delivery address was not found in your address book.');

    // Coupon is validated & priced against the server-side subtotal, then locked.
    let coupon = null;
    let discount = 0;
    if (couponCode) {
      coupon = await couponModel.findCouponByCode(couponCode, { forUpdate: true, conn });
      const alreadyRedeemed = coupon ? await couponModel.hasRedeemed(coupon.id, userId, conn) : false;
      discount = evaluateCoupon(coupon, { subtotal, alreadyRedeemed });
    }

    const shipping = computeShipping(subtotal);
    const total = round2(subtotal - discount + shipping);

    const { orderId, orderNumber } = await orderModel.insertOrder(conn, {
      userId, subtotal, discountAmount: discount, shippingFee: shipping, totalAmount: total,
      couponCode: coupon ? coupon.code : null, paymentMethod,
      recipient: address.recipient, contactPhone: address.phone,
      addressLine1: address.line1, addressLine2: address.line2, city: address.city,
      province: address.province, postalCode: address.postal_code, country: address.country, notes,
    });

    await orderModel.insertOrderItems(conn, orderId, checkoutLines);

    // Cash on delivery is unpaid until it lands; the mock gateway "pays" instantly so
    // the flow is testable without a card. No card data is ever stored (spec §9).
    const paidNow = paymentMethod === 'mock';
    await orderModel.insertPayment(conn, {
      orderId, method: paymentMethod, amount: total,
      status: paidNow ? 'paid' : 'pending',
      providerRef: paidNow ? `MOCK-${orderNumber}` : null,
      paidAt: paidNow ? new Date() : null,
    });

    await orderModel.insertShipment(conn, orderId);

    if (coupon) {
      await couponModel.recordRedemption(conn, { couponId: coupon.id, orderId, userId, discountApplied: discount });
    }

    // Decrement stock under the lock. The guard is a final safety net; it can only
    // trip if the FOR UPDATE lock were ever bypassed, in which case we abort cleanly.
    for (const line of checkoutLines) {
      const ok = await orderModel.decrementStock(conn, line.productId, line.quantity);
      if (!ok) throw new ApiError(409, `"${line.name}" sold out while you were checking out.`);
    }

    // Empty the cart and open the audit trail.
    await orderModel.clearCartItems(conn, cartId);
    await orderModel.insertStatusHistory(conn, {
      orderId, fromStatus: null, toStatus: 'pending', note: 'Order placed', changedBy: userId,
    });

    await conn.commit();
    return await getOrderForUser(orderId, userId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Customer reads ──────────────────────────────────────────────────────────────
export async function listMyOrders(userId, { page = 1, limit = 10 } = {}) {
  // Query params arrive as strings; mysql2 renders a string straight into LIMIT as a
  // quoted literal, so coerce exactly like the other list services before any maths.
  const take = Math.min(Math.max(Math.trunc(Number(limit)) || 10, 1), 100);
  const current = Math.max(Math.trunc(Number(page)) || 1, 1);
  const { orders, total } = await orderModel.listOrdersForUser(userId, {
    limit: take, offset: (current - 1) * take,
  });
  return {
    orders: orders.map(toPublicOrder),
    pagination: { total, page: current, limit: take, pages: Math.ceil(total / take) || 1 },
  };
}

// Ownership is enforced here: a wrong id or someone else's order both read as 404.
export async function getOrderForUser(orderId, userId) {
  const order = await orderModel.findOrderById(orderId, userId);
  if (!order) throw new ApiError(404, 'Order not found.');
  const [items, payment, shipment, history] = await Promise.all([
    orderModel.getOrderItems(orderId),
    orderModel.getPayment(orderId),
    orderModel.getShipment(orderId),
    orderModel.getStatusHistory(orderId),
  ]);
  return toPublicDetail(order, items, payment, shipment, history);
}

// ── Shared status transition (used by customer cancel and admin) ────────────────
async function transition(conn, order, toStatus, { note, changedBy }) {
  const from = order.status;
  await orderModel.updateOrderStatus(conn, order.id, toStatus);

  if (toStatus === 'cancelled') {
    // Return every unit to stock exactly once — the row lock above means we can't
    // double-fire, and cancelling is only reachable from a not-yet-shipped status.
    const itemRows = await orderModel.getOrderItemRows(order.id, conn);
    for (const r of itemRows) {
      await orderModel.incrementStock(conn, r.product_id, Number(r.quantity));
    }
    // A prepaid (mock) order is refunded on cancellation; COD was never charged.
    if (order.payment_method === 'mock') await orderModel.markPayment(conn, order.id, { status: 'refunded' });
  } else if (toStatus === 'shipped') {
    await orderModel.markShipped(conn, order.id);
  } else if (toStatus === 'delivered') {
    await orderModel.markDelivered(conn, order.id);
    // Cash on delivery changes hands at the door.
    if (order.payment_method === 'cod') await orderModel.markPayment(conn, order.id, { status: 'paid', paidAt: true });
  } else if (toStatus === 'refunded') {
    await orderModel.markPayment(conn, order.id, { status: 'refunded' });
  }

  await orderModel.insertStatusHistory(conn, { orderId: order.id, fromStatus: from, toStatus, note, changedBy });
}

// Customer-initiated cancellation, limited to the early statuses.
export async function cancelByCustomer(orderId, userId, reason) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await orderModel.lockOrder(conn, orderId);
    if (!order || order.user_id !== userId) throw new ApiError(404, 'Order not found.');
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new ApiError(409, `An order that is already ${order.status} can no longer be cancelled here. Please contact support.`);
    }
    await transition(conn, order, 'cancelled', { note: reason || 'Cancelled by customer', changedBy: userId });
    await conn.commit();
    return await getOrderForUser(orderId, userId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Admin operations ────────────────────────────────────────────────────────────
export async function adminListOrders({ status, search, page = 1, limit = 20 } = {}) {
  const take = Math.min(Math.max(Math.trunc(Number(limit)) || 20, 1), 100);
  const current = Math.max(Math.trunc(Number(page)) || 1, 1);
  const { orders, total } = await orderModel.listOrders({
    status, search, limit: take, offset: (current - 1) * take,
  });
  return {
    orders: orders.map(toPublicOrder),
    pagination: { total, page: current, limit: take, pages: Math.ceil(total / take) || 1 },
  };
}

export async function adminGetOrder(orderId) {
  const order = await orderModel.findOrderById(orderId);
  if (!order) throw new ApiError(404, 'Order not found.');
  const [items, payment, shipment, history] = await Promise.all([
    orderModel.getOrderItems(orderId),
    orderModel.getPayment(orderId),
    orderModel.getShipment(orderId),
    orderModel.getStatusHistory(orderId),
  ]);
  return toPublicDetail(order, items, payment, shipment, history);
}

export async function adminChangeStatus(orderId, toStatus, { note, changedBy }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await orderModel.lockOrder(conn, orderId);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (!ALLOWED_TRANSITIONS[order.status]?.includes(toStatus)) {
      throw new ApiError(409, `Cannot move an order from ${order.status} to ${toStatus}.`);
    }
    await transition(conn, order, toStatus, { note: note ?? null, changedBy });
    await conn.commit();
    return await adminGetOrder(orderId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function adminUpdateShipment(orderId, { carrier, trackingNumber }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await orderModel.lockOrder(conn, orderId);
    if (!order) throw new ApiError(404, 'Order not found.');
    await orderModel.setShipmentDetails(conn, orderId, { carrier, trackingNumber });
    await conn.commit();
    return await adminGetOrder(orderId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
