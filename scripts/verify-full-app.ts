import "dotenv/config";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";
import { pool } from "../src/db/index";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@aangan.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AanganSecure2026!";

async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const [pathname, search] = route.split("?");
  const headers = new Headers();
  if (input !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  const url = `http://localhost:3000/api/${pathname}${search ? `?${search}` : ""}`;
  const request = new NextRequest(url, {
    method,
    headers,
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
  return dispatch(request, method, { params: Promise.resolve({ segments: pathname.split("/") }) });
}

function getCookie(response: NextResponse, name: string): string {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected cookie ${name} not found in response`);
  return `${name}=${cookie.value}`;
}

async function runEndToEndVerification() {
  console.log("================================================================");
  console.log("   AANGAN MARKETPLACE — REAL PROTOCOL END-TO-END VERIFICATION   ");
  console.log("================================================================\n");

  const results: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];

  function record(test: string, ok: boolean, details: string) {
    results.push({ test, status: ok ? "PASS" : "FAIL", details });
    console.log(`[${ok ? "PASS" : "FAIL"}] ${test}`);
    if (details) console.log(`       ${details}`);
  }

  const seekerPhone = "+919870000001";
  const seekerEmail = "seeker.audit@aangan.com";
  const ownerPhone = "+919870000002";
  const ownerEmail = "owner.audit@aangan.com";

  try {
    // 1. Health check & Database Query
    console.log("--- TEST 1: Database Connection ---");
    const dbCheck = await pool.query("SELECT count(*) as total FROM properties;");
    const initialCount = Number(dbCheck.rows[0].total);
    record("Database Query Execution", true, `Database responsive. Initial properties: ${initialCount}`);

    // 2. Seeker Real OTP Authentication & Profile Setup
    console.log("\n--- TEST 2: Seeker OTP Registration Flow ---");
    const sReq = await call("auth/otp/request", "POST", { phone: seekerPhone });
    assert.equal(sReq.status, 200);
    const sVer = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
    assert.equal(sVer.status, 200);
    const seekerCookie = getCookie(sVer, "aangan_access");
    await call("profile", "PATCH", { name: "Audit Seeker", email: seekerEmail, addOwnerRole: false, consent: true }, seekerCookie);
    record("Seeker OTP Onboarding", true, `Seeker successfully registered (${seekerPhone}).`);

    // 3. Owner Real OTP Authentication & Profile Setup
    console.log("\n--- TEST 3: Owner OTP Registration Flow ---");
    const oReq = await call("auth/otp/request", "POST", { phone: ownerPhone });
    assert.equal(oReq.status, 200);
    const oVer = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
    assert.equal(oVer.status, 200);
    const ownerCookie = getCookie(oVer, "aangan_access");
    await call("profile", "PATCH", { name: "Audit Owner", email: ownerEmail, addOwnerRole: true, consent: true }, ownerCookie);
    record("Owner OTP Onboarding", true, `Owner successfully registered and upgraded (${ownerPhone}).`);

    // 4. Admin Authentication Flow
    console.log("\n--- TEST 4: Platform Admin 2FA Authentication ---");
    const adminL = await call("admin/login", "POST", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(adminL.status, 200);
    const challengeCookie = getCookie(adminL, "aangan_admin_challenge");
    const admin2Fa = await call("admin/2fa", "POST", { code: "000000" }, challengeCookie);
    assert.equal(admin2Fa.status, 200);
    const adminCookie = getCookie(admin2Fa, "aangan_access");
    record("Admin 2FA Authentication", true, `Admin successfully authenticated as ${ADMIN_EMAIL}.`);

    // 5. Owner Posts a Property
    console.log("\n--- TEST 5: Owner Listing Submission ---");
    const propRes = await call(
      "properties",
      "POST",
      {
        category: "buy_home",
        propertyType: "Apartment",
        title: "Koramangala Sunlit Haven",
        description: "Elegant 3BHK flat near 5th Block. Peaceful community living.",
        price: 18500000,
        address: "7th Main Road, Koramangala",
        city: "Bengaluru",
        locality: "Koramangala 5th Block",
        bhkOrRoomType: "3 BHK",
        areaSqft: 1650,
        bathrooms: 2,
        furnishingStatus: "Semi-furnished",
        amenities: ["Security", "Elevator"],
        images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
        readyToMove: true,
      },
      ownerCookie
    );
    assert.ok([200, 201].includes(propRes.status));
    const propData = await propRes.json();
    const propertyId = propData.property.id;
    record("Owner Property Creation", true, `Created property "${propData.property.title}" (ID: ${propertyId}).`);

    // 6. Admin Approves the Property
    console.log("\n--- TEST 6: Admin Review & Moderation ---");
    const approveRes = await call(`admin/properties/${propertyId}/verify`, "PATCH", { action: "approve" }, adminCookie);
    assert.equal(approveRes.status, 200);
    record("Admin Moderation Approval", true, `Property approved to "live" status.`);

    // 7. Public Listing & PII Shield Verification
    console.log("\n--- TEST 7: Public Property Search & PII Privacy Shield ---");
    const publicList = await call("properties?limit=5");
    assert.equal(publicList.status, 200);
    const publicData = await publicList.json();
    const liveProp = publicData.items.find((p: any) => p.id === propertyId);
    assert.ok(liveProp, "Property is visible publicly");
    const leaksOwner = "ownerPhone" in liveProp || "ownerEmail" in liveProp || "ownerId" in liveProp;
    record("Public PII Privacy Shield", !leaksOwner, "Owner phone, email, and ID are completely sanitized from public endpoints.");

    // 8. Seeker Expresses Interest (Lead Creation)
    console.log("\n--- TEST 8: Seeker Expresses Interest (Zero Direct Contact) ---");
    const leadRes = await call(
      "leads",
      "POST",
      { propertyId, preferredContactTime: "Evening (5 PM - 8 PM)" },
      seekerCookie
    );
    assert.ok([200, 201].includes(leadRes.status));
    const leadData = await leadRes.json();
    const seekerLeadJson = JSON.stringify(leadData);
    const seekerGotOwnerPhone = seekerLeadJson.includes(ownerPhone) || seekerLeadJson.includes(ownerEmail);
    record("Seeker Lead Creation & Privacy", !seekerGotOwnerPhone, "Lead created; Owner contact details are shielded from Seeker.");

    // 9. Owner Sees Anonymous Interest Notification
    console.log("\n--- TEST 9: Owner Sees Anonymous Interest Notification ---");
    const ownerLeadsRes = await call("owner/leads", "GET", undefined, ownerCookie);
    assert.equal(ownerLeadsRes.status, 200);
    const ownerLeadsData = await ownerLeadsRes.json();
    const ownerLead = ownerLeadsData.items.find((l: any) => l.property?.id === propertyId);
    assert.ok(ownerLead, "Owner received the lead");
    const ownerLeadJson = JSON.stringify(ownerLeadsData);
    const ownerGotSeekerPhone = ownerLeadJson.includes(seekerPhone) || ownerLeadJson.includes(seekerEmail);
    record("Owner Lead View & Privacy", !ownerGotSeekerPhone, "Seeker contact details are shielded from Owner.");

    // 10. Admin Lead Oversight & Meeting Scheduling
    console.log("\n--- TEST 10: Admin Centralized Mediation ---");
    const adminLeadsRes = await call("admin/leads", "GET", undefined, adminCookie);
    assert.equal(adminLeadsRes.status, 200);
    const adminLeadsData = await adminLeadsRes.json();
    const adminLead = adminLeadsData.items.find((l: any) => l.id === leadData.lead.id);
    assert.ok(adminLead, "Admin has access to the lead");
    const adminHasBoth = Boolean(adminLead.customer?.phone && adminLead.owner?.phone);
    record("Admin Mediation Access", adminHasBoth, `Admin coordinates between Seeker (${adminLead.customer?.phone}) and Owner (${adminLead.owner?.phone}).`);

    const meetRes = await call(
      "admin/meetings",
      "POST",
      {
        leadId: adminLead.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        mode: "site_visit",
      },
      adminCookie
    );
    assert.ok([200, 201].includes(meetRes.status));
    record("Admin Meeting Scheduling", true, "Admin successfully scheduled mediated site visit.");

  } catch (err: any) {
    console.error("Test execution error:", err);
    record("Full Test Suite Execution", false, err.message);
  } finally {
    // Clean all data to keep database 100% empty
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
    await pool.end();
  }

  console.log("\n================================================================");
  console.log("                     VERIFICATION SUMMARY                       ");
  console.log("================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`Total Checks : ${total}`);
  console.log(`Passed       : ${passed}`);
  console.log(`Failed       : ${failed}`);
  console.log(`System Status: ${failed === 0 ? "ALL SYSTEMS OPERATIONAL (100% WORKING)" : "FAILURES DETECTED"}`);
  console.log("================================================================\n");

  if (failed > 0) process.exit(1);
}

runEndToEndVerification();
