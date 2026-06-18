const express = require("express");
const router  = express.Router();

router.use("/auth",       require("./auth.routes"));
router.use("/attendants", require("./attendant.routes"));
router.use("/students",   require("./student.routes"));
router.use("/books",      require("./book.routes"));
router.use("/authors",    require("./author.routes"));
router.use("/borrows",    require("./borrow.routes"));

router.get("/debug-env", (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    allowedOriginsRaw: process.env.ALLOWED_ORIGINS,
    allowedOriginsParsed: process.env.ALLOWED_ORIGINS?.split(","),
  });
});

router.get("/health", (req, res) => {
  res.status(200).json({
    success:   true,
    message:   "School Library API is running.",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;