import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aangan_dev";

const isHostedPg =
  databaseUrl.includes("supabase.co") ||
  databaseUrl.includes("pooler.supabase.com") ||
  databaseUrl.includes("neon.tech") ||
  databaseUrl.includes("sslmode=require") ||
  (process.env.NODE_ENV === "production" && !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1"));

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set in environment variables. Database operations will not succeed until DATABASE_URL is configured in Vercel.");
}

const cleanDatabaseUrl = isHostedPg
  ? databaseUrl.replace(/[?&]sslmode=[^&]+/, "")
  : databaseUrl;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: cleanDatabaseUrl,
    ssl: isHostedPg ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 3000,
    max: isHostedPg ? 3 : 10,
  });

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

// Cache pool on globalThis in all environments so warm serverless lambdas reuse connections
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
