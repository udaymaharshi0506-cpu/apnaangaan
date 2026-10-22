import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ ERROR: DATABASE_URL is not set in .env");
  process.exit(1);
}

const tablesToSecure = [
  "users",
  "properties",
  "leads",
  "meetings",
  "notifications",
  "favorites",
  "admin_call_logs",
  "lead_events",
  "saved_searches",
  "otp_challenges",
  "refresh_tokens",
  "uploaded_images",
];

async function fixRLS() {
  console.log("==================================================");
  console.log("   SUPABASE ROW LEVEL SECURITY (RLS) HARDENING   ");
  console.log("==================================================\n");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    console.log("1. Enabling Row Level Security (RLS) on all public tables...");

    for (const table of tablesToSecure) {
      await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      console.log(`   ✔ Enabled RLS on: ${table}`);
    }

    console.log("\n2. Revoking direct public/anon/authenticated access to PostgREST on public tables...");
    await client.query(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;
    `);
    console.log("   ✔ Revoked direct PostgREST access from 'anon' and 'authenticated' roles.");
    console.log("   ✔ Explicitly granted full access to 'postgres' and 'service_role'.");

    console.log("\n3. Hardening DEFAULT PRIVILEGES for future tables (October 30 readiness)...");
    await client.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        REVOKE ALL ON ROUTINES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        GRANT ALL ON TABLES TO postgres, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        GRANT ALL ON SEQUENCES TO postgres, service_role;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
        GRANT ALL ON ROUTINES TO postgres, service_role;
    `);
    console.log("   ✔ Default privileges configured: future tables will never be leaked to anon,");
    console.log("     and will automatically grant full access to postgres & service_role.");

    console.log("\n4. Verifying updated RLS status in PostgreSQL catalog:");
    const verifyRes = await client.query(`
      SELECT 
        tablename, 
        rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.table(verifyRes.rows);

    const insecureTables = verifyRes.rows.filter((r) => !r.rowsecurity);
    if (insecureTables.length === 0) {
      console.log("\n🎉 SUCCESS: All tables in public schema have Row Level Security ENABLED!");
      console.log("   Database is fully secure and 100% prepared for the October 30 Data API changes.");
    } else {
      console.warn("\n⚠️ WARNING: Some tables still have RLS disabled:", insecureTables);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

fixRLS().catch((err) => {
  console.error("❌ Fix failed:", err);
  process.exit(1);
});
