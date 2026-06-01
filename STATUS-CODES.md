# School Library API - HTTP Status Codes Reference

This document lists all expected HTTP status codes for the API endpoints, mapped to Postman collection requests. Use it during testing to verify correct responses.

## Success Codes
| Code | Meaning | Used In |
|------|---------|---------|
| **200 OK** | Successful GET, PUT, PATCH, login, refresh, logout, change-password | All list/search/get, login, refresh, logout, change-password, return-book |
| **201 Created** | Resource created successfully | Create attendant/student/author/book/borrow (issue) |

## Client Errors
| Code | Meaning | Used In |
|------|---------|---------|
| **400 Bad Request** | Validation failed (invalid data, wrong current password) | Any POST/PUT with bad payload, change-password with wrong currentPassword |
| **401 Unauthorized** | Invalid/missing token, wrong credentials, deactivated account | Protected routes without token, bad login, expired refresh token, revoked token |
| **403 Forbidden** | Operation not allowed (e.g., setup after first admin) | /auth/setup (after first attendant exists), role-restricted (attendant trying admin ops) |
| **404 Not Found** | Resource ID doesn't exist | GET/PUT/DELETE with invalid ID (attendant/student/etc.) |

## Server Errors
| Code | Meaning | Used In |
|------|---------|---------|
| **500 Internal Server Error** | Unexpected server error (DB failure, etc.) | Any endpoint (handled by error.middleware.js) |
| **429 Too Many Requests** | Rate limit exceeded | Auth endpoints (/login, /refresh, /setup) |

## Response Structure
**Success (ApiResponse)**:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "string",
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "string"
}
```

## Endpoint Groups Summary
| Group | Expected Success | Expected Errors |
|-------|------------------|-----------------|
| **Auth** | 201 (setup), 200 (login/refresh/profile/logout/change-password) | 400, 401, 403, 429 |
| **Attendants** | 200, 201 | 400, 401, 403, 404 |
| **Students** | 200, 201 | 400, 401, 403, 404 |
| **Authors** | 200, 201 | 400, 401, 403, 404 |
| **Books** | 200, 201 | 400, 401, 403, 404 |
| **Borrows** | 200, 201 (issue), 200 (return) | 400, 401, 403, 404 |
| **Health** | 200 | 500 (if DB down) |

## Testing Tips
- Use Postman collection: Tests expect above codes.
- Verify `statusCode` in response body matches HTTP status.
- Edge cases: Invalid ID → 404, no token → 401, bad data → 400.
- Logs: Check `src/logs/combined.log` for details.

---
Reference for POSTMAN-PRODUCTION-TESTING.md

