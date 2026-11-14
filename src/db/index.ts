import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl =
  process.env.POOLER_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/aangan_dev";

const isHostedPg =
  databaseUrl.includes("supabase.co") ||
  databaseUrl.includes("pooler.supabase.com") ||
  databaseUrl.includes("neon.tech") ||
  databaseUrl.includes("sslmode=require") ||
  (process.env.NODE_ENV === "production" && !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1"));

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL && !process.env.POOLER_URL) {
  console.warn("⚠️ Neither POOLER_URL nor DATABASE_URL is set in environment variables. Database operations will not succeed until configured.");
}

const cleanDatabaseUrl = isHostedPg
  ? databaseUrl.replace(/[?&]sslmode=[^&]+/, "")
  : databaseUrl;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: cleanDatabaseUrl,
    ssl: isHostedPg ? { rejectUnauthorized: false } : undefined,
    options: "-c search_path=public",
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 20000,
    max: isHostedPg ? 10 : 20,
    keepAlive: true,
  });

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

// Cache pool on globalThis in all environments so warm serverless lambdas reuse connections
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
