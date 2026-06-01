// utils/ApiResponse.js

class ApiResponse {
  /**
   * Standard success response wrapper.
   *
   * @param {number}  statusCode - HTTP status code (200, 201, 204, etc.)
   * @param {*}       data       - Response payload (object, array, null)
   * @param {string}  message    - Human-readable message (defaults to generic based on status)
   * @param {object}  meta       - Optional metadata (page, total, totalPages, etc.)
   * @param {boolean} includeStatusCode - Whether to include statusCode in body (default: false)
   */
  constructor(statusCode, data = null, message = null, meta = null, includeStatusCode = false) {
    // Auto-generate default message if not provided
    const defaultMessages = {
      200: "Success",
      201: "Created successfully",
      204: "No content",
    };
    this.success = true;
    this.message = message || defaultMessages[statusCode] || "Operation successful";
    this.data = data;
    this.timestamp = new Date().toISOString();

    // Optionally include statusCode in body (only if explicitly requested)
    if (includeStatusCode) {
      this.statusCode = statusCode;
    }

    // Include meta only if provided and data is not null (optional check)
    if (meta !== null && meta !== undefined && data !== null) {
      this.meta = meta;
    }
  }
}

module.exports = ApiResponse;