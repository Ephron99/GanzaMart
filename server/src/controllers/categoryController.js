import * as categoryService from '../services/categoryService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

// GET /api/categories?flat=true → plain list for <select> inputs in the admin forms.
export const list = asyncHandler(async (req, res) => {
  ok(res, await categoryService.listCategories({ tree: req.query.flat !== 'true' }));
});

// GET /api/categories/:idOrSlug — the catalogue page for one category.
export const detail = asyncHandler(async (req, res) => {
  ok(res, await categoryService.getCategory(req.params.idOrSlug, {
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 12, 100),
  }));
});

export const create = asyncHandler(async (req, res) => {
  created(res, await categoryService.createCategory(req.body));
});

export const update = asyncHandler(async (req, res) => {
  ok(res, await categoryService.updateCategory(req.params.idOrSlug, req.body));
});

// Returns 409 when products or sub-categories still reference the category.
export const remove = asyncHandler(async (req, res) => {
  ok(res, await categoryService.deleteCategory(req.params.idOrSlug));
});
