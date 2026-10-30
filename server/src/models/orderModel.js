// Data access for the order cluster: `orders`, `order_items`, `payments`,
// `shipments` and `order_status_history`. Like every model here this file contains
// SQL only — no business rules, no HTTP. Checkout runs all of these on the ONE
// transaction connection (the Phase-7 gap-lock lesson: never mix pool queries into
// an open transaction).
//
// Ownership pattern (spec §9): customer reads always filter on user_id in the WHERE
// clause, so another customer's order simply "does not exist" for them (404, not 403).
import { pool } from '../config/db.js';

// Column list kept explicit so a schema change surfaces as a clear bug, not a
// silently renamed JSON field.
const ORDER_COLUMNS = `id, order_number, user_id, status, subtotal, discount_amount, shipping_fee,
  total_amount, coupon_code, payment_method, recipient, contact_phone, address_line1, address_line2,
  city, province, postal_code, country, notes, created_at, updated_at`;

// The same columns, each qualified with the `o.` alias — required whenever `orders`
// is JOINed to another table (users, ...) because bare `id`/`created_at` would then
// be ambiguous between the two tables.
const ORDER_COLUMNS_O = ORDER_COLUMNS.split(',').map((c) => `o.${c.trim()}`).join(', ');

// ── Placement (called inside the checkout transaction) ─────────────────────────

// Lock + read the cart lines with live product data in one statement. The
// `FOR UPDATE` takes row locks on every touched product so two concurrent checkouts
// can never oversell the same stock: the second waits here until the first commits,
// then re-reads the decremented quantity (spec §6 / §12 concurrency test).
export async function lockCartLinesForCheckout(conn, cartId) {
  const [rows] = await conn.query(
    `SELECT ci.product_id, ci.quantity, p.name, p.slug, p.price, p.discount_price,
            p.stock, p.is_archived
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
      FOR UPDATE`, [cartId]);
  return rows;
}

// The delivery address must also be read on the transaction connection, scoped by
// user_id (ownership) and deleted_at (a soft-deleted address can't be picked).
export async function lockAddressForCheckout(conn, userId, addressId) {
  const [rows] = await conn.query(
    `SELECT id, label, recipient, phone, line1, line2, city, province, postal_code, country
       FROM addresses
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1`, [addressId, userId]);
  return rows[0] ?? null;
}

export async function insertOrder(conn, o) {
  const [result] = await conn.query(
    `INSERT INTO orders
       (order_number, user_id, status, subtotal, discount_amount, shipping_fee, total_amount,
        coupon_code, payment_method, recipient, contact_phone, address_line1, address_line2,
        city, province, postal_code, country, notes)
     VALUES ('', ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.userId, o.subtotal, o.discountAmount, o.shippingFee, o.totalAmount,
      o.couponCode ?? null, o.paymentMethod, o.recipient, o.contactPhone,
      o.addressLine1, o.addressLine2 ?? null, o.city, o.province ?? null,
      o.postalCode ?? null, o.country, o.notes ?? null]);
  // order_number is NOT NULL + UNIQUE but naturally derives from the row id, so we
  // stamp it right after insert: GM + 12-digit zero-padded id (seed uses the same
  // format, e.g. GM000000000001).
  const orderNumber = `GM${String(result.insertId).padStart(12, '0')}`;
  await conn.query('UPDATE orders SET order_number = ? WHERE id = ?', [orderNumber, result.insertId]);
  return { orderId: result.insertId, orderNumber };
}

export async function insertOrderItems(conn, orderId, lines) {
  if (!lines.length) return;
  const values = lines.map((l) => [orderId, l.productId, l.name, l.priceAtPurchase, l.quantity]);
  await conn.query(
    `INSERT INTO order_items (order_id, product_id, product_name, price_at_purchase, quantity) VALUES ?`,
    [values]);
}

export async function insertPayment(conn, { orderId, method, amount, status, providerRef, paidAt }) {
  await conn.query(
    `INSERT INTO payments (order_id, method, amount, status, provider_ref, paid_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, method, amount, status, providerRef ?? null, paidAt ?? null]);
}

// `shipments` is 1..* per order in the entity model: create the (still empty) row at
// checkout so admin updates later are a plain UPDATE instead of an upsert.
export async function insertShipment(conn, orderId) {
  await conn.query('INSERT INTO shipments (order_id) VALUES (?)', [orderId]);
}

