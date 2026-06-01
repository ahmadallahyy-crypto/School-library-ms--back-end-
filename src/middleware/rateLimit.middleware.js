const rateLimit = require("express-rate-limit");
const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } = require("../config/env");

// ─────────────────────────────────────────────────────────────────────────────
// Tracks how many requests each IP makes — blocks them once they hit the limit
// Prevents brute force (password guessing) and DDoS (server flooding)
// ─────────────────────────────────────────────────────────────────────────────

// ── General Limiter ───────────────────────────────────────────────────────────
// Covers ALL /api/* routes → app.use("/api", apiLimiter)
const apiLimiter = rateLimit({
  windowMs:        RATE_LIMIT_WINDOW_MS, // time window e.g. 15 minutes (from .env)
  max:             RATE_LIMIT_MAX,       // max requests per IP per window e.g. 100

  standardHeaders: true,  // tells client their limit status via response headers
                          // e.g. RateLimit-Remaining: 95, RateLimit-Reset: 900
  legacyHeaders:   false, // disables old X-RateLimit-* headers

  // Sent to client when blocked — 429 Too Many Requests
  message: {
    success: false,
    message: "Too many requests from this IP. Please try again later.",
  },
});

// ── Auth Limiter ──────────────────────────────────────────────────────────────
// Login only → router.post("/login", authLimiter, ...)
// Stricter because login is the main attack target
// Real user needs 1-3 attempts — bot needs thousands → 10 stops bots, not humans
// Note: login runs BOTH limiters — apiLimiter (app.js) + authLimiter
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // hardcoded 15 mins — always strict
  max:             10,             // 10 attempts per IP per 15 mins

  standardHeaders: true,
  legacyHeaders:   false,

  message: {
    success: false,
    message: "Too many login attempts. Please wait 15 minutes and try again.",
  },
});

// apiLimiter  → app.js         → all routes
// authLimiter → auth.routes.js → login only
module.exports = { apiLimiter, authLimiter };