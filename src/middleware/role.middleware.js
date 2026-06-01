const ApiError = require("../utils/ApiError");

/**
 * authorise — restricts a route to attendants whose role is in allowedRoles.
 *
 * MUST be used AFTER protect (which sets req.attendant).
 *
 * Roles:
 *   "attendant" — standard library staff
 *   "admin"     — can also manage other attendants
 *
 * Usage:
 *   // Only admins can delete an attendant
 *   router.delete("/:id", protect, authorise("admin"), attendantController.deleteAttendant)
 *
 *   // Both roles can issue books
 *   router.post("/", protect, authorise("attendant", "admin"), borrowController.issueBook)
 *   // (or simply omit authorise when all authenticated users are allowed)
 *
 * @param {...string} allowedRoles
 */
const authorise = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.attendant) {
      return next(new ApiError(401, "Not authenticated."));
    }

    if (!allowedRoles.includes(req.attendant.role)) {
      return next(
        new ApiError(
          403,
          `Access denied. Required role: ${allowedRoles.join(" or ")}. ` +
          `Your role: ${req.attendant.role}.`
        )
      );
    }

    next();
  };
};

module.exports = { authorise };
