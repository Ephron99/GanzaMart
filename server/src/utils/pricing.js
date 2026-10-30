// The single source of truth for checkout money rules. Both the coupon-preview
// endpoint and the authoritative checkout transaction import these helpers, so a
// discount or shipping figure computed for display is derived by the exact same code
// that will later commit it — they can never drift apart.
import { ApiError } from './ApiError.js';

// Ganza Mart delivery policy (kept simple and transparent, matching the seeded orders):
// a flat fee under the free-shipping threshold, free at or above it.
export const SHIPPING_FEE = 2000;
export const FREE_SHIPPING_THRESHOLD = 200000;
export const CURRENCY = 'RWF';

export function computeShipping(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

// Round money to 2 decimals at the boundary. All inputs are already Numbers (the
// models hand back MySQL DECIMAL via money()); we only round the derived discount and
// totals so no floating-point dust reaches the database or the JSON.
export const round2 = (n) => Number(Number(n).toFixed(2));

/**
 * Validate a coupon row against the live cart subtotal and return the discount.
 * Throws ApiError(422) with a shopper-facing message for every rejection reason.
 * `alreadyRedeemed` is passed in by the caller (a DB read) so this stays pure.
 */
export function evaluateCoupon(coupon, { subtotal, alreadyRedeemed }) {
  if (!coupon) throw new ApiError(422, 'That coupon code is not recognised.');
  if (!coupon.is_active) throw new ApiError(422, 'That coupon is no longer active.');
  if (!Number(coupon.valid_now)) throw new ApiError(422, 'That coupon has expired or is not valid yet.');
  if (coupon.max_uses !== null && Number(coupon.used_count) >= Number(coupon.max_uses)) {
    throw new ApiError(422, 'That coupon has already been fully redeemed.');
  }
  if (subtotal < Number(coupon.min_order)) {
    throw new ApiError(422, `Spend at least ${Number(coupon.min_order).toLocaleString('en-US')} ${CURRENCY} to use this coupon.`);
  }
  if (alreadyRedeemed) throw new ApiError(422, 'You have already used that coupon.');

  const value = Number(coupon.value);
  const discount = coupon.type === 'percent'
    ? round2(subtotal * (value / 100))
    : round2(Math.min(value, subtotal));
  return discount;
}
