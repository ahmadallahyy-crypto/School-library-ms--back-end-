const express     = require("express");
const router      = express.Router();
const ctrl        = require("../controllers/student.controller");
const { protect } = require("../middleware/auth.middleware");
const { validate }= require("../middleware/validate.middleware");
const v           = require("../validators/student.validator");

// ─────────────────────────────────────────────────────────────────────────────
// student.routes.js — all routes require a valid JWT
// No role restriction — any authenticated attendant can manage students
// ─────────────────────────────────────────────────────────────────────────────

// Applied once — protects every route below
router.use(protect);

router.get("/",            ctrl.getAllStudents);                            // GET    /api/students            → fetch all + filters
router.get("/:id",         ctrl.getStudentById);                           // GET    /api/students/:id        → fetch one + active borrow count
router.get("/:id/borrows", ctrl.getStudentBorrows);                        // GET    /api/students/:id/borrows → full borrow history
router.post("/bulk",       ctrl.createBulkStudents);                       // POST   /api/students/bulk       → create up to 50 students at once — must be BEFORE /:id
router.post("/",           validate(v.createStudent), ctrl.createStudent); // POST   /api/students            → validate → create
router.put("/:id",         validate(v.updateStudent), ctrl.updateStudent); // PUT    /api/students/:id        → validate → update
router.delete("/:id",                                 ctrl.deleteStudent); // DELETE /api/students/:id        → blocked if books checked out

module.exports = router;