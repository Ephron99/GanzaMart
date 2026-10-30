import { body, param, query } from 'express-validator';

// Checkout never accepts prices, totals or a user id from the client — only *which*
// address to ship to, *how* to pay and an optional coupon code. The server recomputes
// every figure inside the transaction (spec §9 "prices computed only on server").
export const placeOrderRules = [
  body('addressId').isInt({ min: 1 }).withMessage('A delivery address is required.').toInt(),
  body('paymentMethod').optional({ values: 'falsy' }).isIn(['cod', 'mock'])
    .withMessage('Payment method must be "cod" or "mock".'),
  body('couponCode').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 40 })
    .withMessage('Coupon code must be 3–40 characters.'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 })
    .withMessage('Notes are too long.'),
  // Guard the fields a tampering client might try to inject.
  body('userId').not().exists().withMessage('Unexpected field: userId.'),
  body('items').not().exists().withMessage('Unexpected field: items.'),
  body('total').not().exists().withMessage('Unexpected field: total.'),
];

export const orderIdRules = [
  param('id').isInt({ min: 1 }).withMessage('Order id must be a positive integer.').toInt(),
];

// Cancelling is a normal shopper action but must still be shape-checked: an optional
// free-text reason, capped so nobody stuffs a novel into the audit note.
export const cancelOrderRules = [
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
    .withMessage('Reason must be 200 characters or fewer.'),
];

export const validateCouponRules = [
  body('code').exists().withMessage('Enter a coupon code.')
    .trim().isLength({ min: 3, max: 40 }).withMessage('Coupon code must be 3–40 characters.'),
];

// ── Admin ───────────────────────────────────────────────────────────────────────
export const adminOrderQueryRules = [
  query('status').optional({ values: 'falsy' })
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    .withMessage('Unknown order status.'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 })
    .withMessage('Search text is too long.'),
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('page must be positive.').toInt(),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100.').toInt(),
];

export const changeStatusRules = [
  body('status').exists().withMessage('A new status is required.')
    .isIn(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    .withMessage('That is not a valid target status.'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 255 })
    .withMessage('Note must be 255 characters or fewer.'),
];

export const updateShipmentRules = [
  body('carrier').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 80 })
    .withMessage('Carrier name is too long.'),
  body('trackingNumber').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 80 })
    .withMessage('Tracking number is too long.'),
];
