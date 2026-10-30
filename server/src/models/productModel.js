// Data access for `products` and `product_images`.
// Every filter value is a `?` placeholder; the only interpolated numbers are
// LIMIT/OFFSET and a whitelisted ORDER BY expression (see SORT_WHITELIST below).
import { pool } from '../config/db.js';

const COLUMNS = `p.id, p.category_id, p.name, p.slug, p.description, p.price, p.discount_price,
                 p.stock, p.low_stock_threshold, p.sku, p.image_url, p.is_featured,
                 p.is_new_arrival, p.is_archived, p.created_at, p.updated_at`;

// Average rating and units sold are NOT columns on `products` (MySQL forbids
// subqueries in generated columns — see database/schema.sql), so they are derived
// per query. Both fragments are shared by every product query on purpose: a product
// must never report a different rating or sold count depending on which endpoint
// returned it. Assumes the products table is aliased as `p`.
const DERIVED_COLUMNS = `rv.review_avg, rv.review_count, COALESCE(os.sold_count, 0) AS sold_count`;
const DERIVED_JOINS = `
  LEFT JOIN (SELECT product_id, AVG(rating) AS review_avg, COUNT(*) AS review_count
               FROM reviews GROUP BY product_id) rv ON rv.product_id = p.id
  LEFT JOIN (SELECT oi.product_id, SUM(oi.quantity) AS sold_count
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
              GROUP BY oi.product_id) os ON os.product_id = p.id`;

// Whitelist instead of interpolating req.query.sort — an unknown key is rejected,
// so no user input can ever reach the ORDER BY clause as raw SQL.
const SORT_WHITELIST = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  'price-asc': 'effective_price ASC',
  'price-desc': 'effective_price DESC',
  'name-asc': 'p.name ASC',
  'name-desc': 'p.name DESC',
  'best-selling': 'sold_count DESC',
  'rating-desc': 'review_avg DESC',
};

export function isValidSort(sort) {
  return Object.prototype.hasOwnProperty.call(SORT_WHITELIST, sort);
}

/**
 * Paginated catalogue query used by the shop front AND the admin table.
 * @param {object} f filters — search, categoryIds, minPrice, maxPrice, inStock,
 *                    featured, newArrivals, lowStock, includeArchived, archivedOnly,
 *                    sort, page, limit
 */
export async function listProducts(f) {
  const {
    search = '', categoryIds = [], minPrice, maxPrice, inStock,
    featured, newArrivals, lowStock, includeArchived = false, archivedOnly = false,
    sort = 'newest', page = 1, limit = 12,
  } = f;

  const where = [];
  const params = [];

  if (archivedOnly) where.push('p.is_archived = 1');
  else if (!includeArchived) where.push('p.is_archived = 0');

  if (search) {
    // LIKE is used (not the FULLTEXT index) because shoppers type partial words
    // like "gal"; FULLTEXT would need whole words plus a minimum-token length.
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (categoryIds.length) {
    where.push(`p.category_id IN (${categoryIds.map(() => '?').join(',')})`);
    params.push(...categoryIds);
  }
  if (minPrice !== undefined) { where.push('COALESCE(p.discount_price, p.price) >= ?'); params.push(minPrice); }
  if (maxPrice !== undefined) { where.push('COALESCE(p.discount_price, p.price) <= ?'); params.push(maxPrice); }
  if (inStock === true) where.push('p.stock > 0');
  if (inStock === false) where.push('p.stock = 0');
  if (featured === true) where.push('p.is_featured = 1');
  if (newArrivals === true) where.push('p.is_new_arrival = 1');
  if (lowStock === true) where.push('p.stock <= p.low_stock_threshold');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORT_WHITELIST[sort] ?? SORT_WHITELIST.newest;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p ${whereSql}`, params
  );
  const total = Number(countRows[0].total);

  const take = Math.min(Math.max(Number(limit) || 12, 1), 100);
  const current = Math.max(Number(page) || 1, 1);
  const offset = (current - 1) * take;

  // One derived table per query gives us rating + best-selling data without an
  // extra round-trip per product (the N+1 query trap).
  const [rows] = await pool.query(
    `SELECT ${COLUMNS},
            c.name AS category_name, c.slug AS category_slug,
            COALESCE(p.discount_price, p.price) AS effective_price,
            ${DERIVED_COLUMNS}
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${DERIVED_JOINS}
       ${whereSql}
      ORDER BY ${orderSql}, p.id DESC
      LIMIT ${take} OFFSET ${offset}`,
    params
  );

  return { products: rows, total, page: current, limit: take };
}

export async function findProductById(id, { includeArchived = false } = {}) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS},
            c.name AS category_name, c.slug AS category_slug,
            COALESCE(p.discount_price, p.price) AS effective_price,
            ${DERIVED_COLUMNS}
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${DERIVED_JOINS}
      WHERE p.id = ? ${includeArchived ? '' : 'AND p.is_archived = 0'}
      LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function isProductSlugTaken(slug, exceptId = null) {
  const [rows] = await pool.query(
    `SELECT 1 AS x FROM products WHERE slug = ? ${exceptId ? 'AND id <> ?' : ''} LIMIT 1`,
    exceptId ? [slug, exceptId] : [slug]
  );
  return rows.length > 0;
}

export async function insertProduct(p) {
  const [result] = await pool.query(
    `INSERT INTO products
       (category_id, name, slug, description, price, discount_price, stock,
        low_stock_threshold, sku, image_url, is_featured, is_new_arrival)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.categoryId, p.name, p.slug, p.description, p.price, p.discountPrice ?? null,
      p.stock, p.lowStockThreshold ?? 5, p.sku ?? null, p.imageUrl ?? '/images/products/placeholder.svg',
      p.isFeatured ? 1 : 0, p.isNewArrival ? 1 : 0,
    ]
  );
  return result.insertId;
}

