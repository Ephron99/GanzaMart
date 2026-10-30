// Operational error with an HTTP status code.
// Services/controllers `throw new ApiError(409, 'Out of stock')` and the
// central error middleware turns it into a clean JSON response.
export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details; // optional field-level info (e.g. validator errors)
  }
}
