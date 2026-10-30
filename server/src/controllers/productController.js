import * as productService from '../services/productService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

// Controllers here do three things only: read input, call the service, shape the
// response. All rules live in productService / productModel.

// GET /api/products?search=&category=&categoryId=&minPrice=&maxPrice=&inStock=
//     &featured=&newArrivals=&sort=&page=&limit=
export const list = asyncHandler(async (req, res) => {
  const { products, pagination, appliedFilters } = await productService.listProducts(req.query);
  ok(res, products, { pagination, filters: appliedFilters });
});

// GET /api/admin/products — same engine, but admins also see archived rows,
// sold counts and low-stock flags.
export const adminList = asyncHandler(async (req, res) => {
  const { products, pagination, appliedFilters } = await productService.listProducts(req.query, { admin: true });
  ok(res, products, { pagination, filters: appliedFilters });
});

// GET /api/products/:id — product + gallery + related rail in one round-trip,
// so the details page needs a single request.
export const detail = asyncHandler(async (req, res) => {
  const bundle = await productService.getProduct(req.params.id);
  const related = await productService.getRelatedProducts(req.params.id, 4);
  ok(res, { ...bundle, related });
});

export const related = asyncHandler(async (req, res) => {
  ok(res, await productService.getRelatedProducts(req.params.id, Number(req.query.limit) || 4));
});

// POST /api/products  (JSON, or multipart/form-data with an `images` file field)
export const create = asyncHandler(async (req, res) => {
  const bundle = await productService.createProduct(req.body, req.uploadedImageUrls ?? []);
  created(res, bundle);
});

export const update = asyncHandler(async (req, res) => {
  const bundle = await productService.updateProduct(req.params.id, req.body, req.uploadedImageUrls ?? []);
  ok(res, bundle);
});

// DELETE /api/products/:id?mode=permanent — archives by default (order history safe).
export const remove = asyncHandler(async (req, res) => {
  const mode = req.query.mode === 'permanent' ? 'permanent' : 'archive';
  ok(res, await productService.removeProduct(req.params.id, { mode }));
});

export const restore = asyncHandler(async (req, res) => {
  ok(res, await productService.restoreProduct(req.params.id));
});

// PATCH /api/products/:id/stock — inventory correction without touching other fields.
export const updateStock = asyncHandler(async (req, res) => {
  const bundle = await productService.adjustStock(req.params.id, { stock: req.body.stock });
  ok(res, bundle);
});

export const removeImage = asyncHandler(async (req, res) => {
  ok(res, await productService.removeImage(req.params.id, req.params.imageId));
});
