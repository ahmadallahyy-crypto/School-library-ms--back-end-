// config/db.js

const mongoose = require("mongoose");
const { MONGO_URI, NODE_ENV } = require("./env");
const logger = require("./logger");

// ─── Validate env config at startup ─────────────────────────────────────────
if (!MONGO_URI) {
  throw new Error("MONGO_URI must be defined in env config.");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Immediately ping the database to verify the connection is truly alive.
 */
const pingDatabase = async () => {
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (err) {
    logger.error(`Post-connect ping failed: ${err.message}`);
    return false;
  }
};

// ─── Event handlers ───────────────────────────────────────────────────────────

mongoose.connection.on("disconnected", () => {
  logger.warn("⚠️  MongoDB disconnected — Mongoose will attempt to reconnect automatically.");
});

mongoose.connection.on("reconnected", () => {
  logger.info("✅ MongoDB reconnected successfully.");
});

mongoose.connection.on("error", (err) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

// ─── connectDB ───────────────────────────────────────────────────────────────

const connectDB = async (retries = 5, delayMs = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 5000,
        socketTimeoutMS: 45000,
      });

      const isAlive = await pingDatabase();
      if (!isAlive) {
        await mongoose.connection.close();
        throw new Error("Connection not usable after ping");
      }

      logger.info("✅ MongoDB connected successfully.");
      if (NODE_ENV === "development") {
        logger.debug(`   Host: ${mongoose.connection.host}`);
      }

      return;
    } catch (err) {
      logger.error(
        `❌ MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`
      );

      if (attempt === retries) {
        logger.error("Could not connect to MongoDB after maximum retries. Exiting...");
        process.exit(1);
      }

      const waitTime = delayMs * Math.pow(2, attempt - 1);
      logger.info(`   Retrying in ${waitTime / 1000}s...`);
      await sleep(waitTime);
    }
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);
  await mongoose.connection.close();
  logger.info("MongoDB connection closed. Goodbye.");
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

module.exports = connectDB;