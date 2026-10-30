// Data access for `carts` and `cart_items`. The ONLY place that writes cart SQL.
//
// Two identities own a cart (see database/schema.sql §6):
//   • a signed-in customer  → carts.user_id      (UNIQUE, one persistent cart each)
//   • an anonymous browser  → carts.session_token (UNIQUE, a client-generated id)
// Prices are NEVER stored in cart_items — every read re-derives them from `products`,
// so a price change between "add to cart" and "view cart" is always reflected. All
// values pass through `?` placeholders (parameterized, injection-proof).
import { pool } from '../config/db.js';

const CART_SELECT = 'id, user_id, session_token, created_at, updated_at';

// ── Cart lookup / creation ───────────────────────────────────────────────────
export async function findCartByUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${CART_SELECT} FROM carts WHERE user_id = ? LIMIT 1`, [userId]);
  return rows[0] ?? null;
}

export async function findCartBySession(sessionToken) {
  const [rows] = await pool.query(
    `SELECT ${CART_SELECT} FROM carts WHERE session_token = ? LIMIT 1`, [sessionToken]);
  return rows[0] ?? null;
}

// ON DUPLICATE KEY re-uses the row when a concurrent request just created the same
// user/session cart, so the UNIQUE index never surfaces as a 500 to the shopper.
export async function ensureUserCart(userId) {
  await pool.query('INSERT INTO carts (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)', [userId]);
  return findCartByUser(userId);
}

export async function ensureSessionCart(sessionToken) {
  await pool.query(
    'INSERT INTO carts (session_token) VALUES (?) ON DUPLICATE KEY UPDATE session_token = VALUES(session_token)',
    [sessionToken]);
  return findCartBySession(sessionToken);
}

// ── Cart contents ────────────────────────────────────────────────────────────
// One join pulls the live price, stock and archive flag for every line, so the
// service never has to trust a client number and never fires N queries for N items.
export async function getCartLines(cartId) {
  const [rows] = await pool.query(
    `SELECT ci.product_id, ci.quantity, ci.created_at AS added_at,
            p.name, p.slug, p.image_url, p.price, p.discount_price, p.stock,
            p.is_archived, c.slug AS category_slug
       FROM cart_items ci
       JOIN products   p ON p.id = ci.product_id
       JOIN categories c ON c.id = p.category_id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC`,
    [cartId]);
  return rows;
}

export async function findCartItem(cartId, productId) {
  const [rows] = await pool.query(
    'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1',
    [cartId, productId]);
  return rows[0] ?? null;
}

export async function insertItem(cartId, productId, quantity) {
  const [result] = await pool.query(
    'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
    [cartId, productId, quantity]);
  return result.insertId;
}

export async function updateItemQuantity(cartId, productId, quantity) {
  await pool.query(
    'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?',
    [quantity, cartId, productId]);
}

export async function deleteItem(cartId, productId) {
  const [result] = await pool.query(
    'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId]);
  return result.affectedRows;
}

export async function clearItems(cartId) {
  await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
}

// A single lightweight read used when a product must be validated before it can be
// added to a cart (exists? archived? how much stock?).
export async function findProductForCart(productId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.price, p.discount_price, p.stock, p.is_archived
       FROM products p WHERE p.id = ? LIMIT 1`, [productId]);
  return rows[0] ?? null;
}

// ── Merge an anonymous cart into the customer cart at login ────────────────────
// Called inside one transaction by cartService.mergeOnLogin. Order matters:
//   1. top up the quantity for products BOTH carts already have (must run first,
//      while the only matching target rows are the pre-existing user-cart lines),
//   2. copy across products the user cart does NOT yet have,
//   3. drop the now-empty session cart (its items CASCADE).
export async function mergeSessionCartIntoUserCart(conn, userCartId, sessionCartId) {
  await conn.query(
    `UPDATE cart_items target
       JOIN cart_items source ON source.cart_id = ? AND source.product_id = target.product_id
      SET target.quantity = target.quantity + source.quantity
    WHERE target.cart_id = ?`,
    [sessionCartId, userCartId]);

  await conn.query(
    `INSERT INTO cart_items (cart_id, product_id, quantity)
     SELECT ?, ci.product_id, ci.quantity
       FROM cart_items ci
      WHERE ci.cart_id = ?
        AND ci.product_id NOT IN (SELECT product_id FROM cart_items WHERE cart_id = ?)`,
    [userCartId, sessionCartId, userCartId]);

  // CASCADE deletes the session cart's remaining items too.
  await conn.query('DELETE FROM carts WHERE id = ?', [sessionCartId]);
}

export async function getCartById(cartId) {
  const [rows] = await pool.query(`SELECT ${CART_SELECT} FROM carts WHERE id = ? LIMIT 1`, [cartId]);
  return rows[0] ?? null;
}
