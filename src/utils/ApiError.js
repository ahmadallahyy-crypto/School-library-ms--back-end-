// Custom error class — carries HTTP status code so errorMiddleware knows what to send
// Extends built-in Error so it works with try/catch and next(err)

class ApiError extends Error {
  constructor(
    statusCode,           // e.g. 400, 401, 404, 500
    message,              // e.g. "Book not found"
    errors = [],          // field-level errors e.g. ["name is required"]
    isOperational = true  // true = expected error, false = bug
  ) {
    super(message);

    this.name          = "ApiError";
    this.statusCode    = statusCode;
    this.errors        = errors;
    this.isOperational = isOperational;

    // 4xx → "fail" (client fault)  |  5xx → "error" (server fault)
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // Points stack trace to where error was thrown — not to this class
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;