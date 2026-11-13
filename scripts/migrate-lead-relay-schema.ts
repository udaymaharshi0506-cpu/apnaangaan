import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export async function migrateLeadRelaySchema() {
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
    console.log("  AANGAN DATABASE MIGRATION: LEAD RELAY SCHEMA");
    console.log("==================================================");

    await client.query("SET search_path TO public;");

    console.log("1. Adding owner response & WhatsApp tracking columns to 'leads' table...");
    await client.query(`
      ALTER TABLE public.leads 
      ADD COLUMN IF NOT EXISTS owner_response varchar(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS owner_responded_at timestamp with time zone,
      ADD COLUMN IF NOT EXISTS whatsapp_message_id varchar(100),
      ADD COLUMN IF NOT EXISTS whatsapp_status varchar(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent_at timestamp with time zone;
    `);
    console.log("   ✓ Columns added/verified on 'leads' table.");

    console.log("2. Creating or updating 'owner_inquiry_view'...");
    await client.query(`
      CREATE OR REPLACE VIEW public.owner_inquiry_view AS
      SELECT
        l.id AS id,
        l.property_id AS property_id,
        p.title AS property_name,
        l.owner_id AS owner_id,
        l.occupants_count AS occupants_count,
        l.tenant_type AS tenant_type,
        l.profession AS profession,
        COALESCE(l.group_gender, 'N/A') AS group_composition,
        l.status AS status,
        COALESCE(l.owner_response, 'pending') AS owner_response,
        l.created_at AS created_at,
        l.updated_at AS updated_at
      FROM public.leads l
      JOIN public.properties p ON l.property_id = p.id;
    `);
    console.log("   ✓ View 'owner_inquiry_view' created successfully.");

    console.log("3. Verifying 'owner_inquiry_view' query...");
    const testRes = await client.query("SELECT * FROM public.owner_inquiry_view LIMIT 1;");
    console.log(`   ✓ View test query returned ${testRes.rowCount} rows.`);

    console.log("==================================================");
    console.log("  LEAD RELAY MIGRATION COMPLETE");
    console.log("==================================================");
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate-lead-relay-schema.ts")) {
  migrateLeadRelaySchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}

