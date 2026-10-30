// Data access for `reviews`.
// Reading reviews is public; WRITING them is a Phase 8 feature, because a review
// may only be created by a customer whose order for that product actually exists.
import { pool } from '../config/db.js';

// One query returns the page of reviews; a second returns the star histogram for
// the summary panel. Two small indexed queries beat one unreadable mega-query.
export async function listProductReviews(productId, { limit = 10, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.title, r.comment, r.created_at,
            u.id AS user_id, u.full_name AS user_name,
            EXISTS(
              SELECT 1 FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
             WHERE oi.product_id = r.product_id
               AND o.user_id = r.user_id
               AND o.status <> 'cancelled'
            ) AS verified_purchase
       FROM reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    [productId]
  );
  return rows;
}

export async function countProductReviews(productId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM reviews WHERE product_id = ?', [productId]
  );
  return Number(rows[0].total);
}

// [ { rating: 5, count: 1 }, { rating: 4, count: 1 }, ... ] — the detail page draws
// the 5→1 bars from this, so the numbers can never disagree with the list below it.
export async function reviewBreakdown(productId) {
  const [rows] = await pool.query(
    'SELECT rating, COUNT(*) AS count FROM reviews WHERE product_id = ? GROUP BY rating',
    [productId]
  );
  return rows.map((r) => ({ rating: Number(r.rating), count: Number(r.count) }));
}
