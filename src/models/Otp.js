// models/Otp.js
//
// Stores one-time passwords temporarily.
// Each document expires automatically after 10 minutes via MongoDB TTL index.
// When the user verifies successfully, the document is deleted immediately.
//
// type field separates login OTPs from password reset OTPs —
// prevents a login code from being used to reset a password and vice versa.

const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  true,
    lowercase: true,
    trim:      true,
    index:     true,
  },
  otp: {
    type:     String,
    required: true, // hashed OTP — not plain text
  },
  type: {
    type:    String,
    enum:    ["login", "reset"], // login = 2FA login, reset = forgot password
    default: "login",
  },
  expiresAt: {
    type:     Date,
    required: true,
  },
}, { timestamps: true });

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);