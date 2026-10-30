import * as orderService from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

// Customer-facing order endpoints. req.user.id is the ONLY identity used — the token,
// not the request body, decides whose orders are listed and whose cart is emptied.

// POST /api/orders  — the checkout. Returns the full, authoritative order.
export const place = asyncHandler(async (req, res) => {
  const order = await orderService.placeOrder({
    userId: req.user.id,
    addressId: req.body.addressId,
    paymentMethod: req.body.paymentMethod || 'cod',
    couponCode: req.body.couponCode || null,
    notes: req.body.notes || null,
  });
  created(res, order);
});

// GET /api/orders  — my order history (paginated, newest first).
export const myOrders = asyncHandler(async (req, res) => {
  const { orders, pagination } = await orderService.listMyOrders(req.user.id, {
    page: req.query.page ?? 1,
    limit: req.query.limit ?? 10,
  });
  ok(res, orders, { pagination });
});

// GET /api/orders/:id  — one order owned by me (404 if it isn't mine).
export const detail = asyncHandler(async (req, res) => {
  ok(res, await orderService.getOrderForUser(req.params.id, req.user.id));
});

// POST /api/orders/:id/cancel  — shopper-initiated, only while still unpacked.
export const cancel = asyncHandler(async (req, res) => {
  // A cancel POST may legitimately carry no body at all, so guard the optional reason.
  ok(res, await orderService.cancelByCustomer(req.params.id, req.user.id, req.body?.reason));
});
