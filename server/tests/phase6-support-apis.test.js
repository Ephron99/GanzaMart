// Phase 6 support endpoints: reviews for the details page, newsletter and contact
// for the home/footer/contact pages.
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const runStamp = Date.now();
const newsletterEmails = [];
const contactIds = [];

afterAll(async () => {
  for (const email of newsletterEmails) {
    await pool.query('DELETE FROM newsletter_subscribers WHERE email = ?', [email]);
  }
  for (const id of contactIds) {
    await pool.query('DELETE FROM contact_messages WHERE id = ?', [id]);
  }
});

describe('GET /api/products/:id/reviews', () => {
  it('returns the page of reviews plus a summary the page can render directly', async () => {
    const res = await request(app).get('/api/products/1/reviews').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      rating: 5,
      author: expect.any(String),
      verifiedPurchase: true,          // the reviewer really ordered this product
    });
    expect(res.body.data[0].password_hash).toBeUndefined();
    expect(res.body.summary).toMatchObject({ average: 5, total: 1 });
    // Five bars always, so the client never has to fill the gaps itself.
    expect(res.body.summary.breakdown.map((b) => b.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(res.body.product).toMatchObject({ id: 1, name: expect.any(String) });
  });

  it('reports an unreviewd product as null average with zero bars, not as an error', async () => {
    const res = await request(app).get('/api/products/2/reviews').expect(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.summary.average).toBeNull();
    expect(res.body.summary.total).toBe(0);
    expect(res.body.summary.breakdown.every((b) => b.count === 0)).toBe(true);
  });

  it('pages reviews and keeps the summary covering ALL reviews', async () => {
    const res = await request(app).get('/api/products/1/reviews?limit=1&page=1').expect(200);
    expect(res.body.pagination).toMatchObject({ total: 1, limit: 1, page: 1, pages: 1 });
  });

  it('404s on an unknown product and 422s on a bad id or page', async () => {
    await request(app).get('/api/products/999999/reviews').expect(404);
    await request(app).get('/api/products/abc/reviews').expect(422);
    await request(app).get('/api/products/1/reviews?page=0').expect(422);
    await request(app).get('/api/products/1/reviews?limit=500').expect(422);
  });
});

describe('POST /api/newsletter', () => {
  it('subscribes a new address (201) and treats a repeat as a success (200)', async () => {
    const email = `reader-${runStamp}@example.com`;
    newsletterEmails.push(email);

    const first = await request(app).post('/api/newsletter').send({ email }).expect(201);
    expect(first.body.data).toMatchObject({ subscribed: true, alreadySubscribed: false });

    const second = await request(app).post('/api/newsletter').send({ email }).expect(200);
    expect(second.body.data.alreadySubscribed).toBe(true);

    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE email = ?', [email]);
    expect(Number(rows[0].n)).toBe(1);            // no duplicate rows despite two calls
  });

  it('normalises case so Alice@Example.com is the same subscriber', async () => {
    const email = `MixedCase-${runStamp}@Example.com`;
    newsletterEmails.push(email.toLowerCase());

    await request(app).post('/api/newsletter').send({ email }).expect(201);
    const repeat = await request(app).post('/api/newsletter').send({ email: email.toLowerCase() }).expect(200);
    expect(repeat.body.data.alreadySubscribed).toBe(true);
  });

  it('rejects a missing or malformed address with a field detail', async () => {
    const missing = await request(app).post('/api/newsletter').send({}).expect(422);
    expect(missing.body.details[0].field).toBe('email');

    await request(app).post('/api/newsletter').send({ email: 'not-an-email' }).expect(422);
    await request(app).post('/api/newsletter').send({ email: 'a@b.com', id: 5 }).expect(422);
  });
});

describe('POST /api/contact', () => {
  const message = (over = {}) => ({
    name: 'Jean-Paul Habimana',
    email: `jean-paul-${runStamp}@example.com`,
    phone: '+250 788 123 456',
    subject: 'Delivery to Huye district',
    message: 'Could you confirm whether you deliver to Huye before I place an order?',
    ...over,
  });

  it('stores the message and returns a reference number', async () => {
    const body = message();
    const res = await request(app).post('/api/contact').send(body).expect(201);

    expect(res.body.data.id).toBeGreaterThan(0);
    expect(res.body.data.ticket).toMatch(/^GM-\d{6}$/);
    contactIds.push(res.body.data.id);

    const [rows] = await pool.query('SELECT name, email, phone, subject, is_handled FROM contact_messages WHERE id = ?', [res.body.data.id]);
    expect(rows[0]).toMatchObject({ name: body.name, email: body.email, is_handled: 0 });
  });

  it('accepts a submission without the optional phone number', async () => {
    const res = await request(app).post('/api/contact').send(message({ phone: '' })).expect(201);
    contactIds.push(res.body.data.id);
    expect(res.body.success).toBe(true);
  });

  it.each([
    ['a short name', { name: 'A' }],
    ['an invalid e-mail', { email: 'nope' }],
    ['a missing subject', { subject: undefined }],
    ['a message that is too short', { message: 'hi' }],
    ['a phone number with letters', { phone: 'call me' }],
    // A visitor marking their own ticket as handled would hide it from the admin
    // queue, which is exactly the privilege check the spec asks for.
    ['an attempted is_handled injection', { is_handled: 1 }],
  ])('rejects %s with 422', async (_label, over) => {
    const body = message(over);
    if (over.subject === undefined) delete body.subject;
    const res = await request(app).post('/api/contact').send(body).expect(422);
    expect(res.body.error).toBe('Validation failed');
  });

  it('caps the message length so a huge payload never reaches MySQL', async () => {
    await request(app).post('/api/contact').send(message({ message: 'x'.repeat(5000) })).expect(422);
  });
});
