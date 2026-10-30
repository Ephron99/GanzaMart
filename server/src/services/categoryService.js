// Business rules for categories (spec §5: CRUD "with safeguards for categories
// that contain products").
import { ApiError } from '../utils/ApiError.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';
import * as categoryModel from '../models/categoryModel.js';
import * as productModel from '../models/productModel.js';
import { toPublicProduct } from './productService.js';

// Nested tree for the navbar/category grid: roots each carry a children array.
export function buildTree(rows) {
  const toNode = (c) => ({
    id: c.id,
    parentId: c.parent_id,
    name: c.name,
    slug: c.slug,
    imageUrl: c.image_url,
    productCount: Number(c.product_count ?? 0),
    children: [],
  });

  const nodes = rows.map(toNode);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];

  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    (parent ? parent.children : roots).push(node);
  }
  // Counts roll up so "Electronics (12)" includes its sub-categories.
  const rollUp = (n) => {
    n.totalProductCount = n.children.reduce((sum, c) => sum + rollUp(c), n.productCount);
    return n.totalProductCount;
  };
  roots.forEach(rollUp);
  return roots;
}

export async function listCategories({ tree = true } = {}) {
  const rows = await categoryModel.listCategories();
  return tree ? buildTree(rows) : rows.map((c) => ({
    id: c.id, parentId: c.parent_id, name: c.name, slug: c.slug,
    imageUrl: c.image_url, productCount: Number(c.product_count),
  }));
}

export async function getCategory(idOrSlug, { withProducts = true, page = 1, limit = 12 } = {}) {
  const id = Number(idOrSlug);
  const category = Number.isInteger(id)
    ? await categoryModel.findCategoryById(id)
    : await categoryModel.findCategoryBySlug(String(idOrSlug));
  if (!category) throw new ApiError(404, 'Category not found.');

  const result = { category: {
    id: category.id, parentId: category.parent_id, name: category.name,
    slug: category.slug, imageUrl: category.image_url,
  }};

  if (withProducts) {
    const ids = await categoryModel.categoryIdsWithChildren(category.id);
    const { products, total } = await productModel.listProducts({
      categoryIds: ids, includeArchived: false, sort: 'newest', page, limit,
    });
    result.products = products.map((p) => toPublicProduct(p));
    result.pagination = { total, page, limit, pages: Math.ceil(total / limit) || 1 };
  }
  return result;
}

async function prepareInput(body, existing = null) {
  const name = String(body.name).trim();

  if (body.parentId !== undefined && body.parentId !== null && body.parentId !== '') {
    const parentId = Number(body.parentId);
    if (existing && parentId === existing.id) {
      throw new ApiError(422, 'Validation failed',
        [{ field: 'parentId', message: 'A category cannot be its own parent.' }]);
    }
    const parent = await categoryModel.findCategoryById(parentId);
    if (!parent) {
      throw new ApiError(422, 'Validation failed', [{ field: 'parentId', message: 'Unknown parent category.' }]);
    }
    // Reparenting must not create a cycle (grandchild becoming grandparent).
    if (existing && await categoryModel.isDescendantOf(parentId, existing.id)) {
      throw new ApiError(422, 'Validation failed',
        [{ field: 'parentId', message: 'That parent is inside this category — it would create a loop.' }]);
    }
  }

  const wanted = body.slug ? slugify(body.slug)
    : (existing && existing.name === name ? existing.slug : slugify(name));
  const slug = await uniqueSlug(wanted, (s) => categoryModel.isCategorySlugTaken(s, existing?.id ?? null));

  return {
    parentId: body.parentId ? Number(body.parentId) : null,
    name,
    slug,
    imageUrl: body.imageUrl ?? null,
  };
}

export async function createCategory(body) {
  const data = await prepareInput(body);
  const id = await categoryModel.insertCategory(data);
  return (await getCategory(id, { withProducts: false })).category;
}

export async function updateCategory(id, body) {
  const existing = await categoryModel.findCategoryById(Number(id));
  if (!existing) throw new ApiError(404, 'Category not found.');

  const data = await prepareInput(body, existing);
  await categoryModel.updateCategory(existing.id, data);
  return (await getCategory(existing.id, { withProducts: false })).category;
}

// Safeguard (spec §5): a category is only deletable when nothing references it.
// Products are moved by editing them, never silently orphaned by a delete.
export async function deleteCategory(id) {
  const existing = await categoryModel.findCategoryById(Number(id));
  if (!existing) throw new ApiError(404, 'Category not found.');

  const products = await categoryModel.countProductsInCategory(existing.id);
  if (products > 0) {
    throw new ApiError(409,
      `Cannot delete: ${products} product(s) still belong to "${existing.name}". Move them to another category first.`);
  }
  const children = await categoryModel.countChildCategories(existing.id);
  if (children > 0) {
    throw new ApiError(409,
      `Cannot delete: "${existing.name}" still has ${children} sub-categories. Delete or move them first.`);
  }

  await categoryModel.deleteCategory(existing.id);
  return { deleted: true, id: existing.id };
}
