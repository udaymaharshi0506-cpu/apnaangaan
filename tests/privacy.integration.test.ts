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
      category: "rent_home",
      propertyType: "Apartment",
      title: "The Grove Residences",
      description: "A light-filled home where thoughtful design meets everyday ease. Indiranagar.",
      price: 55000,
      deposit: 110000,
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
  const { property: createdProp, status: initialStatus } = await createPropRes.json();
  assert.ok(createdProp?.id);
  assert.equal(initialStatus, "pending_review");

  // 2b. Unapproved listing must stay hidden from public search/detail and owner cannot self-publish
  assert.equal((await call(`properties/${createdProp.id}`)).status, 404);
  assert.equal((await call(`properties/${createdProp.id}`, "PATCH", { status: "live" }, ownerCookie)).status, 422);

  // 3. Admin moderates and approves property -> status: live
  const approveRes = await call(`admin/properties/${createdProp.id}/verify`, "PATCH", { action: "approve" }, adminCookie);
  assert.equal(approveRes.status, 200);

  // 3b. Editing an approved listing (e.g. changing photos/title, even alongside status: "live") forces re-approval via pending_review
  const editRes = await call(
    `properties/${createdProp.id}`,
    "PATCH",
    { images: ["https://images.pexels.com/photos/7018401/pexels-photo-7018401.jpeg"], status: "live" },
    ownerCookie
  );
  assert.equal(editRes.status, 200);
  const editBody = await editRes.json();
  assert.equal(editBody.status, "pending_review");
  assert.equal(editBody.property.verified, false);
  assert.equal((await call(`properties/${createdProp.id}`)).status, 404);
  assert.equal((await call(`properties/${createdProp.id}`, "PATCH", { status: "live" }, ownerCookie)).status, 422);

  // Re-approve after admin inspects updated photos
  assert.equal((await call(`admin/properties/${createdProp.id}/verify`, "PATCH", { action: "approve" }, adminCookie)).status, 200);

  // 4. Verify public property endpoints (list & detail) strip owner PII, contact fields, and exact street address
  const streetAddress = "12, 4th Cross, Indiranagar";
  const listProperties = await (await call("properties")).json();
  const listedProp = listProperties.items.find((item: { id: string }) => item.id === createdProp.id);
  assert.ok(listedProp);
  hasNoPII(listedProp, [ownerPhone, ownerEmail, ownerName, streetAddress, "ownerId", "ownerPhone", "ownerEmail", "ownerName", "liveSelfieUrl", "aadhaarCardUrl", "passwordHash"]);
  assert.equal("address" in listedProp, false);

  const publicProperty = await (await call(`properties/${createdProp.id}`)).json();
  hasNoPII(publicProperty, [ownerPhone, ownerEmail, ownerName, streetAddress, "ownerId", "ownerPhone", "ownerEmail", "ownerName", "liveSelfieUrl", "aadhaarCardUrl", "passwordHash"]);
  assert.equal("address" in publicProperty.property, false);

  // 4b. Verify owner's own properties endpoint omits contact/KYC fields and exact street address
  const ownerPropsRes = await call("owner/properties", "GET", undefined, ownerCookie);
  assert.equal(ownerPropsRes.status, 200);
  const ownerPropsPayload = await ownerPropsRes.json();
  const ownerListedProp = ownerPropsPayload.items.find((item: { id: string }) => item.id === createdProp.id);
  assert.ok(ownerListedProp);
  hasNoPII(ownerListedProp, [ownerPhone, ownerEmail, ownerName, streetAddress, "ownerId", "ownerPhone", "ownerEmail", "ownerName", "liveSelfieUrl", "aadhaarCardUrl", "coOwners"]);
  assert.equal("address" in ownerListedProp, false);

  // 4c. Favorite listing and verify favorites endpoint strips restricted fields
  await call(`favorites/${createdProp.id}`, "POST", undefined, customerCookie);
  const favoritesPayload = await (await call("favorites", "GET", undefined, customerCookie)).json();
  const favProp = favoritesPayload.items.find((item: { id: string }) => item.id === createdProp.id);
  assert.ok(favProp);
  hasNoPII(favProp, [ownerPhone, ownerEmail, ownerName, streetAddress, "ownerId", "ownerPhone", "ownerEmail", "ownerName"]);
  assert.equal("address" in favProp, false);

  // 5. Seeker expresses interest in the live property
  const createdResponse = await call("leads", "POST", { propertyId: createdProp.id, preferredContactTime: "Morning", confirmedPhone: "9876543210" }, customerCookie);
  assert.ok([200, 201].includes(createdResponse.status));
  const created = await createdResponse.json();
  hasNoPII(created, [ownerPhone, ownerEmail, ownerName, seekerPhone, seekerEmail, seekerName, streetAddress, "ownerId", "ownerPhone", "ownerEmail", "confirmedPhone", "whatsappMessageId", "whatsappStatus", "adminNotes", "history"]);
  assert.ok(created.lead?.id);

  // 6. Seeker views their leads (must omit phone, email, whatsapp, address, and owner/customer personal objects)
  const customerResponse = await call("customer/leads", "GET", undefined, customerCookie);
  assert.equal(customerResponse.status, 200);
  const customerPayload = await customerResponse.json();
  assert.ok(customerPayload.items.length > 0);
  hasNoPII(customerPayload, [ownerPhone, ownerEmail, ownerName, seekerPhone, seekerEmail, seekerName, streetAddress, "ownerId", "customerId", "ownerPhone", "ownerEmail", "ownerName", "confirmedPhone", "whatsappMessageId", "whatsappStatus", "adminNotes", "history"]);
  assert.equal("address" in customerPayload.items[0].property, false);

  // 7. Owner views their leads (anonymous interest)
  const ownerResponse = await call("owner/leads", "GET", undefined, ownerCookie);
  assert.equal(ownerResponse.status, 200);
  const ownerPayload = await ownerResponse.json();
  assert.ok(ownerPayload.items.length > 0);
  hasNoPII(ownerPayload, [seekerPhone, seekerEmail, seekerName, ownerPhone, ownerEmail, streetAddress, "ownerId", "customerId", "customerPhone", "customerEmail", "customerName", "confirmedPhone", "whatsappMessageId", "whatsappStatus", "adminNotes", "history"]);

  // 8. Owner notifications
  const ownerNotifications = await (await call("notifications", "GET", undefined, ownerCookie)).json();
  hasNoPII(ownerNotifications, [seekerPhone, seekerEmail, seekerName]);

  // 9. Strict RBAC & IDOR protection across Guest, Customer, Owner, and Admin routes
  // Guests (401)
  assert.equal((await call("owner/properties")).status, 401);
  assert.equal((await call("owner/leads")).status, 401);
  assert.equal((await call("customer/leads")).status, 401);
  assert.equal((await call("admin/leads")).status, 401);
  assert.equal((await call("admin/users")).status, 401);
  assert.equal((await call("profile", "PATCH", { email: DEFAULT_ADMIN_EMAIL, name: "Hijack" })).status, 401);

  // Customers blocked from Owner & Admin routes (403)
  assert.equal((await call("owner/properties", "GET", undefined, customerCookie)).status, 403);
  assert.equal((await call("owner/leads", "GET", undefined, customerCookie)).status, 403);
  assert.equal((await call(`owner/leads/${created.lead.id}`, "GET", undefined, customerCookie)).status, 403);
  assert.equal((await call("properties", "POST", { category: "rent_home", propertyType: "Apartment", price: 45000, address: "5 Park Road", city: "Bengaluru", locality: "Koramangala", bhkOrRoomType: "2 BHK", areaSqft: 1200, bathrooms: 2, furnishingStatus: "Unfurnished", images: ["https://example.com/photo.jpg"] }, customerCookie)).status, 403);
  assert.equal((await call(`properties/${createdProp.id}`, "PATCH", { status: "paused" }, customerCookie)).status, 403);
  assert.equal((await call(`properties/${createdProp.id}`, "DELETE", undefined, customerCookie)).status, 403);
  assert.equal((await call("admin/leads", "GET", undefined, customerCookie)).status, 403);
  assert.equal((await call("admin/users", "GET", undefined, customerCookie)).status, 403);
  assert.equal((await call(`admin/properties/${createdProp.id}/verify`, "PATCH", { action: "approve" }, customerCookie)).status, 403);

  // Owners blocked from Admin routes (403) and self-assigning admin (403)
  assert.equal((await call("admin/leads", "GET", undefined, ownerCookie)).status, 403);
  assert.equal((await call("admin/dashboard/stats", "GET", undefined, ownerCookie)).status, 403);
  assert.equal((await call(`admin/properties/${createdProp.id}/verify`, "PATCH", { action: "approve" }, ownerCookie)).status, 403);
  assert.equal((await call("profile", "PATCH", { role: "admin" }, ownerCookie)).status, 403);
  assert.equal((await call("auth/login", "POST", { email: DEFAULT_ADMIN_EMAIL, code: "123456" })).status, 403);
  assert.equal((await call("auth/otp/request", "POST", { email: DEFAULT_ADMIN_EMAIL })).status, 403);

  // Cross-user IDOR protection (403)
  const intruderOwnerPhone = "+919876543212";
  await call("auth/otp/request", "POST", { phone: intruderOwnerPhone });
  const intruderOwnerCookie = cookieFrom(await call("auth/otp/verify", "POST", { phone: intruderOwnerPhone, code: "123456" }), "aangan_access");
  await call("profile", "PATCH", { name: "Intruder Owner", email: "intruder.owner@example.com", addOwnerRole: true, consent: true }, intruderOwnerCookie);

  assert.equal((await call(`properties/${createdProp.id}`, "PATCH", { title: "Hijacked Flat" }, intruderOwnerCookie)).status, 403);
  assert.equal((await call(`properties/${createdProp.id}`, "DELETE", undefined, intruderOwnerCookie)).status, 403);
  assert.equal((await call(`owner/leads/${created.lead.id}`, "GET", undefined, intruderOwnerCookie)).status, 403);
  assert.equal((await call(`owner/leads/${created.lead.id}/response`, "PATCH", { response: "not_interested" }, intruderOwnerCookie)).status, 403);
  assert.equal((await call(`leads/${created.lead.id}/meeting`, "GET", undefined, intruderOwnerCookie)).status, 403);

  const intruderSeekerPhone = "+919876543213";
  await call("auth/otp/request", "POST", { phone: intruderSeekerPhone });
  const intruderSeekerCookie = cookieFrom(await call("auth/otp/verify", "POST", { phone: intruderSeekerPhone, code: "123456" }), "aangan_access");
  await call("profile", "PATCH", { name: "Intruder Seeker", email: "intruder.seeker@example.com", addOwnerRole: false, consent: true }, intruderSeekerCookie);
  assert.equal((await call(`leads/${created.lead.id}/meeting`, "GET", undefined, intruderSeekerCookie)).status, 403);

  // Admin malformed ID returns 400 instead of 500
  assert.equal((await call("admin/users/not-a-uuid", "GET", undefined, adminCookie)).status, 400);

  // 10. Listing titles/descriptions and enquiry messages with phones, word-digits, emails, WhatsApp, or links are rejected (422)
  const basePropPayload = { category: "rent_home", propertyType: "Apartment", price: 45000, address: "5 Park Road", city: "Bengaluru", locality: "Koramangala", bhkOrRoomType: "2 BHK", areaSqft: 1200, bathrooms: 2, furnishingStatus: "Unfurnished", images: ["https://example.com/photo.jpg"] };
  assert.equal((await call("properties", "POST", { ...basePropPayload, title: "Home — WhatsApp me", description: "Quiet 2 BHK in Koramangala." }, ownerCookie)).status, 422);
  assert.equal((await call("properties", "POST", { ...basePropPayload, title: "Great 2 BHK", description: "Call me on nine eight seven six five four three two one zero." }, ownerCookie)).status, 422);
  assert.equal((await call("properties", "POST", { ...basePropPayload, title: "Great 2 BHK", description: "Visit myhomes dot com for photos." }, ownerCookie)).status, 422);

  assert.equal((await call("leads", "POST", { propertyId: createdProp.id, seekerNotes: "Ping on WhatsApp or @seeker_id" }, customerCookie)).status, 422);
  assert.equal((await call("leads", "POST", { propertyId: createdProp.id, seekerNotes: "Email me at seeker at gmail dot com" }, customerCookie)).status, 422);
  assert.equal((await call("leads", "POST", { propertyId: createdProp.id, seekerNotes: "Number nine eight 76543210" }, customerCookie)).status, 422);

  // 11. Admin schedules a meeting
  await call("admin/meetings", "POST", { leadId: created.lead.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), mode: "site_visit" }, adminCookie);
  const seekerMeeting = await (await call(`leads/${created.lead.id}/meeting`, "GET", undefined, customerCookie)).json();
  const ownerMeeting = await (await call(`leads/${created.lead.id}/meeting`, "GET", undefined, ownerCookie)).json();
  assert.equal(seekerMeeting.meeting?.status, "proposed");
  assert.deepEqual(seekerMeeting, ownerMeeting);
  hasNoPII(seekerMeeting, [seekerPhone, ownerPhone, "customerId", "ownerId", "scheduledByAdminId"]);

  // 12. Admin sees lead history and full contact/address details
  const adminResponse = await call("admin/leads", "GET", undefined, adminCookie);
  assert.equal(adminResponse.status, 200);
  const adminPayload = await adminResponse.json();
  assert.ok(adminPayload.items[0].history.length > 0);
  const adminLead = adminPayload.items.find((item: { id: string }) => item.id === created.lead.id);
  assert.ok(adminLead);
  assert.equal(adminLead.customer.phone, seekerPhone);
  assert.equal(adminLead.owner.phone, ownerPhone);
  assert.equal(adminLead.property.address, streetAddress);

  const { pool } = await import("../src/db/index");
  await pool.query(`
    DELETE FROM users WHERE phone IN ('+919876543210', '+919876543211', '+919876543212', '+919876543213') OR email IN ('rohan@example.com', 'ananya@example.com', 'intruder.owner@example.com', 'intruder.seeker@example.com');
  `);
  await pool.end();
});
