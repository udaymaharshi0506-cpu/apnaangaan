import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";
import { middleware } from "../src/middleware";
import { pool } from "../src/db";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  const request = new NextRequest(`http://localhost:3000/api/${route}`, {
    method,
    headers,
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
  const [cleanRoute] = route.split("?");
  return dispatch(request, method, { params: Promise.resolve({ segments: cleanRoute.split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} cookie`);
  return `${name}=${cookie.value}`;
}

test("Security Audit: Strict RBAC prevents Customer and Owner from accessing /admin", async () => {
  const customerPhone = "+919876543801";
  const ownerPhone = "+919876543802";

  // Create customer
  await call("auth/otp/request", "POST", { phone: customerPhone });
  const custVerify = await call("auth/otp/verify", "POST", { phone: customerPhone, code: "123456" });
  assert.equal(custVerify.status, 200);
  const custCookie = cookieFrom(custVerify, "aangan_access");
  await call("profile", "PATCH", { name: "Customer Tester", email: "cust.test@example.com", addOwnerRole: false, consent: true }, custCookie);

  // Create owner
  await call("auth/otp/request", "POST", { phone: ownerPhone });
  const ownerVerify = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
  assert.equal(ownerVerify.status, 200);
  const ownerCookie = cookieFrom(ownerVerify, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Tester", email: "owner.test@example.com", addOwnerRole: true, consent: true }, ownerCookie);

  // 1. Customer blocked from backend /api/admin/* (403)
  const custAdminRes = await call("admin/leads", "GET", undefined, custCookie);
  assert.equal(custAdminRes.status, 403);

  // 2. Owner blocked from backend /api/admin/* (403)
  const ownerAdminRes = await call("admin/leads", "GET", undefined, ownerCookie);
  assert.equal(ownerAdminRes.status, 403);

  // 3. Unauthenticated blocked from backend /api/admin/* (401)
  const guestAdminRes = await call("admin/leads", "GET");
  assert.equal(guestAdminRes.status, 401);

  // 4. Edge Middleware blocks Customer from /admin (redirects to /)
  const custReq = new NextRequest("http://localhost:3000/admin", {
    headers: new Headers({ Cookie: custCookie }),
  });
  const custMidRes = await middleware(custReq);
  assert.equal(custMidRes.status, 307);
  assert.equal(custMidRes.headers.get("location"), "http://localhost:3000/");
  assert.match(custMidRes.headers.get("cache-control") || "", /no-store/);

  // 5. Edge Middleware blocks Owner from /admin (redirects to /)
  const ownerReq = new NextRequest("http://localhost:3000/admin", {
    headers: new Headers({ Cookie: ownerCookie }),
  });
  const ownerMidRes = await middleware(ownerReq);
  assert.equal(ownerMidRes.status, 307);
  assert.equal(ownerMidRes.headers.get("location"), "http://localhost:3000/");

  // 6. Edge Middleware blocks Guest from /admin (redirects to /admin/login)
  const guestReq = new NextRequest("http://localhost:3000/admin");
  const guestMidRes = await middleware(guestReq);
  assert.equal(guestMidRes.status, 307);
  assert.equal(guestMidRes.headers.get("location"), "http://localhost:3000/admin/login");

  // 7. Edge Middleware blocks Guest from /owner & /profile (redirects to /login)
  const guestOwnerReq = new NextRequest("http://localhost:3000/owner");
  const guestOwnerMidRes = await middleware(guestOwnerReq);
  assert.equal(guestOwnerMidRes.status, 307);
  assert.ok(guestOwnerMidRes.headers.get("location")?.includes("/login"));

  await pool.query("DELETE FROM users WHERE phone IN ($1, $2);", [customerPhone, ownerPhone]);
});

test("Security Audit: Strict IDOR Protection on leads & inquiries", async () => {
  const customerA = "+919876543811";
  const customerB = "+919876543812";
  const ownerA = "+919876543813";
  const ownerB = "+919876543814";

  // Setup Customer A
  await call("auth/otp/request", "POST", { phone: customerA });
  const resCA = await call("auth/otp/verify", "POST", { phone: customerA, code: "123456" });
  let cookieCA = cookieFrom(resCA, "aangan_access");
  const pCA = await call("profile", "PATCH", { name: "Customer A", email: "custA@example.com", consent: true }, cookieCA);
  cookieCA = cookieFrom(pCA, "aangan_access");

  // Setup Customer B
  await call("auth/otp/request", "POST", { phone: customerB });
  const resCB = await call("auth/otp/verify", "POST", { phone: customerB, code: "123456" });
  let cookieCB = cookieFrom(resCB, "aangan_access");
  const pCB = await call("profile", "PATCH", { name: "Customer B", email: "custB@example.com", consent: true }, cookieCB);
  cookieCB = cookieFrom(pCB, "aangan_access");

  // Setup Owner A
  await call("auth/otp/request", "POST", { phone: ownerA });
  const resOA = await call("auth/otp/verify", "POST", { phone: ownerA, code: "123456" });
  let cookieOA = cookieFrom(resOA, "aangan_access");
  const pOA = await call("profile", "PATCH", { name: "Owner A", email: "ownerA@example.com", addOwnerRole: true, consent: true }, cookieOA);
  cookieOA = cookieFrom(pOA, "aangan_access");

  // Setup Owner B
  await call("auth/otp/request", "POST", { phone: ownerB });
  const resOB = await call("auth/otp/verify", "POST", { phone: ownerB, code: "123456" });
  let cookieOB = cookieFrom(resOB, "aangan_access");
  const pOB = await call("profile", "PATCH", { name: "Owner B", email: "ownerB@example.com", addOwnerRole: true, consent: true }, cookieOB);
  cookieOB = cookieFrom(pOB, "aangan_access");

  // Owner A posts a property
  const propRes = await call(
    "properties",
    "POST",
    {
      category: "rent_home",
      propertyType: "Apartment",
      title: "IDOR Test Residence",
      description: "Secure flat in Koramangala.",
      price: 35000,
      address: "100 Security Road",
      city: "Bengaluru",
      locality: "Koramangala",
      bhkOrRoomType: "2 BHK",
      areaSqft: 1100,
      bathrooms: 2,
      furnishingStatus: "Semi-furnished",
      images: ["https://example.com/sec1.jpg"],
    },
    cookieOA
  );
  assert.equal(propRes.status, 201);
  const { property: createdProp } = await propRes.json();

  // Approve property via Admin direct query
  await pool.query("UPDATE properties SET status = 'live', verified = true WHERE id = $1;", [createdProp.id]);

  // Customer A submits an inquiry on Owner A's property
  const leadRes = await call("leads", "POST", { propertyId: createdProp.id, preferredContactTime: "Evening", confirmedPhone: "9876543811" }, cookieCA);
  assert.ok([200, 201].includes(leadRes.status));
  const { lead: createdLead } = await leadRes.json();
  const leadId = createdLead.id;

  // 1. Customer A can fetch their own inquiry (200)
  const custAFetch = await call(`customer/leads/${leadId}`, "GET", undefined, cookieCA);
  assert.equal(custAFetch.status, 200);

  // 2. IDOR: Customer B tries to fetch Customer A's inquiry -> strictly 403 Forbidden!
  const custBFetch = await call(`customer/leads/${leadId}`, "GET", undefined, cookieCB);
  assert.equal(custBFetch.status, 403);

  // 3. IDOR: Customer B tries to fetch via generic /api/leads/:id -> strictly 403 Forbidden!
  const custBGeneric = await call(`leads/${leadId}`, "GET", undefined, cookieCB);
  assert.equal(custBGeneric.status, 403);

  // 4. Owner A (the true property owner) can view the inquiry (200)
  const ownerAFetch = await call(`owner/leads/${leadId}`, "GET", undefined, cookieOA);
  assert.equal(ownerAFetch.status, 200);

  // 5. IDOR: Owner B (unrelated owner) tries to view the inquiry -> strictly 403 Forbidden!
  const ownerBFetch = await call(`owner/leads/${leadId}`, "GET", undefined, cookieOB);
  assert.equal(ownerBFetch.status, 403);

  // 6. IDOR: Owner B tries via generic /api/leads/:id -> strictly 403 Forbidden!
  const ownerBGeneric = await call(`leads/${leadId}`, "GET", undefined, cookieOB);
  assert.equal(ownerBGeneric.status, 403);

  // Cleanup
  await pool.query("DELETE FROM leads WHERE id = $1;", [leadId]);
  await pool.query("DELETE FROM properties WHERE id = $1;", [createdProp.id]);
  await pool.query("DELETE FROM users WHERE phone IN ($1, $2, $3, $4);", [customerA, customerB, ownerA, ownerB]);
});

test("Security Audit: OTP 5-attempt lockout, expired rejection, and replay prevention", async () => {
  const testPhone = "+919876543822";

  // Request code
  await call("auth/otp/request", "POST", { phone: testPhone });

  // 1. Enter wrong OTP 4 times -> reports attempts remaining
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wrongRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "000000" });
    assert.equal(wrongRes.status, 400);
    const data = await wrongRes.json();
    assert.ok(data.error.includes("attempt"));
  }

  // 2. 5th wrong attempt locks the code
  const fifthRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "000000" });
  assert.equal(fifthRes.status, 400);
  const fifthData = await fifthRes.json();
  assert.ok(fifthData.error.toLowerCase().includes("locked") || fifthData.error.toLowerCase().includes("too many"));

  // 3. 6th attempt (even with valid code) MUST be rejected because challenge is locked out
  const lockedRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
  assert.equal(lockedRes.status, 400);
  const lockedData = await lockedRes.json();
  assert.ok(lockedData.error.toLowerCase().includes("locked") || lockedData.error.toLowerCase().includes("too many"));

  // 4. Request a fresh code and verify replay prevention
  await call("auth/otp/request", "POST", { phone: testPhone });
  const validRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
  assert.equal(validRes.status, 200);

  // 5. Replaying the EXACT same code immediately MUST fail (replay attack prevented)
  const replayRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
  assert.equal(replayRes.status, 400);

  // Cleanup
  await pool.query("DELETE FROM otp_challenges WHERE phone = $1;", [testPhone]);
  await pool.query("DELETE FROM users WHERE phone = $1;", [testPhone]);
});
