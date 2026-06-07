const express         = require("express");
const router          = express.Router();
const authController  = require("../controllers/auth.controller");
const { protect }     = require("../middleware/auth.middleware");
const { validate }    = require("../middleware/validate.middleware");
const { authLimiter } = require("../middleware/rateLimit.middleware");
const v               = require("../validators/auth.validator");
const attendantV      = require("../validators/attendant.validator");

// ── Public routes (no token required) ────────────────────────────────────────

router.post("/setup",           authLimiter, validate(attendantV.createAttendant), authController.setup);
router.post("/login",           authLimiter, validate(v.login),                    authController.login);
router.post("/refresh",         authLimiter, validate(v.refreshToken),             authController.refresh);

// 2FA login
router.post("/send-otp",        authLimiter, authController.sendOtp);
router.post("/verify-otp",      authLimiter, authController.verifyOtp);

// Forgot / reset password
router.post("/forgot-password", authLimiter, authController.forgotPassword);
router.post("/reset-password",  authLimiter, authController.resetPassword);

// ── Protected routes (valid JWT required) ─────────────────────────────────────

router.post("/logout",          protect, authController.logout);
router.get( "/me",              protect, authController.getMe);
router.put( "/change-password", protect, validate(v.changePassword), authController.changePassword);

module.exports = router;