export async function decrementStock(conn, productId, quantity) {
  // The WHERE guard makes overselling impossible even if a lock were ever forgotten:
  // affectedRows = 0 means stock fell short and the caller aborts the transaction.
  const [result] = await conn.query(
    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
    [quantity, productId, quantity]);
  return result.affectedRows === 1;
}

export async function incrementStock(conn, productId, quantity) {
  await conn.query('UPDATE products SET stock = LEAST(stock + ?, 999999) WHERE id = ?', [quantity, productId]);
}

export async function insertStatusHistory(conn, { orderId, fromStatus, toStatus, note, changedBy }) {
  await conn.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, fromStatus ?? null, toStatus, note ?? null, changedBy ?? null]);
}

export async function clearCartItems(conn, cartId) {
  await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
}

// ── Reads ───────────────────────────────────────────────────────────────────────

// One header row, scoped by user_id when given (customer view); unscoped for admin.
export async function findOrderById(orderId, userId = null, conn = pool) {
  const sql = `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?` + (userId ? ' AND user_id = ?' : '');
  const [rows] = await conn.query(userId ? sql : `${sql} LIMIT 1`, userId ? [orderId, userId] : [orderId]);
  return rows[0] ?? null;
}

export async function getOrderItems(orderId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT oi.product_id, oi.product_name, oi.price_at_purchase, oi.quantity, oi.line_total,
            p.slug, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC`, [orderId]);
  return rows;
}

export async function getPayment(orderId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT method, amount, currency, status, provider_ref, paid_at, created_at
       FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1`, [orderId]);
  return rows[0] ?? null;
}

export async function getShipment(orderId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT carrier, tracking_number, shipped_at, delivered_at
       FROM shipments WHERE order_id = ? ORDER BY id DESC LIMIT 1`, [orderId]);
  return rows[0] ?? null;
}

export async function getStatusHistory(orderId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT h.from_status, h.to_status, h.note, h.changed_by, h.created_at, u.full_name AS changed_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.order_id = ?
      ORDER BY h.id ASC`, [orderId]);
  return rows;
}

// Customer order list: headers only (items are fetched on the detail view).
export async function listOrdersForUser(userId, { limit, offset }) {
  const [rows] = await pool.query(
    `SELECT ${ORDER_COLUMNS},
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`, [userId, limit, offset]);
  const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM orders WHERE user_id = ?', [userId]);
  return { orders: rows, total: Number(countRows[0].total) };
}

// Admin list: any status + free-text search over order number / recipient / email.
export async function listOrders({ status, search, limit, offset }) {
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (search) {
    where.push(`(o.order_number LIKE ? OR o.recipient LIKE ? OR u.email LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ${ORDER_COLUMNS_O}, u.email AS user_email, u.full_name AS user_name,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ${clause}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id ${clause}`, params);
  return { orders: rows, total: Number(countRows[0].total) };
}

// ── Status transitions (run on the transaction connection) ──────────────────────

export async function updateOrderStatus(conn, orderId, status) {
  await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
}

export async function markPayment(conn, orderId, { status, paidAt = false }) {
  await conn.query(
    `UPDATE payments SET status = ?${paidAt ? ', paid_at = NOW()' : ''}
      WHERE order_id = ? AND id = (SELECT id FROM (SELECT id FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1) t)`,
    [status, orderId, orderId]);
}

export async function setShipmentDetails(conn, orderId, { carrier, trackingNumber }) {
  await conn.query(
    `UPDATE shipments SET carrier = COALESCE(?, carrier), tracking_number = COALESCE(?, tracking_number)
      WHERE order_id = ?`,
    [carrier ?? null, trackingNumber ?? null, orderId]);
}

export async function markShipped(conn, orderId) {
  await conn.query('UPDATE shipments SET shipped_at = NOW() WHERE order_id = ? AND shipped_at IS NULL', [orderId]);
}

export async function markDelivered(conn, orderId) {
  await conn.query('UPDATE shipments SET delivered_at = NOW() WHERE order_id = ? AND delivered_at IS NULL', [orderId]);
}

// Order lines needed to restore stock on cancellation.
export async function getOrderItemRows(orderId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
  return rows;
}

export async function getOrderStatus(orderId, conn = pool) {
  const [rows] = await conn.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
  return rows[0] ?? null;
}

// Lock the whole order header for a status transition so two admins (or a customer
// cancelling while an admin processes) can't interleave and double-restore stock.
export async function lockOrder(conn, orderId) {
  const [rows] = await conn.query(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ? FOR UPDATE`, [orderId]);
  return rows[0] ?? null;
}
