// controllers/attendantController.js
//
// Handles all CRUD operations for LibraryAttendant accounts.
// Route-level authorization (admin-only guards) is enforced by middleware
// before these controllers run; here we only apply field-level business rules.

const mongoose         = require("mongoose");
const LibraryAttendant = require("../models/LibraryAttendant");
const ApiResponse      = require("../utils/ApiResponse");  // Uniform success envelope: { status, data, message, meta }
const ApiError         = require("../utils/ApiError");     // Operational error class; caught by the global error handler
const paginate         = require("../utils/paginate");     // Applies page/limit/sort and returns { data, meta }
const pick             = require("../utils/pick");         // Whitelists only the specified keys from an object
const bcrypt           = require("bcryptjs");
const { BCRYPT_SALT_ROUNDS } = require("../config/env");

// ─── Constants ───────────────────────────────────────────────────────────────

// Fields an admin may supply when creating a new attendant.
// Any key NOT in this list is silently dropped by pick(), preventing
// mass-assignment vulnerabilities (e.g. a caller injecting `isActive: true`).
const CREATABLE = ["name", "email", "password", "staffId", "role", "shift"];

// Fields an admin may change on an existing attendant.
// `staffId`  is intentionally excluded — it is immutable after creation.
// `password` is intentionally excluded — it must go through /auth/change-password
//            so that hashing, token invalidation, and audit logging are applied.
const UPDATABLE = ["name", "email", "role", "shift", "isActive"];

const VALID_ROLES   = ["attendant", "admin"];
const VALID_SHIFTS  = ["morning", "afternoon", "evening"];
const BULK_LIMIT    = 50; // Hard cap on bulk-create to prevent oversized payloads / DB strain

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a MongoDB duplicate-key error (error code 11000) into a
 * human-readable ApiError so internal index names never reach the client.
 *
 * @param   {Error}        err - The raw error thrown by Mongoose/MongoDB.
 * @returns {ApiError|null}     A 409 ApiError if it's a dupe-key error, otherwise null.
 */
