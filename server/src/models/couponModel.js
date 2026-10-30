// Data access for `coupons` and `coupon_redemptions`. A coupon's discount is always
// recomputed server-side from the live cart subtotal — the client only ever sends a
// code, never a number, so nobody can "edit" their own discount (spec §9).
import { pool } from '../config/db.js';

const COUPON_COLUMNS = `id, code, type, value, min_order, max_uses, used_count,
  valid_from, valid_until, is_active`;

// `valid_now` is computed by MySQL so the validity window is judged in the database's
// own clock/timezone — comparing the DATETIME strings in JavaScript could drift.
const SELECT_COUPON = `SELECT ${COUPON_COLUMNS}, (NOW() BETWEEN valid_from AND valid_until) AS valid_now
  FROM coupons WHERE UPPER(code) = UPPER(?) LIMIT 1`;

// Case-insensitive lookup so "welcome10" typed by a shopper still matches WELCOME10.
// `FOR UPDATE` is used inside the checkout transaction so two simultaneous orders
// can't both sneak past a max_uses cap.
export async function findCouponByCode(code, { forUpdate = false, conn = pool } = {}) {
  const [rows] = await conn.query(SELECT_COUPON + (forUpdate ? ' FOR UPDATE' : ''), [code]);
  return rows[0] ?? null;
}

// Has this customer already burned this coupon? The DB also enforces it with
// UNIQUE(coupon_id, user_id), so this read is only for a friendly early error.
export async function hasRedeemed(couponId, userId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ? LIMIT 1',
    [couponId, userId]);
  return rows.length > 0;
}

export async function recordRedemption(conn, { couponId, orderId, userId, discountApplied }) {
  await conn.query(
    `INSERT INTO coupon_redemptions (coupon_id, order_id, user_id, discount_applied)
     VALUES (?, ?, ?, ?)`,
    [couponId, orderId, userId, discountApplied]);
  await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);
}
