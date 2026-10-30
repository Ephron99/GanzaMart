// Business rules for the shopping cart. Controllers stay thin; the model only knows SQL.
//
// The cart's defining principle (spec §8 "server-side price/stock math"): every number
// the shopper sees is re-derived from the database on read. The client sends only
// product ids and a desired quantity — never a price. Quantities are always clamped to
// live stock, so a cart can never hold more of something than the shop actually has.
import { pool } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/httpResponse.js';
import * as cartModel from '../models/cartModel.js';

const CURRENCY = 'RWF';

// Resolve (creating if needed) the cart that belongs to this request's identity:
// a signed-in user wins; otherwise the anonymous browser session token is used.
export async function resolveCart({ user, sessionToken }) {
  if (user) return cartModel.ensureUserCart(user.id);
  if (!sessionToken) throw new ApiError(400, 'A cart session identifier is required.');
  return cartModel.ensureSessionCart(sessionToken);
}

// Turn raw joined rows into the JSON the storefront renders, with totals computed here
// so the header badge, the cart page and (later) checkout can never disagree.
function toPublicCart(lines) {
  let subtotal = 0;
  let itemCount = 0;

  const items = lines.map((l) => {
    const price = money(l.price);
    const discountPrice = money(l.discount_price);
    const unitPrice = discountPrice ?? price;          // what the shopper actually pays
    const quantity = Number(l.quantity);
    const stock = Number(l.stock);
    const lineTotal = Number((unitPrice * quantity).toFixed(2));

    subtotal += lineTotal;
    itemCount += quantity;

    return {
      productId: l.product_id,
      name: l.name,
      slug: l.slug,
      imageUrl: l.image_url,
      categorySlug: l.category_slug,
      unitPrice,
      listPrice: price,
      onSale: discountPrice !== null && discountPrice < price,
      currency: CURRENCY,
      quantity,
      stock,
      inStock: stock > 0 && !l.is_archived,
      // The line is still shown, but flagged so the UI can block checkout if stock
      // fell below the requested quantity after the item was added.
      exceedsStock: quantity > stock,
      isArchived: Boolean(l.is_archived),
      lineTotal,
    };
  });

  return {
    items,
    itemCount,
    subtotal: Number(subtotal.toFixed(2)),
    currency: CURRENCY,
    // A cart is only empty when it has no lines; `canCheckout` is advisory for the UI —
    // the authoritative check happens again inside the checkout transaction.
    canCheckout: items.length > 0 && items.every((i) => i.inStock && !i.exceedsStock),
  };
}

export async function readCart(cartId) {
  const lines = await cartModel.getCartLines(cartId);
  return toPublicCart(lines);
}

// Add `quantity` of a product (or bump an existing line), always capped to stock.
export async function addItem({ cartId, productId, quantity = 1 }) {
  const product = await cartModel.findProductForCart(productId);
  if (!product) throw new ApiError(404, 'That product no longer exists.');
  if (product.is_archived) throw new ApiError(409, 'That product is no longer available.');

  const stock = Number(product.stock);
  if (stock <= 0) throw new ApiError(409, 'That product is out of stock.');

  const wanted = Math.max(1, Number(quantity) || 1);
  const existing = await cartModel.findCartItem(cartId, productId);
  const target = Math.min((existing ? Number(existing.quantity) : 0) + wanted, stock);

  if (existing) await cartModel.updateItemQuantity(cartId, productId, target);
  else await cartModel.insertItem(cartId, productId, target);

  return readCart(cartId);
}

// Set an absolute quantity for a line (the stepper), clamped to 1..stock.
export async function setQuantity({ cartId, productId, quantity }) {
  const existing = await cartModel.findCartItem(cartId, productId);
  if (!existing) throw new ApiError(404, 'That item is not in your cart.');

  const product = await cartModel.findProductForCart(productId);
  if (!product) throw new ApiError(404, 'That product no longer exists.');

  const stock = Number(product.stock);
  if (stock <= 0) throw new ApiError(409, 'That product is out of stock.');

  const target = Math.max(1, Math.min(Number(quantity) || 1, stock));
  await cartModel.updateItemQuantity(cartId, productId, target);
  return readCart(cartId);
}

export async function removeItem({ cartId, productId }) {
  const removed = await cartModel.deleteItem(cartId, productId);
  if (!removed) throw new ApiError(404, 'That item is not in your cart.');
  return readCart(cartId);
}

export async function clearCart({ cartId }) {
  await cartModel.clearItems(cartId);
  return readCart(cartId);
}

/**
 * Merge a browser's anonymous cart into the customer's persistent cart at login.
 * Runs in ONE transaction so a crash can't leave items in both carts or in neither.
 * After the merge every line is re-clamped to live stock (a session cart might hold a
 * quantity that the product no longer supports); lines for now-out-of-stock products
 * are dropped rather than kept as an unbuyable reminder.
 */
export async function mergeOnLogin({ userId, sessionToken }) {
  const sessionCart = sessionToken ? await cartModel.findCartBySession(sessionToken) : null;

  if (!sessionCart) {
    // Nothing to merge — just return the user's (possibly empty) cart.
    const cart = await cartModel.ensureUserCart(userId);
    return readCart(cart.id);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Ensure the destination user cart exists inside this transaction's view.
    const [urows] = await conn.query('SELECT id FROM carts WHERE user_id = ? LIMIT 1', [userId]);
    let userCartId;
    if (urows.length) {
      userCartId = urows[0].id;
    } else {
      const [ins] = await conn.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      userCartId = ins.insertId;
    }

    await cartModel.mergeSessionCartIntoUserCart(conn, userCartId, sessionCart.id);

    // Re-clamp to live stock and prune unbuyable lines.
    const [rows] = await conn.query(
      `SELECT ci.product_id, ci.quantity, p.stock, p.is_archived
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ?`, [userCartId]);

    for (const r of rows) {
      const stock = Number(r.stock);
      if (stock <= 0 || r.is_archived) {
        await conn.query('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [userCartId, r.product_id]);
      } else if (Number(r.quantity) > stock) {
        await conn.query('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?',
          [stock, userCartId, r.product_id]);
      }
    }

    await conn.commit();
    return readCart(userCartId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
