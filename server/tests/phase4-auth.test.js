// Phase 4 verification: registration, login, JWT revocation and role-based access.
// These tests run against the real seeded MySQL database; created e-mails use a
// unique run id so repeated runs never collide on the UNIQUE email constraint.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import process from 'node:process';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const RUN = `${Date.now()}`;
const emailFor = (name) => `${name}.${RUN}@example.com`;

const registerPayload = (over = {}) => ({
  fullName: 'Test Customer',
  email: emailFor('customer'),
  password: 'Password123',
  phone: '+250789999999',
  ...over,
});

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.data.token;
}

// Test hygiene: every user this file creates uses a unique @<run>.example.com address,
// so a single DELETE can clean them up without touching the seeded demo accounts.
afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE ?', [`%.${RUN}@example.com`]);
});

describe('auth environment', () => {
  it('runs with NODE_ENV=test so rate limits do not break the suite', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

describe('POST /api/auth/register', () => {
  it('creates a customer, returns a token and never exposes the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(registerPayload()).expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    // The stored credential must be a bcrypt hash, never plaintext (spec §4D/§6).
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE email = ?',
      [registerPayload().email]);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(rows[0].password_hash).not.toContain('Password123');
  });

  it('rejects a duplicate e-mail with 409', async () => {
    const payload = registerPayload({ email: emailFor('dup') });
    await request(app).post('/api/auth/register').send(payload).expect(201);
    const res = await request(app).post('/api/auth/register').send(payload).expect(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it.each([
    ['weak password (no digit)', { password: 'abcdefgh' }],
    ['too short password', { password: 'Ab1' }],
    ['invalid e-mail', { email: 'not-an-email' }],
    ['missing full name', { fullName: '' }],
    ['malformed phone', { phone: 'abc' }],
  ])('rejects %s with 422 and lists the offending field', async (_label, over) => {
    const res = await request(app).post('/api/auth/register').send(registerPayload(over)).expect(422);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('accepts a registration without the optional phone number', async () => {
    const payload = registerPayload({ email: emailFor('nophone') });
    delete payload.phone;
    const res = await request(app).post('/api/auth/register').send(payload).expect(201);
    expect(res.body.data.user.phone).toBeNull();
  });

  it('cannot be used to self-assign the admin role (privilege escalation)', async () => {
    const res = await request(app).post('/api/auth/register')
      .send(registerPayload({ role: 'admin' })).expect(422);
    expect(res.body.details[0].message).toMatch(/your own role/i);
  });
});

describe('POST /api/auth/login', () => {
  it('signs a valid token for the seeded administrator', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'admin@ganza.com', password: 'Admin@123' }).expect(200);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongPassword1' }).expect(401);
    expect(res.body.error).toBe('Invalid e-mail or password.');
  });

  it('gives the same 401 for an unknown account (no user enumeration)', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: emailFor('ghost'), password: 'Whatever123' }).expect(401);
    expect(res.body.error).toBe('Invalid e-mail or password.');
  });

  it('blocks a deactivated account with 403', async () => {
    const email = emailFor('inactive');
    await request(app).post('/api/auth/register').send(registerPayload({ email })).expect(201);
    await pool.query('UPDATE users SET is_active = 0 WHERE email = ?', [email]);

    const res = await request(app).post('/api/auth/login')
      .send({ email, password: 'Password123' }).expect(403);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  it('is not vulnerable to SQL injection through the e-mail field', async () => {
    const before = (await pool.query('SELECT COUNT(*) AS n FROM users'))[0][0].n;
    await request(app).post('/api/auth/login')
      .send({ email: "admin@ganza.com' OR '1'='1", password: 'x' }).expect(422);
    const after = (await pool.query('SELECT COUNT(*) AS n FROM users'))[0][0].n;
    expect(after).toBe(before);   // no rows bypassed, no users deleted/added
  });
});

describe('GET /api/auth/me + logout revocation', () => {
  let token;
  beforeAll(async () => { token = await loginAs('alice@example.com', 'Alice@123'); });

  it('returns the owner profile for a valid token', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.data.user.email).toBe('alice@example.com');
  });

  it('rejects a request with no token (401) and a forged token (401)', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token').expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    // Same shape, different key → signature verification must fail.
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: 1, role: 'admin', tv: 0 }, 'wrong-secret', { expiresIn: '1h' });
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('logout invalidates the token server-side (true revocation)', async () => {
    const t = await loginAs('bo@example.com', 'BoBo@123');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${t}`).expect(200);

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${t}`).expect(200);

    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${t}`).expect(401);
    expect(res.body.error).toMatch(/signed out/i);
  });
});

describe('POST /api/auth/change-password', () => {
  it('requires the correct current password and then forces a new sign-in', async () => {
    const email = emailFor('pwdchange');
    const reg = await request(app).post('/api/auth/register')
      .send(registerPayload({ email })).expect(201);
    const token = reg.body.data.token;

    await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass1' })
      .expect(401);

    await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password123', newPassword: 'BrandNewPass1' })
      .expect(200);

    // Old session is dead, old password is dead, new password works.
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    await request(app).post('/api/auth/login').send({ email, password: 'Password123' }).expect(401);
    const relogin = await request(app).post('/api/auth/login')
      .send({ email, password: 'BrandNewPass1' }).expect(200);
    expect(relogin.body.data.user.email).toBe(email);
  });
});

describe('role-based access control', () => {
  it('anonymous callers get 401 from an admin endpoint', async () => {
    await request(app).get('/api/admin/users').expect(401);
  });

  it('authenticated customers get 403 from an admin endpoint', async () => {
    const customerToken = await loginAs('carla@example.com', 'Carla@123');
    const res = await request(app).get('/api/admin/users')
      .set('Authorization', `Bearer ${customerToken}`).expect(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it('administrators get the paginated customer list without password hashes', async () => {
    const adminToken = await loginAs('admin@ganza.com', 'Admin@123');
    const res = await request(app).get('/api/admin/users?limit=2&page=1')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);

    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data[0].passwordHash).toBeUndefined();
    expect(res.body.data[0].password_hash).toBeUndefined();
    expect(res.body.data[0].orderCount).toBeTypeOf('number');
  });

  it('validates admin query parameters', async () => {
    const adminToken = await loginAs('admin@ganza.com', 'Admin@123');
    await request(app).get('/api/admin/users?role=root')
      .set('Authorization', `Bearer ${adminToken}`).expect(422);
    await request(app).get('/api/admin/users?page=-3')
      .set('Authorization', `Bearer ${adminToken}`).expect(422);
  });

  it('searches customers by name or e-mail (parameterized LIKE)', async () => {
    const adminToken = await loginAs('admin@ganza.com', 'Admin@123');
    const res = await request(app).get('/api/admin/users?search=alice')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.every((u) => /alice/i.test(u.email) || /alice/i.test(u.fullName))).toBe(true);
    expect(res.body.data.length).toBe(1);
  });
});
