# Postman: Test All Routes (School Library API)

This guide explains how to use Postman to exercise **every API route** in this project.

## 1) Prerequisites

### Install & start
```bash
npm install
npm run dev   # or: npm start
```

### MongoDB
The app expects MongoDB. Use the same setup your project uses (often via `src/config/db.js` and `.env`).

## 2) Import the Postman collection

Import the collection file:
- `postman/school-library-api.json`

In Postman:
- **File → Import → File**
- Select `postman/school-library-api.json`

## 3) Configure Base URL

Set the collection variable `baseUrl` (or edit each request) to match your server.

Typical defaults:
- `http://localhost:3000`

> If you are unsure of the port, check `server.js` (and/or `src/app.js`).

## 4) Common headers and variables

### JWT access token
For endpoints that use `protect`, set:
- Header:
  - `Authorization: Bearer {{accessToken}}`

### Content-Type
Most requests require:
- `Content-Type: application/json`

## 5) Auth flow (required before protected routes)

### 1. Setup first admin
**POST** `/api/auth/setup`

Body (raw JSON):
```json
{
  "name": "Test Admin",
  "email": "testadmin@school.com",
  "password": "Admin@12345",
  "staffId": "TST-001",
  "role": "admin"
}
```

Expected: **201**
- Save `accessToken` and `refreshToken` from response.

### 2. Login
**POST** `/api/auth/login`

Body:
```json
{ "email": "testadmin@school.com", "password": "Admin@12345" }
```

Expected: **200**
- Save updated tokens.

### 3. Profile (JWT protected)
**GET** `/api/auth/me`

Headers:
- `Authorization: Bearer {{accessToken}}`

Expected: **200**

## 6) Route-by-route testing checklist

> The paths below are based on Express routes under `src/routes/*`.
> Add JWT header for any route that uses `protect`.

### A) Auth routes (`src/routes/auth.routes.js`)

1. **POST** `/api/auth/setup`
   - Body: attendant creation schema (see `src/validators/attendant.validator.js`)
   - Expected: **201** on first setup, **403** later

2. **POST** `/api/auth/login`
   - Body: `{ "email": string, "password": string }`
   - Expected: **200** valid, **401** invalid, **400** missing fields

3. **POST** `/api/auth/refresh`
   - Body: `{ "refreshToken": string }`
   - Expected: **200** valid, **401** invalid

4. **POST** `/api/auth/logout`
   - Headers: `Authorization: Bearer {{accessToken}}`
   - Expected: **200**; refresh token becomes invalid

5. **GET** `/api/auth/me`
   - Headers: `Authorization: Bearer {{accessToken}}`
   - Expected: **200** with valid token, **401** missing/malformed token

6. **PUT** `/api/auth/change-password`
   - Headers: `Authorization: Bearer {{accessToken}}`
   - Body: `{ "currentPassword": "...", "newPassword": "...", "confirmPassword": "..." }`

### B) Attendant routes (`src/routes/attendant.routes.js`)

These routes are protected and typically require admin/role.

1. **POST** `/api/attendants/` or `/api/attendants` (create)
2. **PUT** `/api/attendants/:id` (update)
3. Bulk create route if present.

Checklist:
- Attempt without JWT → expect **401**
- Attempt with JWT but wrong role → expect **403**
- Attempt with valid JWT and correct role → expect **201/200**

### C) Author routes (`src/routes/author.routes.js`)

1. **POST** `/api/authors`
2. **GET** `/api/authors`
3. **GET** `/api/authors/:id`
4. **PUT** `/api/authors/:id`
5. **DELETE** `/api/authors/:id` (if implemented)

### D) Book routes (`src/routes/book.routes.js`)

1. **POST** `/api/books`
2. **GET** `/api/books`
3. **GET** `/api/books/:id`
4. **PUT** `/api/books/:id`
5. **DELETE** `/api/books/:id` (if implemented)

### E) Student routes (`src/routes/student.routes.js`)

1. **POST** `/api/students`
2. **GET** `/api/students`
3. **GET** `/api/students/:id`
4. **PUT** `/api/students/:id`
5. **DELETE** `/api/students/:id` (if implemented)

### F) Borrow routes (`src/routes/borrow.routes.js`)

These are the business-critical endpoints.

1. **POST** `/api/borrow/issue` (or `/api/borrow`) — issue a book
2. **POST** `/api/borrow/return` (or similar) — return a book
3. **PUT** or scheduled route for overdue marking (if present)

Checklist:
- Issue with non-existent book/student → **404**
- Issue inactive book/student → **400**
- Issue when no copies → **400**
- Issue duplicate book to same student → **409**
- Issue beyond borrow limit → **400**

## 7) Variables you should create in Postman

Create these in an environment (Postman Variables):
- `baseUrl`
- `accessToken`
- `refreshToken`

Use Postman Tests scripts (auto) to capture tokens.

## 8) If you want this to be 100% exact

If you want the file to list every route **with the exact request bodies**, send me:
- your server port (or confirm it’s `:3000`)
- and whether you want the output to include **request JSON examples for each route**.

This project already includes a Postman collection JSON, so the fastest option is: import it and then use the checklist here.

