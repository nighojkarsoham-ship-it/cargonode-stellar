import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schema = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf-8"
  );

  try {
    await pool.query(schema);
    console.log("Database migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
