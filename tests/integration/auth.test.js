/**
 * Integration tests for the auth flow.
 *
 * Uses supertest to fire real HTTP requests against the Express app.
 * Uses an in-memory MongoDB via mongoose to avoid touching a real DB.
 *
 * Tests:
 *   POST /api/auth/setup      — creates first admin
 *   POST /api/auth/login      — returns tokens
 *   GET  /api/auth/me         — returns profile
 *   POST /api/auth/refresh    — rotates tokens
 *   POST /api/auth/logout     — revokes refresh token
 *   POST /api/auth/setup      — blocked after first admin created
 */
jest.mock("../../src/middleware/rateLimit.middleware", () => ({
  apiLimiter:  (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
}));
const request  = require("supertest");
const mongoose = require("mongoose");
const app      = require("../../src/app");
const LibraryAttendant = require("../../src/models/LibraryAttendant");

// ── Test data ─────────────────────────────────────────────────────────────────
const adminPayload = {
  name:     "Test Admin",
  email:    "testadmin@school.com",
  password: "Admin@12345",
  staffId:  "TST-001",
  role:     "admin",
};

let accessToken;
let refreshToken;

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  // Connect to an isolated in-memory DB for tests
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/school_library_test");
});

afterAll(async () => {
  await LibraryAttendant.deleteMany({});
  await mongoose.connection.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/setup", () => {
  it("creates the first admin and returns tokens", async () => {
    const res = await request(app)
      .post("/api/auth/setup")
      .send(adminPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.attendant.role).toBe("admin");
    expect(res.body.data.attendant.password).toBeUndefined();

    accessToken  = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("blocks a second setup call once admin exists", async () => {
    const res = await request(app)
      .post("/api/auth/setup")
      .send(adminPayload);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/auth/login", () => {
  it("returns tokens on valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminPayload.email, password: adminPayload.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.attendant.email).toBe(adminPayload.email);

    accessToken  = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("returns 401 on wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminPayload.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 on unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@school.com", password: "Admin@12345" });

    expect(res.status).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: adminPayload.email });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });
});

describe("GET /api/auth/me", () => {
  it("returns attendant profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(adminPayload.email);
    expect(res.body.data.password).toBeUndefined();
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with a malformed token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer notavalidtoken");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("issues a new access token from a valid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Update tokens for subsequent tests
    accessToken  = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("returns 401 on an invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "invalidtoken" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out and revokes the refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });

  it("old refresh token is rejected after logout", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });
});
