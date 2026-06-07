// ─────────────────────────────────────────────────────────────────────────────
// auth.service.js
// ─────────────────────────────────────────────────────────────────────────────

const jwt              = require("jsonwebtoken");
const bcrypt           = require("bcryptjs");
const LibraryAttendant = require("../models/LibraryAttendant");
const Otp              = require("../models/Otp");
const ApiError         = require("../utils/ApiError");
const { sendOtpEmail, sendPasswordResetEmail } = require("./email.service");

const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN,
} = require("../config/env");


// ─── Token Helpers ────────────────────────────────────────────────────────────

const signAccessToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const signRefreshToken = (id) =>
  jwt.sign({ id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });


// ─── login ────────────────────────────────────────────────────────────────────
const login = async (email, password) => {

  const attendant = await LibraryAttendant
    .findOne({ email })
    .select("+password");

  if (!attendant || !(await attendant.comparePassword(password))) {
    throw new ApiError(401, "Invalid credentials.");
  }

  if (!attendant.isActive) {
    throw new ApiError(401, "Your account has been deactivated. Contact an admin.");
  }

  attendant.lastLoginAt  = new Date();
  const accessToken      = signAccessToken(attendant._id);
  const refreshToken     = signRefreshToken(attendant._id);
  attendant.refreshToken = refreshToken;
  await attendant.save({ validateBeforeSave: false });

  return { attendant: attendant.toSafeObject(), accessToken, refreshToken };
};


// ─── refresh ──────────────────────────────────────────────────────────────────
const refresh = async (incomingToken) => {

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token. Please log in again.");
  }

  const attendant = await LibraryAttendant
    .findById(decoded.id)
    .select("+refreshToken");

  if (!attendant || attendant.refreshToken !== incomingToken) {
    throw new ApiError(401, "Refresh token has been revoked. Please log in again.");
  }

  const accessToken      = signAccessToken(attendant._id);
  const refreshToken     = signRefreshToken(attendant._id);
  attendant.refreshToken = refreshToken;
  await attendant.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};


// ─── logout ───────────────────────────────────────────────────────────────────
const logout = async (attendantId) => {
  await LibraryAttendant.findByIdAndUpdate(attendantId, { refreshToken: null });
};


// ─── changePassword ───────────────────────────────────────────────────────────
const changePassword = async (attendantId, currentPassword, newPassword) => {

  const attendant = await LibraryAttendant
    .findById(attendantId)
    .select("+password");

  if (!(await attendant.comparePassword(currentPassword))) {
    throw new ApiError(400, "Current password is incorrect.");
  }

  attendant.password          = newPassword;
  attendant.passwordChangedAt = new Date();
  attendant.refreshToken      = null;
  await attendant.save();
};


// ─── sendOtp ──────────────────────────────────────────────────────────────────
// Step 1 of 2FA login — verify credentials then send OTP
const sendOtp = async (email, password) => {

  const attendant = await LibraryAttendant
    .findOne({ email })
    .select("+password");

  if (!attendant || !(await attendant.comparePassword(password))) {
    throw new ApiError(401, "Invalid credentials.");
  }

  if (!attendant.isActive) {
    throw new ApiError(401, "Your account has been deactivated. Contact an admin.");
  }

  const otp       = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);

  await Otp.deleteMany({ email, type: "login" });

  await Otp.create({
    email,
    otp:       hashedOtp,
    type:      "login",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  await sendOtpEmail(email, otp, attendant.name);

  return { email };
};


// ─── verifyOtp ────────────────────────────────────────────────────────────────
// Step 2 of 2FA login — verify OTP then issue tokens
const verifyOtp = async (email, otp) => {

  const otpDoc = await Otp.findOne({ email, type: "login" });

  if (!otpDoc) {
    throw new ApiError(400, "No OTP found for this email. Please log in again.");
  }

  if (otpDoc.expiresAt < new Date()) {
    await Otp.deleteOne({ email, type: "login" });
    throw new ApiError(400, "OTP has expired. Please log in again.");
  }

  const isMatch = await bcrypt.compare(otp, otpDoc.otp);
  if (!isMatch) {
    throw new ApiError(400, "Invalid OTP. Please check your email and try again.");
  }

  await Otp.deleteOne({ email, type: "login" });

  const attendant        = await LibraryAttendant.findOne({ email });
  attendant.lastLoginAt  = new Date();
  const accessToken      = signAccessToken(attendant._id);
  const refreshToken     = signRefreshToken(attendant._id);
  attendant.refreshToken = refreshToken;
  await attendant.save({ validateBeforeSave: false });

  return { attendant: attendant.toSafeObject(), accessToken, refreshToken };
};


// ─── forgotPassword ───────────────────────────────────────────────────────────
// Sends a password reset code to the attendant's email
const forgotPassword = async (email) => {

  // Check if email exists — use generic message to prevent email enumeration
  const attendant = await LibraryAttendant.findOne({ email });

  // We always return success even if email not found — security best practice
  // This prevents attackers from knowing which emails are registered
  if (!attendant || !attendant.isActive) {
    return { email }; // silently do nothing but pretend success
  }

  const otp       = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);

  // Delete any existing reset OTP for this email
  await Otp.deleteMany({ email, type: "reset" });

  // Save reset OTP with 10-minute expiry
  await Otp.create({
    email,
    otp:       hashedOtp,
    type:      "reset",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  // Send reset email
  await sendPasswordResetEmail(email, otp, attendant.name);

  return { email };
};


// ─── resetPassword ────────────────────────────────────────────────────────────
// Verifies reset code and updates password
const resetPassword = async (email, otp, newPassword) => {

  const otpDoc = await Otp.findOne({ email, type: "reset" });

  if (!otpDoc) {
    throw new ApiError(400, "No reset code found. Please request a new one.");
  }

  if (otpDoc.expiresAt < new Date()) {
    await Otp.deleteOne({ email, type: "reset" });
    throw new ApiError(400, "Reset code has expired. Please request a new one.");
  }

  const isMatch = await bcrypt.compare(otp, otpDoc.otp);
  if (!isMatch) {
    throw new ApiError(400, "Invalid reset code. Please check your email and try again.");
  }

  // Delete the used reset OTP immediately
  await Otp.deleteOne({ email, type: "reset" });

  // Update the password
  const attendant = await LibraryAttendant
    .findOne({ email })
    .select("+password");

  if (!attendant) {
    throw new ApiError(404, "Account not found.");
  }

  attendant.password          = newPassword;
  attendant.passwordChangedAt = new Date();
  attendant.refreshToken      = null; // invalidate all existing sessions
  await attendant.save();
};


module.exports = {
  login,
  refresh,
  logout,
  changePassword,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
};