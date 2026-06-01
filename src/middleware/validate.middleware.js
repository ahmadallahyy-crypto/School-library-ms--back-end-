const ApiError = require("../utils/ApiError");

/**
 * validate — runs a Joi schema against req.body before the controller fires.
 *
 * Options:
 *   abortEarly:false  → collect ALL field errors, not just the first
 *   stripUnknown:true → silently drop fields not in the schema (same as pick())
 *   convert:true      → auto-coerce types ("3" → 3, "true" → true)
 *
 * On failure → 400 with an array of field-level error messages.
 * On success → replaces req.body with the clean, validated value.
 *
 * Usage:
 *   router.post("/", validate(bookValidator.createBook), bookController.createBook)
 *
 * @param {Joi.Schema} schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly:   false,
      stripUnknown: true,
      convert:      true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message.replace(/['"]/g, ""));
      return next(new ApiError(400, "Validation failed", messages));
    }

    req.body = value;
    next();
  };
};

module.exports = { validate };
