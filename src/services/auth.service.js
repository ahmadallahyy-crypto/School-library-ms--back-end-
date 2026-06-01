// ─────────────────────────────────────────────────────────────────────────────
// auth.service.js
//
// The service layer for all authentication logic.
// Controllers stay thin by delegating every real operation here.
// This file owns: token creation, credential verification, token rotation,
// logout invalidation, and password changes.
// It never touches req/res — it only works with plain data and throws ApiErrors.
// ─────────────────────────────────────────────────────────────────────────────

// Standard JWT library — used to sign and verify JSON Web Tokens
const jwt = require("jsonwebtoken");

// Mongoose model for library staff — every DB operation in this file targets this collection
const LibraryAttendant = require("../models/LibraryAttendant");

// Structured error class that carries an HTTP status code alongside the message
const ApiError = require("../utils/ApiError");

// Pull token secrets and expiry durations from centralised env config
// Having them in one place means a single change propagates everywhere
const {
  JWT_SECRET,             // Secret key used to sign/verify short-lived access tokens
  JWT_EXPIRES_IN,         // e.g. "15m" — how long an access token stays valid
  JWT_REFRESH_SECRET,     // Separate secret for refresh tokens — different key = tighter scope
  JWT_REFRESH_EXPIRES_IN, // e.g. "7d" — how long a refresh token stays valid
} = require("../config/env");


// ─── Token Helpers ────────────────────────────────────────────────────────────
// Two private functions — not exported — used only inside this module.

/**
 * signAccessToken
 * Creates a short-lived JWT the client attaches to every protected API request.
 * Payload is minimal (just the attendant's DB id) to keep the token small.
 */
const signAccessToken = (id) =>
  jwt.sign(
    { id },              // Payload: only the attendant's MongoDB ObjectId
    JWT_SECRET,          // Signed with the access-token-specific secret
    { expiresIn: JWT_EXPIRES_IN } // Token self-expires; no DB lookup needed to detect expiry
  );

/**
 * signRefreshToken
 * Creates a long-lived JWT stored in the DB so it can be explicitly revoked.
 * Uses a different secret from access tokens so a compromised access secret
 * cannot be used to forge refresh tokens (and vice versa).
 */
const signRefreshToken = (id) =>
  jwt.sign(
    { id },                      // Same minimal payload — just enough to identify the attendant
    JWT_REFRESH_SECRET,          // Different secret from access token for isolation
    { expiresIn: JWT_REFRESH_EXPIRES_IN } // Long window (days) so users aren't forced to re-login often
  );


// ─── login ────────────────────────────────────────────────────────────────────
const login = async (email, password) => {

  // Query the DB for a document matching the supplied email
  // .select("+password") is required because the schema marks `password` as
  // select:false — meaning it is excluded from all queries by default for safety.
  // We must opt in explicitly only when we genuinely need to compare it.
  const attendant = await LibraryAttendant
    .findOne({ email })
    .select("+password");

  // Security: use a single generic error message whether the email is unknown
  // OR the password is wrong. Two separate messages ("email not found" vs
  // "wrong password") would let an attacker enumerate which emails are registered.
  if (!attendant || !(await attendant.comparePassword(password))) {
    // attendant.comparePassword() runs bcrypt.compare() under the hood
    // Short-circuit evaluation: if attendant is null, comparePassword never runs
    throw new ApiError(401, "Invalid credentials.");
  }

  // Secondary guard: an admin may have soft-disabled the account without deleting it
  // A deactivated attendant can still pass the password check above, so we need this extra check
  if (!attendant.isActive) {
    throw new ApiError(401, "Your account has been deactivated. Contact an admin.");
  }

  // Record the exact moment this successful login occurred.
  // Must be set BEFORE .save() so the timestamp is written in the same DB call
  // as the refresh token — one write instead of two.
  attendant.lastLoginAt = new Date();

  // Both checks passed — generate a fresh token pair for this session
  const accessToken  = signAccessToken(attendant._id);   // Short-lived; sent in Authorization header
  const refreshToken = signRefreshToken(attendant._id);  // Long-lived; used only at /api/auth/refresh

  // Persist the refresh token in the DB.
  // This is what makes logout and token revocation possible — we can simply null it out.
  attendant.refreshToken = refreshToken;

  // validateBeforeSave: false — we're only updating refreshToken and lastLoginAt,
  // not the full document, so we skip re-running all Mongoose validators
  // (faster, and avoids spurious errors on fields we haven't touched)
  await attendant.save({ validateBeforeSave: false });

  // Strip sensitive fields (password hash, raw refreshToken) before returning to the controller
  // toSafeObject() is a custom instance method defined on the Mongoose model
  return { attendant: attendant.toSafeObject(), accessToken, refreshToken };
};


