const mongoose = require("mongoose");

const authorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Author name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
       trim: true
    },
    bio: {
      type: String,
      trim: true,                     // ✅ added trim
      maxlength: [1000, "Bio cannot exceed 1000 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual reverse-populate — gives all books by this author
authorSchema.virtual("books", {
  ref: "Book",
  localField: "_id",
  foreignField: "author",
});

// ✅ Regular index for fast exact match / sorting on name
authorSchema.index({ name: 1 });

// ✅ Text index for full‑text search on name (only one text index per collection allowed)
authorSchema.index({ name: "text" });

module.exports = mongoose.model("Author", authorSchema);