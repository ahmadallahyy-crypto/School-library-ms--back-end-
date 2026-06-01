const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/borrow.controller");
const { protect } = require("../middleware/auth.middleware");
const { validate }= require("../middleware/validate.middleware");
const v           = require("../validators/borrow.validator");

// ─────────────────────────────────────────────────────────────────────────────
// borrow.routes.js — all routes require a valid JWT
// No role restriction — any authenticated attendant can issue and return books
// ─────────────────────────────────────────────────────────────────────────────

// Applied once — protects every route below
router.use(protect);

router.get("/",              ctrl.getAllBorrows);                        // GET  /api/borrows         → fetch all + filters
router.get("/:id",           ctrl.getBorrowById);                       // GET  /api/borrows/:id     → fetch one fully populated
router.post("/",             validate(v.issueBook),  ctrl.issueBook);   // POST /api/borrows         → validate → issue book
router.put("/:id/return",    validate(v.returnBook), ctrl.returnBook);  // PUT  /api/borrows/:id/return → validate → return book

module.exports = router;