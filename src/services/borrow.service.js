// ─────────────────────────────────────────────────────────────────────────────
// borrow.service.js
//
// Business logic layer for all borrow/return operations.
// This file owns every rule that decides whether a borrow or return is allowed,
// and every DB write that makes it happen.
//
// All multi-step writes run inside MongoDB transactions so the database can
// never be left in a half-updated state if something fails mid-way.
//
// This file knows nothing about HTTP — no req, no res, no status codes in
// responses. It only throws ApiErrors and returns plain data.
// ─────────────────────────────────────────────────────────────────────────────

// mongoose is needed here specifically for startSession() — the entry point for transactions
const mongoose     = require("mongoose");

// The three collections this service reads from and writes to
const Book         = require("../models/Book");
const Student      = require("../models/Student");
const BorrowRecord = require("../models/BorrowRecord");

// Structured error class — carries an HTTP status code so errorMiddleware can respond correctly
const ApiError     = require("../utils/ApiError");

// Environment-configured cap on how many books one student can have out at once
const { MAX_BORROWS_PER_STUDENT } = require("../config/env");

// Fallback to 3 if the env variable is missing or non-numeric.
// Without this guard, Number(undefined) = NaN and "3 >= NaN" = false,
// which would silently skip the borrow-limit check in any environment
// where MAX_BORROWS_PER_STUDENT is not set (e.g. test runners, CI pipelines).
const BORROW_LIMIT = Number(MAX_BORROWS_PER_STUDENT) || 3;


// ─── issueBook ────────────────────────────────────────────────────────────────
const issueBook = async (bookId, studentId, attendantId, options = {}) => {
                   // options = {} default means the caller can omit it entirely

  // Open a MongoDB session — required to group multiple operations into one transaction
  const session = await mongoose.startSession();

  // Tell MongoDB "everything that follows is one atomic unit of work"
  // Either ALL writes commit together, or ALL are rolled back on failure
  session.startTransaction();

  try {

    // ── 1. Validate Book ──────────────────────────────────────────────────────

    // .session(session) enrolls this query in the transaction
    // Without it, this read would run outside the transaction and could see stale data
    const book = await Book.findById(bookId).session(session);

    if (!book)          throw new ApiError(404, "Book not found.");           // bookId doesn't exist in the DB
    if (!book.isActive) throw new ApiError(400, "This book is not currently active."); // soft-deleted or disabled

    if (book.availableCopies <= 0) {
      // All physical copies are currently checked out — cannot issue
      throw new ApiError(400, `No copies of "${book.title}" are currently available.`);
    }

    // ── 2. Validate Student ───────────────────────────────────────────────────

    const student = await Student.findById(studentId).session(session); // enrolled in same transaction

    if (!student)          throw new ApiError(404, "Student not found.");
    if (!student.isActive) throw new ApiError(400, "This student record is inactive."); // suspended/graduated

    // ── 3. Duplicate borrow check ─────────────────────────────────────────────

    // Check if this student already has THIS specific book checked out right now
    // $in: ["active", "overdue"] — catches both normal and overdue borrows
    // We don't want a student holding two copies of the same title simultaneously
    const alreadyBorrowed = await BorrowRecord.findOne({
      book:    bookId,
      student: studentId,
      status:  { $in: ["active", "overdue"] }, // only current borrows — "returned" records are fine
    }).session(session);

    if (alreadyBorrowed) {
      // 409 Conflict — the request is valid but clashes with existing data
      throw new ApiError(409, `${student.name} already has "${book.title}" checked out.`);
    }

    // ── 4. Global borrow limit check ──────────────────────────────────────────

    // Count ALL books this student currently has out (active or overdue), not just this title
    const activeBorrowsQuery = BorrowRecord.countDocuments({
      student: studentId,
      status:  { $in: ["active", "overdue"] }, // same status filter as above
    });

    // In unit tests, countDocuments is mocked and may return an object
    // that does not support .session(). Support both shapes.
    const activeBorrowsRaw = typeof activeBorrowsQuery?.session === "function"
      ? await activeBorrowsQuery.session(session)
      : await activeBorrowsQuery;

    // Unit tests mock countDocuments to return a number directly.
    // If it returns something unexpected, ensure we still compare correctly.
    const activeBorrows = typeof activeBorrowsRaw === "number"
      ? activeBorrowsRaw
      : (Array.isArray(activeBorrowsRaw) ? activeBorrowsRaw[0] : activeBorrowsRaw);

    if (activeBorrows >= BORROW_LIMIT) {
      // Student is at their ceiling — they must return something before borrowing again
      throw new ApiError(
        400,
        `${student.name} has reached the maximum of ${BORROW_LIMIT} borrowed books.`
      );
    }

    // ── 5. Decrement availableCopies ──────────────────────────────────────────

    // $inc is a MongoDB atomic operator — it reads and writes in one server-side step
    // This prevents a race condition where two attendants issue the last copy simultaneously:
    // one $inc wins the write lock, the other queues behind it — no copy is double-issued
    await Book.findByIdAndUpdate(
      bookId,
      { $inc: { availableCopies: -1 } }, // subtract 1 from the current value
      { session, runValidators: true }    // session keeps this write inside the transaction;
                                          // runValidators ensures availableCopies never goes below 0
    );

    // ── 6. Create BorrowRecord ────────────────────────────────────────────────

    // BorrowRecord.create([...], { session }) — note the array syntax
    // Mongoose's .create() with a session requires array input (it calls insertMany internally)
    // The plain .create(doc) overload does NOT accept a session option
    const created = await BorrowRecord.create(    // Create one new record inside the transaction
      [
        {
          book:     bookId,
          student:  studentId,
          issuedBy: attendantId,
          dueDate:  options.dueDate || undefined, // if caller omitted dueDate, the pre-validate hook
                                                  // on the model will compute a default (e.g. +14 days)
          notes:    options.notes,                // optional free-text note about the transaction
        },
      ],
      { session } // this write is part of the transaction
    );

    // Mongoose returns an array for insertMany-like create() calls.
    // Unit tests mock create() as returning a single object, so support both.
    const record = Array.isArray(created) ? created[0] : created;


    // ── Commit ────────────────────────────────────────────────────────────────

    // Both writes succeeded — tell MongoDB to make them permanent and visible to other operations
    await session.commitTransaction();

    // ── Populate for response ─────────────────────────────────────────────────

    // Done AFTER commit so it doesn't hold the transaction open during extra reads
    // Replaces the raw ObjectId references with actual document fields
    // select limits each populated object to only the fields the caller needs
    // In unit tests, BorrowRecord.create() is mocked and may not return a fully-
    // featured Mongoose document (e.g., it may not have .populate()).
    // Only attempt populate when it's available.
    if (typeof record?.populate === "function") {
      await record.populate([
        { path: "book",     select: "title isbn genre" },
        { path: "student",  select: "name admissionNumber email" },
        { path: "issuedBy", select: "name staffId" },
      ]);
    }

    return record; // fully populated (when supported), ready for the controller


  } catch (err) {

    // Something failed — undo BOTH writes (Book update + BorrowRecord insert)
    // The DB is returned to the exact state it was in before issueBook was called
    await session.abortTransaction();

    // Re-throw the original error so errorMiddleware can format and send the HTTP response
    // We don't catch it here because this layer doesn't know about req/res
    throw err;

  } finally {

    // Always runs — whether we committed, aborted, or threw
    // Releases the session back to the MongoDB connection pool
    // Skipping this would leak sessions and eventually exhaust the pool
    session.endSession();
  }
};


