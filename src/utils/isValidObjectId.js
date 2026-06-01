// utils/isValidObjectId.js

const mongoose = require("mongoose");
const ApiError = require("./ApiError");

/**
 * Checks if a value is a valid MongoDB ObjectId.
 * @param {string} id - The ID to validate.
 * @returns {boolean} - True if valid 24-character hex string.
 */
const isValidObjectId = (id) => {
  // Guard against non-strings (null, undefined, numbers, objects)
  if (typeof id !== "string") return false;
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Express middleware – validates a route parameter and throws ApiError if invalid.
 * @param {string} paramName - Route parameter name (default "id").
 * @returns {Function} - Middleware.
 */
const validateIdParam = (paramName = "id") => (req, res, next) => {
  const id = req.params[paramName];
  if (!isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${paramName} format.`);
  }
  next();
};

/**
 * Service‑layer helper – validates and returns the ID, throws ApiError.
 * @param {string} id - ID to validate.
 * @param {string} fieldName - Name for error message.
 * @returns {string} - Validated ID.
 */
const validateIdOrThrow = (id, fieldName = "id") => {
  if (!isValidObjectId(id)) {
    throw new ApiError(400, `Invalid ${fieldName} format.`);
  }
  return id;
};

module.exports = {
  isValidObjectId,
  validateIdParam,
  validateIdOrThrow,
};