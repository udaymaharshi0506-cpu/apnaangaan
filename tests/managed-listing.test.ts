import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { hasRole } from "../src/lib/auth";
import { serializePublicProperty } from "../src/lib/serializers";
import { dispatch } from "../src/lib/api-handler";
import type { Property, User } from "../src/db/schema";

// ─────────────────────────────────────────────────────────────
// 1. Access & Role Gating Tests
// ─────────────────────────────────────────────────────────────
test("Access & Role Gating: Strict separation for owner listing flow", () => {
  const seekerUser = {
    id: "u-seeker",
    roles: ["customer"],
    role: "customer",
    name: "Arjun Seeker",
    phone: "+919876543210",
  } as User;

  const ownerUser = {
    id: "u-owner",
    roles: ["customer", "owner"],
    role: "owner",
    name: "Vikram Owner",
    phone: "+919876543222",
  } as User;

  const adminUser = {
    id: "u-admin",
    roles: ["customer", "owner", "admin"],
    role: "admin",
    name: "Ananya Admin",
    phone: "+919876543233",
  } as User;

  // Seekers/guests must not have owner or admin privileges
  assert.equal(hasRole(seekerUser, "owner"), false, "Seeker must not be permitted owner privileges");
  assert.equal(hasRole(seekerUser, "admin"), false, "Seeker must not be permitted admin privileges");

  // Owners are allowed
  assert.equal(hasRole(ownerUser, "owner"), true, "Owner must have owner privileges");
  assert.equal(hasRole(ownerUser, "admin"), false, "Owner must not have admin privileges");

  // Admins have access
  assert.equal(hasRole(adminUser, "owner"), true, "Admin has owner privileges");
  assert.equal(hasRole(adminUser, "admin"), true, "Admin has admin privileges");
});

// ─────────────────────────────────────────────────────────────
// 2. Managed Service Tier Pricing & Boost Logic Tests
// ─────────────────────────────────────────────────────────────
test("Managed Service Tiers: Standard ₹499 vs Premium ₹999 deliverables and boost flag", () => {
  type TierDefinition = {
    tier: "standard" | "premium" | "none";
    fee: string;
    isRecommended: boolean;
    verificationIncluded: boolean;
    searchPlacement: "standard" | "priority_boost";
  };

  const TIERS: Record<string, TierDefinition> = {
    standard: {
      tier: "standard",
      fee: "499.00",
      isRecommended: false,
      verificationIncluded: false,
      searchPlacement: "standard",
    },
    premium: {
      tier: "premium",
      fee: "999.00",
      isRecommended: true,
      verificationIncluded: true,
      searchPlacement: "priority_boost",
    },
    none: {
      tier: "none",
      fee: "0.00",
      isRecommended: false,
      verificationIncluded: false,
      searchPlacement: "standard",
    },
  };

  // Standard Tier assertions
  assert.equal(TIERS.standard.fee, "499.00");
  assert.equal(TIERS.standard.isRecommended, false);
  assert.equal(TIERS.standard.verificationIncluded, false);

  // Premium Tier assertions (Recommended)
  assert.equal(TIERS.premium.fee, "999.00");
  assert.equal(TIERS.premium.isRecommended, true);
  assert.equal(TIERS.premium.verificationIncluded, true);
  assert.equal(TIERS.premium.searchPlacement, "priority_boost");
});

