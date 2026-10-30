// Phase 7 verification: the server-side cart (anonymous session cart, stock-clamped
// quantities, login merge) and the customer address book (ownership-scoped CRUD).
// Run against the real seeded MySQL database. Every created identity uses a unique
// @<run>.example.com address or a unique session token, and afterAll removes them, so
// the seeded demo accounts and their addresses stay untouched.
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const RUN = `${Date.now()}`;
const emailFor = (name) => `${name}.${RUN}@example.com`;

// Session carts belong to no user, so they must be cleaned explicitly.
const sessionTokens = [];
function anonHeaders() {
  const token = randomUUID();
  sessionTokens.push(token);
  return { 'X-Cart-Session': token };
}

async function registerCustomer(over = {}) {
  const res = await request(app).post('/api/auth/register').send({
    fullName: 'Phase7 Tester', email: emailFor('cust'), password: 'Password123', ...over,
  }).expect(201);
  return res.body.data.token;
}

afterAll(async () => {
  if (sessionTokens.length) {
    await pool.query(
      `DELETE FROM carts WHERE session_token IN (${sessionTokens.map(() => '?').join(',')})`,
      sessionTokens);
  }
  // Cascades to carts and addresses owned by the throwaway accounts.
  await pool.query('DELETE FROM users WHERE email LIKE ?', [`%.${RUN}@example.com`]);
});

// ── Cart ─────────────────────────────────────────────────────────────────────
describe('GET /api/cart (anonymous session)', () => {
  it('starts empty and carries the authoritative totals shape', async () => {
    const res = await request(app).get('/api/cart').set(anonHeaders()).expect(200);
    expect(res.body.data).toMatchObject({ items: [], itemCount: 0, subtotal: 0, currency: 'RWF', canCheckout: false });
  });

  it('rejects an anonymous cart request with no session identifier (400)', async () => {
    await request(app).get('/api/cart').expect(400);
  });

  it('rejects a malformed session header with 422', async () => {
    await request(app).get('/api/cart').set('X-Cart-Session', 'no spaces allowed!').expect(422);
  });
});

describe('POST /api/cart/items', () => {
  it('adds a line at the server-derived discounted price and returns the rebuilt cart', async () => {
    const h = anonHeaders();
    // Product 1: price 350000, discount 315000, stock 25.
    const res = await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 2 }).expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      productId: 1, quantity: 2, unitPrice: 315000, listPrice: 350000, onSale: true, lineTotal: 630000,
    });
    expect(res.body.data).toMatchObject({ itemCount: 2, subtotal: 630000, canCheckout: true });
  });

  it('accumulates into the existing line instead of duplicating it', async () => {
    const h = anonHeaders();
    await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 1 }).expect(200);
    const res = await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 2 }).expect(200);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });

  it('clamps the quantity to live stock rather than overselling (product 4 has stock 3)', async () => {
    const h = anonHeaders();
    const res = await request(app).post('/api/cart/items').set(h).send({ productId: 4, quantity: 5 }).expect(200);
    expect(res.body.data.items[0]).toMatchObject({ productId: 4, quantity: 3, exceedsStock: false });
  });

  it('404s on an unknown product and 422s on bad payloads', async () => {
    const h = anonHeaders();
    await request(app).post('/api/cart/items').set(h).send({ productId: 999999 }).expect(404);
    await request(app).post('/api/cart/items').set(h).send({ quantity: 1 }).expect(422);          // no productId
    await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 0 }).expect(422);
  });
});

