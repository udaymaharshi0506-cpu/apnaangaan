import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function cleanDatabase() {
  const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aangan_dev";
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log("Truncating all database tables...");
    await pool.query(`
      TRUNCATE TABLE 
        refresh_tokens,
        otp_challenges,
        saved_searches,
        lead_events,
        admin_call_logs,
        favorites,
        notifications,
        meetings,
        leads,
        properties,
        users
      RESTART IDENTITY CASCADE;
    `);
    console.log("SUCCESS: All 11 tables have been completely cleared (0 rows).");
  } catch (error) {
    console.error("Error clearing database:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanDatabase();
