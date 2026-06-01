# School Library API - Postman Production Testing Guide

## Overview
This guide explains how to use the provided Postman collection `postman/school-library-api.json` to thoroughly test the School Library Management System API and confirm it's ready for production. The collection covers authentication, CRUD operations for all entities (Attendants, Students, Authors, Books, Borrows), searching/filtering, and health checks.

**Key Features Tested:**
- ✅ Authentication & Authorization (JWT, roles: admin/attendant)
- ✅ CRUD for all resources
- ✅ Validation & Error Handling
- ✅ Pagination & Searching
- ✅ Borrow workflows (issue/return/overdue)
- ✅ Rate Limiting
- ✅ Database Integration (MongoDB assumed)

## Prerequisites
1. **Postman Installed**: Download from [postman.com](https://www.postman.com/downloads/).
2. **API Server Running**:
   ```bash
   npm run dev  # or npm start for production
   ```
   - Default: `http://localhost:5000/api`
   - Update `baseUrl` variable if different.
3. **Database Connected**: Ensure MongoDB is running and seeded (optional: run `node scripts/seed.js`).
4. **Clean State**: Use a test database for safety.

## Step 1: Import the Collection
1. Open Postman.
2. Click **Import** → **Upload Files** → Select `postman/school-library-api.json`.
3. Collection imported with variables: `baseUrl`, `accessToken`, `refreshToken`, `studentId`, `bookId`, etc.

## Step 2: Set Up Environment Variables
1. Create a new **Environment** named `School Library - Local`.
2. Set initial variables (updated automatically during tests):
   | Variable     | Initial Value              | Description |
   |--------------|----------------------------|-------------|
   | `baseUrl`    | `http://localhost:5000/api`| API base URL |
   | `accessToken`| (empty)                    | JWT token   |
   | `refreshToken`| (empty)                  | Refresh token |

## Step 3: Run Tests in Order
Follow this sequence. Collection has **Tests** that auto-set IDs/tokens.

### 1. Authentication (🔐 Auth folder)
```
1. Setup — Create First Admin (run ONCE)
   - Creates admin user. Note the tokens.
2. Login
3. Get My Profile (verify role: admin)
4. Refresh Token
5. Change Password
6. Logout
```
**Expected**: 200 OK, valid tokens, profile data.

### 2. Staff Management (👤 Attendants)
```
1. Get All Attendants
2. Create Attendant → Note attendantId
3. Bulk Create Attendants
4. Get Attendant by ID
5. Update Attendant
6. Delete Attendant
```
**Admin only**. Test without token → 401 Unauthorized.

### 3. Student Management (🎓 Students)
```
1. Get All Students (with pagination)
2. Search Students
3. Create Student → Note studentId
4. Get Student by ID
5. Get Student Borrow History
6. Update Student
7. Delete Student
```

### 4. Author Management (✍️ Authors)
```
1. Get All Authors
2. Create Author → Note authorId
3. Get Author by ID (includes books)
4. Update Author
5. Delete Author
```

### 5. Book Management (📚 Books)
```
1. Get All Books
2. Get Available Books Only
3. Search Books
4. Filter by Genre
5. Create Book (use authorId)
6. Get Book by ID
7. Update Book
8. Delete Book
```

### 6. Borrow Management (📖 Borrows)
```
1. Issue Book to Student (use bookId + studentId)
2. Get All Borrow Records
3. Filter Active Borrows
4. Filter Overdue Borrows
5. Filter by Student
6. Return Book
7. Get Borrow Record by ID
```

### 7. Health Check (❤️ Health)
```
Health Check → 200 OK
```

## Step 4: Production Readiness Checklist
Run all requests. Verify:

| Test Area | Pass Criteria | Status |
|-----------|---------------|--------|
| **Security** | JWT validation, role middleware, rate limiting (spam requests) | ☐ |
| **CRUD** | All create/update/delete succeed, IDs auto-populate | ☐ |
| **Validation** | Bad data → 400 Bad Request (e.g., invalid ISBN, email) | ☐ |
| **Errors** | 404 Not Found, 401 Unauthorized, 403 Forbidden, 500 handled gracefully | ☐ |
| **Pagination** | `?page=1&limit=10` → meta with pagination info | ☐ |
| **Search/Filter** | Query params work (e.g., `?search=term`, `?available=true`) | ☐ |
| **Workflows** | Issue → Active → Return → Completed (no DB errors) | ☐ |
| **Performance** | 50+ requests without crashes, response < 500ms | ☐ |
| **Edge Cases** | Empty lists, overdue borrows, bulk ops | ☐ |
| **Health** | DB connected, no leaks | ☐ |

### Common Error Tests (Manual)
```
- POST /auth/login with wrong password → 401
- GET /books without token → 401
- POST /books with invalid ISBN → 400
- DELETE non-existent ID → 404
```

## Step 5: Production Deployment Tests
1. Update `baseUrl` to production URL (e.g., `https://school-lib-api.com/api`).
2. Use production DB.
3. Run full suite.
4. Monitor logs: `tail -f src/logs/combined.log`
5. Load test: Use Postman Collection Runner (100 iterations).

## Troubleshooting
- **Token Expired**: Run Login/Refresh.
- **ID Not Set**: Re-run create request.
- **CORS/Port**: Check server config.
- **DB Errors**: Verify MongoDB connection in `src/config/db.js`.

## Automation
- **Collection Runner**: Select all → Run → Export results as HTML/JSON.
- **Newman CLI** (for CI/CD):
  ```bash
  npm install -g newman
  newman run postman/school-library-api.json -e School-Library-Local.postman_environment.json
  ```

**All tests pass? API is PRODUCTION READY! 🚀**

---
*Generated for School Library System. Last updated: $(date)*

