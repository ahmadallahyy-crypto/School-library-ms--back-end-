const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// Student validators — define the exact shape of student request bodies.
// The validate() middleware runs these schemas BEFORE the controller fires.
// If validation fails, a 400 is returned immediately and the controller
// never runs — keeping business logic clean and free of input checks.
// ─────────────────────────────────────────────────────────────────────────────

// Admission number pattern: DEPT/YY/COURSE/00000
// Examples: SCH/26/STU/00001, ENG/24/CSC/00042
// Rules:
//   DEPT   → 2-4 uppercase letters (department code)
//   YY     → exactly 2 digits (last 2 digits of the year)
//   COURSE → exactly 3 uppercase letters (course/division code)
//   00000  → exactly 5 digits (zero-padded sequence number)
// Must match the same regex defined in the Mongoose Student model so
// both layers enforce the same format independently
const ADMISSION_PATTERN = /^[A-Z]{2,4}\/\d{2}\/[A-Z]{3}\/\d{5}$/;


// ── POST /api/students ────────────────────────────────────────────────────────
// Validates a single student creation request.
//
// admissionNumber is OPTIONAL here — if the caller omits it, the controller's
// generateAdmissionNumber() function creates one automatically (SCH/YY/STU/NNNNN).
// If the caller supplies one, it must match ADMISSION_PATTERN exactly.
//
// Note: .uppercase() was intentionally removed — Joi's coercion runs AFTER
// pattern matching in some versions, causing valid lowercase input to fail
// the regex before being uppercased. Callers must supply uppercase values
// or omit the field entirely and let the controller generate it.
const createStudent = Joi.object({
  name: Joi.string()
           .min(2)       // single-letter names are likely mistakes
           .max(80)      // reasonable upper bound for a full name
           .required(),

  email: Joi.string()
            .email()     // must be a valid email format e.g. name@domain.com
            .required(),

  admissionNumber: Joi.string()
                      .pattern(ADMISSION_PATTERN) // enforces DEPT/YY/COURSE/00000 format
                      .optional()                 // omit → controller auto-generates
                      .messages({
                        // Override the default cryptic regex message with something helpful
                        "string.pattern.base": "Admission number must follow pattern: DEPT/YY/COURSE/00000 (e.g. SCH/26/STU/00001)",
                      }),
});


// ── PUT /api/students/:id ─────────────────────────────────────────────────────
// Validates a student profile update request.
//
// All fields are optional — the caller only sends what they want to change.
// .min(1) at the object level rejects empty bodies so we never hit the DB
// for a no-op update.
//
// admissionNumber is intentionally NOT included here — it is a permanent
// identifier assigned at registration and must never change. Any attempt
// to send it will be silently dropped by validate()'s stripUnknown: true.
const updateStudent = Joi.object({
  name:     Joi.string().min(2).max(80).optional(), // same rules as create
  email:    Joi.string().email().optional(),         // same rules as create
  isActive: Joi.boolean().optional(),               // true = active, false = deactivated
})
  .min(1) // at least one field must be present — rejects completely empty bodies
  .messages({
    "object.min": "Provide at least one field to update", // friendlier than the default
  });

module.exports = { createStudent, updateStudent };