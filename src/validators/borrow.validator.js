const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// Borrow validators — define the exact shape of borrow request bodies
// Rejected here before reaching the controller if rules are not met
// ─────────────────────────────────────────────────────────────────────────────


// ── POST /api/borrows ─────────────────────────────────────────────────────────
const issueBook = Joi.object({
  // hex().length(24) validates MongoDB ObjectId format
  // catches invalid IDs before they hit the DB and cause a CastError
  bookId:    Joi.string().hex().length(24).required()
    .messages({ "string.length": "bookId must be a valid MongoDB ID" }),

  studentId: Joi.string().hex().length(24).required()
    .messages({ "string.length": "studentId must be a valid MongoDB ID" }),

  // greater("now") ensures dueDate is always in the future
  // if omitted, borrow.service.js calculates default from LOAN_PERIOD_DAYS in .env
  dueDate:   Joi.date().greater("now").optional()
    .messages({ "date.greater": "Due date must be in the future" }),

  notes:     Joi.string().max(500).optional().allow(""), // optional condition note
});


// ── PUT /api/borrows/:id/return ───────────────────────────────────────────────
// borrowId comes from req.params — not the body, so not validated here
// only optional notes about the return condition e.g. "page torn"
const returnBook = Joi.object({
  notes: Joi.string().max(500).optional().allow(""),
});

module.exports = { issueBook, returnBook };