const express = require("express");
const router  = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// index.routes.js — mounts all route files in one place
// app.js imports only this file → app.use("/api", require("./routes/index.routes"))
// ─────────────────────────────────────────────────────────────────────────────

router.use("/auth",       require("./auth.routes"));       // login, refresh, change-password
router.use("/attendants", require("./attendant.routes"));  // staff CRUD
router.use("/students",   require("./student.routes"));    // student CRUD
router.use("/books",      require("./book.routes"));       // book CRUD
router.use("/authors",    require("./author.routes"));     // author CRUD
router.use("/borrows",    require("./borrow.routes"));     // issue and return books

// Health check — no auth needed
// Confirms server is running — used by monitoring tools or deployment checks
// GET /api/health → { success, message, timestamp }
router.get("/health", (req, res) => {
  res.status(200).json({
    success:   true,
    message:   "School Library API is running.",
    timestamp: new Date().toISOString(), // exact time of the check
  });
});

module.exports = router;