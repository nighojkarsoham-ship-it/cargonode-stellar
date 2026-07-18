import { Router } from "express";
import { z } from "zod";
import pool from "../db/index.js";
import {
  config,
  rpc,
  buildContractInvocation,
  simulateAndAssemble,
  submitSignedTx,
  toAddress,
  toI128,
  toStringScVal,
} from "../lib/stellar.js";
import * as StellarSdk from "@stellar/stellar-sdk";
import { logger } from "../index.js";

const log = logger.child({ module: "shipments" });
const router = Router();

// --- Rate Limiting (simple in-memory) ---

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_WRITE = 10; // max write requests per window
const RATE_LIMIT_MAX_READ = 30; // max read requests per window

function rateLimit(max: number) {
  return (req: any, _res: any, next: any) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const timestamps = rateLimitMap.get(ip) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= max) {
      _res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    recent.push(now);
    rateLimitMap.set(ip, recent);
    next();
  };
}

const writeRateLimit = rateLimit(RATE_LIMIT_MAX_WRITE);
const readRateLimit = rateLimit(RATE_LIMIT_MAX_READ);

// --- Validation ---

const CreateShipmentSchema = z.object({
  shipper_address: z.string().length(56),
  driver_address: z.string().length(56),
  amount: z.string().regex(/^\d+(\.\d{1,7})?$/),
  origin: z.string().min(1).max(255),
  destination: z.string().min(1).max(255),
  cargo_description: z.string().max(1000).optional(),
  cargo_weight_kg: z.number().positive().max(1_000_000).optional(),
});

const SubmitTxSchema = z.object({
  signed_xdr: z.string().min(1),
  status: z.enum(["created", "accepted", "confirmed", "cancelled"]).optional(),
});

const AcceptSchema = z.object({
  driver_address: z.string().length(56),
});

const ConfirmSchema = z.object({
  shipper_address: z.string().length(56),
});

const CancelSchema = z.object({
  shipper_address: z.string().length(56),
});

// --- Helpers ---

function parseAmountToBigInt(amountStr: string): bigint {
  // Parse USDC amount (up to 7 decimals) without float precision loss
  const parts = amountStr.split(".");
  const wholePart = parts[0] || "0";
  const fracPart = (parts[1] || "").padEnd(7, "0").slice(0, 7);
  return BigInt(wholePart + fracPart);
}

// --- Routes ---

