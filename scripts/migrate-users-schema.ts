import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export async function migrateUsersSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing from .env");

  const cleanDatabaseUrl = databaseUrl.replace(/[?&]sslmode=[^&]+/, "");
  const isHostedPg =
    databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("pooler.supabase.com") ||
    databaseUrl.includes("neon.tech");

  const pool = new Pool({
    connectionString: cleanDatabaseUrl,
    ssl: isHostedPg ? { rejectUnauthorized: false } : undefined,
    options: "-c search_path=public",
  });

  const client = await pool.connect();

  try {
    console.log("==================================================");
    console.log("  AANGAN DATABASE MIGRATION: USERS TABLE");
    console.log("==================================================");

    await client.query("SET search_path TO public;");

    // 1. Add last_login timestamp column if not exists
    console.log("1. Checking 'last_login' column...");
    await client.query(`
      ALTER TABLE public.users 
      ADD COLUMN IF NOT EXISTS last_login timestamp with time zone;
    `);
    console.log("   ✓ Column 'last_login' verified / added.");

    // 2. Add location column if not exists
    console.log("2. Checking 'location' column...");
    await client.query(`
      ALTER TABLE public.users 
      ADD COLUMN IF NOT EXISTS location varchar(255);
    `);
    console.log("   ✓ Column 'location' verified / added.");

    // 3. Backfill any NULL emails before enforcing NOT NULL
    console.log("3. Inspecting existing NULL emails...");
    const nullEmailRes = await client.query(`
      SELECT id, phone, name FROM public.users WHERE email IS NULL;
    `);
    if (nullEmailRes.rows.length > 0) {
      console.log(`   Found ${nullEmailRes.rows.length} rows with NULL email. Backfilling...`);
      for (const row of nullEmailRes.rows) {
        const fallbackEmail = row.phone
          ? `user_${row.phone.replace(/\D/g, "")}@apnaangaan.in`
          : `user_${row.id.slice(0, 8)}@apnaangaan.in`;
        await client.query(`
          UPDATE public.users 
          SET email = $1 
          WHERE id = $2;
        `, [fallbackEmail, row.id]);
        console.log(`   - User ${row.id} assigned fallback email: ${fallbackEmail}`);
      }
    } else {
      console.log("   ✓ No NULL emails found.");
    }

    // 4. Ensure email is NOT NULL
    console.log("4. Enforcing NOT NULL on email column...");
    await client.query(`
      ALTER TABLE public.users 
      ALTER COLUMN email SET NOT NULL;
    `);
    console.log("   ✓ Column 'email' set to NOT NULL.");

    // 5. Ensure UNIQUE constraint on email
    console.log("5. Ensuring UNIQUE constraint on email...");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'users_email_unique' OR conname = 'users_email_key'
        ) THEN
          ALTER TABLE public.users ADD CONSTRAINT users_email_unique UNIQUE (email);
        END IF;
      END $$;
    `);
    console.log("   ✓ UNIQUE constraint on 'email' confirmed.");

    // 6. Ensure index on email (case-insensitive for fast lookups)
    console.log("6. Creating lower(email) index for case-insensitive lookup...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS users_email_lower_idx 
      ON public.users (lower(email));
    `);
    console.log("   ✓ Index 'users_email_lower_idx' ready.");

    // 7. Verify all columns of users table
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position;
    `);

    console.log("\nUpdated public.users Schema Columns:");
    for (const c of cols.rows) {
      console.log(`  - ${c.column_name.padEnd(18)} : ${c.data_type.padEnd(25)} (Nullable: ${c.is_nullable}, Default: ${c.column_default || "none"})`);
    }

    console.log("\n==================================================");
    console.log("   USERS TABLE MIGRATION COMPLETE! ");
    console.log("==================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate-users-schema.ts") || process.argv[1]?.endsWith("migrate-users-schema.js")) {
  migrateUsersSchema().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
