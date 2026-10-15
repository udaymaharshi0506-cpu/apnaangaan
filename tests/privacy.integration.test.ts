import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from "../src/lib/seed";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  const request = new NextRequest(`http://localhost:3000/api/${route}`, { method, headers, ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
  return dispatch(request, method, { params: Promise.resolve({ segments: route.split("/") }) });
}
function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}
function hasNoPII(value: unknown, secrets: string[]) {
  const json = JSON.stringify(value);
  for (const secret of secrets) assert.ok(!json.includes(secret), `Private data leaked into public JSON: ${secret}`);
}

test("real route handlers keep seeker and owner contact details separated", async () => {
  const seekerPhone = "+919876543210";
  const seekerEmail = "rohan@example.com";
  const seekerName = "Rohan Verma";

  const ownerPhone = "+919876543211";
  const ownerEmail = "ananya@example.com";
  const ownerName = "Ananya Iyer";

  // 1. Authenticate Seeker via real OTP flow
  const seekerOtpReq = await call("auth/otp/request", "POST", { phone: seekerPhone });
  assert.equal(seekerOtpReq.status, 200);
  const seekerVerify = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
  assert.equal(seekerVerify.status, 200);
  const customerCookie = cookieFrom(seekerVerify, "aangan_access");
  await call("profile", "PATCH", { name: seekerName, email: seekerEmail, addOwnerRole: false, consent: true }, customerCookie);

  // 2. Authenticate Owner via real OTP flow & activate owner tools
  const ownerOtpReq = await call("auth/otp/request", "POST", { phone: ownerPhone });
  assert.equal(ownerOtpReq.status, 200);
  const ownerVerify = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
  assert.equal(ownerVerify.status, 200);
  const ownerCookie = cookieFrom(ownerVerify, "aangan_access");
  await call("profile", "PATCH", { name: ownerName, email: ownerEmail, addOwnerRole: true, consent: true }, ownerCookie);

  // 3. Authenticate Admin via 2-factor login
  const firstFactor = await call("admin/login", "POST", { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });
  assert.equal(firstFactor.status, 200);
  const challengeCookie = cookieFrom(firstFactor, "aangan_admin_challenge");
  const secondFactor = await call("admin/2fa", "POST", { code: "000000" }, challengeCookie);
  assert.equal(secondFactor.status, 200);
  const adminCookie = cookieFrom(secondFactor, "aangan_access");

  // 2. Owner posts property (status: pending_review)
  const createPropRes = await call(
    "properties",
    "POST",
    {
      category: "buy_home",
      propertyType: "Apartment",
      title: "The Grove Residences",
      description: "A light-filled home where thoughtful design meets everyday ease. Indiranagar.",
      price: 14800000,
      address: "12, 4th Cross, Indiranagar",
      city: "Bengaluru",
      locality: "Indiranagar",
      bhkOrRoomType: "3 BHK",
      areaSqft: 1680,
      bathrooms: 3,
      furnishingStatus: "Semi-furnished",
      amenities: ["Balcony"],
      images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
    },
    ownerCookie
  );
  assert.ok([200, 201].includes(createPropRes.status));
  const { property: createdProp } = await createPropRes.json();
  assert.ok(createdProp?.id);

  // 3. Admin moderates and approves property -> status: live
  const approveRes = await call(`admin/properties/${createdProp.id}/verify`, "PATCH", { action: "approve" }, adminCookie);
  assert.equal(approveRes.status, 200);

  // 4. Verify public property endpoint strips owner PII
  const publicProperty = await (await call(`properties/${createdProp.id}`)).json();
  hasNoPII(publicProperty, [ownerPhone, ownerEmail, ownerName, "ownerId", "passwordHash"]);

  // 5. Seeker expresses interest in the live property
  const createdResponse = await call("leads", "POST", { propertyId: createdProp.id, preferredContactTime: "Morning" }, customerCookie);
  assert.ok([200, 201].includes(createdResponse.status));
  const created = await createdResponse.json();
  hasNoPII(created, [ownerPhone, ownerEmail, ownerName, "ownerId", "ownerPhone", "ownerEmail", "adminNotes", "history"]);
  assert.ok(created.lead?.id);

  // 6. Seeker views their leads
  const customerResponse = await call("customer/leads", "GET", undefined, customerCookie);
  assert.equal(customerResponse.status, 200);
  const customerPayload = await customerResponse.json();
  assert.ok(customerPayload.items.length > 0);
  hasNoPII(customerPayload, [ownerPhone, ownerEmail, ownerName, "ownerId", "ownerPhone", "ownerEmail", "ownerName", "adminNotes", "history"]);

  // 7. Owner views their leads (anonymous interest)
  const ownerResponse = await call("owner/leads", "GET", undefined, ownerCookie);
  assert.equal(ownerResponse.status, 200);
  const ownerPayload = await ownerResponse.json();
  assert.ok(ownerPayload.items.length > 0);
  hasNoPII(ownerPayload, [seekerPhone, seekerEmail, seekerName, "customerId", "customerPhone", "customerEmail", "customerName", "adminNotes", "history"]);

  // 8. Owner notifications
  const ownerNotifications = await (await call("notifications", "GET", undefined, ownerCookie)).json();
  hasNoPII(ownerNotifications, [seekerPhone, seekerEmail, seekerName]);

  // 9. Customer cannot access admin routes
  const denied = await call("admin/leads", "GET", undefined, customerCookie);
  assert.equal(denied.status, 403);

  // 10. Property description with phone number is rejected
  const rejectedListing = await call("properties", "POST", { category: "rent_home", propertyType: "Apartment", title: "Contact me for this great home", description: "Call me on 9876543210 for the nicest apartment in this area.", price: 45000, address: "5 Park Road", city: "Bengaluru", locality: "Koramangala", bhkOrRoomType: "2 BHK", areaSqft: 1200, bathrooms: 2, furnishingStatus: "Unfurnished", images: ["https://example.com/photo.jpg"] }, ownerCookie);
  assert.equal(rejectedListing.status, 422);

  // 11. Admin schedules a meeting
  await call("admin/meetings", "POST", { leadId: created.lead.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), mode: "site_visit" }, adminCookie);
  const seekerMeeting = await (await call(`leads/${created.lead.id}/meeting`, "GET", undefined, customerCookie)).json();
  const ownerMeeting = await (await call(`leads/${created.lead.id}/meeting`, "GET", undefined, ownerCookie)).json();
  assert.equal(seekerMeeting.meeting?.status, "proposed");
  assert.deepEqual(seekerMeeting, ownerMeeting);
  hasNoPII(seekerMeeting, [seekerPhone, ownerPhone, "customerId", "ownerId", "scheduledByAdminId"]);

  // 12. Admin sees lead history
  const adminResponse = await call("admin/leads", "GET", undefined, adminCookie);
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  assert.ok(adminPayload.items[0].history.length > 0);

  const { pool } = await import("../src/db/index");
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
});
