import * as authService from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/httpResponse.js';

// Controllers translate HTTP ↔ service calls. No SQL, no business rules here.
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone } = req.body;
  const result = await authService.register({ fullName, email, password, phone });
  created(res, result);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  ok(res, result);
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: await authService.currentUser(req.user.id) });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  ok(res, { message: 'Signed out. This token is now invalid on the server.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.id, { currentPassword, newPassword });
  ok(res, { message: 'Password changed. Please sign in again.' });
});
