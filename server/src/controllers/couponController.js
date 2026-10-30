import * as couponService from '../services/couponService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

// POST /api/coupons/validate { code }  — a live, read-only discount preview priced
// against the signed-in shopper's current cart. It never applies anything; checkout
// re-runs the same evaluation authoritatively inside its transaction.
export const validateCoupon = asyncHandler(async (req, res) => {
  ok(res, await couponService.previewCoupon({ userId: req.user.id, code: req.body.code }));
});
