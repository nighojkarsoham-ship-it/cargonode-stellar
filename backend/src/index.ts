import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import shipmentsRouter from "./routes/shipments.js";
import { logger } from "./lib/logger.js";

dotenv.config();

// --- Logger ---

const log = logger.child({ module: "server" });

// --- App ---

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// --- Routes ---

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    network: process.env.STELLAR_NETWORK || "testnet",
  });
});

app.use("/api/shipments", shipmentsRouter);

// --- Error Handler ---

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error({ err: err.message, stack: err.stack }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  }
);

// --- Start ---

app.listen(PORT, () => {
  log.info(`CargoNode API running on port ${PORT}`);
  log.info(`Network: ${process.env.STELLAR_NETWORK || "testnet"}`);
  log.info(`CORS origins: ${allowedOrigins.join(", ")}`);
});
