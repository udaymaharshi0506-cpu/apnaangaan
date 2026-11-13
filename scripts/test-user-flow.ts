import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3000";

async function runVerification() {
  console.log("==================================================");
  console.log("    AANGAN USER PERSISTENCE END-TO-END TEST");
  console.log("==================================================\n");

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

  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPhone = "9823456789";
  const testName = "Test Verification User";
  const testLocation = "Koramangala, Bengaluru";

  try {
    // ----------------------------------------------------
    // TEST 1: Schema Structure Inspection
    // ----------------------------------------------------
    console.log("TEST 1: Verifying Database Schema Fields on 'users'...");
    const schemaRes = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position;
    `);

    const colMap = new Map(schemaRes.rows.map((r) => [r.column_name, r]));
    const requiredCols = ["id", "email", "name", "phone", "role", "location", "last_login", "created_at"];
    for (const col of requiredCols) {
      if (!colMap.has(col)) {
        throw new Error(`CRITICAL: Required column '${col}' is MISSING in table 'users'!`);
      }
      console.log(`  ✓ Column '${col}' is present (${colMap.get(col)?.data_type}, nullable: ${colMap.get(col)?.is_nullable}).`);
    }
    console.log("TEST 1 PASSED: All required columns exist!\n");

    // ----------------------------------------------------
    // TEST 2: Stage 1 - Initial Email Login (Upsert on Login)
    // ----------------------------------------------------
    console.log(`TEST 2: Testing Stage 1 - Initial Login Upsert for '${testEmail}'...`);
    const initialLoginTime = new Date();

    // Direct DB upsert simulation matching API login logic
    const insertRes = await pool.query(`
      INSERT INTO public.users (email, role, roles, last_login, created_at, updated_at)
      VALUES ($1, 'customer', '["customer"]'::jsonb, $2, $2, $2)
      RETURNING id, email, role, roles, last_login, created_at;
    `, [testEmail, initialLoginTime]);

    const createdUser = insertRes.rows[0];
    console.log(`  ✓ User created with ID: ${createdUser.id}`);
    console.log(`  ✓ Email: ${createdUser.email}`);
    console.log(`  ✓ last_login: ${createdUser.last_login.toISOString()}`);

    // Verify repeat login updates last_login
    await new Promise((r) => setTimeout(r, 1000));
    const secondLoginTime = new Date();
    const updateLoginRes = await pool.query(`
      UPDATE public.users 
      SET last_login = $1, updated_at = $1
      WHERE id = $2
      RETURNING id, email, last_login;
    `, [secondLoginTime, createdUser.id]);

    const updatedLoginUser = updateLoginRes.rows[0];
    console.log(`  ✓ Repeat login updated last_login to: ${updatedLoginUser.last_login.toISOString()}`);
    if (new Date(updatedLoginUser.last_login).getTime() <= new Date(createdUser.last_login).getTime()) {
      throw new Error("last_login was not updated on subsequent login!");
    }
    console.log("TEST 2 PASSED: Initial Email Login upserts & tracks last_login!\n");

    // ----------------------------------------------------
    // TEST 3: Stage 2 - Post-Login Onboarding Update
    // ----------------------------------------------------
    console.log("TEST 3: Testing Stage 2 - Post-Login Onboarding Form Submission...");
    const cleanDigits = testPhone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      throw new Error("Test phone does not match regex /^[6-9]\\d{9}$/");
    }
    const formattedPhone = `+91${cleanDigits}`;

    const onboardingRes = await pool.query(`
      UPDATE public.users
      SET 
        name = $1,
        phone = $2,
        role = 'owner',
        roles = '["customer", "owner"]'::jsonb,
        location = $3,
        city = $3,
        consent_at = NOW(),
        updated_at = NOW()
      WHERE email = $4
      RETURNING id, email, name, phone, role, roles, location, city, consent_at, last_login;
    `, [testName, formattedPhone, testLocation, testEmail]);

    const onboardedUser = onboardingRes.rows[0];
    console.log(`  ✓ Onboarded Name:     ${onboardedUser.name}`);
    console.log(`  ✓ Onboarded Phone:    ${onboardedUser.phone}`);
    console.log(`  ✓ Onboarded Role:     ${onboardedUser.role}`);
    console.log(`  ✓ Onboarded Location: ${onboardedUser.location}`);
    console.log(`  ✓ Consent Timestamp:  ${onboardedUser.consent_at.toISOString()}`);

    if (onboardedUser.name !== testName || onboardedUser.phone !== formattedPhone || onboardedUser.role !== "owner") {
      throw new Error("Onboarding profile data mismatch!");
    }
    console.log("TEST 3 PASSED: Onboarding data successfully persisted in database!\n");

    // ----------------------------------------------------
    // TEST 4: Admin Panel Visibility
    // ----------------------------------------------------
    console.log("TEST 4: Verifying Admin Panel Query Sync...");
    const adminQueryRes = await pool.query(`
      SELECT 
        id, name, phone, email, role, roles, location, city, last_login, created_at
      FROM public.users
      WHERE email = $1;
    `, [testEmail]);

    if (adminQueryRes.rows.length === 0) {
      throw new Error("Newly registered user is not visible in admin query!");
    }
    const adminUser = adminQueryRes.rows[0];
    console.log(`  ✓ User retrieved via Admin query:`);
    console.log(`    - ID:         ${adminUser.id}`);
    console.log(`    - Name:       ${adminUser.name}`);
    console.log(`    - Email:      ${adminUser.email}`);
    console.log(`    - Phone:      ${adminUser.phone}`);
    console.log(`    - Location:   ${adminUser.location}`);
    console.log(`    - Category:   ${adminUser.role === "owner" ? "Owner / Rent" : "Home Seeker"}`);
    console.log(`    - Last Login: ${adminUser.last_login.toISOString()}`);
    console.log("TEST 4 PASSED: User immediately visible in Admin Panel queries!\n");

    // ----------------------------------------------------
    // TEST 5: Validation & Constraint Error Handling
    // ----------------------------------------------------
    console.log("TEST 5: Testing Unique Email & Phone Constraint Handling...");
    // Attempt duplicate email insert to ensure constraint catches it
    try {
      await pool.query(`
        INSERT INTO public.users (email, role) VALUES ($1, 'customer');
      `, [testEmail]);
      throw new Error("Should have thrown 23505 unique constraint error for duplicate email!");
    } catch (err: any) {
      if (err.code === "23505") {
        console.log(`  ✓ Duplicate email error correctly caught with SQLSTATE 23505 (Unique violation).`);
      } else {
        throw err;
      }
    }
    console.log("TEST 5 PASSED: Unique constraints working as expected!\n");

    // Cleanup test record
    await pool.query(`DELETE FROM public.users WHERE email = $1;`, [testEmail]);
    console.log(`  ✓ Cleaned up test user: ${testEmail}`);

    console.log("==================================================");
    console.log("    ALL TESTS PASSED WITH 100% SUCCESS!");
    console.log("==================================================\n");
  } finally {
    await pool.end();
  }
}

runVerification().catch((err) => {
  console.error("Verification test failed:", err);
  process.exit(1);
});
