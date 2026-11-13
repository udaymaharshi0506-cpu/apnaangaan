import "dotenv/config";
import { pool } from "../src/db";

async function migrate() {
  console.log("Running migration for manager_requests and properties schema...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Add managed service columns to properties table
    await client.query(`
      ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS listing_mode VARCHAR(20) DEFAULT 'self',
        ADD COLUMN IF NOT EXISTS managed_tier VARCHAR(20) DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10, 2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'not_required',
        ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS request_status VARCHAR(30) DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS assigned_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS assigned_manager_name VARCHAR(150);
    `);

    // Create manager_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS manager_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
        listing_mode VARCHAR(20) NOT NULL DEFAULT 'managed',
        managed_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
        fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 499.00,
        payment_status VARCHAR(30) NOT NULL DEFAULT 'paid',
        transaction_id VARCHAR(100),
        is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
        request_status VARCHAR(30) NOT NULL DEFAULT 'new',
        assigned_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
        assigned_manager_name VARCHAR(150),
        property_title VARCHAR(255),
        locality VARCHAR(120),
        city VARCHAR(100),
        owner_contact_phone VARCHAR(25),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS manager_requests_owner_idx ON manager_requests(owner_id);
      CREATE INDEX IF NOT EXISTS manager_requests_status_idx ON manager_requests(request_status);
      CREATE INDEX IF NOT EXISTS manager_requests_created_idx ON manager_requests(created_at);
    `);

    await client.query("COMMIT");
    console.log("Migration executed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});

