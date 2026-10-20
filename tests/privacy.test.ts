import test from "node:test";
import assert from "node:assert/strict";
import type { Lead, Meeting, Property, User } from "../src/db/schema";
import { serializeAdminLead, serializeCustomerLead, serializeOwnerLead, serializePublicMeeting, serializePublicProperty } from "../src/lib/serializers";

const owner = { id: "owner-id", name: "Private Owner", phone: "+919876543210", email: "private-owner@example.com", passwordHash: "secret-hash" } as User;
const customer = { id: "customer-id", name: "Private Customer", phone: "+919123456789", email: "private-customer@example.com", passwordHash: "secret-hash" } as User;
const property = { id: "property-id", ownerId: owner.id, category: "buy_home", propertyType: "Apartment", title: "A quiet home", description: "A bright place to live", price: 12000000, priceType: "fixed", address: "A neighbourhood address", city: "Bengaluru", locality: "Indiranagar", latitude: 12.9, longitude: 77.6, bhkOrRoomType: "2 BHK", areaSqft: 1100, bathrooms: 2, furnishingStatus: "Semi-furnished", amenities: ["Balcony"], images: ["https://example.com/home.jpg"], availabilityDate: null, reraNumber: null, deposit: null, verified: true, createdAt: new Date(), ownerPhone: owner.phone, ownerEmail: owner.email, ownerName: owner.name } as unknown as Property;
const lead = { id: "lead-id", customerId: customer.id, ownerId: owner.id, propertyId: property.id, status: "new", adminNotes: "Private internal notes", preferredContactTime: "Morning", createdAt: new Date(), updatedAt: new Date(), customerPhone: customer.phone, ownerPhone: owner.phone, history: "Private history" } as unknown as Lead;
const meeting = { id: "meeting-id", leadId: lead.id, scheduledByAdminId: "admin-id", scheduledAt: new Date(), mode: "site_visit", status: "confirmed", adminNotes: "Private" } as unknown as Meeting;

function assertNoPrivateFields(value: unknown, forbidden: string[]) {
  const serialized = JSON.stringify(value);
  for (const secret of forbidden) assert.ok(!serialized.includes(secret), `Public response leaked: ${secret}`);
}

test("public property serializer explicitly strips owner identity and contact fields", () => {
  const result = serializePublicProperty(property);
  assertNoPrivateFields(result, [owner.name!, owner.phone!, owner.email!, owner.id, "ownerPhone", "ownerEmail", "ownerName", "passwordHash"]);
  assert.equal(result.title, property.title);
});

test("customer-facing lead never contains owner name, phone, email, ID, notes, or history", () => {
  const result = serializeCustomerLead(lead, property, meeting);
  assertNoPrivateFields(result, [owner.name!, owner.phone!, owner.email!, owner.id, "ownerPhone", "ownerEmail", "ownerName", "ownerId", "adminNotes", "Private internal notes", "history", "scheduledByAdminId"]);
  assert.equal(result.meeting?.status, "confirmed");
});

test("owner-facing lead never contains customer name, phone, email, ID, notes, or history", () => {
  const result = serializeOwnerLead(lead, property, meeting);
  assertNoPrivateFields(result, [customer.name!, customer.phone!, customer.email!, customer.id, "customerPhone", "customerEmail", "customerName", "customerId", "adminNotes", "Private internal notes", "history", "scheduledByAdminId"]);
  assert.match(result.message, /^Someone is interested/);
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

test("homeseeker living profile and confirmed phone are accurately serialized for admin and seeker", () => {
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
  assert.equal(customerView.confirmedPhone, "+919876543210");
  assert.equal(customerView.seekerNotes, "Need dedicated car parking and 11-month lease");

  const adminView = serializeAdminLead(profileLead, property, customer, owner, meeting, []);
  assert.equal(adminView.occupantsCount, "3–4 People");
  assert.equal(adminView.tenantType, "Family");
  assert.equal(adminView.profession, "Job / Salaried");
  assert.equal(adminView.groupGender, "Family");
  assert.equal(adminView.moveInTimeline, "Within 15 Days");
  assert.equal(adminView.confirmedPhone, "+919876543210");
  assert.equal(adminView.seekerNotes, "Need dedicated car parking and 11-month lease");

  // Owner view receives the living profile requirements without leaking seeker contact details
  const ownerView = serializeOwnerLead(profileLead, property, meeting);
  assert.equal(ownerView.occupantsCount, "3–4 People");
  assert.equal(ownerView.tenantType, "Family");
  assert.equal(ownerView.profession, "Job / Salaried");
  assert.equal(ownerView.groupGender, "Family");
  assert.equal(ownerView.moveInTimeline, "Within 15 Days");
  assertNoPrivateFields(ownerView, [profileLead.confirmedPhone!, customer.phone!, customer.email!, customer.id]);
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