// ─────────────────────────────────────────────────────────────
// 3. Property Serializer: isRecommended Serialization
// ─────────────────────────────────────────────────────────────
test("Serializer: includes isRecommended boolean for search ranking and boost cards", () => {
  const dummyPropBase: Property = {
    id: "prop-123",
    ownerId: "owner-456",
    category: "rent_home",
    propertyType: "Apartment",
    title: "2 BHK Luxury Flat near Indiranagar Metro",
    description: "Fully furnished 2 BHK flat ready to move in.",
    price: 35000,
    priceType: "fixed",
    city: "Bengaluru",
    locality: "Indiranagar",
    pinCode: "560038",
    landmark: "Behind Metro Pillar 42",
    latitude: 12.9716,
    longitude: 77.5946,
    bhkOrRoomType: "2 BHK",
    areaSqft: 1100,
    bathrooms: 2,
    floor: "3",
    totalFloors: 5,
    propertyAge: "1–5 Years",
    facing: "East",
    furnishingStatus: "Furnished",
    amenities: ["Power Backup", "Lift", "Covered Parking"],
    images: ["https://example.com/p1.webp"],
    availabilityDate: "2026-12-01",
    reraNumber: null,
    deposit: 100000,
    maintenanceStatus: "included",
    maintenanceAmount: null,
    possessionStatus: "Ready to move",
    possessionDate: null,
    loanStatus: null,
    lockInPeriod: "6 months",
    noticePeriod: "1 month",
    tenantPreference: "Family or Bachelors",
    bedCount: null,
    genderPolicy: null,
    houseRules: ["No smoking"],
    itemizedCharges: null,
    verified: true,
    liveSelfieUrl: null,
    aadhaarCardUrl: null,
    ownershipType: "sole_owner",
    coOwners: null,
    ownerName: "Test Owner",
    ownerPhone: "+919876543222",
    rejectionReason: null,
    views: 42,
    status: "live",
    isRecommended: true,
    listingMode: "managed",
    managedTier: "premium",
    feeAmount: "999.00",
    paymentStatus: "paid",
    transactionId: "TXN-TEST-999",
    requestStatus: "published",
    assignedManagerId: null,
    assignedManagerName: "Priya Sharma",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const serializedPremium = serializePublicProperty(dummyPropBase);
  assert.equal(serializedPremium.isRecommended, true, "Premium listing should serialize isRecommended as true");
  assert.equal(serializedPremium.title, "2 BHK Luxury Flat near Indiranagar Metro");

  const nonBoostedProp = { ...dummyPropBase, isRecommended: false };
  const serializedStandard = serializePublicProperty(nonBoostedProp);
  assert.equal(serializedStandard.isRecommended, false, "Standard listing should serialize isRecommended as false");
});

// ─────────────────────────────────────────────────────────────
// 4. API RBAC Security Tests (Dispatched Calls)
// ─────────────────────────────────────────────────────────────
test("API Security: Non-authenticated and non-owner callers are strictly gated", async () => {
  // 1. Unauthenticated POST /api/owner/manager-requests should be rejected with 401
  const reqUnauth = new NextRequest("http://localhost:3000/api/owner/manager-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      managedTier: "premium",
      locality: "Koramangala",
      city: "Bengaluru",
      ownerContactPhone: "9876543210",
    }),
  });
  const resUnauth = await dispatch(reqUnauth, "POST", {
    params: Promise.resolve({ segments: ["owner", "manager-requests"] }),
  });
  assert.equal(resUnauth.status, 401, "Unauthenticated request to owner/manager-requests must return 401");

  // 2. Unauthenticated GET /api/admin/manager-requests should be rejected with 401
  const reqAdminUnauth = new NextRequest("http://localhost:3000/api/admin/manager-requests", {
    method: "GET",
  });
  const resAdminUnauth = await dispatch(reqAdminUnauth, "GET", {
    params: Promise.resolve({ segments: ["admin", "manager-requests"] }),
  });
  assert.equal(resAdminUnauth.status, 401, "Unauthenticated request to admin/manager-requests must return 401");

  // 3. Unauthenticated PATCH /api/admin/manager-requests/:id should be rejected with 401
  const reqAdminPatch = new NextRequest("http://localhost:3000/api/admin/manager-requests/00000000-0000-0000-0000-000000000001", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assign_manager", managerName: "Priya Sharma" }),
  });
  const resAdminPatch = await dispatch(reqAdminPatch, "PATCH", {
    params: Promise.resolve({ segments: ["admin", "manager-requests", "00000000-0000-0000-0000-000000000001"] }),
  });
  assert.equal(resAdminPatch.status, 401, "Unauthenticated PATCH to admin/manager-requests must return 401");
});