const handleDuplicateKeyError = (err) => {
  if (err.code === 11000) {
    // err.keyValue looks like: { email: "john@example.com" }
    const field = Object.keys(err.keyValue ?? {})[0] ?? "field";
    const value = err.keyValue?.[field] ?? "";
    return new ApiError(409, `${field} "${value}" is already in use.`);
  }
  return null; // Not a duplicate-key error; let the caller handle it
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/attendants
 *
 * Returns a paginated list of attendant accounts.
 * - Any authenticated attendant (admin or not) can call this endpoint.
 * - The optional `role` and `shift` query params narrow the results.
 * - Inactive accounts are hidden by default; only admins can opt-in via
 *   `?showInactive=true` to see deactivated records.
 * - Sensitive fields (password, refreshToken) are always stripped.
 */
exports.getAllAttendants = async (req, res, next) => {
  try {
    const filter = {};
    const errors = []; // Collect ALL query-param errors before throwing

    // --- Optional role filter ---
    if (req.query.role) {
      if (!VALID_ROLES.includes(req.query.role)) {
        errors.push(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`);
      } else {
        filter.role = req.query.role;
      }
    }

    // --- Optional shift filter ---
    if (req.query.shift) {
      if (!VALID_SHIFTS.includes(req.query.shift)) {
        errors.push(`Invalid shift. Must be one of: ${VALID_SHIFTS.join(", ")}.`);
      } else {
        filter.shift = req.query.shift;
      }
    }

    // Throw once after all checks so the client sees every problem in one response
    if (errors.length) throw new ApiError(400, errors.join(" "));

    // --- Active/inactive visibility ---
    // Non-admins always see active accounts only.
    // Admins must explicitly pass ?showInactive=true to include inactive records.
    const isAdmin = req.attendant?.role === "admin";
    if (!isAdmin || req.query.showInactive !== "true") {
      filter.isActive = true;
    }

    // paginate() wraps findMany + countDocuments and returns { data, meta }
    // where meta contains { total, page, limit, totalPages }.
    const { data, meta } = await paginate(LibraryAttendant, filter, {
      page:   req.query.page,
      limit:  req.query.limit,
      sort:   { createdAt: -1 },        // Newest accounts appear first
      select: "-password -refreshToken", // Never expose credentials
    });

    res.status(200).json(new ApiResponse(200, data, "Attendants fetched successfully.", meta));
  } catch (err) { next(err); }
};

/**
 * GET /api/attendants/:id
 *
 * Returns a single attendant by MongoDB ObjectId.
 * Any authenticated attendant (admin or not) can view any profile.
 */
exports.getAttendantById = async (req, res, next) => {
  try {
    // Reject early if the ID is not a valid 24-hex ObjectId to avoid
    // a CastError from Mongoose (which would surface as a confusing 500).
    // mongoose.isValidObjectId() is the built-in way to check this —
    // no custom utility file needed.
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, "Invalid attendant ID.");
    }

    const attendant = await LibraryAttendant
      .findById(req.params.id)
      .select("-password -refreshToken");

    if (!attendant) throw new ApiError(404, "Attendant not found.");

    res.status(200).json(new ApiResponse(200, attendant, "Attendant fetched."));
  } catch (err) { next(err); }
};

/**
 * POST /api/attendants
 *
 * Creates a single new attendant account. Admin only.
 * pick() ensures only CREATABLE fields are written — all other keys in
 * req.body are silently discarded, preventing mass-assignment attacks.
 * The Mongoose pre-save hook on the model hashes the password automatically.
 */
exports.createAttendant = async (req, res, next) => {
  try {
    const safeData = pick(req.body, CREATABLE);

    let attendant;
    try {
      attendant = await LibraryAttendant.create(safeData);
    } catch (err) {
      // Translate a duplicate email/staffId error into a friendly 409 response
      const dupeError = handleDuplicateKeyError(err);
      if (dupeError) throw dupeError;
      throw err; // Re-throw anything else (validation errors, etc.)
    }

    // toObject() triggers the schema's `transform` option which strips
    // password, refreshToken, and __v before the document is serialized.
    res.status(201).json(
      new ApiResponse(201, attendant.toObject(), "Attendant created successfully.")
    );
  } catch (err) { next(err); }
};

/**
 * POST /api/attendants/bulk
 *
 * Creates up to 50 attendant accounts in a single request. Admin only.
 *
 * Key design decisions:
 * 1. insertMany() is used for performance (single round-trip to MongoDB).
 * 2. ⚠️  insertMany() BYPASSES Mongoose pre-save hooks, so the model's
 *    automatic password-hashing hook will NOT run. Passwords are therefore
 *    hashed explicitly in this controller before insertion.
 * 3. `ordered: false` tells MongoDB to continue inserting valid documents
 *    even after a failure, maximising the number of successful inserts.
 * 4. Partial success is returned as HTTP 207 Multi-Status so callers can
 *    programmatically distinguish a full success (201) from a partial one.
 */
exports.createBulkAttendants = async (req, res, next) => {
  try {
    // --- Payload validation ---
    if (!Array.isArray(req.body.attendants) || req.body.attendants.length === 0) {
      throw new ApiError(400, "Request body must include a non-empty 'attendants' array.");
    }
    if (req.body.attendants.length > BULK_LIMIT) {
      throw new ApiError(400, `Bulk insert is limited to ${BULK_LIMIT} attendants per request.`);
    }

    const SALT_ROUNDS = parseInt(BCRYPT_SALT_ROUNDS, 10);

    // Whitelist fields AND hash each password in parallel before insertion.
    // Promise.all preserves the original order of the array, so error
    // reporting by index stays accurate.
    const safeList = await Promise.all(
      req.body.attendants.map(async (a) => {
        const doc = pick(a, CREATABLE);
        if (doc.password) {
          doc.password = await bcrypt.hash(doc.password, SALT_ROUNDS);
        }
        return doc;
      })
    );

    let created;
    try {
      // ordered: false → MongoDB keeps inserting after individual failures
      created = await LibraryAttendant.insertMany(safeList, { ordered: false });
    } catch (bulkErr) {
      // MongoBulkWriteError is thrown when `ordered: false` and at least one
      // document failed. The error object carries both the successfully
      // inserted docs AND an array describing each failure.
      if (bulkErr.name === "MongoBulkWriteError") {
        const inserted = bulkErr.insertedDocs ?? [];
        const errors   = (bulkErr.writeErrors ?? []).map((e) => ({
          index:   e.index, // Position in the original request array
          message: e.code === 11000
            // Translate duplicate-key codes; avoid leaking raw index names
            ? `Duplicate value for field: ${Object.keys(e.err?.keyValue ?? {})[0] ?? "unknown"}`
            : e.errmsg,
        }));

        // 207 Multi-Status: the request partially succeeded
        return res.status(207).json({
          success:  true,  // Partial success is still a success
          message:  `Partial insert: ${inserted.length} succeeded, ${errors.length} failed.`,
          data:     inserted.map((a) => a.toObject()),
          errors,           // Callers can inspect and retry the failed entries
        });
      }
      throw bulkErr; // Any other error (network, schema, etc.) — propagate up
    }

    // All documents inserted successfully
    res.status(201).json(
      new ApiResponse(
        201,
        created.map((a) => a.toObject()),
        `${created.length} attendant(s) created successfully.`
      )
    );
  } catch (err) { next(err); }
};

/**
 * PUT /api/attendants/:id
 *
 * Updates an existing attendant's profile. Admin only.
 *
 * Business rules enforced here:
 * - An admin cannot demote themselves (change their own role away from "admin").
 *   This prevents a situation where no admin remains in the system.
 * - Only fields listed in UPDATABLE can be changed (staffId and password are
 *   excluded — see constant definitions for the rationale).
 * - runValidators: true ensures Mongoose schema validators (e.g. enum checks)
 *   are applied on update, not just on create.
 */
exports.updateAttendant = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, "Invalid attendant ID.");
    }

    // Self-demotion guard: an admin cannot change their own role to a lower one.
    // This ensures there is always at least one admin who can manage others.
    if (
      req.params.id === req.attendant._id.toString() && // Targeting themselves
      req.body.role &&                                   // A role change was requested
      req.body.role !== "admin"                          // And it would be a demotion
    ) {
      throw new ApiError(400, "You cannot downgrade your own role.");
    }

    // Strip any fields not in UPDATABLE before touching the database
    const safeData = pick(req.body, UPDATABLE);
    if (Object.keys(safeData).length === 0) {
      throw new ApiError(400, `No valid fields provided. Updatable: ${UPDATABLE.join(", ")}.`);
    }

    let attendant;
    try {
      attendant = await LibraryAttendant.findByIdAndUpdate(
        req.params.id,
        safeData,
        {
          new:           true,  // Return the updated document, not the original
          runValidators: true,  // Apply schema validators (enum, required, etc.)
        }
      ).select("-password -refreshToken");
    } catch (err) {
      const dupeError = handleDuplicateKeyError(err);
      if (dupeError) throw dupeError;
      throw err;
    }

    if (!attendant) throw new ApiError(404, "Attendant not found.");

    res.status(200).json(new ApiResponse(200, attendant, "Attendant updated."));
  } catch (err) { next(err); }
};

/**
 * DELETE /api/attendants/:id
 *
 * Soft-deletes an attendant by setting isActive = false. Admin only.
 *
 * Why soft-delete instead of hard-delete?
 * - Preserves audit trails (who checked out which book, when).
 * - Maintains referential integrity with transaction records that reference
 *   this attendant's _id.
 * - Allows reactivation if the account was deactivated by mistake (set
 *   isActive back to true via the PUT endpoint).
 *
 * Self-deactivation guard: an admin cannot deactivate their own account,
 * which would lock them — and potentially everyone — out of admin functions.
 */
exports.deleteAttendant = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(400, "Invalid attendant ID.");
    }

    // Prevent an admin from accidentally (or maliciously) locking themselves out
    if (req.params.id === req.attendant._id.toString()) {
      throw new ApiError(400, "You cannot deactivate your own account.");
    }

    // Flip isActive to false — the record remains in the database
    const attendant = await LibraryAttendant.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true } // Return the updated doc so we can use the name in the response message
    ).select("-password -refreshToken");

    if (!attendant) throw new ApiError(404, "Attendant not found.");

    // Return null for data — there is nothing to display for a deactivated account
    res.status(200).json(
      new ApiResponse(200, null, `Attendant "${attendant.name}" deactivated successfully.`)
    );
  } catch (err) { next(err); }
};