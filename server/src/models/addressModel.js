// Data access for `addresses`. Ownership is enforced in SQL: every read and write is
// scoped to the current user's id, so one customer physically cannot see or edit
// another's address even if they guess the id (spec §9 "ownership checks").
// Deleted addresses are soft-deleted (`deleted_at`) so historical orders keep resolving.
import { pool } from '../config/db.js';

const COLUMNS = `id, user_id, label, recipient, phone, line1, line2, city, province,
                 postal_code, country, is_default, created_at, updated_at`;

export async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM addresses
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at ASC`, [userId]);
  return rows;
}

// Ownership baked into the WHERE clause — returns null for someone else's id.
export async function findById(userId, id) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM addresses WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, userId]);
  return rows[0] ?? null;
}

export async function countForUser(userId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n FROM addresses WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  return Number(rows[0].n);
}

// Every write in the default-address flow runs on the SAME connection as its
// transaction: mixing a pool query with an open transaction deadlocks on an InnoDB
// gap lock (the transaction's `is_default` UPDATE holds the gap the INSERT wants).
export async function insertAddress(userId, a, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO addresses
       (user_id, label, recipient, phone, line1, line2, city, province, postal_code, country, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, a.label, a.recipient, a.phone, a.line1, a.line2 ?? null, a.city,
      a.province ?? null, a.postalCode ?? null, a.country, a.isDefault ? 1 : 0]);
  return result.insertId;
}

export async function updateAddress(userId, id, a, conn = pool) {
  await conn.query(
    `UPDATE addresses
        SET label = ?, recipient = ?, phone = ?, line1 = ?, line2 = ?, city = ?,
            province = ?, postal_code = ?, country = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [a.label, a.recipient, a.phone, a.line1, a.line2 ?? null, a.city,
      a.province ?? null, a.postalCode ?? null, a.country, id, userId]);
}

// Only one default per customer: clear every default, then set the chosen one.
export async function clearDefaults(userId, conn = pool) {
  await conn.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
}

export async function markDefault(userId, id, conn = pool) {
  await conn.query('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function softDelete(userId, id) {
  const [result] = await pool.query(
    'UPDATE addresses SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId]);
  return result.affectedRows;
}

// When the default address is deleted, promote the most recent survivor so a checkout
// always has a sensible pre-filled address.
export async function promoteFallbackDefault(userId) {
  const [rows] = await pool.query(
    `SELECT id FROM addresses WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`, [userId]);
  if (rows.length) await markDefault(userId, rows[0].id);
}
