const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// Book validators — define the exact shape of book request bodies
// Rejected here before reaching the controller if rules are not met
// ─────────────────────────────────────────────────────────────────────────────


// ── POST /api/books ───────────────────────────────────────────────────────────
const createBook = Joi.object({
  title:         Joi.string().min(1).max(200).required(),

  // ISBN must be exactly 10 or 13 digits — industry standard book identifier
  // pattern() checks the format, custom message replaces Joi's default cryptic error
  isbn:          Joi.string()
    .pattern(/^(?:\d{9}[\dX]|\d{13})$/)
    .required()
    .messages({ "string.pattern.base": "ISBN must be a valid 10 or 13-digit number" }),

  // author is stored as a MongoDB ObjectId — hex().length(24) validates the format
  // without this, a random string would pass and cause a CastError in the DB
  author:        Joi.string().hex().length(24).required()
    .messages({ "string.length": "Author must be a valid ID" }),

  genre:         Joi.string().max(60).default("General"),       // defaults to General if not sent
  description:   Joi.string().max(2000).optional().allow(""),   // allow("") accepts empty string
  publishedYear: Joi.number().integer().min(1000).max(new Date().getFullYear()).optional(), // cannot be future year
  publisher:     Joi.string().max(100).optional().allow(""),
  totalCopies:   Joi.number().integer().min(1).default(1),      // defaults to 1 copy if not sent
  shelfLocation: Joi.string().max(20).optional().allow(""),
});


// ── PUT /api/books/:id ────────────────────────────────────────────────────────
// author and isbn excluded — they form the book's identity and cannot change after creation
const updateBook = Joi.object({
  title:         Joi.string().min(1).max(200).optional(),
  genre:         Joi.string().max(60).optional(),
  description:   Joi.string().max(2000).optional().allow(""),
  publishedYear: Joi.number().integer().min(1000).max(new Date().getFullYear()).optional(),
  publisher:     Joi.string().max(100).optional().allow(""),
  totalCopies:   Joi.number().integer().min(1).optional(),
  shelfLocation: Joi.string().max(20).optional().allow(""),
  isActive:      Joi.boolean().optional(),
}).min(1) // rejects request if no fields sent at all
  .messages({ "object.min": "Provide at least one field to update" });

module.exports = { createBook, updateBook };