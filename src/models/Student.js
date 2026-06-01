const mongoose = require("mongoose");

/**
 * Admission number pattern: DEPT/YY/COURSE/00000
 * Example: ENG/17/CHE/00228
 * - DEPT: 2-4 uppercase letters
 * - YY: 2 digits (year)
 * - COURSE: 3 uppercase letters
 * - 00000: 5 digits (sequence)
 */
const ADMISSION_PATTERN = /^[A-Z]{2,4}\/\d{2}\/[A-Z]{3}\/\d{5}$/;

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"],
    },
    admissionNumber: {
      type: String,
      required: [true, "Admission number is required"],
      unique: true,
      trim: true,
      uppercase: true,   // Converts "eng/17/che/00228" → "ENG/17/CHE/00228"
      match: [ADMISSION_PATTERN, "Admission number must follow pattern: DEPT/YY/COURSE/00000 (e.g., ENG/17/CHE/00228)"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,   // Ensures email is always stored in lowercase
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtuals: Borrow history relations ───────────────────────────
studentSchema.virtual("borrowHistory", {
  ref: "BorrowRecord",
  localField: "_id",
  foreignField: "student",
});

studentSchema.virtual("activeBorrows", {
  ref: "BorrowRecord",
  localField: "_id",
  foreignField: "student",
  options: { match: { status: "active" } },
});

// ─── Indexes for common queries ───────────────────────────────────
studentSchema.index({ name: "text" });          // search by name
studentSchema.index({ createdAt: -1 });         // newest students first
studentSchema.index({ updatedAt: -1 });         // recently updated

module.exports = mongoose.model("Student", studentSchema);