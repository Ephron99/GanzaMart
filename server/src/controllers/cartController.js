import * as cartService from '../services/cartService.js';
import { CART_SESSION_HEADER } from '../validators/cartValidators.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

// Every cart operation first resolves which cart this request owns (the signed-in
// user's persistent cart, or the anonymous browser's session cart), then does the
// work, then returns the FULL rebuilt cart. Returning the whole cart after every
// mutation means the client never has to guess totals or re-fetch — one round-trip
// per action and the header badge, page and checkout preview are always in sync.

const sessionOf = (req) => req.get(CART_SESSION_HEADER) || undefined;
const openCart = (req) => cartService.resolveCart({ user: req.user, sessionToken: sessionOf(req) });

// GET /api/cart
export const getCart = asyncHandler(async (req, res) => {
  const cart = await openCart(req);
  ok(res, await cartService.readCart(cart.id));
});

// POST /api/cart/items { productId, quantity? }
export const addItem = asyncHandler(async (req, res) => {
  const cart = await openCart(req);
  const updated = await cartService.addItem({
    cartId: cart.id, productId: req.body.productId, quantity: req.body.quantity ?? 1,
  });
  ok(res, updated);
});

// PUT /api/cart/items/:productId { quantity }
export const updateItem = asyncHandler(async (req, res) => {
  const cart = await openCart(req);
  const updated = await cartService.setQuantity({
    cartId: cart.id, productId: Number(req.params.productId), quantity: req.body.quantity,
  });
  ok(res, updated);
});

// DELETE /api/cart/items/:productId
export const removeItem = asyncHandler(async (req, res) => {
  const cart = await openCart(req);
  const updated = await cartService.removeItem({ cartId: cart.id, productId: Number(req.params.productId) });
  ok(res, updated);
});

// DELETE /api/cart
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await openCart(req);
  ok(res, await cartService.clearCart({ cartId: cart.id }));
});

// POST /api/cart/merge { sessionToken }  (authenticated)
// The storefront calls this immediately after a successful login so the shopper's
// anonymous basket is folded into their account without losing a click.
export const merge = asyncHandler(async (req, res) => {
  ok(res, await cartService.mergeOnLogin({ userId: req.user.id, sessionToken: req.body.sessionToken }));
});
