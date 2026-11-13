import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

export async function seedPropertiesAndOwner() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing in .env");

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    options: "-c search_path=public",
  });

  const client = await pool.connect();

  try {
    console.log("==================================================");
    console.log("   AANGAN - SEEDING CORE PROPERTIES & OWNER");
    console.log("==================================================");

    await client.query("SET search_path TO public;");

    // 1. Ensure owner user exists (Uday Maharshi)
    const ownerEmail = "udaymaharshi0506@gmail.com";
    const ownerPhone = "+919876543200";

    const userRes = await client.query(`
      SELECT id, email, role, roles FROM public.users WHERE lower(email) = $1;
    `, [ownerEmail]);

    let ownerId: string;
    if (userRes.rows.length === 0) {
      console.log(`Creating owner user: ${ownerEmail}...`);
      const createRes = await client.query(`
        INSERT INTO public.users (
          email, phone, name, city, location, role, roles, consent_at, last_login, created_at, updated_at
        ) VALUES (
          $1, $2, 'Uday Maharshi', 'Bengaluru', 'Indiranagar, Bengaluru', 'owner', '["customer", "owner", "admin"]'::jsonb, NOW(), NOW(), NOW(), NOW()
        ) RETURNING id;
      `, [ownerEmail, ownerPhone]);
      ownerId = createRes.rows[0].id;
      console.log(`  ✓ Owner user created with ID: ${ownerId}`);
    } else {
      ownerId = userRes.rows[0].id;
      // Ensure admin & owner roles
      await client.query(`
        UPDATE public.users 
        SET 
          roles = '["customer", "owner", "admin"]'::jsonb,
          role = 'owner',
          updated_at = NOW()
        WHERE id = $1;
      `, [ownerId]);
      console.log(`  ✓ Existing owner user confirmed with ID: ${ownerId}`);
    }

    // 2. Load listings-data.json
    const listingsPath = path.resolve(process.cwd(), "scripts", "listings-data.json");
    if (!fs.existsSync(listingsPath)) {
      console.warn("listings-data.json not found, skipping property seed.");
      return;
    }

    const listings = JSON.parse(fs.readFileSync(listingsPath, "utf-8"));
    console.log(`Found ${listings.length} properties in listings-data.json.`);

    let inserted = 0;
    let existing = 0;

    for (const item of listings) {
      // Check if property title already exists
      const checkRes = await client.query(`
        SELECT id FROM public.properties WHERE title = $1 LIMIT 1;
      `, [item.title]);

      if (checkRes.rows.length > 0) {
        existing++;
        continue;
      }

      await client.query(`
        INSERT INTO public.properties (
          owner_id, category, property_type, title, description, price, price_type,
          address, city, locality, pin_code, landmark, latitude, longitude,
          bhk_or_room_type, area_sqft, bathrooms, floor, total_floors, property_age,
          facing, furnishing_status, amenities, images, availability_date, rera_number,
          deposit, owner_name, owner_phone, ownership_type, maintenance_status,
          maintenance_amount, status, verified, views, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23::jsonb, $24::jsonb, $25, $26,
          $27, $28, $29, $30, $31,
          $32, 'live', true, 0, NOW(), NOW()
        );
      `, [
        ownerId,
        item.category,
        item.propertyType || "Apartment",
        item.title,
        item.description || "",
        item.price,
        item.priceType || "fixed",
        item.address || "Main Road",
        item.city || "Bengaluru",
        item.locality || "City Center",
        item.pinCode || null,
        item.landmark || null,
        item.latitude || null,
        item.longitude || null,
        item.bhkOrRoomType || "2 BHK",
        item.areaSqft || 1000,
        item.bathrooms || 2,
        item.floor || null,
        item.totalFloors || null,
        item.propertyAge || null,
        item.facing || null,
        item.furnishingStatus || "Semi-furnished",
        JSON.stringify(item.amenities || []),
        JSON.stringify(item.images || []),
        item.availabilityDate ? new Date(item.availabilityDate) : null,
        item.reraNumber || null,
        item.deposit || null,
        "Uday Maharshi",
        ownerPhone,
        "sole_owner",
        item.maintenanceStatus || "included",
        item.maintenanceAmount || 0,
      ]);

      inserted++;
    }

    console.log(`\nResults:`);
    console.log(`  - Newly inserted: ${inserted}`);
    console.log(`  - Already present: ${existing}`);

    const countRes = await client.query("SELECT count(*) FROM public.properties;");
    const userCountRes = await client.query("SELECT count(*) FROM public.users;");
    console.log(`Total properties in database: ${countRes.rows[0].count}`);
    console.log(`Total users in database: ${userCountRes.rows[0].count}`);
    console.log("==================================================\n");
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-properties.ts")) {
  seedPropertiesAndOwner().catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  });
}