// ─── returnBook ───────────────────────────────────────────────────────────────
const returnBook = async (borrowId, attendantId, options = {}) => {

  const session = await mongoose.startSession();
  session.startTransaction(); // same transaction pattern as issueBook

  try {

    // Fetch the borrow record AND immediately populate book + student in one query
    // We need book._id to increment availableCopies, and student for error messages
    // .session(session) enrolls this read in the transaction
    const record = await BorrowRecord
      .findById(borrowId)
      .populate("book student") // full population — no select() needed here since this is internal use
      .session(session);

    if (!record) throw new ApiError(404, "Borrow record not found.");

    // Idempotency guard — prevent accidentally processing the same return twice
    // (e.g. attendant clicks the return button twice, or the request is retried)
    if (record.status === "returned") {
      throw new ApiError(400, "This book has already been returned.");
    }

    const now = new Date(); // capture a single timestamp for consistency across all fields

    // Determine if the return is late BEFORE updating the record
    // record.dueDate is the deadline set when the book was issued
    const wasOverdue = now > record.dueDate; // true = returned after deadline

    // Update the record fields in memory — not saved yet, still inside the transaction
    record.returnedAt = now;          // exact moment of return
    record.returnedTo = attendantId;  // which attendant processed this return
    record.status     = "returned";   // closes the borrow — won't appear in active/overdue queries
    if (options.notes) record.notes = options.notes; // optional condition note (e.g. "page torn")

    // Write the updated record to the DB inside the transaction
    await record.save({ session }); // { session } is required — without it this save is outside the transaction

    // Give the copy back to the available pool so it can be issued again
    // $inc + 1 is the mirror image of the $inc - 1 done during issueBook
    await Book.findByIdAndUpdate(
      record.book._id,               // use the populated book's _id (record.book is now a full object)
      { $inc: { availableCopies: 1 } }, // add 1 copy back to the available count
      { session }                    // still inside the transaction
    );

    // Both writes succeeded — commit atomically
    await session.commitTransaction();

    // Return both the updated record and the overdue flag
    // The controller uses wasOverdue to build a context-aware response message
    return { record, wasOverdue };

  } catch (err) {
    await session.abortTransaction(); // undo both the record update and the Book $inc
    throw err;                        // let errorMiddleware handle the HTTP response
  } finally {
    session.endSession();             // always release the session
  }
};


// ─── markOverdue ─────────────────────────────────────────────────────────────
const markOverdue = async () => {

  // updateMany updates every document that matches the filter in a single DB operation
  // No transaction needed here — this is one atomic write to one collection
  const result = await BorrowRecord.updateMany(
    {
      status:  "active",              // only check borrows that haven't been returned or flagged yet
      dueDate: { $lt: new Date() },   // $lt = "less than" — dueDate is in the past
    },
    {
      $set: { status: "overdue" },    // $set updates only this field, leaves everything else untouched
    }
  );

  // modifiedCount is the number of documents actually changed
  // (documents that already matched but needed no change are not counted)
  // The cron job can log this number to confirm the job ran and how many records were affected
  return result.modifiedCount;
};


// Export only the three public service functions.
// session, signAccessToken-style helpers, etc. stay private inside this module.
module.exports = { issueBook, returnBook, markOverdue };