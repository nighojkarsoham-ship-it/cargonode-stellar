import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db/index.js";
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

async function start() {
  // Auto-migrate: create tables on startup
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stellar_address VARCHAR(56) UNIQUE NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('shipper', 'driver')),
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id VARCHAR(32) UNIQUE NOT NULL,
        shipper_id UUID NOT NULL REFERENCES users(id),
        driver_id UUID NOT NULL REFERENCES users(id),
        origin VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        cargo_description TEXT,
        cargo_weight_kg DECIMAL(10,2),
        amount DECIMAL(20,7) NOT NULL CHECK (amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN (
          'created', 'accepted', 'in_transit', 'delivered', 'confirmed', 'completed', 'cancelled'
        )),
        contract_address VARCHAR(56),
        tx_hash VARCHAR(64),
        proof_of_delivery_url TEXT,
        pickup_date TIMESTAMP WITH TIME ZONE,
        delivery_date TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipments_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shipment_id UUID NOT NULL REFERENCES shipments(id),
        status VARCHAR(20) NOT NULL,
        tx_hash VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_shipments_shipper ON shipments(shipper_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_driver ON shipments(driver_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
      CREATE INDEX IF NOT EXISTS idx_users_stellar ON users(stellar_address);
    `);
    log.info("Database migration completed");
  } catch (err: any) {
    log.error({ err: err.message }, "Migration failed — tables may already exist");
  }

  app.listen(PORT, () => {
    log.info(`CargoNode API running on port ${PORT}`);
    log.info(`Network: ${process.env.STELLAR_NETWORK || "testnet"}`);
    log.info(`CORS origins: ${allowedOrigins.join(", ")}`);
  });
}

start();
