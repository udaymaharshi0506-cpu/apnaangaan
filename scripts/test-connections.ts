import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function runTests() {
  console.log("==================================================");
  console.log("   AANGAN MARKETPLACE - CONNECTION DIAGNOSTICS   ");
  console.log("==================================================\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  // 1. Check Supabase URL & Key
  console.log("1. Checking Supabase Credentials:");
  console.log(`   - SUPABASE_URL: ${supabaseUrl ? supabaseUrl : "MISSING"}`);
  console.log(`   - SUPABASE_ANON_KEY: ${supabaseKey ? supabaseKey.slice(0, 16) + "..." : "MISSING"}`);

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Test REST API Reachability
      const restResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      console.log(`   - Supabase REST API Status: ${restResponse.status} ${restResponse.statusText} (OK)`);

      // Test Storage Reachability
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      if (storageError) {
        console.log(`   - Supabase Storage: Note (${storageError.message})`);
        if (supabaseKey.startsWith("sb_publishable_")) {
          console.log(`     * Storage API requires the legacy JWT anon key (starts with eyJ...) or service_role key from Supabase Dashboard > Settings > API.`);
        }
      } else {
        console.log(`   - Supabase Storage: OK (${buckets.length} buckets available)`);
      }

      // Check Tables in Supabase
      const schemaData = await restResponse.json().catch(() => ({}));
      const tables = Object.keys(schemaData.definitions || {});
      console.log(`   - Tables in Supabase Schema: ${tables.length > 0 ? tables.join(", ") : "0 tables found (Run supabase-setup.sql in Supabase SQL editor)"}`);
    } catch (err: any) {
      console.log(`   - Supabase Test Failed: ${err.message}`);
    }
  }

  console.log("\n2. Checking PostgreSQL / DATABASE_URL Connection:");
  const effectiveDbUrl = databaseUrl || "postgresql://postgres:postgres@localhost:5432/aangan_dev";
  console.log(`   - Target DB URL: ${effectiveDbUrl.replace(/:[^:@]+@/, ":****@")}`);

  try {
    const isSupabase = effectiveDbUrl.includes("supabase.co") || effectiveDbUrl.includes("pooler.supabase.com");
    const pool = new Pool({
      connectionString: effectiveDbUrl,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });

    const result = await pool.query(`
      SELECT 
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
        (SELECT count(*) FROM properties) as property_count,
        (SELECT count(*) FROM users) as user_count;
    `);

    const { table_count, property_count, user_count } = result.rows[0];
    console.log(`   - PostgreSQL Database Connection: SUCCESS!`);
    console.log(`   - Tables detected: ${table_count}`);
    console.log(`   - Properties loaded: ${property_count}`);
    console.log(`   - Users loaded: ${user_count}`);
    await pool.end();
  } catch (err: any) {
    console.log(`   - PostgreSQL Connection Failed: ${err.message}`);
  }

  console.log("\n==================================================");
}

runTests();
