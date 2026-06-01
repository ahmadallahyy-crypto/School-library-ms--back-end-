const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/author.controller");
const { protect } = require("../middleware/auth.middleware");

// ─────────────────────────────────────────────────────────────────────────────
// author.routes.js — all routes require a valid JWT
// No role restriction — any authenticated attendant can manage authors
// ─────────────────────────────────────────────────────────────────────────────

// Applied once — protects every route below without repeating it on each one
router.use(protect);

router.get("/",       ctrl.getAllAuthors);  // GET    /api/authors       → fetch all
router.get("/:id",    ctrl.getAuthorById); // GET    /api/authors/:id   → fetch one + their books
router.post("/",      ctrl.createAuthor);  // POST   /api/authors       → create new author
router.put("/:id",    ctrl.updateAuthor);  // PUT    /api/authors/:id   → update author
router.delete("/:id", ctrl.deleteAuthor);  // DELETE /api/authors/:id   → delete if no active books

module.exports = router;