import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

// Runs the express-validator chains declared on a route and converts any failure
// into a single 422 ApiError with field details — controllers never check inputs.
export function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new ApiError(422, 'Validation failed', details));
}
