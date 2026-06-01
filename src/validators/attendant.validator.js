const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// Validators — define the exact shape of request bodies
// Used by validate() middleware to reject bad requests before hitting the controller
// ─────────────────────────────────────────────────────────────────────────────


// ── POST /api/auth/setup AND POST /api/attendants ─────────────────────────────
const createAttendant = Joi.object({
  name:     Joi.string().min(2).max(80).required(),
  email:    Joi.string().email().required(),          // must be valid email format
  password: Joi.string().min(8).max(64).required(),  // min 8 — enforces basic password strength
  staffId:  Joi.string().min(2).max(20).required(),
  role:     Joi.string().valid("attendant", "admin").default("attendant"), // only these two values allowed
  shift:    Joi.string().valid("morning", "afternoon", "evening").optional(),
});


// ── PUT /api/attendants/:id ───────────────────────────────────────────────────
// staffId  → excluded — immutable after creation, forms the attendant's identity
// password → excluded — changed only via /auth/change-password, not here
const updateAttendant = Joi.object({
  name:     Joi.string().min(2).max(80).optional(),
  email:    Joi.string().email().optional(),
  role:     Joi.string().valid("attendant", "admin").optional(),
  shift:    Joi.string().valid("morning", "afternoon", "evening").optional(),
  isActive: Joi.boolean().optional(),
}).min(1) // rejects request if no fields sent at all
  .messages({ "object.min": "Provide at least one field to update" });


// ── POST /api/attendants/bulk ─────────────────────────────────────────────────
// Creates multiple attendants in one request
// min(1) → at least one item required, max(50) → prevents oversized payloads
const bulkCreate = Joi.object({
  attendants: Joi.array()
    .items(
      Joi.object({
        name:     Joi.string().min(2).max(80).required(),
        email:    Joi.string().email().required(),
        password: Joi.string().min(8).max(64).required(),
        staffId:  Joi.string().min(2).max(20).required(),
        role:     Joi.string().valid("attendant", "admin").default("attendant"),
        shift:    Joi.string().valid("morning", "afternoon", "evening").optional(),
      })
    )
    .min(1)   // at least one attendant required
    .max(50)  // cap at 50 — prevents DB overload from massive bulk inserts
    .required(),
});

module.exports = { createAttendant, updateAttendant, bulkCreate };