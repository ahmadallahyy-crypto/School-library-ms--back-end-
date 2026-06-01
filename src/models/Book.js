const mongoose = require("mongoose");

/**
 * Book — a physical library book.
 *
 * availableCopies is NEVER set directly from req.body after creation.
 * It is managed exclusively by borrow.service.js using atomic $inc operations
 * inside a MongoDB transaction. This guarantees copies never go negative
 * even under concurrent requests.
 */
const bookSchema = new mongoose.Schema(
  {
    title: {
      type:      String,
      required:  [true, "Book title is required"],
      trim:      true,
      minlength: [1,   "Title cannot be empty"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    isbn: {
      type:     String,
      required: [true, "ISBN is required"],
      unique:   true,
      trim:     true,
      // Accepts ISBN-10 (e.g. 0306406152) and ISBN-13 (e.g. 9780306406157)
      match:    [/^(?:\d{9}[\dX]|\d{13})$/, "ISBN must be a valid 10 or 13-digit number"],
    },
    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Author",
      required: [true, "Author is required"],
    },
    // Plain text genre — no separate Category collection needed
    genre: {
      type:      String,
      trim:      true,
      maxlength: [60, "Genre cannot exceed 60 characters"],
      default:   "General",
    },
    description: {
      type:      String,
      trim:      true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    publishedYear: {
      type: Number,
      min:  [1000, "Published year seems too early"],
      max:  [new Date().getFullYear(), "Published year cannot be in the future"],
    },
    publisher: {
      type:      String,
      trim:      true,
      maxlength: [100, "Publisher name cannot exceed 100 characters"],
    },
    // Total physical copies the library owns
    totalCopies: {
      type:     Number,
      required: [true, "Total copies is required"],
      min:      [1, "There must be at least 1 copy"],
      default:  1,
    },
    // Copies currently on the shelf (not checked out).
    // Set to totalCopies on creation via pre-save hook.
    // Only ever modified by borrow.service.js — not from req.body.
    availableCopies: {
      type: Number,
      min:  [0, "Available copies cannot be negative"],
    },
    shelfLocation: {
      type:      String,
      trim:      true,
      maxlength: [20, "Shelf location cannot exceed 20 characters"],
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Pre-save hook ─────────────────────────────────────────────────────────────
// On first creation, every copy is available.
// isNew ensures this never overwrites availableCopies during updates.
bookSchema.pre("save", function (next) {
  if (this.isNew) {
    this.availableCopies = this.totalCopies;
  }
  next();
});

// ─── Virtuals ─────────────────────────────────────────────────────────────────
bookSchema.virtual("checkedOutCopies").get(function () {
  return this.totalCopies - this.availableCopies;
});

bookSchema.virtual("isAvailable").get(function () {
  return this.availableCopies > 0;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
bookSchema.index({ title: "text" }); // full-text search
bookSchema.index({ author: 1 });
bookSchema.index({ genre: 1 });

module.exports = mongoose.model("Book", bookSchema);
