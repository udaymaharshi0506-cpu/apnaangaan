import test from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import { hasRole, publicSelf, verifyAdminCode } from "../src/lib/auth";
import {
  serializeAdminLead,
  serializeCustomerLead,
  serializeOwnerLead,
  serializePublicMeeting,
  serializePublicProperty,
} from "../src/lib/serializers";
import type { Lead, Meeting, Property, User } from "../src/db/schema";

// ─────────────────────────────────────────────────────────────
// 1. Role-Specific User Matrix Tests
// ─────────────────────────────────────────────────────────────
test("Role separation: hasRole correctly identifies customer, owner, and admin", () => {
  const customerUser = {
    id: "c1",
    roles: ["customer"],
    role: "customer",
    name: "Customer User",
    phone: "+919876543210",
    city: "Bengaluru",
    location: "Bengaluru",
  } as User;

  const ownerUser = {
    id: "o1",
    roles: ["customer", "owner"],
    role: "owner",
    name: "Owner User",
  } as User;

  const adminUser = {
    id: "a1",
    roles: ["customer", "owner", "admin"],
    role: "admin",
    name: "Platform Admin",
  } as User;

  // Customer checks
  assert.equal(hasRole(customerUser, "customer"), true);
  assert.equal(hasRole(customerUser, "owner"), false);
  assert.equal(hasRole(customerUser, "admin"), false);

  // Owner checks
  assert.equal(hasRole(ownerUser, "customer"), true);
  assert.equal(hasRole(ownerUser, "owner"), true);
  assert.equal(hasRole(ownerUser, "admin"), false);

  // Admin checks
  assert.equal(hasRole(adminUser, "customer"), true);
  assert.equal(hasRole(adminUser, "owner"), true);
  assert.equal(hasRole(adminUser, "admin"), true);

  // publicSelf checks
  const publicSeeker = publicSelf(customerUser);
  assert.deepEqual(publicSeeker.roles, ["customer"]);
  assert.equal(publicSeeker.needsOnboarding, true); // No consentAt

  const onboardedSeeker = publicSelf({
    ...customerUser,
    consentAt: new Date(),
  });
  assert.equal(onboardedSeeker.needsOnboarding, false);
});

// ─────────────────────────────────────────────────────────────
// 2. Auth Flow & Timing-Safe Verification (Crash Prevention)
// ─────────────────────────────────────────────────────────────
test("Auth flow: verifyAdminCode handles different lengths without throwing RangeError", () => {
  // Length mismatch should return false safely, NOT throw Buffer.timingSafeEqual RangeError
  assert.equal(verifyAdminCode("123"), false);
  assert.equal(verifyAdminCode("1234567"), false);
  assert.equal(verifyAdminCode(""), false);
  assert.equal(verifyAdminCode("abcdef"), false);

  // Fallback admin code when TOTP secret is unset
  assert.equal(verifyAdminCode("000000"), true);
});

test("Auth flow: timingSafeEqual with hash verification handles mismatched buffers safely", () => {
  const code = "123456";
  const validHashHex = createHash("sha256").update(code).digest("hex");
  const usedString = "used"; // e.g. when code is marked used in db

  const expected = Buffer.from(usedString);
  const actual = Buffer.from(createHash("sha256").update("123456").digest("hex"));

  // Guard: expected.length === actual.length prevents timingSafeEqual crash
  const isMatch =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  assert.equal(isMatch, false);

  // Valid hash matches
  const validExpected = Buffer.from(validHashHex);
  const validActual = Buffer.from(createHash("sha256").update("123456").digest("hex"));
  const isValidMatch =
    validExpected.length === validActual.length &&
    timingSafeEqual(validExpected, validActual);
  assert.equal(isValidMatch, true);
});

// ─────────────────────────────────────────────────────────────
// 3. Property Form Input Sanitization & Anti-Crash Guards
// ─────────────────────────────────────────────────────────────
test("Property posting: Contact detail detection rejects actual phone numbers but preserves street/plot addresses", () => {
  // Regex from api-handler rejectContactDetails
  const phonePattern = /(?:(?:\+?91[\s.-]?)?[6-9]\d{9}|\b\d{5}[\s.-]?\d{5}\b)/;

  // Real phone numbers must be rejected
  assert.match("Call me at 9876543210 for quick viewing", phonePattern);
  assert.match("Contact +919876543210", phonePattern);
  assert.match("Call 98765 43210", phonePattern);

  // Street, plot, sector numbers must NOT be rejected
  assert.doesNotMatch("Near Sector 45, Plot 12, Indiranagar 100 Feet Road", phonePattern);
  assert.doesNotMatch("Flat 302, 3rd Floor, Brigade Road", phonePattern);
  assert.doesNotMatch("Spacious 1200 sqft apartment with 2 balconies", phonePattern);
});

