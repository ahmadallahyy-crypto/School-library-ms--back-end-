const Joi = require("joi");

// ─────────────────────────────────────────────────────────────────────────────
// Auth validators — define the exact shape of auth request bodies
// Rejected here before reaching the controller if rules are not met
// ─────────────────────────────────────────────────────────────────────────────


// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = Joi.object({
  email:    Joi.string().email().required(),  // must be valid email format
  password: Joi.string().required(),          // no min here — wrong password should hit the service, not be blocked here
});


// ── POST /api/auth/refresh ────────────────────────────────────────────────────
// Client sends their refresh token to get a new access token
const refreshToken = Joi.object({
  refreshToken: Joi.string().required(), // blocks request if refresh token is missing
});


// ── POST /api/auth/change-password ────────────────────────────────────────────
const changePassword = Joi.object({
  currentPassword: Joi.string().required(),             // must provide old password first
  newPassword:     Joi.string().min(8).max(64).required(), // enforces basic password strength

  // Joi.ref("newPassword") — compares confirmPassword against newPassword in the same request
  // If they don't match → blocked immediately with a clear message before hitting the service
  confirmPassword: Joi.string()
    .valid(Joi.ref("newPassword"))
    .required()
    .messages({ "any.only": "Passwords do not match" }),
});

module.exports = {
  login,
  refreshToken,
  changePassword,
};