describe('PUT / DELETE /api/cart/items/:productId', () => {
  it('sets an absolute quantity and removes a line', async () => {
    const h = anonHeaders();
    await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 2 }).expect(200);

    const afterPut = await request(app).put('/api/cart/items/1').set(h).send({ quantity: 5 }).expect(200);
    expect(afterPut.body.data.items[0].quantity).toBe(5);

    const afterDelete = await request(app).delete('/api/cart/items/1').set(h).expect(200);
    expect(afterDelete.body.data.items).toHaveLength(0);
  });

  it('404s when editing a product that is not in the cart', async () => {
    const h = anonHeaders();
    await request(app).put('/api/cart/items/1').set(h).send({ quantity: 1 }).expect(404);
    await request(app).delete('/api/cart/items/1').set(h).expect(404);
  });

  it('DELETE /api/cart empties the whole cart', async () => {
    const h = anonHeaders();
    await request(app).post('/api/cart/items').set(h).send({ productId: 1 }).expect(200);
    const res = await request(app).delete('/api/cart').set(h).expect(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

describe('POST /api/cart/merge (login merge)', () => {
  it('folds an anonymous basket into the freshly-registered account and destroys the session cart', async () => {
    const h = anonHeaders();
    await request(app).post('/api/cart/items').set(h).send({ productId: 1, quantity: 2 }).expect(200);
    await request(app).post('/api/cart/items').set(h).send({ productId: 6, quantity: 1 }).expect(200);

    const token = await registerCustomer({ email: emailFor('merge') });
    const merged = await request(app).post('/api/cart/merge').set('Authorization', `Bearer ${token}`)
      .send({ sessionToken: h['X-Cart-Session'] }).expect(200);

    expect(merged.body.data.items.map((i) => i.productId).sort()).toEqual([1, 6]);
    expect(merged.body.data.itemCount).toBe(3);

    // The anonymous session cart is gone: reading it again comes back empty.
    const gone = await request(app).get('/api/cart').set(h).expect(200);
    expect(gone.body.data.items).toHaveLength(0);

    // The merged lines live on the user cart and persist for that token.
    const asUser = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200);
    expect(asUser.body.data.itemCount).toBe(3);
  });

  it('requires authentication', async () => {
    await request(app).post('/api/cart/merge').send({ sessionToken: randomUUID() }).expect(401);
  });
});

// ── Addresses ────────────────────────────────────────────────────────────────
const address = (over = {}) => ({
  label: 'Home', recipient: 'Alice Uwase', phone: '+250781111111',
  line1: 'KG 123 St, Nyarutarama', city: 'Kigali', province: 'Kigali City', ...over,
});

describe('Addresses require a signed-in customer', () => {
  it('401s without a token', async () => {
    await request(app).get('/api/addresses').expect(401);
    await request(app).post('/api/addresses').send(address()).expect(401);
  });
});

describe('GET /api/addresses', () => {
  it("returns the seeded customer's addresses with the default first", async () => {
    // Alice (seeded) owns two addresses; she is never mutated by these tests.
    const login = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'Alice@123' }).expect(200);
    const res = await request(app).get('/api/addresses').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].isDefault).toBe(true);
    expect(res.body.data[0].user_id).toBeUndefined();     // internal FK never crosses the boundary
  });

  it('isolates one customer from another', async () => {
    const token = await registerCustomer({ email: emailFor('isolation') });
    // A brand-new account has no addresses and cannot read Alice's (id 1).
    const empty = await request(app).get('/api/addresses').set('Authorization', `Bearer ${token}`).expect(200);
    expect(empty.body.data).toHaveLength(0);
    await request(app).get('/api/addresses/1').set('Authorization', `Bearer ${token}`).expect(404);
    await request(app).put('/api/addresses/1').set('Authorization', `Bearer ${token}`).send(address()).expect(404);
    await request(app).delete('/api/addresses/1').set('Authorization', `Bearer ${token}`).expect(404);
  });
});

describe('POST /api/addresses (default handling)', () => {
  it('makes the first address the default automatically', async () => {
    const token = await registerCustomer({ email: emailFor('firstaddr') });
    const res = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(address()).expect(201);
    expect(res.body.data.isDefault).toBe(true);
  });

  it('keeps exactly one default when a second address claims it', async () => {
    const token = await registerCustomer({ email: emailFor('twoaddr') });
    await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(address()).expect(201);
    const second = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`)
      .send(address({ label: 'Office', isDefault: true })).expect(201);

    const list = await request(app).get('/api/addresses').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.data.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list.body.data.find((a) => a.isDefault).id).toBe(second.body.data.id);
  });

  it('validates the body and refuses privileged fields', async () => {
    const token = await registerCustomer({ email: emailFor('addvalid') });
    await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send({ recipient: 'A' }).expect(422);
    await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(address({ phone: 'call me' })).expect(422);
    const inj = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`)
      .send(address({ userId: 1 })).expect(422);
    expect(inj.body.details.map((d) => d.field)).toContain('userId');
  });
});

describe('PATCH /api/addresses/:id/default and DELETE', () => {
  it('switches the default and soft-deletes without exposing the row again', async () => {
    const token = await registerCustomer({ email: emailFor('editaddr') });
    const a = (await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(address()).expect(201)).body.data;
    const b = (await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(address({ label: 'Flat' })).expect(201)).body.data;

    await request(app).patch(`/api/addresses/${b.id}/default`).set('Authorization', `Bearer ${token}`).expect(200);
    const afterSwitch = await request(app).get('/api/addresses').set('Authorization', `Bearer ${token}`).expect(200);
    expect(afterSwitch.body.data.find((x) => x.isDefault).id).toBe(b.id);

    // Delete the new default → the survivor is promoted so one default always remains.
    await request(app).delete(`/api/addresses/${b.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    const afterDelete = await request(app).get('/api/addresses').set('Authorization', `Bearer ${token}`).expect(200);
    expect(afterDelete.body.data.map((x) => x.id)).toEqual([a.id]);
    expect(afterDelete.body.data[0].isDefault).toBe(true);
  });
});
