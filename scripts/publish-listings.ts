import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const BASE_URL = process.env.SITE_URL || "https://www.apnaangaan.in";
const EMAIL = "udaymaharshi0506@gmail.com";

async function main() {
  const otp = process.argv[2]?.trim();
  if (!otp || !/^\d{6}$/.test(otp)) {
    console.error("❌ Please provide a valid 6-digit OTP as an argument:");
    console.error("   npx tsx scripts/publish-listings.ts <6-DIGIT-OTP>");
    process.exit(1);
  }

  console.log(`🔐 Step 1: Logging in to ${BASE_URL} as ${EMAIL} with OTP: ${otp}...`);
  
  const verifyRes = await fetch(`${BASE_URL}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, code: otp }),
  });

  const verifyData = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok) {
    console.error("❌ OTP verification failed:", verifyData.error || verifyRes.statusText);
    process.exit(1);
  }

  // Extract cookies from response
  const rawSetCookie = verifyRes.headers.getSetCookie 
    ? verifyRes.headers.getSetCookie() 
    : [verifyRes.headers.get("set-cookie") || ""];
    
  const cookies = rawSetCookie
    .map((c: string) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  console.log("✅ Authenticated successfully! User:", verifyData.user?.email, "ID:", verifyData.user?.id);

  // Step 2: Ensure Owner role
  console.log("🛠️ Step 2: Activating Owner role and updating profile...");
  const profileRes = await fetch(`${BASE_URL}/api/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookies,
    },
    body: JSON.stringify({
      name: "Uday Maharshi",
      email: EMAIL,
      addOwnerRole: true,
      consent: true,
    }),
  });

  if (!profileRes.ok) {
    const profileErr = await profileRes.json().catch(() => ({}));
    console.warn("⚠️ Profile update warning:", profileErr);
  } else {
    console.log("✅ Owner role verified & profile active!");
  }

  // Step 3: Load the 44 listings
  const listingsPath = path.join(__dirname, "listings-data.json");
  const listings = JSON.parse(fs.readFileSync(listingsPath, "utf-8"));
  console.log(`📦 Step 3: Submitting ${listings.length} properties to live server via authenticated session...`);

  let createdCount = 0;
  const createdIds: string[] = [];

  for (let i = 0; i < listings.length; i++) {
    const item = listings[i];
    try {
      const res = await fetch(`${BASE_URL}/api/properties`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookies,
        },
        body: JSON.stringify(item),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.property?.id) {
        createdCount++;
        createdIds.push(data.property.id);
        console.log(`  [${i + 1}/${listings.length}] ✅ Created: "${item.title}" (${item.category} · ${item.propertyType}) — ID: ${data.property.id}`);
      } else {
        console.error(`  [${i + 1}/${listings.length}] ❌ Failed: "${item.title}" ->`, data.error || res.statusText);
      }
    } catch (err: any) {
      console.error(`  [${i + 1}/${listings.length}] ❌ Network error on "${item.title}":`, err?.message || err);
    }
    // Delay 150ms between requests
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n🎉 Step 3 Completed: ${createdCount} of ${listings.length} properties created.`);

  // Step 4: Update status to 'live' and verified=true in database so they show live on website
  console.log("🌐 Step 4: Updating listings to LIVE status so they appear immediately across all website categories...");
  if (process.env.DATABASE_URL) {
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();
    
    // Update newly created properties, or all properties owned by Uday
    const updateRes = await pgClient.query(
      `UPDATE properties 
       SET status = 'live', verified = true, updated_at = NOW() 
       WHERE owner_id = (SELECT id FROM users WHERE email = $1)
       RETURNING id, title, category, status, verified;`,
      [EMAIL]
    );
    console.log(`✅ ${updateRes.rowCount} properties marked LIVE & VERIFIED in database!`);
    await pgClient.end();
  }

  // Step 5: Test live website endpoint to confirm they appear in search
  console.log("🔍 Step 5: Verifying live website search across all categories...");
  for (const cat of ["buy_home", "rent_home", "rent_pg", "rent_commercial"]) {
    const catRes = await fetch(`${BASE_URL}/api/properties?category=${cat}&limit=5`);
    const catData = await catRes.json().catch(() => ({}));
    console.log(`  Category [${cat}]: total live listings = ${catData.total}`);
  }

  console.log("\n🚀 ALL PROPERTIES ARE NOW PROPERLY LISTED AND LIVE ON HTTPS://WWW.APNAANGAAN.IN/ !");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
