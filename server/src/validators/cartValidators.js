import { body, param, header } from 'express-validator';

// A cart session id is an opaque, client-generated identifier (we expect a UUID).
// Validating the shape here keeps garbage (or a very long string) out of the UNIQUE
// `session_token` column, without assuming anything about who generated it.
export const CART_SESSION_HEADER = 'x-cart-session';

const sessionTokenRule = (loc) =>
  loc.optional({ values: 'falsy' })
    .isString().withMessage('Cart session must be a text identifier.')
    .matches(/^[A-Za-z0-9-]{8,64}$/).withMessage('Cart session identifier is not valid.');

// Sent on every cart read/modify: the anonymous browser's cart key. Ignored by the
// server when a valid JWT is present (the user's persistent cart wins).
export const cartSessionHeaderRule = [
  sessionTokenRule(header(CART_SESSION_HEADER)),
];

export const addCartItemRules = [
  body('productId').isInt({ min: 1 }).withMessage('A valid product id is required.').toInt(),
  // Omitting quantity is fine (defaults to 1), but an explicit 0/negative must fail —
  // so only null/undefined are treated as "absent", not the falsy 0.
  body('quantity').optional({ values: 'null' })
    .isInt({ min: 1, max: 1000 }).withMessage('Quantity must be between 1 and 1000.').toInt(),
];

export const updateCartItemRules = [
  param('productId').isInt({ min: 1 }).withMessage('A valid product id is required.').toInt(),
  body('quantity').exists().withMessage('Quantity is required.')
    .isInt({ min: 1, max: 1000 }).withMessage('Quantity must be between 1 and 1000.').toInt(),
];

export const removeCartItemRules = [
  param('productId').isInt({ min: 1 }).withMessage('A valid product id is required.').toInt(),
];

// POST /api/cart/merge — called right after login with the anonymous cart's key.
// Here the token is REQUIRED (unlike the optional header), so it gets its own chain.
export const mergeCartRules = [
  body('sessionToken').exists().withMessage('sessionToken is required.')
    .isString().withMessage('Cart session must be a text identifier.')
    .matches(/^[A-Za-z0-9-]{8,64}$/).withMessage('Cart session identifier is not valid.'),
];
