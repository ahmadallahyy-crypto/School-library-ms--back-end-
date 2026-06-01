// config/logger.js

const { createLogger, format, transports } = require("winston");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const { NODE_ENV } = require("./env");

// ANSI color codes for distinct log levels
const colors = {
  error: "\x1b[31m",   // red
  warn:  "\x1b[33m",   // yellow
  info:  "\x1b[32m",   // green
  debug: "\x1b[36m",   // cyan
  verbose: "\x1b[35m", // magenta
  silly: "\x1b[90m",   // gray
};
const RESET = "\x1b[0m";

// Ensure logs directory exists
const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Console format: each level gets its own color
const consoleFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, stack }) => {
    const color = colors[level] || "\x1b[37m"; // default white
    const coloredLevel = `${color}${level}${RESET}`;
    const coloredMessage = stack
      ? `${color}${stack}${RESET}`
      : `${color}${message}${RESET}`;
    return `${timestamp} ${coloredLevel}: ${coloredMessage}`;
  })
);

// File format (plain text, no colors)
const fileFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message, stack }) =>
    `${timestamp} ${level.toUpperCase()}: ${stack || message}`
  )
);

// Create Winston logger
const logger = createLogger({
  level: NODE_ENV === "production" ? "info" : "debug",
  format: fileFormat,
  transports: [
    new transports.Console({
      level: NODE_ENV === "production" ? "info" : "debug",
      format: consoleFormat,
    }),
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      level: "debug",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new transports.File({ filename: path.join(logDir, "exceptions.log") }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(logDir, "rejections.log") }),
  ],
  exitOnError: false,
});

// In development, also log exceptions/rejections to console with the same color rules
if (NODE_ENV !== "production") {
  logger.exceptions.handle(new transports.Console({ format: consoleFormat }));
  logger.rejections.handle(new transports.Console({ format: consoleFormat }));
}

// Morgan stream – HTTP requests logged as INFO (green)
const stream = {
  write: (message) => logger.info(message.trim()),
};
const morganMiddleware = morgan("combined", { stream });

module.exports = logger;
module.exports.morganMiddleware = morganMiddleware;