// Phase 8 verification: checkout (the transactional order placement), coupon
// application, stock integrity, order reads/ownership, customer cancellation and the
// admin status console — run against the real seeded MySQL database.
//
// Orders are hard to "undo" cleanly, so instead of hand-reversing each mutation we
// snapshot product stock and coupon counters in beforeAll and restore them wholesale
// in afterAll (after deleting the throwaway orders). Every test user uses a unique
// @<run>.example.com email so the demo accounts and seeded history are never touched.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const RUN = `${Date.now()}`;
const emailFor = (name) => `${name}.${RUN}@example.com`;

const sessionTokens = [];
let stockSnapshot = [];
let couponSnapshot = [];

async function registerCustomer(email) {
  const res = await request(app).post('/api/auth/register').send({
    fullName: 'Phase8 Tester', email, password: 'Password123',
  }).expect(201);
  return res.body.data.token;
}

// A customer ready to check out: registered + one address + optional cart lines.
async function buyer(withLines = []) {
  const token = await registerCustomer(emailFor(`cust${Math.random().toString(36).slice(2, 8)}`));
  const addr = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send({
    label: 'Home', recipient: 'Phase8 Tester', phone: '+250789999999',
    line1: 'KG 1 Test St', city: 'Kigali', province: 'Kigali City',
  }).expect(201);
  for (const [productId, quantity] of withLines) {
    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity }).expect(200);
  }
  return { token, addressId: addr.body.data.id };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const [stocks] = await pool.query('SELECT id, stock FROM products');
  stockSnapshot = stocks;
  const [coupons] = await pool.query('SELECT id, used_count FROM coupons');
  couponSnapshot = coupons;
});

afterAll(async () => {
  // Remove throwaway orders (CASCADE wipes their items/payments/shipments/
  // redemptions/history) before the users they belong to can be deleted.
  await pool.query(
    `DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)`,
    [`%.${RUN}@example.com`]);

  // Roll inventory and coupon counters back to the exact pre-suite values.
  for (const s of stockSnapshot) {
    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [s.stock, s.id]);
  }
  for (const c of couponSnapshot) {
    await pool.query('UPDATE coupons SET used_count = ? WHERE id = ?', [c.used_count, c.id]);
  }

  if (sessionTokens.length) {
    await pool.query(`DELETE FROM carts WHERE session_token IN (${sessionTokens.map(() => '?').join(',')})`, sessionTokens);
  }
  await pool.query('DELETE FROM users WHERE email LIKE ?', [`%.${RUN}@example.com`]);
});

// ── Checkout ────────────────────────────────────────────────────────────────────
describe('POST /api/orders (checkout)', () => {
  it('requires a signed-in customer', async () => {
    await request(app).post('/api/orders').send({ addressId: 1 }).expect(401);
  });

  it('rejects an empty cart with 409', async () => {
    const { token, addressId } = await buyer();
    await request(app).post('/api/orders').set(auth(token)).send({ addressId }).expect(409);
  });

  it('rejects a forged price/total field with 422', async () => {
    const { token, addressId } = await buyer([[6, 1]]);
    await request(app).post('/api/orders').set(auth(token)).send({ addressId, total: 1 }).expect(422);
  });

  it('404s when the address is not in the buyer’s book', async () => {
    const { token } = await buyer([[6, 1]]);
    await request(app).post('/api/orders').set(auth(token)).send({ addressId: 999999 }).expect(404);
  });

  it('places a cash-on-delivery order at server-derived prices with the flat shipping fee', async () => {
    // Product 6 (JBL): discount 58,000 × 2 = subtotal 116,000; < 200k so shipping 2,000.
    const { token, addressId } = await buyer([[6, 2]]);
    const res = await request(app).post('/api/orders').set(auth(token)).send({ addressId, paymentMethod: 'cod' }).expect(201);

    const o = res.body.data;
    expect(o.status).toBe('pending');
    expect(o).toMatchObject({ subtotal: 116000, discountAmount: 0, shippingFee: 2000, totalAmount: 118000, currency: 'RWF' });
    expect(o.orderNumber).toMatch(/^GM\d{12}$/);
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ productId: 6, quantity: 2, unitPrice: 58000, lineTotal: 116000 });
    expect(o.payment).toMatchObject({ method: 'cod', status: 'pending', amount: 118000 });
    expect(o.history.at(-1)).toMatchObject({ fromStatus: null, toStatus: 'pending' });

    // Cart emptied and stock decremented by the live re-check.
    const cart = await request(app).get('/api/cart').set(auth(token)).expect(200);
    expect(cart.body.data.items).toHaveLength(0);
    const [rows] = await pool.query('SELECT stock FROM products WHERE id = 6');
    expect(Number(rows[0].stock)).toBe(58);
  });

  it('charges a mock payment immediately (paid, never stores card data)', async () => {
    const { token, addressId } = await buyer([[17, 1]]);   // Pragmatic 35,000, no discount
    const res = await request(app).post('/api/orders').set(auth(token)).send({ addressId, paymentMethod: 'mock' }).expect(201);
    expect(res.body.data).toMatchObject({ subtotal: 35000, shippingFee: 2000, totalAmount: 37000 });
    expect(res.body.data.payment).toMatchObject({ method: 'mock', status: 'paid' });
    expect(res.body.data.payment.providerRef).toMatch(/^MOCK-GM/);
  });

  it('waives shipping above the free-delivery threshold', async () => {
    const { token, addressId } = await buyer([[1, 1]]);    // Galaxy 315,000 discounted
    const res = await request(app).post('/api/orders').set(auth(token)).send({ addressId }).expect(201);
    expect(res.body.data).toMatchObject({ subtotal: 315000, shippingFee: 0, totalAmount: 315000 });
  });
});

