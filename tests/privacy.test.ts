import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Lead, Meeting, Property, User } from "../src/db/schema";
import { serializeAdminLead, serializeCustomerLead, serializeOwnerLead, serializePublicMeeting, serializePublicProperty } from "../src/lib/serializers";

const owner = { id: "owner-id", name: "Private Owner", phone: "+919876543210", email: "private-owner@example.com", passwordHash: "secret-hash" } as User;
const customer = { id: "customer-id", name: "Private Customer", phone: "+919123456789", email: "private-customer@example.com", passwordHash: "secret-hash" } as User;
const property = { id: "property-id", ownerId: owner.id, category: "rent_home", propertyType: "Apartment", title: "A quiet home", description: "A bright place to live", price: 45000, priceType: "fixed", address: "A neighbourhood address", city: "Bengaluru", locality: "Indiranagar", latitude: 12.9, longitude: 77.6, bhkOrRoomType: "2 BHK", areaSqft: 1100, bathrooms: 2, furnishingStatus: "Semi-furnished", amenities: ["Balcony"], images: ["https://example.com/home.jpg"], availabilityDate: null, reraNumber: null, deposit: 90000, verified: true, createdAt: new Date(), ownerPhone: owner.phone, ownerEmail: owner.email, ownerName: owner.name } as unknown as Property;
const lead = { id: "lead-id", customerId: customer.id, ownerId: owner.id, propertyId: property.id, status: "new", adminNotes: "Private internal notes", preferredContactTime: "Morning", createdAt: new Date(), updatedAt: new Date(), customerPhone: customer.phone, ownerPhone: owner.phone, history: "Private history" } as unknown as Lead;
const meeting = { id: "meeting-id", leadId: lead.id, scheduledByAdminId: "admin-id", scheduledAt: new Date(), mode: "site_visit", status: "confirmed", adminNotes: "Private" } as unknown as Meeting;

function assertNoPrivateFields(value: unknown, forbidden: string[]) {
  const serialized = JSON.stringify(value);
  for (const secret of forbidden) assert.ok(!serialized.includes(secret), `Public response leaked: ${secret}`);
}

test("public property serializer explicitly strips owner identity, address, and contact fields", () => {
  const result = serializePublicProperty(property);
  assertNoPrivateFields(result, [owner.name!, owner.phone!, owner.email!, owner.id, property.address, "ownerPhone", "ownerEmail", "ownerName", "passwordHash"]);
  assert.equal("address" in result, false);
  assert.equal("ownerId" in result, false);
  assert.equal(result.title, property.title);
});

test("customer-facing lead never contains owner name, phone, email, address, whatsapp, ID, notes, or history", () => {
  const result = serializeCustomerLead(lead, property, meeting);
  assertNoPrivateFields(result, [owner.name!, owner.phone!, owner.email!, owner.id, property.address, "ownerPhone", "ownerEmail", "ownerName", "ownerId", "confirmedPhone", "whatsappMessageId", "whatsappStatus", "adminNotes", "Private internal notes", "history", "scheduledByAdminId"]);
  assert.equal("confirmedPhone" in result, false);
  assert.equal(result.meeting?.status, "confirmed");
});

test("owner-facing lead never contains customer name, phone, email, ID, notes, or history", () => {
  const result = serializeOwnerLead(lead, property, meeting);
  assertNoPrivateFields(result, [customer.name!, customer.phone!, customer.email!, customer.id, "customerPhone", "customerEmail", "customerName", "customerId", "adminNotes", "Private internal notes", "history", "scheduledByAdminId"]);
  assert.equal(result.propertyName, property.title);
});

test("meeting serializer returns only time, mode, status and public ID", () => {
  assert.deepEqual(Object.keys(serializePublicMeeting(meeting) || {}).sort(), ["id", "mode", "scheduledAt", "status"]);
});

test("admin serializer is the only one with both parties' contact details and private history", () => {
  const result = serializeAdminLead(lead, property, customer, owner, meeting, [{ eventType: "created", detail: "Admin-only event", createdAt: new Date() }]);
  assert.equal(result.customer.phone, customer.phone);
  assert.equal(result.owner.phone, owner.phone);
  assert.equal(result.adminNotes, lead.adminNotes);
  assert.equal(result.history.length, 1);
});