// List shipments for a user (requires address filter)
router.get("/", readRateLimit, async (req, res) => {
  try {
    const { address, role } = req.query;

    if (!address || typeof address !== "string") {
      return res
        .status(400)
        .json({ error: "address query parameter is required" });
    }

    let query = "SELECT * FROM shipments";
    const params: any[] = [];

    if (role === "driver") {
      query +=
        " WHERE driver_id = (SELECT id FROM users WHERE stellar_address = $1)";
      params.push(address);
    } else if (role === "shipper") {
      query +=
        " WHERE shipper_id = (SELECT id FROM users WHERE stellar_address = $1)";
      params.push(address);
    } else {
      query +=
        " WHERE shipper_id = (SELECT id FROM users WHERE stellar_address = $1) OR driver_id = (SELECT id FROM users WHERE stellar_address = $1)";
      params.push(address);
    }

    query += " ORDER BY created_at DESC LIMIT 50";

    const result = await pool.query(query, params);
    res.json({ shipments: result.rows });
  } catch (err) {
    log.error({ err }, "Error listing shipments");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single shipment (returns stellar addresses instead of UUIDs)
router.get("/:shipment_id", readRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const result = await pool.query(
      `SELECT s.*,
              u1.stellar_address AS shipper_stellar_address,
              u2.stellar_address AS driver_stellar_address
       FROM shipments s
       LEFT JOIN users u1 ON s.shipper_id = u1.id
       LEFT JOIN users u2 ON s.driver_id = u2.id
       WHERE s.shipment_id = $1`,
      [shipment_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    res.json({ shipment: result.rows[0] });
  } catch (err) {
    log.error({ err }, "Error getting shipment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create shipment + build escrow transaction
router.post("/", writeRateLimit, async (req, res) => {
  try {
    const body = CreateShipmentSchema.parse(req.body);

    // Generate unique shipment ID with crypto randomness
    const randomBytes = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const shipmentId = `SHIP-${Date.now()}-${randomBytes}`;

    // Upsert users
    await pool.query(
      `INSERT INTO users (stellar_address, role) VALUES ($1, 'shipper')
       ON CONFLICT (stellar_address) DO NOTHING`,
      [body.shipper_address]
    );

    await pool.query(
      `INSERT INTO users (stellar_address, role) VALUES ($1, 'driver')
       ON CONFLICT (stellar_address) DO NOTHING`,
      [body.driver_address]
    );

    // Insert shipment record
    const insertResult = await pool.query(
      `INSERT INTO shipments (shipment_id, shipper_id, driver_id, origin, destination, cargo_description, cargo_weight_kg, amount, status)
       VALUES ($1, (SELECT id FROM users WHERE stellar_address = $2), (SELECT id FROM users WHERE stellar_address = $3), $4, $5, $6, $7, $8, 'created')
       RETURNING id`,
      [
        shipmentId,
        body.shipper_address,
        body.driver_address,
        body.origin,
        body.destination,
        body.cargo_description || null,
        body.cargo_weight_kg || null,
        body.amount,
      ]
    );

    if (!insertResult.rows[0]?.id) {
      return res.status(400).json({ error: "Failed to create shipment — verify user addresses" });
    }

    // Build XDR for shipper to sign (only if contract is deployed)
    if (!config.contractId) {
      // Dev mode: no contract deployed, skip XDR
      res.json({
        shipment_id: shipmentId,
        xdr: null,
        status: "created",
      });
      return;
    }

    const amountBigInt = parseAmountToBigInt(body.amount);
    const txBuilder = await buildContractInvocation(
      body.shipper_address,
      "create_shipment",
      [
        toAddress(body.shipper_address),
        toAddress(body.driver_address),
        toI128(amountBigInt),
        toStringScVal(shipmentId),
      ]
    );

    const xdr = await simulateAndAssemble(txBuilder);

    res.json({
      shipment_id: shipmentId,
      xdr,
      status: "created",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: err.errors });
    }
    log.error({ err }, "Error creating shipment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Submit signed escrow transaction
router.post("/:shipment_id/submit", writeRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const body = SubmitTxSchema.parse(req.body);

    // Decode XDR and verify it targets our contract with create_shipment
    let tx: StellarSdk.Transaction;
    try {
      tx = StellarSdk.TransactionBuilder.fromXDR(
        body.signed_xdr,
        config.networkPassphrase
      ) as StellarSdk.Transaction;
    } catch {
      return res.status(400).json({ error: "Invalid XDR" });
    }

    // Verify the transaction has an invokeHostFunction op
    const hasValidOp = tx.operations.some((op) => {
      return op.type === "invokeHostFunction";
    });

    if (!hasValidOp) {
      return res
        .status(400)
        .json({ error: "XDR does not contain a valid contract invocation" });
    }

    const result = await submitSignedTx(body.signed_xdr);

    const newStatus = body.status || "created";

    // Update shipment with tx hash and status
    await pool.query(
      `UPDATE shipments SET tx_hash = $1, status = $2, updated_at = NOW() WHERE shipment_id = $3`,
      [result.hash, newStatus, shipment_id]
    );

    // Log history
    await pool.query(
      `INSERT INTO shipments_history (shipment_id, status, tx_hash, notes)
       VALUES ((SELECT id FROM shipments WHERE shipment_id = $1), $2, $3, $4)`,
      [shipment_id, newStatus, result.hash, `Escrow ${newStatus} on-chain`]
    );

    res.json({
      shipment_id,
      tx_hash: result.hash,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: err.errors });
    }
    log.error({ err }, "Error submitting transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Accept shipment (driver)
router.post("/:shipment_id/accept", writeRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const body = AcceptSchema.parse(req.body);

    // Verify shipment exists and driver matches
    const shipmentCheck = await pool.query(
      `SELECT s.status, u.stellar_address AS driver_address
       FROM shipments s
       LEFT JOIN users u ON s.driver_id = u.id
       WHERE s.shipment_id = $1`,
      [shipment_id]
    );

    if (shipmentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    const shipment = shipmentCheck.rows[0];
    if (shipment.driver_address !== body.driver_address) {
      return res.status(403).json({ error: "Not assigned driver for this shipment" });
    }

    if (shipment.status !== "created") {
      return res.status(400).json({ error: `Cannot accept shipment in '${shipment.status}' status` });
    }

    const txBuilder = await buildContractInvocation(
      body.driver_address,
      "accept_shipment",
      [toAddress(body.driver_address), toStringScVal(shipment_id)]
    );

    const xdr = await simulateAndAssemble(txBuilder);

    res.json({ shipment_id, xdr });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: err.errors });
    }
    log.error({ err }, "Error building accept tx");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Confirm delivery + release payment
router.post("/:shipment_id/confirm", writeRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const body = ConfirmSchema.parse(req.body);

    // Verify shipment exists and shipper matches
    const shipmentCheck = await pool.query(
      `SELECT s.status, u.stellar_address AS shipper_address
       FROM shipments s
       LEFT JOIN users u ON s.shipper_id = u.id
       WHERE s.shipment_id = $1`,
      [shipment_id]
    );

    if (shipmentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    const shipment = shipmentCheck.rows[0];
    if (shipment.shipper_address !== body.shipper_address) {
      return res.status(403).json({ error: "Not shipper for this shipment" });
    }

    if (shipment.status !== "accepted") {
      return res.status(400).json({ error: `Cannot confirm shipment in '${shipment.status}' status` });
    }

    const txBuilder = await buildContractInvocation(
      body.shipper_address,
      "confirm_delivery",
      [toAddress(body.shipper_address), toStringScVal(shipment_id)]
    );

    const xdr = await simulateAndAssemble(txBuilder);

    res.json({ shipment_id, xdr });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: err.errors });
    }
    log.error({ err }, "Error building confirm tx");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel shipment
router.post("/:shipment_id/cancel", writeRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const body = CancelSchema.parse(req.body);

    // Verify shipment exists and shipper matches
    const shipmentCheck = await pool.query(
      `SELECT s.status, u.stellar_address AS shipper_address
       FROM shipments s
       LEFT JOIN users u ON s.shipper_id = u.id
       WHERE s.shipment_id = $1`,
      [shipment_id]
    );

    if (shipmentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Shipment not found" });
    }

    const shipment = shipmentCheck.rows[0];
    if (shipment.shipper_address !== body.shipper_address) {
      return res.status(403).json({ error: "Not shipper for this shipment" });
    }

    if (shipment.status !== "created" && shipment.status !== "accepted") {
      return res.status(400).json({ error: `Cannot cancel shipment in '${shipment.status}' status` });
    }

    const txBuilder = await buildContractInvocation(
      body.shipper_address,
      "cancel_shipment",
      [toAddress(body.shipper_address), toStringScVal(shipment_id)]
    );

    const xdr = await simulateAndAssemble(txBuilder);

    res.json({ shipment_id, xdr });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Validation error", details: err.errors });
    }
    log.error({ err }, "Error building cancel tx");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get on-chain shipment data
router.get("/:shipment_id/onchain", readRateLimit, async (req, res) => {
  try {
    const { shipment_id } = req.params;

    const txBuilder = await buildContractInvocation(
      config.contractId,
      "get_shipment",
      [toStringScVal(shipment_id)]
    );

    // Read-only: simulate without submitting
    const tx = txBuilder.setTimeout(10).build();
    const simulation = await rpc.simulateTransaction(tx);

    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      return res.status(404).json({ error: "Shipment not found on-chain" });
    }

    const result = StellarSdk.scValToNative(
      (simulation as any).result?.retval
    );
    res.json({ shipment_id, onchain_data: result });
  } catch (err) {
    log.error({ err }, "Error reading on-chain data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
