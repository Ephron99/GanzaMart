import { listUsers } from '../models/userModel.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/httpResponse.js';

// Simple reads may go straight from controller → model; anything that changes
// state or combines rules (orders, coupons) goes through a service.
const toPublicUser = (u) => ({
  id: u.id,
  fullName: u.full_name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  isActive: Boolean(u.is_active),
  orderCount: Number(u.order_count),
  createdAt: u.created_at,
});

// GET /api/admin/users?search=&role=&page=&limit=
export const list = asyncHandler(async (req, res) => {
  const { search = '', role, page = 1, limit = 10 } = req.query;
  const { users, total, page: current, limit: perPage } = await listUsers({
    search: String(search).trim(),
    role,
    page: Number(page),
    limit: Number(limit),
  });

  ok(res, users.map(toPublicUser), {
    pagination: { total, page: current, limit: perPage, pages: Math.ceil(total / perPage) || 1 },
  });
});
