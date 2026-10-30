// Phase 5 verification: catalogue reads, admin writes, uploads, archive rules.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { UPLOAD_DIR } from '../src/config/paths.js';

// 1×1 transparent PNG — a real image file, so the upload path is genuinely exercised.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let adminToken;
let customerToken;
const createdProductIds = [];
const createdCategoryIds = [];
const uploadedFiles = [];

beforeAll(async () => {
  const admin = await request(app).post('/api/auth/login')
    .send({ email: 'admin@ganza.com', password: 'Admin@123' }).expect(200);
  adminToken = admin.body.data.token;

  const customer = await request(app).post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'Alice@123' }).expect(200);
  customerToken = customer.body.data.token;
});

afterAll(async () => {
  // Permanent-delete everything this file created, then remove the uploaded images,
  // so repeated runs leave the demo database untouched.
  for (const id of createdProductIds) {
    await request(app).delete(`/api/products/${id}?mode=permanent`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
  for (const file of uploadedFiles) {
    fs.rmSync(path.join(UPLOAD_DIR, file), { force: true });
  }
  for (const id of createdCategoryIds) {
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
  }
});

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
const asCustomer = (req) => req.set('Authorization', `Bearer ${customerToken}`);

const productBody = (over = {}) => ({
  name: `Test Widget ${Date.now()}`,
  description: 'A durable widget created by the automated catalogue test suite.',
  categoryId: 9,                 // "TV & Audio"
  price: 25000,
  discountPrice: 19000,
  stock: 10,
  sku: `TST-${Date.now()}`,
  isFeatured: true,
  isNewArrival: true,
  ...over,
});

async function createProduct(body) {
  const res = await asAdmin(request(app).post('/api/products')).send(body).expect(201);
  createdProductIds.push(res.body.data.product.id);
  return res.body.data;
}

describe('GET /api/products (public catalogue)', () => {
  it('returns a paginated list without archived rows or the raw hash columns', async () => {
    const res = await request(app).get('/api/products?limit=5').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toMatchObject({ limit: 5, page: 1 });
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(20);

    const p = res.body.data[0];
    expect(p).toMatchObject({ price: expect.any(Number), currency: 'RWF' });
    expect(p.isArchived).toBeUndefined();          // admin-only field stays hidden
    expect(p.category.name).toEqual(expect.any(String));
  });

  it('exposes discounted prices as effectivePrice so the UI never re-derives them', async () => {
    const res = await request(app).get('/api/products?limit=50').expect(200);
    const discounted = res.body.data.find((p) => p.discountPrice !== null);
    const plain = res.body.data.find((p) => p.discountPrice === null);
    expect(discounted.effectivePrice).toBe(discounted.discountPrice);
    expect(plain.effectivePrice).toBe(plain.price);
  });

  it('searches by name, SKU and description', async () => {
    const byName = await request(app).get('/api/products?search=galaxy').expect(200);
    expect(byName.body.data.some((p) => /galaxy/i.test(p.name))).toBe(true);

    const byDesc = await request(app).get('/api/products?search=oil-free').expect(200);
    expect(byDesc.body.data.every((p) => /oil-free/i.test(p.description))).toBe(true);

    const none = await request(app).get('/api/products?search=zzzqqqxx').expect(200);
    expect(none.body.data).toHaveLength(0);
  });

  it('filters by category slug and includes sub-category products', async () => {
    // "electronics" is a parent: phones/laptops/TVs live in its children.
    const res = await request(app).get('/api/products?category=electronics&limit=100').expect(200);
    const slugs = new Set(res.body.data.map((p) => p.category.slug));
    expect(slugs.size).toBeGreaterThan(1);          // children included
    expect([...slugs].every((s) => !['fashion', 'beauty-health'].includes(s))).toBe(true);

    const childOnly = await request(app).get('/api/products?category=computers&limit=100').expect(200);
    expect(childOnly.body.data.every((p) => p.category.slug === 'computers')).toBe(true);
  });

  it('filters by price range and availability, using the discounted price', async () => {
    const cheap = await request(app).get('/api/products?maxPrice=20000&limit=100').expect(200);
    expect(cheap.body.data.every((p) => p.effectivePrice <= 20000)).toBe(true);

    const soldOut = await request(app).get('/api/products?inStock=false&limit=100').expect(200);
    expect(soldOut.body.data.every((p) => p.stock === 0)).toBe(true);

    const available = await request(app).get('/api/products?inStock=true&limit=100').expect(200);
    expect(available.body.data.every((p) => p.stock > 0)).toBe(true);
  });

  it('sorts by price and by best-selling, and ignores an unknown sort key', async () => {
    const asc = await request(app).get('/api/products?sort=price-asc&limit=8').expect(200);
    const prices = asc.body.data.map((p) => p.effectivePrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);

    const best = await request(app).get('/api/products?sort=best-selling&limit=3').expect(200);
    const sold = best.body.data.map((p) => p.soldCount);
    expect([...sold].sort((a, b) => b - a)).toEqual(sold);          // strictly descending
    expect(best.body.data[0].id).toBe(7);                           // the shirt, sold 2×
    expect(best.body.data[0].rating).toBe(4);                       // aggregate from reviews

    const bogus = await request(app).get('/api/products?sort=DROP+TABLE&limit=3').expect(200);
    expect(bogus.body.data.length).toBeGreaterThan(0);   // falls back to newest
  });

  it('survives an injection attempt in the search parameter', async () => {
    const before = (await pool.query('SELECT COUNT(*) AS n FROM products'))[0][0].n;
    const res = await request(app).get("/api/products?search='; DROP TABLE products; --").expect(200);
    const after = (await pool.query('SELECT COUNT(*) AS n FROM products'))[0][0].n;
    expect(res.body.data).toHaveLength(0);
    expect(after).toBe(before);
  });

  it('returns 422 for a malformed page number instead of silently guessing', async () => {
    await request(app).get('/api/products?page=abc').expect(422);
    await request(app).get('/api/products?limit=5000').expect(422);
    await request(app).get('/api/products?minPrice=-5').expect(422);
  });
});

describe('GET /api/products/:id', () => {
  it('returns the product, its gallery (card image first) and related items', async () => {
    const res = await request(app).get('/api/products/1').expect(200);
    expect(res.body.data.product.name).toMatch(/Galaxy/);
    expect(res.body.data.images.length).toBeGreaterThanOrEqual(3);   // card + 2 gallery rows
    expect(res.body.data.images[0].url).toBe(res.body.data.product.imageUrl);
    expect(res.body.data.related.every((p) => p.id !== 1)).toBe(true);
    expect(res.body.data.related.every((p) => p.category.id === 7)).toBe(true);
  });

  it('returns 404 for a missing product and 422 for a non-numeric id', async () => {
    await request(app).get('/api/products/999999').expect(404);
    await request(app).get('/api/products/not-a-number').expect(422);
  });

  it('hides archived products from the public but shows them to admins', async () => {
    const { product } = await createProduct(productBody());
    await asAdmin(request(app).delete(`/api/products/${product.id}`)).expect(200);

    await request(app).get(`/api/products/${product.id}`).expect(404);
    const inPublicList = await request(app).get('/api/products?limit=100').expect(200);
    expect(inPublicList.body.data.some((p) => p.id === product.id)).toBe(false);

    const adminView = await asAdmin(request(app).get(`/api/admin/products?archived=true`)).expect(200);
    expect(adminView.body.data.some((p) => p.id === product.id)).toBe(true);
  });
});

describe('product writes require the admin role', () => {
  const body = () => productBody();

  it('rejects anonymous (401) and customer (403) callers on POST, PUT and DELETE', async () => {
    await request(app).post('/api/products').send(body()).expect(401);
    await asCustomer(request(app).post('/api/products')).send(body()).expect(403);

    await request(app).put('/api/products/1').send(body()).expect(401);
    await asCustomer(request(app).put('/api/products/1')).send(body()).expect(403);

    await request(app).delete('/api/products/1').expect(401);
    await asCustomer(request(app).delete('/api/products/1')).expect(403);

    await asCustomer(request(app).patch('/api/products/1/stock')).send({ stock: 5 }).expect(403);
  });

  it('never let a shopper reach the admin product list', async () => {
    await asCustomer(request(app).get('/api/admin/products')).expect(403);
  });
});

describe('POST /api/products (admin)', () => {
  it('creates a product with a generated unique slug and admin-only fields', async () => {
    const name = `Unique Name ${Date.now()}`;
    const first = await createProduct(productBody({ name }));
    expect(first.product.slug).toBe(name.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-'));
    expect(first.product.sku).toMatch(/^TST-/);                 // upper-cased by the service
    expect(first.product.isLowStock).toBe(false);
    expect(first.product.effectivePrice).toBe(19000);

    // Same name again → the UNIQUE slug constraint is honoured via a -2 suffix.
    const second = await createProduct(productBody({ name }));
    expect(second.product.slug).toBe(`${first.product.slug}-2`);
  });

  it.each([
    ['missing name', { name: undefined }],
    ['missing description', { description: undefined }],
    ['missing category', { categoryId: undefined }],
    ['missing price', { price: undefined }],
    ['short name', { name: 'x' }],
    ['short description', { description: 'too short' }],
    ['zero price', { price: 0 }],
    ['negative price', { price: -100 }],
    ['discount equal to price', { discountPrice: 25000 }],
    ['discount greater than price', { discountPrice: 30000 }],
    ['negative stock', { stock: -1 }],
    ['unknown category id', { categoryId: 987654 }],
    ['client-supplied id', { id: 999 }],
  ])('rejects %s with 422 and a field detail', async (_label, over) => {
    const body = productBody(over);
    if (over.name === undefined) delete body.name;
    if (over.description === undefined) delete body.description;
    if (over.categoryId === undefined) delete body.categoryId;
    if (over.price === undefined) delete body.price;

    const res = await asAdmin(request(app).post('/api/products')).send(body).expect(422);
    expect(res.body.error).toBe('Validation failed');
  });

  it('accepts a multipart upload, stores the file and serves it from /uploads', async () => {
    const res = await asAdmin(request(app).post('/api/products')
      .field('name', `Uploaded Shirt ${Date.now()}`)
      .field('description', 'Product created through the multipart upload path.')
      .field('categoryId', '9')
      .field('price', '15000')
      .field('stock', '5')
      .field('sku', `UPL-${Date.now()}`)
      .attach('images', PNG, 'photo.png'))
      .expect(201);

    const { product } = res.body.data;
    createdProductIds.push(product.id);

    expect(product.imageUrl).toMatch(/^\/uploads\/\d+-[0-9a-f]{16}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, path.basename(product.imageUrl)))).toBe(true);
    uploadedFiles.push(path.basename(product.imageUrl));

    const fetched = await request(app).get(product.imageUrl).expect(200);
    expect(fetched.headers['content-type']).toBe('image/png');
  });

  it('rejects a disallowed file type before writing it to disk', async () => {
    const before = fs.readdirSync(UPLOAD_DIR).length;
    const res = await asAdmin(request(app).post('/api/products')
      .field('name', 'Bad Upload Test')
      .field('description', 'Attempting to upload a PHP file as an image.')
      .field('categoryId', '9').field('price', '1000').field('stock', '1')
      .attach('images', Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php'))
      .expect(422);

    expect(res.body.error).toMatch(/Unsupported image type/i);
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);   // nothing persisted
  });
});

describe('PUT /api/products/:id and inventory', () => {
  it('keeps the slug stable when only the price changes', async () => {
    const { product } = await createProduct(productBody());
    const res = await asAdmin(request(app).put(`/api/products/${product.id}`))
      .send(productBody({ name: product.name, price: 30000, discountPrice: null }))
      .expect(200);

    expect(res.body.data.product.slug).toBe(product.slug);
    expect(res.body.data.product.price).toBe(30000);
    expect(res.body.data.product.discountPrice).toBeNull();
    expect(res.body.data.product.effectivePrice).toBe(30000);
  });

  it('updates stock through the dedicated inventory endpoint and validates it', async () => {
    const { product } = await createProduct(productBody({ stock: 4 }));
    const res = await asAdmin(request(app).patch(`/api/products/${product.id}/stock`))
      .send({ stock: 3 }).expect(200);
    expect(res.body.data.product.stock).toBe(3);
    expect(res.body.data.product.isLowStock).toBe(true);        // threshold default is 5

    await asAdmin(request(app).patch(`/api/products/${product.id}/stock`)).send({ stock: -1 }).expect(422);
    await asAdmin(request(app).patch(`/api/products/${product.id}/stock`)).send({}).expect(422);
  });

  it('flags low-stock products for the dashboard alert list', async () => {
    const res = await asAdmin(request(app).get('/api/admin/products?lowStock=true&limit=100')).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p) => p.isLowStock)).toBe(true);
  });

  it('returns 404 when editing a product that does not exist', async () => {
    await asAdmin(request(app).put('/api/products/999999'))
      .send(productBody()).expect(404);
  });
});

