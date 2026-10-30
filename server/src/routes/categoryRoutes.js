import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import * as categoryController from '../controllers/categoryController.js';
import { validate } from '../middleware/validate.js';
import { categoryParamRules, createCategoryRules, updateCategoryRules } from '../validators/catalogValidators.js';

const router = Router();
const adminOnly = [authenticate, authorize('admin')];

// Public reads: the shop front browses categories without a token.
router.get('/', categoryController.list);
router.get('/:idOrSlug', categoryParamRules, validate, categoryController.detail);

// Admin writes: guarded per route so the two public GETs above stay open.
router.post('/', ...adminOnly, createCategoryRules, validate, categoryController.create);
router.put('/:idOrSlug', ...adminOnly, updateCategoryRules, validate, categoryController.update);
router.delete('/:idOrSlug', ...adminOnly, categoryParamRules, validate, categoryController.remove);

export default router;
