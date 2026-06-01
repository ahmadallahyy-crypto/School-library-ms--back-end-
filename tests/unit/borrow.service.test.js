/**
 * Unit tests for borrow.service.js
 *
 * Uses Jest manual mocks — no real DB connection needed.
 * Every test exercises a specific business rule in isolation.
 */

// ── Mock the env config ───────────────────────────────────────────────────────
// MAX_BORROWS_PER_STUDENT must be set here, otherwise it is undefined at import
// time and "activeBorrows >= undefined" always evaluates to false, causing the
// borrow-limit check to be silently skipped in every test run.
jest.mock("../../src/config/env", () => ({
  MAX_BORROWS_PER_STUDENT: 3,
  RATE_LIMIT_WINDOW_MS:    15 * 60 * 1000,
  RATE_LIMIT_MAX:          100,
}));

jest.mock("../../src/models/Book");
jest.mock("../../src/models/Student");
jest.mock("../../src/models/BorrowRecord");
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  return {
    ...actual,
    startSession: jest.fn().mockResolvedValue(mockSession),
  };
});

const Book         = require("../../src/models/Book");
const Student      = require("../../src/models/Student");
const BorrowRecord = require("../../src/models/BorrowRecord");
const ApiError     = require("../../src/utils/ApiError");

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockBook = {
  _id:             "bookId001",
  title:           "Things Fall Apart",
  isActive:        true,
  availableCopies: 2,
};

const mockStudent = {
  _id:             "studentId001",
  name:            "Ada Okafor",
  admissionNumber: "SMS/2024/0001",
  isActive:        true,
};

const sessionMock = () => ({ session: jest.fn().mockReturnThis() });

// ── Test suite ────────────────────────────────────────────────────────────────

describe("borrow.service — issueBook business rules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws 404 if book does not exist", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 404, message: "Book not found." });
  });

  it("throws 400 if book is inactive", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue({ ...mockBook, isActive: false }),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });

  it("throws 400 if no copies are available", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue({ ...mockBook, availableCopies: 0 }),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });

  it("throws 404 if student does not exist", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockBook),
    });
    Student.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 404, message: "Student not found." });
  });

  it("throws 400 if student record is inactive", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockBook),
    });
    Student.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue({ ...mockStudent, isActive: false }),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });

  it("throws 409 if student already has this book checked out", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockBook),
    });
    Student.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockStudent),
    });
    BorrowRecord.findOne = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue({ _id: "existingRecord" }),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 409 });
  });

  it("throws 400 if student has reached the borrow limit", async () => {
    Book.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockBook),
    });
    Student.findById = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(mockStudent),
    });
    BorrowRecord.findOne = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });
    // Simulate student already at the limit (3) — matches MAX_BORROWS_PER_STUDENT
    // mocked above in jest.mock("../../src/config/env")
    BorrowRecord.countDocuments = jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue(3),
    });

    const { issueBook } = require("../../src/services/borrow.service");

    await expect(issueBook("bookId001", "studentId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 400 });
  });
});

describe("borrow.service — returnBook business rules", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws 404 if borrow record does not exist", async () => {
    BorrowRecord.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      }),
    });

    const { returnBook } = require("../../src/services/borrow.service");

    await expect(returnBook("borrowId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 404 });
  });

  it("throws 400 if the book is already returned", async () => {
    const returnedRecord = {
      _id:    "borrowId001",
      status: "returned",
      book:   { _id: "bookId001" },
    };
    BorrowRecord.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        session: jest.fn().mockResolvedValue(returnedRecord),
      }),
    });

    const { returnBook } = require("../../src/services/borrow.service");

    await expect(returnBook("borrowId001", "staffId001"))
      .rejects
      .toMatchObject({ statusCode: 400, message: "This book has already been returned." });
  });
});