export async function updateProduct(id, p) {
  await pool.query(
    `UPDATE products SET
        category_id = ?, name = ?, slug = ?, description = ?, price = ?, discount_price = ?,
        stock = ?, low_stock_threshold = ?, sku = ?, image_url = ?,
        is_featured = ?, is_new_arrival = ?
      WHERE id = ?`,
    [
      p.categoryId, p.name, p.slug, p.description, p.price, p.discountPrice ?? null,
      p.stock, p.lowStockThreshold ?? 5, p.sku ?? null, p.imageUrl,
      p.isFeatured ? 1 : 0, p.isNewArrival ? 1 : 0, id,
    ]
  );
}

export async function setArchived(id, archived) {
  await pool.query('UPDATE products SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
}

// Direct stock assignment used by the inventory screen (delta-based changes come
// with orders in Phase 8, where they run inside a transaction).
export async function setStock(id, stock) {
  const [result] = await pool.query('UPDATE products SET stock = ? WHERE id = ?', [stock, id]);
  return result.affectedRows > 0;
}

// Hard delete is only offered when no order has ever referenced the product,
// otherwise history would break (spec §6 DB rules).
export async function countOrderReferences(productId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', [productId]);
  return Number(rows[0].n);
}

export async function deleteProduct(id) {
  // product_images cascades through the FK (ON DELETE CASCADE).
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
}

// ── gallery ────────────────────────────────────────────────────────────────
export async function listProductImages(productId) {
  const [rows] = await pool.query(
    'SELECT id, image_url, alt_text, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order, id',
    [productId]
  );
  return rows;
}

// Needed before a delete: the row has to be read while it still exists, because the
// image URL is what identifies the file on disk afterwards.
export async function findProductImage(imageId, productId) {
  const [rows] = await pool.query(
    'SELECT id, image_url FROM product_images WHERE id = ? AND product_id = ? LIMIT 1',
    [imageId, productId]
  );
  return rows[0] ?? null;
}

// How many rows still point at a URL, checked AFTER a delete. Two products may
// legitimately share one image URL, and a file must not vanish under someone
// else's product page.
export async function countImageReferences(url) {
  const [rows] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM products WHERE image_url = ?)
            + (SELECT COUNT(*) FROM product_images WHERE image_url = ?) AS n`,
    [url, url]
  );
  return Number(rows[0].n);
}

export async function addProductImages(productId, urls, startIndex = 1) {
  if (!urls.length) return;
  const values = urls.map((url, i) => [productId, url, null, startIndex + i]);
  await pool.query(
    'INSERT INTO product_images (product_id, image_url, alt_text, sort_order) VALUES ?',
    [values]
  );
}

export async function deleteProductImage(imageId, productId) {
  await pool.query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [imageId, productId]);
}

export async function countImages(productId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?', [productId]);
  return Number(rows[0].n);
}

// Same category, excluding itself, cheapest-first — the "You may also like" rail.
export async function findRelatedProducts({ categoryId, excludeId, limit = 4 }) {
  const take = Math.min(Math.max(Number(limit) || 4, 1), 12);
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.price, p.discount_price, p.image_url, p.stock,
            p.created_at, p.updated_at,
            COALESCE(p.discount_price, p.price) AS effective_price,
            ${DERIVED_COLUMNS}
       FROM products p
       ${DERIVED_JOINS}
      WHERE p.category_id = ? AND p.id <> ? AND p.is_archived = 0
      ORDER BY effective_price ASC
      LIMIT ${take}`,
    [categoryId, excludeId]
  );
  return rows;
}
