import * as addressService from '../services/addressService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/httpResponse.js';

// All handlers act on req.user.id, which `authenticate` guarantees. There is no
// "address id alone" path: ownership is part of every service call.

// GET /api/addresses
export const list = asyncHandler(async (req, res) => {
  ok(res, await addressService.list(req.user.id));
});

// GET /api/addresses/:id
export const getOne = asyncHandler(async (req, res) => {
  ok(res, await addressService.get(req.user.id, Number(req.params.id)));
});

// POST /api/addresses
export const create = asyncHandler(async (req, res) => {
  created(res, await addressService.create(req.user.id, req.body));
});

// PUT /api/addresses/:id
export const update = asyncHandler(async (req, res) => {
  ok(res, await addressService.update(req.user.id, Number(req.params.id), req.body));
});

// PATCH /api/addresses/:id/default
export const makeDefault = asyncHandler(async (req, res) => {
  ok(res, await addressService.makeDefault(req.user.id, Number(req.params.id)));
});

// DELETE /api/addresses/:id  (soft delete; 204 with no body)
export const remove = asyncHandler(async (req, res) => {
  await addressService.remove(req.user.id, Number(req.params.id));
  noContent(res);
});
