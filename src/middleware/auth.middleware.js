const jwt              = require("jsonwebtoken");
const LibraryAttendant = require("../models/LibraryAttendant");
const ApiError         = require("../utils/ApiError");
const { JWT_SECRET }   = require("../config/env");

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — runs between request and controller
// Like airport security — passenger must pass check before reaching the gate
//
// Request → protect → Controller
//               ↓
//          ❌ fails? → 401 error
//          ✅ passes? → next()
// ─────────────────────────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    // Step 1: Extract token from "Authorization: Bearer <token>"
    // split(" ")[1] grabs only the token, drops the "Bearer" word
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Step 2: Block if no token sent
    if (!token) {
      return next(new ApiError(401, "Access denied. No token provided."));
    }

    // Step 3: Verify token — throws if expired or tampered
    // decoded = { id, iat, exp }
    const decoded = jwt.verify(token, JWT_SECRET);

    // Step 4: Confirm account still exists — token stays valid even after deletion
    const attendant = await LibraryAttendant.findById(decoded.id);

    if (!attendant)          return next(new ApiError(401, "Account no longer exists."));
    if (!attendant.isActive) return next(new ApiError(401, "Account deactivated. Contact admin."));

    // Step 5: Attach to req — controllers use req.attendant._id, req.attendant.role
    req.attendant = attendant;
    next();

  } catch (err) {
    next(err); // jwt failures → errorMiddleware
  }
};

module.exports = { protect };