// ── Coupons ─────────────────────────────────────────────────────────────────────
describe('POST /api/coupons/validate', () => {
  it('requires auth and previews the discount against the live cart', async () => {
    await request(app).post('/api/coupons/validate').send({ code: 'WELCOME10' }).expect(401);
    // Product 6 × 2 = 116,000; WELCOME10 = 10% → 11,600 off.
    const { token } = await buyer([[6, 2]]);
    const res = await request(app).post('/api/coupons/validate').set(auth(token)).send({ code: 'welcome10' }).expect(200);
    expect(res.body.data).toMatchObject({ code: 'WELCOME10', type: 'percent', discount: 11600, subtotal: 116000 });
  });

  it('rejects an expired code with 422', async () => {
    const { token } = await buyer([[6, 2]]);
    const res = await request(app).post('/api/coupons/validate').set(auth(token)).send({ code: 'EXPIRED20' }).expect(422);
    expect(res.body.success).toBe(false);
  });

  it('applies a percentage coupon at checkout and records the redemption', async () => {
    const { token, addressId } = await buyer([[6, 2]]);   // subtotal 116,000
    const res = await request(app).post('/api/orders').set(auth(token))
      .send({ addressId, couponCode: 'WELCOME10' }).expect(201);
    expect(res.body.data).toMatchObject({ subtotal: 116000, discountAmount: 11600, shippingFee: 2000, totalAmount: 106400 });
    expect(res.body.data.couponCode).toBe('WELCOME10');

    const [r] = await pool.query('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE order_id = ?', [res.body.data.id]);
    expect(Number(r[0].n)).toBe(1);
  });

  it('enforces the minimum order (WELCOME10 needs 20,000)', async () => {
    const { token, addressId } = await buyer([[18, 1]]);  // 7,500 notebook
    await request(app).post('/api/orders').set(auth(token)).send({ addressId, couponCode: 'WELCOME10' }).expect(422);
  });

  it('refuses a coupon the customer has already used', async () => {
    const { token, addressId } = await buyer([[6, 2]]);
    await request(app).post('/api/orders').set(auth(token)).send({ addressId, couponCode: 'WELCOME10' }).expect(201);
    // Same buyer, second order, same coupon → blocked by the per-customer rule.
    await request(app).post('/api/cart/items').set(auth(token)).send({ productId: 6, quantity: 2 }).expect(200);
    await request(app).post('/api/orders').set(auth(token)).send({ addressId, couponCode: 'WELCOME10' }).expect(422);
  });
});

// ── Stock integrity ───────────────────────────────────────────────────────────
describe('stock is re-verified at checkout', () => {
  it('409s when live stock fell below the cart quantity', async () => {
    const { token, addressId } = await buyer([[14, 4]]);  // Vitamin C, stock 4, cart at max
    await pool.query('UPDATE products SET stock = 2 WHERE id = 14'); // sold out from under us
    await request(app).post('/api/orders').set(auth(token)).send({ addressId }).expect(409);
    await pool.query('UPDATE products SET stock = 4 WHERE id = 14');
  });
});

