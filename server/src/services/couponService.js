// Coupon validation for the checkout "Apply" preview. This is deliberately a
// read-only estimate: it reuses the authoritative cart subtotal (via cartService) and
// the SAME pricing helper the checkout transaction uses, so the figure shown before
// placing the order is exactly what will be committed. Nothing here mutates anything.
import * as cartService from './cartService.js';
import * as cartModel from '../models/cartModel.js';
import * as couponModel from '../models/couponModel.js';
import { ApiError } from '../utils/ApiError.js';
import { evaluateCoupon, computeShipping, CURRENCY } from '../utils/pricing.js';

// The shopper must be signed in to redeem (redemptions are per user), and we price the
// coupon against their live cart subtotal — never a number they typed.
export async function previewCoupon({ userId, code }) {
  const cart = await cartModel.findCartByUser(userId);
  const publicCart = await cartService.readCart(cart ? cart.id : null);
  const subtotal = publicCart.subtotal;

  if (!cart || publicCart.items.length === 0) {
    throw new ApiError(409, 'Add something to your cart before applying a coupon.');
  }

  const coupon = await couponModel.findCouponByCode(code);
  const alreadyRedeemed = coupon ? await couponModel.hasRedeemed(coupon.id, userId) : false;
  const discount = evaluateCoupon(coupon, { subtotal, alreadyRedeemed });

  const total = Number((subtotal - discount + computeShipping(subtotal)).toFixed(2));
  return {
    code: coupon.code,
    type: coupon.type,
    value: Number(coupon.value),
    discount: Number(discount.toFixed(2)),
    currency: CURRENCY,
    subtotal,
    shipping: computeShipping(subtotal),
    total,
  };
}