// ─── refresh ──────────────────────────────────────────────────────────────────
const refresh = async (incomingToken) => {

  let decoded; // Will hold the verified JWT payload { id, iat, exp }

  try {
    // jwt.verify() does two things simultaneously:
    //   1. Checks the signature against JWT_REFRESH_SECRET — detects tampering
    //   2. Checks the exp claim — rejects expired tokens
    // If either check fails it throws, so we wrap it in try/catch
    decoded = jwt.verify(incomingToken, JWT_REFRESH_SECRET);
  } catch {
    // Covers: malformed token, wrong secret, or past expiry
    // We don't expose which check failed — generic message for security
    throw new ApiError(401, "Invalid or expired refresh token. Please log in again.");
  }

  // Token signature was valid — now check the DB to see if it was revoked
  // .select("+refreshToken") is necessary for the same reason as password —
  // the field has select:false on the schema to avoid accidentally returning it
  const attendant = await LibraryAttendant
    .findById(decoded.id)
    .select("+refreshToken");

  // Two failure modes caught by this single condition:
  //   • attendant doesn't exist (account deleted after token was issued)
  //   • stored token doesn't match — means it was already used (rotation) or
  //     nulled out by logout — both indicate the token should be rejected
  if (!attendant || attendant.refreshToken !== incomingToken) {
    throw new ApiError(401, "Refresh token has been revoked. Please log in again.");
  }

  // Token rotation: generate a completely new pair and invalidate the old refresh token.
  // If a refresh token is ever stolen, it can be used at most once before the legitimate
  // user's next refresh overwrites it — the attacker's copy becomes useless immediately.
  const accessToken  = signAccessToken(attendant._id);
  const refreshToken = signRefreshToken(attendant._id); // New refresh token replaces the old one

  // Overwrite the stored refresh token with the newly generated one
  // The old incomingToken is now dead — any replay attempt will fail the !== check above
  attendant.refreshToken = refreshToken;
  await attendant.save({ validateBeforeSave: false }); // Skip validation — only refreshToken changed

  // Return both tokens — the client must replace both; the old refresh token is now invalid
  return { accessToken, refreshToken };
};


// ─── logout ───────────────────────────────────────────────────────────────────
const logout = async (attendantId) => {

  // One targeted update — no need to load the full document into memory.
  // Setting refreshToken to null means any future call to refresh() will hit
  // the `attendant.refreshToken !== incomingToken` check and be rejected.
  // The access token still lives until it naturally expires (e.g. 15 min),
  // which is an accepted trade-off with stateless JWTs.
  await LibraryAttendant.findByIdAndUpdate(
    attendantId,
    { refreshToken: null } // Revoke server-side — client should also discard both tokens
  );
};


// ─── changePassword ───────────────────────────────────────────────────────────
const changePassword = async (attendantId, currentPassword, newPassword) => {

  // Fetch the attendant with the password field included (excluded by default)
  // We need the hash to verify the currentPassword the user supplied
  const attendant = await LibraryAttendant
    .findById(attendantId)
    .select("+password");

  // Verify they actually know the current password before allowing a change.
  // This prevents a session-hijacking scenario where someone with a stolen
  // access token (still valid for up to 15 min) changes the real owner's password.
  if (!(await attendant.comparePassword(currentPassword))) {
    throw new ApiError(400, "Current password is incorrect.");
  }

  // Assign the new plain-text password directly to the document field.
  // The model's pre('save') hook intercepts this and runs bcrypt.hash()
  // before the document is written — we never store plain-text passwords.
  attendant.password = newPassword;

  // .save() (without validateBeforeSave:false) triggers the hashing middleware.
  // Running full validation here is intentional — the new password may be
  // subject to length/complexity rules defined in the schema.
  await attendant.save();
};


// Export all four service functions.
// Token helper functions (signAccessToken / signRefreshToken) are intentionally
// NOT exported — they are implementation details private to this module.
module.exports = { login, refresh, logout, changePassword };