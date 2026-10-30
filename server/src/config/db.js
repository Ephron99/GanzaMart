// Central MySQL connection pool (mysql2).
// IMPORTANT: import config/load-env.js before this module so process.env is filled.
// Why a pool: opening a new TCP connection per query is slow; a pool reuses up to
// 10 ready connections. Every model calls pool.query/sql with ARRAY placeholders
// (? marks) — this is what makes our SQL injection-proof.
import mysql from 'mysql2/promise';
import process from 'node:process';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Money comes back as an exact string instead of a lossy JS float —
  // services convert with Number() only for display, never for arithmetic.
  decimalNumbers: false,
  dateStrings: true,
});

// Called once at startup. On failure we print beginner-friendly guidance and exit,
// because a web shop without a database is meaningless.
export async function testDbConnection() {
  try {
    const [rows] = await pool.query(
      'SELECT VERSION() AS version, @@port AS port, DATABASE() AS db'
    );
    console.log(`[db] Connected to MySQL ${rows[0].version} on port ${rows[0].port} (schema: ${rows[0].db})`);
  } catch (err) {
    console.error('[db] CONNECTION FAILED:', err.code || err.message);
    console.error('Checklist:');
    console.error('  1. Is the MySQL Server service running?  (services.msc → MySQL80)');
    console.error(`  2. Does the port in server/.env (DB_PORT=${process.env.DB_PORT}) match reality?`);
    console.error('     Verify in MySQL Workbench:  SHOW VARIABLES LIKE \'port\';');
    console.error('  3. Are DB_USER / DB_PASSWORD correct for that server?');
    console.error('  4. Does the schema exist? Run database/schema.sql then database/seed.sql.');
    console.error('  NOTE: MySQL Workbench is only the admin GUI — the backend connects to the');
    console.error('        MySQL *Server* service, so Workbench does not need to be open.');
    process.exit(1);
  }
}
