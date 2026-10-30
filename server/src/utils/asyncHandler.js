// Wraps async route handlers so a rejected promise is forwarded to Express's
// error middleware instead of crashing the process with "unhandled rejection".
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