// ── Order reads, ownership & cancellation ──────────────────────────────────────
describe('GET /api/orders and ownership', () => {
  it('lists the buyer’s orders and hides another customer’s order (404)', async () => {
    const alice = await buyer([[6, 1]]);
    const placed = await request(app).post('/api/orders').set(auth(alice.token))
      .send({ addressId: alice.addressId }).expect(201);

    const list = await request(app).get('/api/orders').set(auth(alice.token)).expect(200);
    expect(list.body.data.some((o) => o.id === placed.body.data.id)).toBe(true);
    expect(list.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Regression: real browsers send page/limit as query STRINGS — the service must
    // coerce them or mysql2 inlines 'limit' as a quoted literal and LIMIT breaks.
    const paged = await request(app).get('/api/orders?page=1&limit=10').set(auth(alice.token)).expect(200);
    expect(paged.body.pagination).toMatchObject({ page: 1, limit: 10 });

    // A different customer cannot read Alice's order by id.
    const bob = await buyer();
    await request(app).get(`/api/orders/${placed.body.data.id}`).set(auth(bob.token)).expect(404);
  });

  it('lets a customer cancel a pending order and restores the stock', async () => {
    const b = await buyer([[7, 3]]);                       // Oxford shirt 19,000 each
    const [stockRow] = await pool.query('SELECT stock FROM products WHERE id = 7');
    const placed = await request(app).post('/api/orders').set(auth(b.token)).send({ addressId: b.addressId }).expect(201);
    const [afterOrder] = await pool.query('SELECT stock FROM products WHERE id = 7');
    expect(Number(afterOrder[0].stock)).toBe(Number(stockRow[0].stock) - 3);

    const cancelled = await request(app).post(`/api/orders/${placed.body.data.id}/cancel`)
      .set(auth(b.token)).send({ reason: 'Changed my mind' }).expect(200);
    expect(cancelled.body.data.status).toBe('cancelled');

    const [afterCancel] = await pool.query('SELECT stock FROM products WHERE id = 7');
    expect(Number(afterCancel[0].stock)).toBe(Number(stockRow[0].stock));

    // Cancelling twice is refused.
    await request(app).post(`/api/orders/${placed.body.data.id}/cancel`).set(auth(b.token)).expect(409);
  });
});

// ── Admin console ──────────────────────────────────────────────────────────────
describe('admin order console', () => {
  async function adminToken() {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'admin@ganza.com', password: 'Admin@123' }).expect(200);
    return res.body.data.token;
  }

  it('blocks a customer from the admin namespace (403)', async () => {
    const b = await buyer();
    await request(app).get('/api/admin/orders').set(auth(b.token)).expect(403);
  });

  it('lists every order and walks the status machine, rejecting illegal jumps', async () => {
    const admin = await adminToken();
    const b = await buyer([[6, 1]]);
    const placed = await request(app).post('/api/orders').set(auth(b.token)).send({ addressId: b.addressId }).expect(201);
    const id = placed.body.data.id;

    const list = await request(app).get('/api/admin/orders').set(auth(admin)).expect(200);
    expect(list.body.data.some((o) => o.id === id)).toBe(true);

    // pending → confirmed is legal.
    await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(admin)).send({ status: 'confirmed' }).expect(200);
    // confirmed → delivered is NOT a permitted single step.
    await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(admin)).send({ status: 'delivered' }).expect(409);
    // Attach shipment details, then ship.
    await request(app).patch(`/api/admin/orders/${id}/shipment`).set(auth(admin))
      .send({ carrier: 'Ganza Express', trackingNumber: 'TRK-001' }).expect(200);
    const shipped = await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(admin))
      .send({ status: 'processing' }).expect(200);
    await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(admin)).send({ status: 'shipped' }).expect(200);
    expect(shipped.body.data.id).toBe(id);
  });

  it('marks a cash-on-delivery order paid when it is delivered', async () => {
    const admin = await adminToken();
    const b = await buyer([[6, 1]]);
    const placed = await request(app).post('/api/orders').set(auth(b.token)).send({ addressId: b.addressId }).expect(201);
    const id = placed.body.data.id;
    for (const s of ['confirmed', 'processing', 'shipped', 'delivered']) {
      await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(admin)).send({ status: s }).expect(200);
    }
    const detail = await request(app).get(`/api/admin/orders/${id}`).set(auth(admin)).expect(200);
    expect(detail.body.data.status).toBe('delivered');
    expect(detail.body.data.payment.status).toBe('paid');
    expect(detail.body.data.shipment.deliveredAt).not.toBeNull();
  });
});
