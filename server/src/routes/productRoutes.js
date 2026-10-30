import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import * as productController from '../controllers/productController.js';
import * as reviewController from '../controllers/reviewController.js';
import { validate } from '../middleware/validate.js';
import { uploadProductImages } from '../middleware/uploadImages.js';
import {
  productQueryRules, productParamRules, imageParamRules, createProductRules, updateProductRules,
  stockRules,
} from '../validators/catalogValidators.js';
import { reviewQueryRules } from '../validators/contentValidators.js';

const router = Router();
const adminOnly = [authenticate, authorize('admin')];

// NOTE: Express 5 (path-to-regexp 8) no longer allows inline regex like
// '/:id(\\d+)', so ids are constrained by productParamRules instead — a
// non-numeric id is a 422 validation error rather than a route mismatch.

// ── Public catalogue ─────────────────────────────────────────────────────────
router.get('/', productQueryRules, validate, productController.list);
router.get('/:id', productParamRules, validate, productController.detail);
router.get('/:id/related', productParamRules, validate, productController.related);
// Reviews are paged on their own: a popular product can carry hundreds, and the
// details page must not download all of them to show the first ten.
router.get('/:id/reviews', productParamRules, reviewQueryRules, validate, reviewController.listForProduct);

// ── Administration (spec §5: role checks live on the server, not in a hidden menu) ──
router.post('/', ...adminOnly, uploadProductImages, createProductRules, validate, productController.create);
router.put('/:id', ...adminOnly, uploadProductImages, updateProductRules, validate, productController.update);
router.delete('/:id/images/:imageId', ...adminOnly, imageParamRules, validate, productController.removeImage);
// DELETE /:id archives by default. A typo in ?mode=permanent therefore cannot
// destroy data: only the exact word triggers the irreversible path.
router.delete('/:id', ...adminOnly, productParamRules, validate, productController.remove);
router.post('/:id/restore', ...adminOnly, productParamRules, validate, productController.restore);
router.patch('/:id/stock', ...adminOnly, stockRules, validate, productController.updateStock);

export default router;
