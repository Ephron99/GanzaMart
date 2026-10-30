// One-off utility: generate bcrypt (12 rounds) hashes for database/seed.sql
// Run: node tools/hash-seed-passwords.mjs
import bcrypt from 'bcryptjs';

const accounts = [
  { label: 'admin@ganza.com / Admin@123',      pw: 'Admin@123' },
  { label: 'alice@example.com / Alice@123',    pw: 'Alice@123' },
  { label: 'bo@example.com / BoBo@123',        pw: 'BoBo@123' },
  { label: 'carla@example.com / Carla@123',    pw: 'Carla@123' },
];

for (const a of accounts) {
  console.log(a.label);
  console.log(bcrypt.hashSync(a.pw, 12));
  console.log('');
}
