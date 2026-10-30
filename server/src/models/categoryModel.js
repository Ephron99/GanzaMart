// Data access for `categories`.
import { pool } from '../config/db.js';

const COLUMNS = 'id, parent_id, name, slug, image_url, created_at, updated_at';

export async function listCategories() {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.id AND p.is_archived = 0)
             AS product_count
       FROM categories
      ORDER BY name ASC`
  );
  return rows;
}

export async function findCategoryById(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM categories WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function findCategoryBySlug(slug) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM categories WHERE slug = ? LIMIT 1`, [slug]);
  return rows[0] ?? null;
}

export async function isCategorySlugTaken(slug, exceptId = null) {
  const [rows] = await pool.query(
    `SELECT 1 AS x FROM categories WHERE slug = ? ${exceptId ? 'AND id <> ?' : ''} LIMIT 1`,
    exceptId ? [slug, exceptId] : [slug]
  );
  return rows.length > 0;
}

export async function insertCategory({ parentId, name, slug, imageUrl }) {
  const [result] = await pool.query(
    'INSERT INTO categories (parent_id, name, slug, image_url) VALUES (?, ?, ?, ?)',
    [parentId ?? null, name, slug, imageUrl ?? null]
  );
  return result.insertId;
}

export async function updateCategory(id, { parentId, name, slug, imageUrl }) {
  await pool.query(
    `UPDATE categories SET parent_id = ?, name = ?, slug = ?, image_url = ? WHERE id = ?`,
    [parentId ?? null, name, slug, imageUrl ?? null, id]
  );
}

export async function deleteCategory(id) {
  await pool.query('DELETE FROM categories WHERE id = ?', [id]);
}

// Guard data for the delete endpoint (spec §5: safeguards for non-empty categories).
export async function countProductsInCategory(categoryId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [categoryId]
  );
  return Number(rows[0].n);      // counts archived products too — they still reference the category
}

export async function countChildCategories(categoryId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?', [categoryId]);
  return Number(rows[0].n);
}

// A category filter must also show sub-category products ("Electronics" includes
// "Phones & Tablets"). This walks one level deep — enough for this catalogue and
// it costs a single indexed query instead of recursive CTEs per request.
export async function categoryIdsWithChildren(categoryId) {
  const [rows] = await pool.query(
    'SELECT id FROM categories WHERE id = ? OR parent_id = ?', [categoryId, categoryId]
  );
  return rows.map((r) => Number(r.id));
}

// Detect cycles when an admin reparents a category: a node may never become a
// descendant of itself.
export async function isDescendantOf(candidateId, ancestorId) {
  let cursor = await findCategoryById(candidateId);
  const seen = new Set();
  while (cursor?.parent_id) {
    if (cursor.parent_id === ancestorId) return true;
    if (seen.has(cursor.id)) return false;   // broken data guard
    seen.add(cursor.id);
    cursor = await findCategoryById(cursor.parent_id);
  }
  return false;
}