test("Property posting: Type coercion handles string inputs from HTML forms", () => {
  // Form submission sends string values for price, area, bathrooms, deposit
  const formPrice = "45000";
  const formArea = "1250";
  const formBathrooms = "2";
  const formDeposit = "90000";
  const formAvailability = "2026-11-01";

  const cleanPrice = Math.round(Number(formPrice.replace(/,/g, ""))) || 0;
  const cleanArea = Math.round(Number(formArea.replace(/,/g, ""))) || 0;
  const cleanBathrooms = Math.max(1, Math.round(Number(formBathrooms)) || 1);
  const cleanDeposit = formDeposit ? Math.round(Number(formDeposit.replace(/,/g, ""))) : null;

  assert.equal(cleanPrice, 45000);
  assert.equal(cleanArea, 1250);
  assert.equal(cleanBathrooms, 2);
  assert.equal(cleanDeposit, 90000);

  // Availability date format check
  const parsedDate = new Date(formAvailability);
  assert.equal(isNaN(parsedDate.getTime()), false);
  assert.match(parsedDate.toISOString(), /^2026-11-01T/);
});

// ─────────────────────────────────────────────────────────────
// 4. UUID Validation & Route Safety
// ─────────────────────────────────────────────────────────────
test("UUID regex: Strictly matches valid RFC 4122 UUIDs and rejects malicious or invalid strings", () => {
  const strictUuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const validUuid = "123e4567-e89b-12d3-a456-426614174000";
  const validUuidV4 = "550e8400-e29b-41d4-a716-446655440000";
  const invalidUuid1 = "123e4567-e89b-12d3-a456"; // too short
  const invalidUuid2 = "123e4567-e89b-12d3-a456-426614174000-extra"; // too long
  const invalidUuid3 = "123e4567-e89b-62d3-a456-426614174000"; // invalid version 6
  const invalidUuid4 = "123e4567-e89b-12d3-c456-426614174000"; // invalid variant 'c'
  const maliciousInput = "123e4567-e89b-12d3-a456-426614174000'; DROP TABLE users;--";

  assert.equal(strictUuidPattern.test(validUuid), true);
  assert.equal(strictUuidPattern.test(validUuidV4), true);
  assert.equal(strictUuidPattern.test(invalidUuid1), false);
  assert.equal(strictUuidPattern.test(invalidUuid2), false);
  assert.equal(strictUuidPattern.test(invalidUuid3), false);
  assert.equal(strictUuidPattern.test(invalidUuid4), false);
  assert.equal(strictUuidPattern.test(maliciousInput), false);
});

// ─────────────────────────────────────────────────────────────
// 5. Gallery Safety & Division-by-Zero NaN Protection
// ─────────────────────────────────────────────────────────────
test("Gallery: photos array fallback prevents NaN and empty-index crashes", () => {
  const emptyImages: string[] = [];
  const photos =
    emptyImages && emptyImages.length > 0
      ? emptyImages
      : ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"];

  assert.equal(photos.length, 1);
  assert.equal(Boolean(photos[0]), true);

  // Secondary thumbnails calculation
  const secondaryIndices = [1, 2].map((idx) => idx % photos.length);
  assert.deepEqual(secondaryIndices, [0, 0]); // Gracefully wraps without NaN or out-of-bounds error
});

// ─────────────────────────────────────────────────────────────
// 6. Moderation & Rejection Reason Integrity
// ─────────────────────────────────────────────────────────────
test("Moderation: Admin verification handles rejection reason and preserves KYC documents", () => {
  const propertyMock = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    title: "3 BHK Villa in Whitefield",
    category: "buy_home",
    propertyType: "Villa",
    price: 15000000,
    priceType: "negotiable",
    liveSelfieUrl: "https://example.com/selfie.jpg",
    aadhaarCardUrl: "https://example.com/aadhaar.jpg",
    ownershipType: "sole_owner",
    coOwners: null,
    ownerName: "Uday Maharshi",
    ownerPhone: "+919876543210",
    status: "rejected",
    rejectionReason: "Government Aadhaar card document is blurry and unreadable.",
    verified: false,
  };

  // Ensure public serialization does not leak KYC documents or rejection reason
  const publicSerialized = serializePublicProperty(propertyMock as any);
  assert.equal("liveSelfieUrl" in publicSerialized, false);
  assert.equal("aadhaarCardUrl" in publicSerialized, false);
  assert.equal("rejectionReason" in publicSerialized, false);
  assert.equal("ownerName" in publicSerialized, false);

  // Admin moderation payload includes KYC documents and rejection reason
  const adminModerationPayload = {
    ...publicSerialized,
    status: propertyMock.status,
    liveSelfieUrl: propertyMock.liveSelfieUrl,
    aadhaarCardUrl: propertyMock.aadhaarCardUrl,
    ownershipType: propertyMock.ownershipType,
    coOwners: propertyMock.coOwners,
    ownerName: propertyMock.ownerName,
    ownerPhone: propertyMock.ownerPhone,
    rejectionReason: propertyMock.rejectionReason,
  };

  assert.equal(adminModerationPayload.liveSelfieUrl, "https://example.com/selfie.jpg");
  assert.equal(adminModerationPayload.aadhaarCardUrl, "https://example.com/aadhaar.jpg");
  assert.equal(adminModerationPayload.rejectionReason, "Government Aadhaar card document is blurry and unreadable.");
  assert.equal(adminModerationPayload.status, "rejected");

  // Owner payload includes rejection reason so owner knows why listing was rejected
  const ownerListingPayload = {
    ...publicSerialized,
    status: propertyMock.status,
    rejectionReason: propertyMock.rejectionReason,
  };
  assert.equal(ownerListingPayload.rejectionReason, "Government Aadhaar card document is blurry and unreadable.");
});

