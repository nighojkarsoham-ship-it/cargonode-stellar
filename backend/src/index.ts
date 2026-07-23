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

// --- Telemetry & Monitoring Counters ---
let totalRequests = 0;
let totalErrors = 0;
let latencySumMs = 0;

// Request logging & metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  totalRequests++;
  res.on("finish", () => {
    const duration = Date.now() - start;
    latencySumMs += duration;
    if (res.statusCode >= 400) {
      totalErrors++;
    }
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

// Production System Metrics & Telemetry Monitoring Endpoint
app.get("/api/metrics", async (_req, res) => {
  try {
    const dbRes = await pool.query("SELECT COUNT(*) FROM shipments");
    const shipmentCount = parseInt(dbRes.rows[0]?.count || "0", 10);

    const mem = process.memoryUsage();
    const avgLatency = totalRequests > 0 ? (latencySumMs / totalRequests).toFixed(2) : "0.00";
    const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : "0.00";

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      system: {
        uptime_seconds: Math.floor(process.uptime()),
        memory_heap_used_mb: (mem.heapUsed / 1024 / 1024).toFixed(2),
        memory_rss_mb: (mem.rss / 1024 / 1024).toFixed(2),
        node_version: process.version,
        platform: process.platform,
      },
      telemetry: {
        total_requests: totalRequests,
        total_errors: totalErrors,
        error_rate_pct: parseFloat(errorRate),
        avg_latency_ms: parseFloat(avgLatency),
      },
      database: {
        pool_total_connections: pool.totalCount,
        pool_idle_connections: pool.idleCount,
        pool_waiting_clients: pool.waitingCount,
        total_shipments_stored: shipmentCount,
      },
      network: {
        stellar_network: process.env.STELLAR_NETWORK || "testnet",
        soroban_rpc_url: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
        escrow_contract: process.env.ESCROW_CONTRACT_ID || "CAI52UIAHEMT3SNQ2EXOJKHHC2PAGLGURZYNL6HFZJ6LL5KDQFURBQUH",
      },
    });
  } catch (err: any) {
    log.error({ err: err.message }, "Metrics check failed");
    res.status(500).json({ error: "Failed to collect system metrics", detail: err.message });
  }
});

// Debug: test DB connection and tables
app.get("/api/debug", async (_req, res) => {
  try {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const dbUrl = process.env.DATABASE_URL ? "set (hidden)" : "NOT SET";
    res.json({ db: dbUrl, tables: tables.rows });
  } catch (err: any) {
    res.json({ error: err.message, db: process.env.DATABASE_URL ? "set" : "NOT SET" });
  }
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
  const migrations = [
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stellar_address VARCHAR(56) UNIQUE NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('shipper', 'driver')),
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS shipments (
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
    )`,
    `CREATE TABLE IF NOT EXISTS shipments_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shipment_id UUID NOT NULL REFERENCES shipments(id),
      status VARCHAR(20) NOT NULL,
      tx_hash VARCHAR(64),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_shipper ON shipments(shipper_id)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_driver ON shipments(driver_id)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_shipper_status ON shipments(shipper_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_driver_status ON shipments(driver_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_users_stellar ON users(stellar_address)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_history_shipment ON shipments_history(shipment_id)`,
  ];

  try {
    for (const sql of migrations) {
      await pool.query(sql);
    }
    log.info("Database migration completed");
  } catch (err: any) {
    log.error({ err: err.message, stack: err.stack }, "Migration failed");
  }

  app.listen(PORT, () => {
    log.info(`CargoNode API running on port ${PORT}`);
    log.info(`Network: ${process.env.STELLAR_NETWORK || "testnet"}`);
    log.info(`CORS origins: ${allowedOrigins.join(", ")}`);
  });
}

start();
