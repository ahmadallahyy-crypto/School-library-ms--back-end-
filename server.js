/**
 * server.js — Entry point.
 * 1. Connect to MongoDB
 * 2. Start the HTTP server
 * 3. Graceful shutdown on SIGTERM / SIGINT
 * 4. Catch unhandled errors
 *
 * App logic lives in src/app.js so tests can import it without starting a server.
 */

const app       = require("./src/app");
const connectDB = require("./src/config/db");
const logger    = require("./src/config/logger");
const { PORT }  = require("./src/config/env");

let server;

// Connect to DB first, then start the server
const start = async () => {
  await connectDB();

  server = app.listen(PORT, () => {
    logger.info(`─────────────────────────────────────────────`);
    logger.info(` School Library API`);
    logger.info(` Mode:   ${process.env.NODE_ENV}`);
    logger.info(` Port:   ${PORT}`);
    logger.info(` Health: http://localhost:${PORT}/api/health`);
    logger.info(` Setup:  POST http://localhost:${PORT}/api/auth/setup`);
    logger.info(`─────────────────────────────────────────────`);
  });
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Waits for active requests to finish before closing
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM")); // Hosting platforms (e.g. Heroku)
process.on("SIGINT",  () => shutdown("SIGINT"));  // Ctrl+C in terminal

// Catch errors not wrapped in try/catch
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

// Catch promises rejected without .catch()
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

start();