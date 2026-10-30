import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/jwt.js';
import { findPublicUserById } from '../models/userModel.js';

// Reads `Authorization: Bearer <jwt>`, verifies it, then RE-CHECKS the user in MySQL.
// Why the extra DB read: a token is a claim, not a fact. Accounts can be deactivated
// or logged out after the token was issued, and role changes must take effect
// immediately rather than when the token expires.
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new ApiError(401, 'Authentication required.');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw new ApiError(401, err.name === 'TokenExpiredError'
        ? 'Your session expired. Please sign in again.'
        : 'Invalid token.');
    }

    const user = await findPublicUserById(payload.sub);
    if (!user) throw new ApiError(401, 'Account no longer exists.');
    if (!user.is_active) throw new ApiError(403, 'This account has been deactivated.');
    if (user.token_version !== payload.tv) {
      throw new ApiError(401, 'This session has been signed out. Please sign in again.');
    }

    req.user = user;              // trusted, hash-free user object for later middleware
    next();
  } catch (err) {
    next(err);
  }
}

// Role gate: authorize('admin') or authorize('customer','admin').
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required.'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to do that.'));
    }
    next();
  };
}

// Optional auth: anonymous shoppers get a cart, signed-in users get their persistent
// cart. Never fails — it only annotates req.user when a valid token is present.
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  try {
    const payload = verifyToken(token);
    const user = await findPublicUserById(payload.sub);
    if (user && user.is_active && user.token_version === payload.tv) req.user = user;
  } catch {
    /* an invalid token simply means "anonymous" — the cart must keep working */
  }
  next();
}
