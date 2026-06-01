// models/LibraryAttendant.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { BCRYPT_SALT_ROUNDS } = require("../config/env");

const libraryAttendantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    staffId: {
      type: String,
      required: [true, "Staff ID is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
      // Example format: LIB-001, ADM-042
      match: [/^[A-Z]{3}-\d{3}$/, "Staff ID must follow format XXX-### (e.g., LIB-001)"],
    },
    role: {
      type: String,
      enum: {
        values: ["attendant", "admin"],
        message: "Role must be either attendant or admin",
      },
      default: "attendant",
    },
    shift: {
      type: String,
      enum: {
        values: ["morning", "afternoon", "evening"],
        message: "Shift must be one of: morning, afternoon, evening",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: (doc, ret) => {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    }},
    toObject: { transform: (doc, ret) => {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    }},
  }
);

// ─── Pre‑save hook ───────────────────────────────────────────────────────────
libraryAttendantSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
  next();
});

// ─── Pre‑validate: ensure staffId is uppercase and trimmed ───────────────────
libraryAttendantSchema.pre("validate", function (next) {
  if (this.staffId) {
    this.staffId = this.staffId.trim().toUpperCase();
  }
  next();
});

// ─── Instance methods ────────────────────────────────────────────────────────

/** Compare plain password with stored hash */
libraryAttendantSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/** Update refresh token (set or null) */
libraryAttendantSchema.methods.setRefreshToken = async function (token) {
  this.refreshToken = token;
  await this.save({ validateBeforeSave: false });
};

/** Update last login timestamp */
libraryAttendantSchema.methods.updateLastLogin = async function () {
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

/** Safe object (explicit, though toJSON already handles it) */
libraryAttendantSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

// ─── Static methods ──────────────────────────────────────────────────────────

/** Find by email and explicitly select password field */
libraryAttendantSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select("+password +refreshToken");
};

/** Check if email already exists (excluding own ID) */
libraryAttendantSchema.statics.isEmailTaken = async function (email, excludeAttendantId) {
  const attendant = await this.findOne({ email, _id: { $ne: excludeAttendantId } });
  return !!attendant;
};

module.exports = mongoose.model("LibraryAttendant", libraryAttendantSchema); 