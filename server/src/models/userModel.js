// Data-access layer for the `users` table — the ONLY place that writes user SQL.
// Every value passes through `?` placeholders (prepared statements), which is what
// makes SQL injection structurally impossible here.
import { pool } from '../config/db.js';

// Columns we expose to the app: password_hash is deliberately absent so an
// accidental `res.json(user)` can never leak the hash.
const PUBLIC_COLUMNS = 'id, full_name, email, phone, role, is_active, token_version, created_at';

export async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT * FROM users WHERE email = ? LIMIT 1`,   // * includes the hash — login needs it
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const [rows] = await pool.query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;   // includes password_hash — for password change only
}

export async function findPublicUserById(id) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function emailExists(email) {
  const [rows] = await pool.query('SELECT 1 AS x FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

// INSERT returns the generated id via insertId — no follow-up SELECT needed
// (and no race condition between two concurrent registrations).
export async function insertUser({ fullName, email, phone, passwordHash, role = 'customer' }) {
  const [result] = await pool.query(
    `INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    [fullName, email, phone ?? null, passwordHash, role]
  );
  return result.insertId;
}

// Invalidate every token previously issued to this user (logout, deactivation,
// password change, role change).
export async function bumpTokenVersion(userId) {
  await pool.execute(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [userId]);
}

export async function updatePasswordHash(userId, passwordHash) {
  await pool.execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
}

// Server-side pagination + search for the admin customer list.
// LIMIT/OFFSET are interpolated as integers, not placeholders, because MySQL
// prepares them as strings; we therefore hard-cast with Number()/Math first.
export async function listUsers({ search = '', role, page = 1, limit = 10 }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(full_name LIKE ? OR email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (role) {
    where.push('role = ?');
    params.push(role);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users ${whereSql}`, params
  );
  const total = Number(countRows[0].total);

  const take = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * take;
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_COLUMNS},
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = users.id) AS order_count
       FROM users ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${take} OFFSET ${offset}`,
    params
  );

  return { users: rows, total, page: Math.max(Number(page) || 1, 1), limit: take };
}
