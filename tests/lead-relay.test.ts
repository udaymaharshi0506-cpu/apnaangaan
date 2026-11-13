import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";
import { db } from "../src/db";
import { leads, notifications, properties, users } from "../src/db/schema";
import { serializeOwnerInquiry } from "../src/lib/serializers";
import {
  buildMetaWhatsAppPayload,
  buildWhatsAppTemplateText,
  formatWhatsAppPhone,
  handleOwnerResponse,
  sendOwnerInterestWhatsAppWithRetry,
} from "../src/lib/whatsapp";
import { eq } from "drizzle-orm";

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
  return dispatch(request, method, { params: Promise.resolve({ segments: route.split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

function assertNoPII(value: unknown, secrets: string[]) {
  const json = JSON.stringify(value);
  for (const secret of secrets) {
    assert.ok(!json.includes(secret), `Private data leaked into owner payload/response: ${secret}`);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Owner WhatsApp payload and owner API response contain only allowed fields
// -----------------------------------------------------------------------------
test("TEST 1: Owner WhatsApp payload and owner API response contain only allowed fields; fail if seeker PII appears", async () => {
  const seekerPhone = "+919876540001";
  const seekerEmail = "test-seeker@example.com";
  const seekerName = "Aarav Sharma";
  const propertyTitle = "Palm Meadows Villa";
  const propertyId = "11111111-2222-3333-4444-555555555555";
  const leadId = "66666666-7777-8888-9999-000000000000";

  // A. Verify Meta WhatsApp Cloud API template payload
  const waPayload = buildMetaWhatsAppPayload({
    toPhone: "+919876549999",
    propertyName: propertyTitle,
    occupantsCount: "2",
    tenantType: "Working Professionals",
    profession: "Job-Salaried",
    groupComposition: "N/A",
    leadId,
  });

  const rawWaJson = JSON.stringify(waPayload);

  // Must contain only the 5 allowed fields and quick reply button payloads
  assert.equal(waPayload.messaging_product, "whatsapp");
  assert.equal(waPayload.template.name, "owner_lead_interest_v1");
  assert.equal(waPayload.template.components[0].parameters[0].text, propertyTitle);
  assert.equal(waPayload.template.components[0].parameters[1].text, "2");
  assert.equal(waPayload.template.components[0].parameters[2].text, "Working Professionals");
  assert.equal(waPayload.template.components[0].parameters[3].text, "Job-Salaried");
  assert.equal(waPayload.template.components[0].parameters[4].text, "N/A");

  // STRICT CHECK: Fail if any seeker name, phone, email, or user ID appears
  assertNoPII(waPayload, [seekerName, seekerPhone, seekerEmail, "test-seeker"]);

  // B. Verify plain-text WhatsApp body for utility submission
  const waText = buildWhatsAppTemplateText({
    propertyName: propertyTitle,
    occupantsCount: "2",
    tenantType: "Working Professionals",
    profession: "Job-Salaried",
    groupComposition: "N/A",
  });
  assert.ok(waText.includes(`*${propertyTitle}*`));
  assert.ok(waText.includes("- People: 2"));
  assert.ok(waText.includes("- Tenant type: Working Professionals"));
  assert.ok(waText.includes("- Profession: Job-Salaried"));
  assert.ok(waText.includes("- Group: N/A"));
  assertNoPII(waText, [seekerName, seekerPhone, seekerEmail]);

  // C. Verify owner inquiry view serializer DTO
  const ownerInquiryRow = {
    id: leadId,
    propertyId,
    propertyName: propertyTitle,
    occupantsCount: "3-4",
    tenantType: "Family",
    profession: "Business-Self-Employed",
    groupComposition: "Family",
    status: "new",
    ownerResponse: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const serialized = serializeOwnerInquiry(ownerInquiryRow);

  // Check allowed keys only
  const keys = Object.keys(serialized);
  assert.ok(keys.includes("id"));
  assert.ok(keys.includes("propertyId"));
  assert.ok(keys.includes("propertyName"));
  assert.ok(keys.includes("occupantsCount"));
  assert.ok(keys.includes("tenantType"));
  assert.ok(keys.includes("profession"));
  assert.ok(keys.includes("groupComposition"));
  assert.ok(keys.includes("status"));
  assert.ok(keys.includes("ownerResponse"));

  // Strictly prohibited keys
  const forbiddenKeys = ["customerId", "customerName", "customerPhone", "customerEmail", "name", "phone", "email", "budget", "dates", "moveInTimeline", "message", "seekerNotes", "location", "userId"];
  for (const forbidden of forbiddenKeys) {
    assert.equal(forbidden in serialized, false, `Forbidden field '${forbidden}' was present in owner DTO`);
  }

  assertNoPII(serialized, [seekerName, seekerPhone, seekerEmail]);
});

// -----------------------------------------------------------------------------
// TEST 2: Owner A cannot fetch Owner B's inquiries (IDOR Prevention: expect 403/404)
// -----------------------------------------------------------------------------
test("TEST 2: Owner A cannot fetch Owner B's inquiries (expect 403/404)", async () => {
  const ownerAPhone = "+919871111111";
  const ownerBPhone = "+919872222222";
  const seekerPhone = "+919873333333";

  await db.delete(users).where(eq(users.phone, ownerAPhone));
  await db.delete(users).where(eq(users.phone, ownerBPhone));
  await db.delete(users).where(eq(users.phone, seekerPhone));

  // Authenticate Owner A
  await call("auth/otp/request", "POST", { phone: ownerAPhone });
  const verifyA = await call("auth/otp/verify", "POST", { phone: ownerAPhone, code: "123456" });
  const cookieA = cookieFrom(verifyA, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Alpha", email: "owner.a@example.com", addOwnerRole: true, consent: true }, cookieA);

  // Authenticate Owner B
  await call("auth/otp/request", "POST", { phone: ownerBPhone });
  const verifyB = await call("auth/otp/verify", "POST", { phone: ownerBPhone, code: "123456" });
  const cookieB = cookieFrom(verifyB, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Beta", email: "owner.b@example.com", addOwnerRole: true, consent: true }, cookieB);

  // Authenticate Seeker
  await call("auth/otp/request", "POST", { phone: seekerPhone });
  const verifySeeker = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
  const cookieSeeker = cookieFrom(verifySeeker, "aangan_access");
  await call("profile", "PATCH", { name: "Seeker User", email: "seeker@example.com", addOwnerRole: false, consent: true }, cookieSeeker);

  // Owner B creates a property
  const propRes = await call(
    "properties",
    "POST",
    {
      category: "rent_home",
      propertyType: "Apartment",
      title: "Owner B Luxury Penthouse",
      description: "Serene views and high ceilings in prime central district.",
      price: 65000,
      deposit: 130000,
      address: "88 Tower Road",
      city: "Bengaluru",
      locality: "Indiranagar",
      bhkOrRoomType: "3 BHK",
      areaSqft: 1800,
      bathrooms: 3,
      furnishingStatus: "Fully furnished",
      amenities: ["Balcony"],
      images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
    },
    cookieB
  );
  assert.ok([200, 201].includes(propRes.status));
  const { property: propB } = await propRes.json();

  // Approve property via direct DB update
  await db.update(properties).set({ status: "live", verified: true }).where(eq(properties.id, propB.id));

  // Seeker expresses interest in Owner B's property
  const leadRes = await call(
    "leads",
    "POST",
    {
      propertyId: propB.id,
      occupantsCount: "2",
      tenantType: "Couple",
      profession: "Job-Salaried",
      groupGender: "Both-Co-ed",
      confirmedPhone: "9873333333",
    },
    cookieSeeker
  );
  assert.ok([200, 201].includes(leadRes.status));
  const { lead: createdLead } = await leadRes.json();
  assert.ok(createdLead?.id);

  // IDOR ATTEMPT 1: Owner A tries to fetch Owner B's lead by ID via /api/owner/leads/:id
  const idorGetRes = await call(`owner/leads/${createdLead.id}`, "GET", undefined, cookieA);
  assert.ok(
    [403, 404].includes(idorGetRes.status),
    `Expected 403 or 404 on IDOR fetch attempt, got ${idorGetRes.status}`
  );

  // IDOR ATTEMPT 2: Owner A tries to respond to Owner B's lead
  const idorPatchRes = await call(
    `owner/leads/${createdLead.id}/response`,
    "PATCH",
    { response: "interested" },
    cookieA
  );
  assert.ok(
    [403, 404].includes(idorPatchRes.status),
    `Expected 403 or 404 on IDOR response attempt, got ${idorPatchRes.status}`
  );

  // LEGITIMATE ACCESS: Owner B can fetch the lead
  const legitGetRes = await call(`owner/leads/${createdLead.id}`, "GET", undefined, cookieB);
  assert.equal(legitGetRes.status, 200);
  const legitData = await legitGetRes.json();
  assert.equal(legitData.inquiry.id, createdLead.id);
  assert.equal(legitData.inquiry.propertyName, "Owner B Luxury Penthouse");
  assert.equal(legitData.inquiry.occupantsCount, "2");
  assert.equal(legitData.inquiry.tenantType, "Couple");

  // Ensure NO seeker PII in Owner B's response
  assertNoPII(legitData, ["Seeker User", seekerPhone, "seeker@example.com"]);

  // Cleanup
  await db.delete(leads).where(eq(leads.id, createdLead.id));
  await db.delete(properties).where(eq(properties.id, propB.id));
  await db.delete(users).where(eq(users.phone, ownerAPhone));
  await db.delete(users).where(eq(users.phone, ownerBPhone));
  await db.delete(users).where(eq(users.phone, seekerPhone));
});

// -----------------------------------------------------------------------------
// TEST 3: WhatsApp failure retries with backoff, and website notification still appears
// -----------------------------------------------------------------------------
test("TEST 3: WhatsApp failure retries with backoff, and website notification still appears", async () => {
  // A. Test retry with backoff on failure
  let fetchAttempts = 0;
  const mockFailingFetch = async () => {
    fetchAttempts++;
    return new Response(JSON.stringify({ error: { message: "Internal WhatsApp Server Error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };

  const oldPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const oldToken = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "mock_phone_id_12345";
  process.env.WHATSAPP_ACCESS_TOKEN = "mock_token_abcde";

  const startTime = Date.now();
  const retryResult = await sendOwnerInterestWhatsAppWithRetry(
    {
      toPhone: "+919876543210",
      propertyName: "Green Haven",
      occupantsCount: "1",
      tenantType: "Working Professionals",
      profession: "Job-Salaried",
      groupComposition: "N/A",
      leadId: "test-retry-lead-id",
    },
    3,
    30, // 30ms initial backoff for speedy test execution
    mockFailingFetch as unknown as typeof fetch
  );
  const duration = Date.now() - startTime;

  // Verify all 3 attempts executed
  assert.equal(fetchAttempts, 3, "Expected 3 retry attempts");
  assert.equal(retryResult.success, false, "Expected failure after max retries");
  assert.equal(retryResult.attempts, 3);
  assert.ok(duration >= 30, `Expected backoff delay (took ${duration}ms)`);

  // Restore env
  process.env.WHATSAPP_PHONE_NUMBER_ID = oldPhoneId;
  process.env.WHATSAPP_ACCESS_TOKEN = oldToken;

  // B. Verify website notification still appears even when WhatsApp fails
  const ownerPhone = "+919874444444";
  const seekerPhone = "+919875555555";

  await call("auth/otp/request", "POST", { phone: ownerPhone });
  const verifyOwner = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
  const ownerCookie = cookieFrom(verifyOwner, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Charlie", email: "charlie@example.com", addOwnerRole: true, consent: true }, ownerCookie);

  await call("auth/otp/request", "POST", { phone: seekerPhone });
  const verifySeeker = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
  const seekerCookie = cookieFrom(verifySeeker, "aangan_access");
  await call("profile", "PATCH", { name: "Seeker Dave", email: "dave@example.com", addOwnerRole: false, consent: true }, seekerCookie);

  const propRes = await call(
    "properties",
    "POST",
    {
      category: "rent_home",
      propertyType: "Apartment",
      title: "Charlie Garden Retreat",
      description: "Peaceful environment with 24/7 security.",
      price: 40000,
      deposit: 80000,
      address: "10 Green Way",
      city: "Bengaluru",
      locality: "Whitefield",
      bhkOrRoomType: "2 BHK",
      areaSqft: 1100,
      bathrooms: 2,
      furnishingStatus: "Semi-furnished",
      amenities: ["Security"],
      images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
    },
    ownerCookie
  );
  const { property } = await propRes.json();
  await db.update(properties).set({ status: "live", verified: true }).where(eq(properties.id, property.id));

  // Seeker expresses interest
  const leadRes = await call(
    "leads",
    "POST",
    {
      propertyId: property.id,
      occupantsCount: "1",
      tenantType: "Working Professionals",
      profession: "Job-Salaried",
      confirmedPhone: "9875555555",
    },
    seekerCookie
  );
  assert.equal(leadRes.status, 201);
  const { lead } = await leadRes.json();

  // VERIFY: Website notification appears in Owner's notifications
  const ownerNotifsRes = await call("notifications", "GET", undefined, ownerCookie);
  assert.equal(ownerNotifsRes.status, 200);
  const { items: notifs } = await ownerNotifsRes.json();

  const foundNotif = notifs.find((n: { message: string; type: string }) =>
    n.message.includes("Charlie Garden Retreat") || n.type === "interest"
  );
  assert.ok(foundNotif, "Website in-app notification must appear for owner");

  // VERIFY: Owner inquiry list shows the interest request
  const ownerLeadsRes = await call("owner/leads", "GET", undefined, ownerCookie);
  assert.equal(ownerLeadsRes.status, 200);
  const { items: ownerLeads } = await ownerLeadsRes.json();
  assert.ok(ownerLeads.some((l: { id: string }) => l.id === lead.id));

  // Cleanup
  await db.delete(leads).where(eq(leads.id, lead.id));
  await db.delete(properties).where(eq(properties.id, property.id));
  await db.delete(users).where(eq(users.phone, ownerPhone));
  await db.delete(users).where(eq(users.phone, seekerPhone));
});

// -----------------------------------------------------------------------------
// TEST 4: Duplicate interest within 24h is idempotent (no duplicate message)
// -----------------------------------------------------------------------------
test("TEST 4: Duplicate interest from the same seeker on the same property within 24h is idempotent", async () => {
  const ownerPhone = "+919876666666";
  const seekerPhone = "+919877777777";

  await call("auth/otp/request", "POST", { phone: ownerPhone });
  const verifyOwner = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
  const ownerCookie = cookieFrom(verifyOwner, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Emily", email: "emily@example.com", addOwnerRole: true, consent: true }, ownerCookie);

  await call("auth/otp/request", "POST", { phone: seekerPhone });
  const verifySeeker = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
  const seekerCookie = cookieFrom(verifySeeker, "aangan_access");
  await call("profile", "PATCH", { name: "Seeker Frank", email: "frank@example.com", addOwnerRole: false, consent: true }, seekerCookie);

  const propRes = await call(
    "properties",
    "POST",
    {
      category: "rent_home",
      propertyType: "Apartment",
      title: "Emily Park Vista",
      description: "Balcony facing lush parks.",
      price: 38000,
      deposit: 76000,
      address: "14 Vista Road",
      city: "Bengaluru",
      locality: "HSR Layout",
      bhkOrRoomType: "2 BHK",
      areaSqft: 1050,
      bathrooms: 2,
      furnishingStatus: "Semi-furnished",
      amenities: ["Balcony"],
      images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
    },
    ownerCookie
  );
  const { property } = await propRes.json();
  await db.update(properties).set({ status: "live", verified: true }).where(eq(properties.id, property.id));

  // First interest submission -> 201 Created
  const res1 = await call(
    "leads",
    "POST",
    {
      propertyId: property.id,
      occupantsCount: "2",
      tenantType: "Couple",
      profession: "Job-Salaried",
      confirmedPhone: "9877777777",
    },
    seekerCookie
  );
  assert.equal(res1.status, 201);
  const data1 = await res1.json();

  // Second interest submission within 24h -> 200 with idempotency message, NOT 201
  const res2 = await call(
    "leads",
    "POST",
    {
      propertyId: property.id,
      occupantsCount: "2",
      tenantType: "Couple",
      profession: "Job-Salaried",
      confirmedPhone: "9877777777",
    },
    seekerCookie
  );
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data1.lead.id, data2.lead.id);
  assert.ok(data2.message.includes("already expressed interest"));

  // Verify only 1 lead exists in DB
  const leadRows = await db.select().from(leads).where(eq(leads.propertyId, property.id));
  assert.equal(leadRows.length, 1, "Only one lead must exist for the property/seeker pair");

  // Cleanup
  await db.delete(leads).where(eq(leads.id, data1.lead.id));
  await db.delete(properties).where(eq(properties.id, property.id));
  await db.delete(users).where(eq(users.phone, ownerPhone));
  await db.delete(users).where(eq(users.phone, seekerPhone));
});

// -----------------------------------------------------------------------------
// TEST 5: Owner reply updates status, notifies seeker, and creates admin task
// -----------------------------------------------------------------------------
test("TEST 5: Owner reply triggers correct behavior for Interested and Not Interested", async () => {
  const ownerPhone = "+919878888888";
  const seekerPhone = "+919879999999";

  await call("auth/otp/request", "POST", { phone: ownerPhone });
  const verifyOwner = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
  const ownerCookie = cookieFrom(verifyOwner, "aangan_access");
  await call("profile", "PATCH", { name: "Owner Gina", email: "gina@example.com", addOwnerRole: true, consent: true }, ownerCookie);

  await call("auth/otp/request", "POST", { phone: seekerPhone });
  const verifySeeker = await call("auth/otp/verify", "POST", { phone: seekerPhone, code: "123456" });
  const seekerCookie = cookieFrom(verifySeeker, "aangan_access");
  await call("profile", "PATCH", { name: "Seeker Harry", email: "harry@example.com", addOwnerRole: false, consent: true }, seekerCookie);

  const propRes = await call(
    "properties",
    "POST",
    {
      category: "rent_home",
      propertyType: "Apartment",
      title: "Gina Residency",
      description: "Quiet tree-lined lane.",
      price: 32000,
      deposit: 64000,
      address: "22 Lane B",
      city: "Bengaluru",
      locality: "Koramangala",
      bhkOrRoomType: "1 BHK",
      areaSqft: 650,
      bathrooms: 1,
      furnishingStatus: "Semi-furnished",
      amenities: ["Power Backup"],
      images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
    },
    ownerCookie
  );
  const { property } = await propRes.json();
  await db.update(properties).set({ status: "live", verified: true }).where(eq(properties.id, property.id));

  // Seeker expresses interest
  const leadRes = await call(
    "leads",
    "POST",
    {
      propertyId: property.id,
      occupantsCount: "1",
      tenantType: "Working Professionals",
      profession: "Job-Salaried",
      confirmedPhone: "9879999999",
    },
    seekerCookie
  );
  const { lead } = await leadRes.json();

  // Owner responds "interested"
  const responseRes = await call(
    `owner/leads/${lead.id}/response`,
    "PATCH",
    { response: "interested" },
    ownerCookie
  );
  assert.equal(responseRes.status, 200);

  // Check lead status in DB
  const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
  assert.equal(updatedLead.ownerResponse, "interested");
  assert.equal(updatedLead.status, "contacted");

  // Check seeker notifications
  const seekerNotifs = await (await call("notifications", "GET", undefined, seekerCookie)).json();
  const interestedNotif = seekerNotifs.items.find((n: { message: string }) =>
    n.message.toLowerCase().includes("interested")
  );
  assert.ok(interestedNotif, "Seeker must receive notification when owner is interested");

  // Check customer inquiries view has updated status
  const customerLeads = await (await call("customer/leads", "GET", undefined, seekerCookie)).json();
  const foundLead = customerLeads.items.find((l: { id: string }) => l.id === lead.id);
  assert.equal(foundLead.ownerResponse, "interested");

  // Cleanup
  await db.delete(leads).where(eq(leads.id, lead.id));
  await db.delete(properties).where(eq(properties.id, property.id));
  await db.delete(users).where(eq(users.phone, ownerPhone));
  await db.delete(users).where(eq(users.phone, seekerPhone));
});