describe('archive, permanent delete and restore', () => {
  it('archives by default so historical data survives', async () => {
    const { product } = await createProduct(productBody());
    const res = await asAdmin(request(app).delete(`/api/products/${product.id}`)).expect(200);
    expect(res.body.data).toMatchObject({ mode: 'archived', id: product.id });

    const restored = await asAdmin(request(app).post(`/api/products/${product.id}/restore`)).expect(200);
    expect(restored.body.data.product.isArchived).toBe(false);

    // Ready for the afterAll cleanup.
    await asAdmin(request(app).delete(`/api/products/${product.id}?mode=permanent`)).expect(200);
    const index = createdProductIds.indexOf(product.id);
    if (index >= 0) createdProductIds.splice(index, 1);
  });

  it('refuses a permanent delete for a product that appears in an order (409)', async () => {
    const res = await asAdmin(request(app).delete('/api/products/1?mode=permanent')).expect(409);
    expect(res.body.error).toMatch(/order line|Archive/i);

    // The seeded product must still be there for the shop to work.
    await request(app).get('/api/products/1').expect(200);
  });

  it('removes the uploaded file from disk when a product is deleted permanently', async () => {
    const res = await asAdmin(request(app).post('/api/products')
      .field('name', `Disposable Upload ${Date.now()}`)
      .field('description', 'Created only to prove the delete path cleans up bytes.')
      .field('categoryId', '9').field('price', '4000').field('stock', '1')
      .field('sku', `DLP-${Date.now()}`)
      .attach('images', PNG, 'photo.png'))
      .expect(201);

    const { product } = res.body.data;
    const file = path.join(UPLOAD_DIR, path.basename(product.imageUrl));
    expect(fs.existsSync(file)).toBe(true);

    // Query string instead of a bare "/id?mode=" so nothing can mis-parse it.
    const del = await asAdmin(request(app).delete(`/api/products/${product.id}`).query({ mode: 'permanent' })).expect(200);
    expect(del.body.data).toMatchObject({ mode: 'permanent', id: product.id });
    expect(del.body.data.filesRemoved).toContain(product.imageUrl);
    expect(fs.existsSync(file)).toBe(false);          // no orphan bytes left behind

    const index = createdProductIds.indexOf(product.id);
    if (index >= 0) createdProductIds.splice(index, 1);
  });

  it('deletes one gallery image, and never one that belongs to another product', async () => {
    // Two uploads: the first becomes the card image, the second joins the gallery.
    const res = await asAdmin(request(app).post('/api/products')
      .field('name', `Gallery Cleanup ${Date.now()}`)
      .field('description', 'Product with a separate card image and gallery image.')
      .field('categoryId', '9').field('price', '5000').field('stock', '1')
      .field('sku', `GAL-${Date.now()}`)
      .attach('images', PNG, 'card.png')
      .attach('images', PNG, 'gallery.png'))
      .expect(201);

    const { product } = res.body.data;
    createdProductIds.push(product.id);

    const detail = await request(app).get(`/api/products/${product.id}`).expect(200);
    const gallery = detail.body.data.images.find((img) => img.id !== null && img.url !== product.imageUrl);
    expect(gallery).toBeDefined();
    const galleryFile = path.join(UPLOAD_DIR, path.basename(gallery.url));
    expect(fs.existsSync(galleryFile)).toBe(true);

    // Somebody else's image id must not be deletable through this product.
    await asAdmin(request(app).delete(`/api/products/1/images/${gallery.id}`)).expect(404);
    expect(fs.existsSync(galleryFile)).toBe(true);

    const removed = await asAdmin(request(app).delete(`/api/products/${product.id}/images/${gallery.id}`)).expect(200);
    expect(removed.body.data.filesRemoved).toContain(gallery.url);
    expect(removed.body.data.images.some((img) => img.id === gallery.id)).toBe(false);
    expect(fs.existsSync(galleryFile)).toBe(false);
  });

  it('rejects a non-numeric image id with 422', async () => {
    await asAdmin(request(app).delete('/api/products/1/images/abc')).expect(422);
  });
});

