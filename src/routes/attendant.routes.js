const express       = require("express");
const router        = express.Router();
const ctrl          = require("../controllers/attendant.controller");
const { protect }   = require("../middleware/auth.middleware");     // verifies JWT
const { authorise } = require("../middleware/role.middleware");     // verifies role
const { validate }  = require("../middleware/validate.middleware"); // verifies body
const v             = require("../validators/attendant.validator"); // validation rules

// ─────────────────────────────────────────────────────────────────────────────
// Route = URL + method → middleware → controller
// Request → protect → authorise → validate → controller → response
// ─────────────────────────────────────────────────────────────────────────────

// Applied once — protects every route in this file
router.use(protect);

// Read — any authenticated attendant
router.get("/",    ctrl.getAllAttendants);  // fetch all
router.get("/:id", ctrl.getAttendantById); // fetch one

// Write — admin only
// /bulk must come before /:id — "bulk" would be read as an id otherwise
router.post("/bulk", authorise("admin"), validate(v.bulkCreate),      ctrl.createBulkAttendants); // create many
router.post("/",     authorise("admin"), validate(v.createAttendant), ctrl.createAttendant);      // create one
router.put("/:id",   authorise("admin"), validate(v.updateAttendant), ctrl.updateAttendant);      // update
router.delete("/:id",authorise("admin"),                               ctrl.deleteAttendant);      // delete

module.exports = router;