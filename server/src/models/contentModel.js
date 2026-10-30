// Data access for the two public "let a visitor leave a record" tables.
import { pool } from '../config/db.js';

// A duplicate address is the one failure that is NOT a problem: the UNIQUE key on
// newsletter_subscribers.email means the visitor is already on the list, so we turn
// ER_DUP_ENTRY into a friendly result instead of a 409 in the middle of a footer
// form. Every other MySQL error is re-thrown — INSERT IGNORE would have swallowed
// real faults such as truncated data, which is why it is not used here.
export async function subscribe(email) {
  try {
    await pool.query('INSERT INTO newsletter_subscribers (email) VALUES (?)', [email]);
    return { inserted: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return { inserted: false };
    throw err;
  }
}

export async function insertContactMessage({ name, email, phone, subject, message }) {
  const [result] = await pool.query(
    `INSERT INTO contact_messages (name, email, phone, subject, message)
     VALUES (?, ?, ?, ?, ?)`,
    [name, email, phone ?? null, subject, message]
  );
  return result.insertId;
}