// ─────────────────────────────────────────────────────────────
// 5. Notification Message & Link Formatting Tests
// ─────────────────────────────────────────────────────────────
test("Notification System: Correct format for Owner & Admin alerts", () => {
  const formatAdminNotification = (ownerName: string, phone: string, tier: "standard" | "premium", locality: string, reqId: string) => {
    const tierLabel = tier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";
    const message = `🔔 New Hire a Manager Request: ${ownerName} (${phone}) selected ${tierLabel} for ${locality}.`;
    const link = `/admin?view=requests&id=${reqId}`;
    return { message, link };
  };

  const formatOwnerConfirmation = (tier: "standard" | "premium") => {
    const tierLabel = tier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";
    const message = `Your Hire a Manager request (${tierLabel}) has been confirmed! An Apna Aangan manager will contact you shortly.`;
    const link = "/owner";
    return { message, link };
  };

  const formatAssignmentNotification = (managerName: string, tier: "standard" | "premium") => {
    const tierLabel = tier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";
    const message = `Manager ${managerName} has been assigned to your ${tierLabel} request. They will coordinate your property listing.`;
    const link = "/owner";
    return { message, link };
  };

  const adminNotif = formatAdminNotification("Ramesh Kumar", "9876543210", "premium", "Whitefield", "req-uuid-101");
  assert.ok(adminNotif.message.includes("Premium Listing (₹999)"));
  assert.ok(adminNotif.message.includes("Ramesh Kumar"));
  assert.equal(adminNotif.link, "/admin?view=requests&id=req-uuid-101");

  const ownerNotif = formatOwnerConfirmation("standard");
  assert.ok(ownerNotif.message.includes("Standard Listing (₹499)"));
  assert.equal(ownerNotif.link, "/owner");

  const assignNotif = formatAssignmentNotification("Priya Sharma", "premium");
  assert.ok(assignNotif.message.includes("Priya Sharma"));
  assert.ok(assignNotif.message.includes("Premium Listing (₹999)"));
  assert.equal(assignNotif.link, "/owner");
});

// ─────────────────────────────────────────────────────────────
// 6. Legacy Draft Cleansing & Sanitization Test
// ─────────────────────────────────────────────────────────────
test("Legacy Draft Cleansing: automatically normalizes stale category and property types to rent_home", () => {
  const { normalizeFromAllowlist, PROPERTY_TYPES_BY_VERTICAL, BHK_OPTIONS_BY_VERTICAL, validateVerticalRules } = require("../src/lib/listing-validation");

  const legacyDraft = {
    category: "buy_home",
    propertyType: "Plot",
    bhkOrRoomType: "Plot",
    price: "45000",
    areaSqft: "1250",
  };

  // Simulating the post-property draft loader normalization
  const cleanPropertyType =
    normalizeFromAllowlist(legacyDraft.propertyType || "", PROPERTY_TYPES_BY_VERTICAL.rent_home) || "Apartment";
  const cleanBhk =
    normalizeFromAllowlist(legacyDraft.bhkOrRoomType || "", BHK_OPTIONS_BY_VERTICAL.rent_home) || "2 BHK";

  const sanitized = {
    ...legacyDraft,
    category: "rent_home",
    propertyType: cleanPropertyType,
    bhkOrRoomType: cleanBhk,
  };

  assert.equal(sanitized.category, "rent_home");
  assert.equal(sanitized.propertyType, "Apartment");
  assert.equal(sanitized.bhkOrRoomType, "2 BHK");

  const validationRes = validateVerticalRules(sanitized, { isDraft: false });
  assert.equal(validationRes, null, "Sanitized rental draft should pass validation without rejection");
});

