import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import * as adminUserController from '../controllers/adminUserController.js';
import * as adminOrderController from '../controllers/adminOrderController.js';
import * as productController from '../controllers/productController.js';
import * as categoryController from '../controllers/categoryController.js';
import { productQueryRules } from '../validators/catalogValidators.js';
import {
  adminOrderQueryRules, orderIdRules, changeStatusRules, updateShipmentRules,
} from '../validators/orderValidators.js';

const router = Router();

// Everything under /api/admin requires a valid token AND the admin role.
// The 403 you get as a customer is this line working, not a frontend hiding a menu.
router.use(authenticate, authorize('admin'));

router.get(
  '/users',
  [
    query('role').optional().isIn(['customer', 'admin']).withMessage('Unknown role filter.'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer.').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.').toInt(),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search text is too long.'),
  ],
  validate,
  adminUserController.list
);

// Admin views of the catalogue. These are read-only aliases: the write endpoints
// are /api/products and /api/categories (POST/PUT/DELETE, admin-guarded there too).
// The admin list additionally returns archived rows, sold counts and low-stock flags.
router.get('/products', productQueryRules, validate, productController.adminList);
router.get('/categories', categoryController.list);

// ── Order management (Phase 8) ────────────────────────────────────────────────
// Admins see every order regardless of owner; status moves go through the server-side
// transition table so an out-of-order PATCH is a clean 409, not a corrupted row.
router.get('/orders', adminOrderQueryRules, validate, adminOrderController.list);
router.get('/orders/:id', orderIdRules, validate, adminOrderController.detail);
router.patch('/orders/:id/status', orderIdRules, changeStatusRules, validate, adminOrderController.changeStatus);
router.patch('/orders/:id/shipment', orderIdRules, updateShipmentRules, validate, adminOrderController.updateShipment);

// This router owns only the /api/admin/* namespace (dashboard stats, customer and
// order management). Resource routes such as /api/products keep their own router and
// guard the admin-only methods per route.

export default router;
