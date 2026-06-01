const logger   = require("../config/logger");
const ApiError = require("../utils/ApiError");

/**
 * Global error-handling middleware.
 *
 * Express identifies error handlers by the 4-argument signature (err,req,res,next).
 * This MUST be the LAST middleware registered in app.js — after all routes.
 *
 * Converts known error types into clean, consistent JSON:
 *
 *   ApiError              → uses the statusCode we set ourselves
 *   Mongoose CastError    → 400 "Invalid ID format"
 *   Mongoose Validation   → 400 with field-level messages
 *   MongoDB 11000         → 409 duplicate key
 *   JWT TokenExpiredError → 401
 *   JWT JsonWebTokenError → 401
 *   Everything else       → 500 Internal Server Error
 */
const errorMiddleware = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = { ...err, message: err.message };

  // ── Mongoose: invalid ObjectId ───────────────────────────────────────────
  if (err.name === "CastError") {
    error = new ApiError(400, `Invalid ID format: "${err.value}"`);
  }

  // ── Mongoose: schema validation failure ──────────────────────────────────
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = new ApiError(400, "Validation failed", messages);
  }

  // ── MongoDB: duplicate unique key ────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    const value = err.keyValue?.[field]              || "";
    error = new ApiError(409, `"${value}" already exists for field: ${field}`);
  }

  // ── JWT: expired token ───────────────────────────────────────────────────
  if (err.name === "TokenExpiredError") {
    error = new ApiError(401, "Token has expired. Please log in again.");
  }

  // ── JWT: malformed / tampered token ─────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    error = new ApiError(401, "Invalid token. Please log in again.");
  }

  const statusCode = error.statusCode || 500;
  const message    = error.message    || "Internal Server Error";

  // Log unexpected server errors so developers can investigate
  if (statusCode >= 500) {
    logger.error(`[${req.method} ${req.originalUrl}] ${message}\n${err.stack}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(error.errors?.length > 0 && { errors: error.errors }),
    // Only expose the stack trace in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorMiddleware;
