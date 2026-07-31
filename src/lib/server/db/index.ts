import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      statement_timeout: 15_000,
    })
  : null;

export const db = pool ? drizzle({ client: pool, schema }) : null;

if (pool) {
  process.once("sveltekit:shutdown", () => {
    void pool.end().catch((cause) => {
      console.error("Failed to close the database pool during shutdown", cause);
    });
  });
}

export function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL is required for this operation");
  }
  return db;
}
