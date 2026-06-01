const mongoose         = require("mongoose");
const LibraryAttendant = require("../src/models/LibraryAttendant");
const {
  MONGO_URI,
  SEED_ADMIN_NAME,
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
  SEED_ADMIN_STAFF_ID,
} = require("../src/config/env");

// ─────────────────────────────────────────────────────────────────────────────
// seed.js — creates the first admin attendant on first deployment
//
// Why needed?
// The app has no signup route for admins — they can only be created by an
// existing admin. This script breaks that chicken-and-egg problem by creating
// the very first admin directly from .env values.
//
// Run once:  npm run seed
// Safe to re-run — skips silently if an admin already exists
// ─────────────────────────────────────────────────────────────────────────────

const seed = async () => {
  try {
    // Connect to DB first — seed needs the same DB the app uses
    await mongoose.connect(MONGO_URI);
    console.log("✅  Connected to MongoDB");

    // Check if an admin already exists — prevents creating duplicates on re-run
    const existing = await LibraryAttendant.findOne({ role: "admin" });
    if (existing) {
      console.log(`ℹ️   Admin already exists: ${existing.email} — skipping.`);
      process.exit(0); // exit cleanly — not an error
    }

    // Create the first admin using values from .env
    // password is hashed automatically by the pre-save hook on the model
    const admin = await LibraryAttendant.create({
      name:     SEED_ADMIN_NAME,
      email:    SEED_ADMIN_EMAIL,
      password: SEED_ADMIN_PASSWORD,
      staffId:  SEED_ADMIN_STAFF_ID,
      role:     "admin",
    });

    console.log("🎉  First admin created successfully!");
    console.log(`    Name:     ${admin.name}`);
    console.log(`    Email:    ${admin.email}`);
    console.log(`    Staff ID: ${admin.staffId}`);
    console.log(`    Role:     ${admin.role}`);

    // Reminder — .env password should never stay as the real password
    console.log("\n⚠️   Change the default password immediately after first login.\n");

    process.exit(0); // success
  } catch (err) {
    console.error("❌  Seed failed:", err.message);
    process.exit(1); // failure — non-zero exit code signals something went wrong
  }
};

seed();