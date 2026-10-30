import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as couponController from '../controllers/couponController.js';
import { validate } from '../middleware/validate.js';
import { validateCouponRules } from '../validators/orderValidators.js';

const router = Router();

// Redeeming a coupon is tied to a customer (one use per person), so this needs a
// session. Admin coupon CRUD is a separate concern for the dashboard phase.
router.use(authenticate);
router.post('/validate', validateCouponRules, validate, couponController.validateCoupon);

export default router;
