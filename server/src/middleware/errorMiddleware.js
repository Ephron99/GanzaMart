import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

// 404 handler — mounted after all routes in app.js.
export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Centralized error handler (spec §9). Every error in the app funnels here,
// so controllers never repeat res.status(...).json(...) boilerplate.
// Express recognises a 4-argument function as error middleware.
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Translate common MySQL driver errors into proper HTTP responses, so a DB
  // constraint violation never becomes a mysterious 500.
  if (err.code === 'ER_DUP_ENTRY')      err = new ApiError(409, 'That value is already taken (duplicate).');
  else if (err.code === 'ER_NO_REFERENCED_ROW_2') err = new ApiError(400, 'Referenced record does not exist.');
  else if (err.code === 'ER_ROW_IS_REFERENCED_2') err = new ApiError(409, 'Cannot delete: record is referenced by other data.');

  const isKnown = err instanceof ApiError;
  const status = isKnown ? err.status : (err.status || err.statusCode || 500);

  // Never swallow unexpected bugs silently: log with request context.
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} →`, err, err.stack?.split('\n')[1]?.trim());
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status} ${err.message}`);
  }

  const body = {
    success: false,
    error: status >= 500 ? 'Internal server error' : err.message,
  };
  if (err.details) body.details = err.details;          // e.g. validation field errors
  // Leak stack traces only during local development to help the learner debug.
  if (process.env.NODE_ENV === 'development' && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}