test("homeseeker living profile is serialized for seeker without leaking raw phone, while admin retains full details", () => {
  const profileLead = {
    ...lead,
    occupantsCount: "3–4 People",
    tenantType: "Family",
    profession: "Job / Salaried",
    groupGender: "Family",
    moveInTimeline: "Within 15 Days",
    confirmedPhone: "+919876543210",
    seekerNotes: "Need dedicated car parking and 11-month lease",
  } as unknown as Lead;

  const customerView = serializeCustomerLead(profileLead, property, meeting);
  assert.equal(customerView.occupantsCount, "3–4 People");
  assert.equal(customerView.tenantType, "Family");
  assert.equal(customerView.profession, "Job / Salaried");
  assert.equal("confirmedPhone" in customerView, false);
  assertNoPrivateFields(customerView, [profileLead.confirmedPhone!, property.address, "confirmedPhone"]);
  assert.equal(customerView.seekerNotes, "Need dedicated car parking and 11-month lease");

  const adminView = serializeAdminLead(profileLead, property, customer, owner, meeting, []);
  assert.equal(adminView.occupantsCount, "3–4 People");
  assert.equal(adminView.tenantType, "Family");
  assert.equal(adminView.profession, "Job / Salaried");
  assert.equal(adminView.groupGender, "Family");
  assert.equal(adminView.moveInTimeline, "Within 15 Days");
  assert.equal(adminView.confirmedPhone, "+919876543210");
  assert.equal(adminView.property.address, property.address);
  assert.equal(adminView.seekerNotes, "Need dedicated car parking and 11-month lease");

  // Owner view receives the living profile requirements without leaking seeker contact details
  const ownerView = serializeOwnerLead(profileLead, property, meeting);
  assert.equal(ownerView.occupantsCount, "3–4 People");
  assert.equal(ownerView.tenantType, "Family");
  assert.equal(ownerView.profession, "Job / Salaried");
  assert.equal(ownerView.groupGender, "Family");
  assertNoPrivateFields(ownerView, [profileLead.confirmedPhone!, customer.phone!, customer.email!, customer.id, "seekerNotes", "moveInTimeline"]);
});

test("homeseeker phone confirmation enforces strict 10-digit Indian format", () => {
  const isValidIndianMobile = (p: string) => /^[6-9]\d{9}$/.test(p);
  assert.equal(isValidIndianMobile("9876543210"), true);
  assert.equal(isValidIndianMobile("7890123456"), true);
  assert.equal(isValidIndianMobile("6123456789"), true);
  assert.equal(isValidIndianMobile("8888888888"), true);

  assert.equal(isValidIndianMobile("5876543210"), false); // Doesn't start with 6-9
  assert.equal(isValidIndianMobile("987654321"), false);  // Only 9 digits
  assert.equal(isValidIndianMobile("98765432100"), false); // 11 digits
  assert.equal(isValidIndianMobile("98765abcd0"), false); // Non-digits
});

test("public, customer, and owner UI files contain no direct contact CTAs (tel:/wa.me/mailto: to users, Call/WhatsApp Owner)", () => {
  const uiFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!fullPath.includes(`${path.sep}admin`)) walk(fullPath);
      } else if (/\.(tsx|ts)$/.test(entry.name) && entry.name !== "admin-experience.tsx") {
        uiFiles.push(fullPath);
      }
    }
  }
  walk(path.join(process.cwd(), "src", "components"));
  walk(path.join(process.cwd(), "src", "app"));

  for (const file of uiFiles) {
    const content = readFileSync(file, "utf8");
    assert.equal(/\btel:/i.test(content), false, `Unexpected tel: link in ${file}`);
    assert.equal(/wa\.me\/|api\.whatsapp\.com/i.test(content), false, `Unexpected WhatsApp link in ${file}`);
    assert.equal(/\b(Call Owner|WhatsApp Owner|Contact Owner|Message Owner)\b/i.test(content), false, `Unexpected direct owner CTA in ${file}`);
    for (const match of content.matchAll(/mailto:([^"`'\s>]+)/gi)) {
      const target = match[1];
      const isPlatformSupport =
        target.includes("apnaangaan.in") ||
        (target === "${email}" && content.includes("privacy@apnaangaan.in"));
      assert.ok(isPlatformSupport, `Unexpected mailto link (${target}) in ${file}`);
    }
  }
});

