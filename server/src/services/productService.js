// Business rules for the catalogue. Controllers call these; these call the model.
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/httpResponse.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';
import * as productModel from '../models/productModel.js';
import * as categoryModel from '../models/categoryModel.js';
import { deleteUploadedFile, isUploadedUrl } from '../utils/files.js';

// MySQL snake_case + DECIMAL strings → the camelCase/number shape React consumes.
export function toPublicProduct(p, { admin = false } = {}) {
  const price = money(p.price);
  const discountPrice = money(p.discount_price);
  const base = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price,
    discountPrice,
    // What the shopper actually pays, resolved once so the UI never re-derives it.
    effectivePrice: money(p.effective_price ?? (discountPrice ?? price)),
    currency: 'RWF',
    stock: Number(p.stock),
    inStock: Number(p.stock) > 0,
    sku: p.sku,
    imageUrl: p.image_url,
    isFeatured: Boolean(p.is_featured),
    isNewArrival: Boolean(p.is_new_arrival),
    rating: p.review_avg === null ? null : Number(Number(p.review_avg).toFixed(1)),
    reviewCount: Number(p.review_count ?? 0),
    // Units sold is public marketing data ("12 sold" on a product card), not an
    // internal metric, so it belongs to the shared shape rather than the admin one.
    soldCount: Number(p.sold_count ?? 0),
    category: { id: p.category_id, name: p.category_name, slug: p.category_slug },
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
  if (admin) {
    return {
      ...base,
      isArchived: Boolean(p.is_archived),
      lowStockThreshold: Number(p.low_stock_threshold),
      isLowStock: Number(p.stock) <= Number(p.low_stock_threshold),
    };
  }
  return base;
}

// Turn a query string into safe filter arguments. Unknown/garbage input degrades to
// "no filter" rather than throwing, so a hand-typed URL never breaks the shop.
export function parseFilters(query) {
  const bool = (v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined);
  const num = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

  return {
    search: String(query.search ?? '').trim().slice(0, 100),
    minPrice: num(query.minPrice),
    maxPrice: num(query.maxPrice),
    inStock: bool(query.inStock),
    featured: bool(query.featured),
    newArrivals: bool(query.newArrivals),
    lowStock: bool(query.lowStock),
    // Three-state archive filter, honoured only for admin callers:
    //   archived=true  → only archived   archived=false → only live   absent → both
    archived: bool(query.archived),
    sort: productModel.isValidSort(query.sort) ? query.sort : 'newest',
    page: Math.max(num(query.page) ?? 1, 1),
    limit: Math.min(Math.max(num(query.limit) ?? 12, 1), 100),
    categorySlug: query.category ? String(query.category).trim() : undefined,
    categoryId: num(query.categoryId),
  };
}

async function resolveCategoryIds(filters) {
  if (filters.categoryId) {
    const ids = await categoryModel.categoryIdsWithChildren(filters.categoryId);
    if (!ids.length) throw new ApiError(404, 'Category not found.');
    return ids;
  }
  if (filters.categorySlug) {
    const cat = await categoryModel.findCategoryBySlug(filters.categorySlug);
    if (!cat) throw new ApiError(404, 'Category not found.');
    return categoryModel.categoryIdsWithChildren(cat.id);
  }
  return [];
}

export async function listProducts(query, { admin = false } = {}) {
  const filters = parseFilters(query);
  filters.categoryIds = await resolveCategoryIds(filters);

  // Shoppers never see archived products. The admin table shows both states unless
  // the caller pins one with ?archived=true|false.
  filters.includeArchived = admin ? filters.archived !== false : false;
  filters.archivedOnly = admin && filters.archived === true;

  const { products, total, page, limit } = await productModel.listProducts(filters);
  return {
    products: products.map((p) => toPublicProduct(p, { admin })),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    appliedFilters: {
      search: filters.search,
      sort: filters.sort,
      category: filters.categorySlug ?? filters.categoryId ?? null,
      archived: filters.archived ?? null,
    },
  };
}

export async function getProduct(id, { admin = false } = {}) {
  const row = await productModel.findProductById(Number(id), { includeArchived: admin });
  if (!row) throw new ApiError(404, 'Product not found.');

  const images = await productModel.listProductImages(row.id);
  return {
    product: toPublicProduct(row, { admin }),
    // The card image is not duplicated inside the gallery.
    images: [{ id: null, url: row.image_url, altText: row.name, sortOrder: 0 },
      ...images.map((i) => ({ id: i.id, url: i.image_url, altText: i.alt_text, sortOrder: i.sort_order }))],
  };
}

export async function getRelatedProducts(id, limit = 4) {
  const row = await productModel.findProductById(Number(id), {});
  if (!row) throw new ApiError(404, 'Product not found.');

  const rows = await productModel.findRelatedProducts({ categoryId: row.category_id, excludeId: row.id, limit });
  return rows.map((p) => toPublicProduct({
    ...p,
    category_id: row.category_id,
    category_name: row.category_name,
    category_slug: row.category_slug,
  }));
}

