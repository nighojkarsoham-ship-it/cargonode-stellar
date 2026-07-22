import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || (isProduction ? "10" : "20")),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
  process.exit(-1);
});

export default pool;
