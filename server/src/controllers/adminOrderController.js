import * as orderService from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

// Admin order management. The `authenticate + authorize('admin')` gate lives on the
// router; these handlers assume a trusted admin and pass req.user.id as the audit
// "changed_by" so every status move is attributable to a real person.

// GET /api/admin/orders?status=&search=&page=&limit=
export const list = asyncHandler(async (req, res) => {
  const { orders, pagination } = await orderService.adminListOrders({
    status: req.query.status,
    search: req.query.search,
    page: req.query.page ?? 1,
    limit: req.query.limit ?? 20,
  });
  ok(res, orders, { pagination });
});

// GET /api/admin/orders/:id  — any order, no ownership filter.
export const detail = asyncHandler(async (req, res) => {
  ok(res, await orderService.adminGetOrder(req.params.id));
});

// PATCH /api/admin/orders/:id/status  { status, note? }
export const changeStatus = asyncHandler(async (req, res) => {
  ok(res, await orderService.adminChangeStatus(req.params.id, req.body.status, {
    note: req.body.note,
    changedBy: req.user.id,
  }));
});

// PATCH /api/admin/orders/:id/shipment  { carrier?, trackingNumber? }
export const updateShipment = asyncHandler(async (req, res) => {
  ok(res, await orderService.adminUpdateShipment(req.params.id, {
    carrier: req.body.carrier,
    trackingNumber: req.body.trackingNumber,
  }));
});
