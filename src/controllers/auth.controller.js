// ─────────────────────────────────────────────────────────────────────────────
// auth.controller.js
//
// Handles all authentication-related HTTP requests.
// Each exported function maps to one route in routes/auth.routes.js.
// Controllers are intentionally thin — they delegate real logic to authService
// and only handle request/response shaping + error forwarding.
// ─────────────────────────────────────────────────────────────────────────────

// Mongoose model representing a library staff member (attendant) in the DB
const LibraryAttendant = require("../models/LibraryAttendant");

// Service layer that contains all business logic: hashing, token generation, etc.
const authService = require("../services/auth.service");

// Utility class that standardises every successful JSON response shape
const ApiResponse = require("../utils/ApiResponse");

// Utility class for operational errors — carries an HTTP status code + message
const ApiError = require("../utils/ApiError");

// Helper that whitelists specific keys from an object, blocking mass-assignment attacks
const pick = require("../utils/pick");


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/setup
// ─────────────────────────────────────────────────────────────────────────────
exports.setup = async (req, res, next) => {     // Async so we can await DB calls; next lets us forward errors
  try {

    // Count every document in the LibraryAttendant collection
    const count = await LibraryAttendant.countDocuments();

    if (count > 0) {                            // At least one attendant already exists → setup is done
      return next(                              // Forward an operational error to the global error handler
        new ApiError(                           // Structured error with an HTTP status code
          403,                                  // 403 Forbidden: the route exists but is no longer usable
          "System already set up. Use /api/auth/login to access the system."
        )
      );
    }

    // Whitelist only the fields a caller is allowed to supply — any extra fields are silently dropped
    const safeData = pick(req.body, ["name", "email", "password", "staffId", "shift"]);

    // Create the first attendant document; role is hardcoded to "admin" so the
    // caller cannot elevate their own privileges by passing role in the request body
    const attendant = await LibraryAttendant.create({ ...safeData, role: "admin" });

    // Immediately log the new attendant in to generate both tokens
    const { accessToken, refreshToken } = await authService.login(
      attendant.email,        // Email saved during create()
      req.body.password       // Raw plain-text password — authService.login hashes and compares internally
                              // We can't use attendant.password here because it is already hashed by the model hook
    );

    // authService.login persists the refreshToken back onto the document,
    // so we re-fetch to get the latest version of the attendant object
    const freshAttendant = await LibraryAttendant.findById(attendant._id);

    // Send 201 Created with the safe profile + both tokens
    res.status(201).json(
      new ApiResponse(
        201,                                              // HTTP status mirrored inside the response body
        {
          attendant: freshAttendant.toSafeObject(),       // Strips sensitive fields (password, refreshToken) before sending
          accessToken,                                    // Short-lived JWT the client uses on every protected request
          refreshToken,                                   // Long-lived token used only to obtain a new accessToken
        },
        "First admin account created. You are now logged in."  // Human-readable message for the client
      )
    );

  } catch (err) { next(err); }   // Any unexpected error (DB failure, validation error) is forwarded to errorMiddleware
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {

    // Delegate credential verification and token generation entirely to the service layer
    // Destructure all three return values in one step
    const { attendant, accessToken, refreshToken } = await authService.login(
      req.body.email,       // Email from the request body
      req.body.password     // Plain-text password — the service handles bcrypt comparison
    );

    res.status(200).json(
      new ApiResponse(
        200,                                        // 200 OK — a successful, non-creating action
        { attendant, accessToken, refreshToken },   // Safe attendant profile + both tokens
        "Logged in successfully."
      )
    );

  } catch (err) { next(err); }   // Catches wrong-credential errors thrown by the service
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {

    // Pass the refresh token from the body to the service, which validates and issues a new access token
    // tokens = { accessToken } or { accessToken, refreshToken } depending on the rotation strategy
    const tokens = await authService.refresh(req.body.refreshToken);

    // Respond with the new token(s) — no attendant profile needed here
    res.status(200).json(new ApiResponse(200, tokens, "Token refreshed successfully."));

  } catch (err) { next(err); }   // Catches expired / tampered refresh token errors from the service
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {

    // req.attendant is populated by the auth middleware that ran before this controller
    // We only need the ID to locate the document and clear its stored refresh token
    await authService.logout(req.attendant._id);

    // null data payload — there is nothing meaningful to return after logout
    res.status(200).json(new ApiResponse(200, null, "Logged out successfully."));

  } catch (err) { next(err); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {

    // req.attendant is already fully populated by auth middleware — no extra DB query needed
    // toSafeObject() removes password, refreshToken, and any other private fields before sending
    res.status(200).json(
      new ApiResponse(200, req.attendant.toSafeObject(), "Profile fetched.")
    );

  } catch (err) { next(err); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {

    await authService.changePassword(
      req.attendant._id,       // Identifies whose password to change — comes from the verified JWT, not the body
      req.body.currentPassword, // The attendant must prove they know the old password (prevents session hijacking)
      req.body.newPassword      // The desired new password — the service will hash it before saving
    );

    // null data — a password change has no meaningful payload to return
    res.status(200).json(new ApiResponse(200, null, "Password changed successfully."));

  } catch (err) { next(err); }   // Catches "wrong current password" errors thrown by the service
};