const mongoose = require("mongoose");
const { LOAN_PERIOD_DAYS } = require("../config/env");

/**
 * BorrowRecord — permanent audit log of every book issue and return.
 *
 * This document is NEVER deleted. Status transitions only:
 *   "active"   → book is currently with the student
 *   "overdue"  → active borrow past its dueDate (set by scheduled job)
 *   "returned" → book has been brought back
 *
 * Relationships:
 *   book       → the Book that was borrowed
 *   student    → the Student who borrowed it
 *   issuedBy   → the LibraryAttendant who handed the book out
 *   returnedTo → the LibraryAttendant who accepted the return
 */
const borrowRecordSchema = new mongoose.Schema(
  {
    book: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Book",
      required: [true, "Book reference is required"],
    },
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Student",
      required: [true, "Student reference is required"],
    },
    issuedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "LibraryAttendant",
      required: [true, "Issuing attendant is required"],
    },
    borrowedAt: {
      type:    Date,
      default: Date.now,
    },
    dueDate: {
      type:     Date,
      required: [true, "Due date is required"],
    },
    returnedAt: {
      type:    Date,
      default: null, // null = still on loan
    },
    returnedTo: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "LibraryAttendant",
      default: null,
    },
    status: {
      type:    String,
      enum:    {
        values:  ["active", "overdue", "returned"],
        message: "Status must be one of: active, overdue, returned",
      },
      default: "active",
    },
    notes: {
      type:      String,
      trim:      true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Pre-validate hook ─────────────────────────────────────────────────────────
// Auto-set dueDate to LOAN_PERIOD_DAYS from now if not supplied.
// Runs before schema validation so the required check on dueDate always passes.
borrowRecordSchema.pre("validate", function (next) {
  if (!this.dueDate) {
    const due = new Date(this.borrowedAt || Date.now());
    due.setDate(due.getDate() + LOAN_PERIOD_DAYS);
    this.dueDate = due;
  }
  next();
});

// ─── Virtual ──────────────────────────────────────────────────────────────────
// How many days overdue is this record? Returns 0 if not overdue or returned.
borrowRecordSchema.virtual("daysOverdue").get(function () {
  if (this.status === "returned") return 0;
  const now = new Date();
  if (now <= this.dueDate) return 0;
  return Math.floor((now - this.dueDate) / (1000 * 60 * 60 * 24));
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
borrowRecordSchema.index({ student: 1, status: 1 }); // "what does this student have?"
borrowRecordSchema.index({ book:    1, status: 1 }); // "is this book currently out?"
borrowRecordSchema.index({ dueDate: 1, status: 1 }); // overdue batch detection

module.exports = mongoose.model("BorrowRecord", borrowRecordSchema);