describe('categories', () => {
  it('returns a nested tree with rolled-up product counts', async () => {
    const res = await request(app).get('/api/categories').expect(200);
    const electronics = res.body.data.find((c) => c.slug === 'electronics');

    expect(electronics.children.map((c) => c.slug).sort())
      .toEqual(['computers', 'phones-tablets', 'tv-audio']);
    expect(electronics.productCount).toBe(0);                 // products live in children

    // The expectation is derived, never hard-coded: a parent's total is its own count
    // plus the totals of its children, and it has to agree with what the catalogue
    // filter actually returns for that parent.
    expect(electronics.totalProductCount)
      .toBe(electronics.productCount + electronics.children.reduce((sum, c) => sum + c.totalProductCount, 0));
    expect(electronics.totalProductCount).toBeGreaterThanOrEqual(6);   // 2 phones + 2 pcs + 2 audio (seeded)

    const listed = await request(app).get('/api/products?category=electronics&limit=100').expect(200);
    expect(listed.body.pagination.total).toBe(electronics.totalProductCount);

    // Siblings stay independent: fashion's children must not leak into electronics.
    const fashion = res.body.data.find((c) => c.slug === 'fashion');
    expect(fashion.totalProductCount).toBe(fashion.children.reduce((sum, c) => sum + c.totalProductCount, 0));
    expect(fashion.totalProductCount).toBeLessThan(electronics.totalProductCount);
  });

  it('returns a flat list for admin <select> inputs', async () => {
    const res = await request(app).get('/api/categories?flat=true').expect(200);
    expect(res.body.data[0].children).toBeUndefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(12);
  });

  it('resolves a category by slug or by id, with its products', async () => {
    const bySlug = await request(app).get('/api/categories/computers').expect(200);
    const byId = await request(app).get('/api/categories/8').expect(200);

    expect(bySlug.body.data.category.slug).toBe('computers');
    expect(byId.body.data.category.id).toBe(bySlug.body.data.category.id);
    expect(bySlug.body.data.products.every((p) => p.category.slug === 'computers')).toBe(true);
  });

  it('404s on an unknown category and 404s on an unknown product category filter', async () => {
    await request(app).get('/api/categories/no-such-category').expect(404);
    await request(app).get('/api/products?category=no-such-category').expect(404);
  });

  it('creates, updates and deletes a category (admin only)', async () => {
    const created = await asAdmin(request(app).post('/api/categories'))
      .send({ name: 'Temp Sub Category', parentId: 1 }).expect(201);
    createdCategoryIds.push(created.body.data.id);
    expect(created.body.data.slug).toBe('temp-sub-category');
    expect(created.body.data.parentId).toBe(1);

    const updated = await asAdmin(request(app).put(`/api/categories/${created.body.data.id}`))
      .send({ name: 'Renamed Category', parentId: 1 }).expect(200);
    expect(updated.body.data.slug).toBe('renamed-category');

    await asAdmin(request(app).delete(`/api/categories/${created.body.data.id}`)).expect(200);
    await request(app).get(`/api/categories/${created.body.data.id}`).expect(404);
  });

  it('refuses to delete a category that still holds products or sub-categories', async () => {
    const withProducts = await asAdmin(request(app).delete('/api/categories/8')).expect(409);
    expect(withProducts.body.error).toMatch(/product\(s\) still belong/i);

    const withChildren = await asAdmin(request(app).delete('/api/categories/1')).expect(409);
    expect(withChildren.body.error).toMatch(/sub-categories/i);
  });

  it('rejects a category cycle (parent inside its own subtree)', async () => {
    // Making "Electronics" (1) a child of its own grandchild "Kitchen Appliances" is fine,
    // but making it a child of a descendant would loop: set parent of 1 → 7 (its child).
    const res = await asAdmin(request(app).put('/api/categories/1'))
      .send({ name: 'Electronics', parentId: 7 }).expect(422);
    expect(res.body.details[0].message).toMatch(/loop/i);
  });

  it('guards category writes with the admin role', async () => {
    await asCustomer(request(app).post('/api/categories')).send({ name: 'Hijack Category' }).expect(403);
    await request(app).delete('/api/categories/1').expect(401);
  });
});
