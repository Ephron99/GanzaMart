import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as orderController from '../controllers/orderController.js';
import { validate } from '../middleware/validate.js';
import {
  placeOrderRules, orderIdRules, cancelOrderRules,
} from '../validators/orderValidators.js';

const router = Router();

// Placing and viewing orders is strictly account-scoped: no anonymous checkout.
// (An anonymous basket is folded into the account cart at login, so by the time
// someone reaches checkout they are, by definition, signed in.)
router.use(authenticate);

router.post('/', placeOrderRules, validate, orderController.place);
router.get('/', orderController.myOrders);
router.get('/:id', orderIdRules, validate, orderController.detail);
router.post('/:id/cancel', orderIdRules, cancelOrderRules, validate, orderController.cancel);

export default router;