// Shared body → column preparation for POST and PUT, including the rules that
// span more than one field and therefore do not belong in a validator chain.
async function prepareProductInput(body, existing = null) {
  const category = await categoryModel.findCategoryById(Number(body.categoryId));
  if (!category) {
    throw new ApiError(422, 'Validation failed', [{ field: 'categoryId', message: 'Unknown category.' }]);
  }

  const price = Number(body.price);
  const discountPrice = body.discountPrice === undefined || body.discountPrice === null || body.discountPrice === ''
    ? null : Number(body.discountPrice);

  if (discountPrice !== null && discountPrice >= price) {
    throw new ApiError(422, 'Validation failed',
      [{ field: 'discountPrice', message: 'Discount price must be lower than the regular price.' }]);
  }

  const name = String(body.name).trim();
  // Slug: explicit value wins; an unchanged name keeps its current slug (stable URLs
  // keep SEO and bookmarks working); a new name generates a fresh unique slug.
  const wanted = body.slug ? slugify(body.slug)
    : (existing && existing.name === name ? existing.slug : slugify(name));
  const slug = await uniqueSlug(wanted, (s) => productModel.isProductSlugTaken(s, existing?.id ?? null));

  return {
    categoryId: category.id,
    name,
    slug,
    description: String(body.description).trim(),
    price,
    discountPrice,
    stock: Number(body.stock ?? 0),
    lowStockThreshold: Number(body.lowStockThreshold ?? 5),
    sku: body.sku ? String(body.sku).trim().toUpperCase() : null,
    isFeatured: Boolean(body.isFeatured),
    isNewArrival: Boolean(body.isNewArrival),
  };
}

const isPlaceholderImage = (url) => !url || url.endsWith('/placeholder.svg');

export async function createProduct(body, uploadedUrls = []) {
  const data = await prepareProductInput(body);

  // Rule: an explicit imageUrl wins, otherwise the first uploaded file is the card
  // image; anything not used as the card goes into the gallery.
  const primary = body.imageUrl ?? uploadedUrls[0] ?? '/images/products/placeholder.svg';
  const id = await productModel.insertProduct({ ...data, imageUrl: primary });
  await productModel.addProductImages(id, uploadedUrls.filter((u) => u !== primary));

  return getProduct(id, { admin: true });
}

export async function updateProduct(id, body, uploadedUrls = []) {
  const existing = await productModel.findProductById(Number(id), { includeArchived: true });
  if (!existing) throw new ApiError(404, 'Product not found.');

  const data = await prepareProductInput(body, existing);

  // Existing uploads are never destroyed by an edit: new files are appended to the
  // gallery, and the card image only changes when the admin asks for it explicitly
  // (imageUrl) or the product still shows the placeholder.
  const primary = body.imageUrl
    ?? (isPlaceholderImage(existing.image_url) ? (uploadedUrls[0] ?? existing.image_url) : existing.image_url);

  await productModel.updateProduct(existing.id, { ...data, imageUrl: primary });

  const extras = uploadedUrls.filter((u) => u !== primary);
  if (extras.length) {
    const nextOrder = (await productModel.countImages(existing.id)) + 1;
    await productModel.addProductImages(existing.id, extras, nextOrder);
  }

  return getProduct(existing.id, { admin: true });
}

// Spec §5 "Delete or archive": default is archival so order history stays intact.
// A hard delete is only permitted when no order item references the product.
export async function removeProduct(id, { mode = 'archive' } = {}) {
  const existing = await productModel.findProductById(Number(id), { includeArchived: true });
  if (!existing) throw new ApiError(404, 'Product not found.');

  if (mode === 'permanent') {
    const references = await productModel.countOrderReferences(existing.id);
    if (references > 0) {
      throw new ApiError(409,
        `This product appears in ${references} order line(s) and cannot be deleted permanently. Archive it instead.`);
    }
    // Read the gallery before the cascade wipes it, then clear the disk too.
    const gallery = await productModel.listProductImages(existing.id);
    await productModel.deleteProduct(existing.id);
    const filesRemoved = await cleanupFiles([existing.image_url, ...gallery.map((g) => g.image_url)]);
    return { mode: 'permanent', id: existing.id, filesRemoved };
  }

  await productModel.setArchived(existing.id, true);
  return { mode: 'archived', id: existing.id };
}

// Deleting rows does not delete bytes. Remove the uploaded files a product owned,
// but keep any URL another product still shows (shared links) and never touch
// bundled /images artwork, which the frontend ships and the API must not delete.
async function cleanupFiles(urls) {
  const removed = [];
  for (const url of new Set(urls.filter(Boolean))) {
    if (!isUploadedUrl(url)) continue;
    if (await productModel.countImageReferences(url) > 0) continue;
    if (deleteUploadedFile(url)) removed.push(url);
  }
  return removed;
}

export async function restoreProduct(id) {
  const existing = await productModel.findProductById(Number(id), { includeArchived: true });
  if (!existing) throw new ApiError(404, 'Product not found.');
  await productModel.setArchived(existing.id, false);
  // Admin mutations always answer with the admin shape, otherwise the dashboard
  // loses the very fields (isArchived, isLowStock) it needs to refresh its row.
  return getProduct(existing.id, { admin: true });
}

export async function adjustStock(id, { stock }) {
  const existing = await productModel.findProductById(Number(id), { includeArchived: true });
  if (!existing) throw new ApiError(404, 'Product not found.');

  const next = Number(stock);
  if (!Number.isInteger(next) || next < 0) {
    throw new ApiError(422, 'Validation failed', [{ field: 'stock', message: 'Stock must be a whole number ≥ 0.' }]);
  }
  await productModel.setStock(existing.id, next);
  return getProduct(existing.id, { admin: true });
}

export async function removeImage(productId, imageId) {
  const existing = await productModel.findProductById(Number(productId), { includeArchived: true });
  if (!existing) throw new ApiError(404, 'Product not found.');

  // The image must belong to THIS product: an admin guessing another product's
  // image id gets a 404, not a silent deletion of someone else's gallery entry.
  const image = await productModel.findProductImage(Number(imageId), existing.id);
  if (!image) throw new ApiError(404, 'That image does not belong to this product.');

  await productModel.deleteProductImage(image.id, existing.id);
  const filesRemoved = await cleanupFiles([image.image_url]);
  const bundle = await getProduct(existing.id, { admin: true });
  return { ...bundle, filesRemoved };
}
