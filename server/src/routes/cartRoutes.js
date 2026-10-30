import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/authMiddleware.js';
import * as cartController from '../controllers/cartController.js';
import { validate } from '../middleware/validate.js';
import {
  cartSessionHeaderRule, addCartItemRules, updateCartItemRules, removeCartItemRules, mergeCartRules,
} from '../validators/cartValidators.js';

const router = Router();

// The cart is reachable by anonymous shoppers (optionalAuth annotates req.user when a
// valid token is present, but never rejects without one) AND signed-in customers — the
// service decides which cart the request owns, so no route here is auth-gated except
// the explicit login merge.
router.get('/', optionalAuth, cartSessionHeaderRule, validate, cartController.getCart);
router.post('/items', optionalAuth, cartSessionHeaderRule, addCartItemRules, validate, cartController.addItem);
router.put('/items/:productId', optionalAuth, cartSessionHeaderRule, updateCartItemRules, validate, cartController.updateItem);
router.delete('/items/:productId', optionalAuth, cartSessionHeaderRule, removeCartItemRules, validate, cartController.removeItem);
router.delete('/', optionalAuth, cartSessionHeaderRule, validate, cartController.clearCart);

// Merging a browser basket into an account is, by definition, an authenticated action.
router.post('/merge', authenticate, mergeCartRules, validate, cartController.merge);

export default router;
