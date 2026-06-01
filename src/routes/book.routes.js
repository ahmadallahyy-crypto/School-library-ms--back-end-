const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/book.controller");
const { protect } = require("../middleware/auth.middleware");
const { validate }= require("../middleware/validate.middleware");
const v           = require("../validators/book.validator");

// ─────────────────────────────────────────────────────────────────────────────
// book.routes.js — all routes require a valid JWT
// No role restriction — any authenticated attendant can manage books
// ─────────────────────────────────────────────────────────────────────────────

// Applied once — protects every route below
router.use(protect);

router.get("/",       ctrl.getAllBooks);                      // GET    /api/books       → fetch all + filters
router.get("/:id",    ctrl.getBookById);                     // GET    /api/books/:id   → fetch one + author details
router.post("/",      validate(v.createBook), ctrl.createBook);  // POST   /api/books       → validate body → create
router.put("/:id",    validate(v.updateBook), ctrl.updateBook);  // PUT    /api/books/:id   → validate body → update
router.delete("/:id",                         ctrl.deleteBook);  // DELETE /api/books/:id   → soft or hard delete

module.exports = router;