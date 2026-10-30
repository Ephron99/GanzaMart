// Loads server/.env into process.env.
// Must be imported BEFORE any module that reads process.env (like config/db.js),
// because ES module imports run in order — a plain dotenv.config() placed later
// in the file would execute too late.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/config/ → up two levels = server/ (where .env lives)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Fail fast on missing critical variables instead of getting confusing null errors later.
const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'CLIENT_URL'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[env] Missing variables in server/.env: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}
