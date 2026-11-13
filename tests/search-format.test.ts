import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/db";
import { properties, users } from "../src/db/schema";
import { dispatch } from "../src/lib/api-handler";
import { formatIndianCurrency, formatPrice } from "../src/lib/format";
import { findProperties } from "../src/lib/queries";
import { expandLocationSearchVariants, filterLocationSuggestions } from "../src/lib/search-utils";

async function callGet(route: string) {
  const request = new NextRequest(`http://localhost:3000/api/${route}`, { method: "GET" });
  return dispatch(request, "GET", { params: Promise.resolve({ segments: route.split("?")[0].split("/") }) });
}

test("currency formatting: standardizes INR grouping, Lakh, Crore, /month vs total price", () => {
  assert.equal(formatIndianCurrency(0), "₹0");
  assert.equal(formatIndianCurrency(45000), "₹45,000");
  assert.equal(formatIndianCurrency(150000), "₹1.5 Lakh");
  assert.equal(formatIndianCurrency(12500000), "₹1.25 Cr");

  assert.equal(formatPrice(45000, "rent_home"), "₹45,000/month");
  assert.equal(formatPrice(150000, "rent_home"), "₹1.5 Lakh/month");
  assert.equal(formatPrice(15000000, "rent_home"), "₹1.5 Cr/month");

  assert.equal(formatPrice(90000, "rent_home", { period: "total" }), "₹90,000");
  assert.equal(formatPrice(150000, "rent_home", { period: "total" }), "₹1.5 Lakh");
  assert.equal(formatPrice(25000000, "buy_home"), "₹2.5 Cr");
  assert.equal(formatPrice(0, "rent_home"), "₹0/month");
  assert.equal(formatPrice(0, "rent_home", { period: "total" }), "₹0");
});

test("location search utils: matches Jaipur localities and common spelling variations", () => {
  assert.ok(expandLocationSearchVariants("mansarowar").includes("mansarovar"));
  assert.ok(expandLocationSearchVariants("Malavia Nagar").includes("malviya nagar"));
  assert.ok(expandLocationSearchVariants("vashali").includes("vaishali nagar"));
  assert.ok(expandLocationSearchVariants("C Scheme").includes("c-scheme"));

  const mansarovarSuggestions = filterLocationSuggestions("mansarowar", [], []);
  assert.ok(mansarovarSuggestions.includes("Mansarovar, Jaipur"));

  const vaishaliSuggestions = filterLocationSuggestions("vaishalinagar", [], []);
  assert.ok(vaishaliSuggestions.includes("Vaishali Nagar, Jaipur"));

  const jagatpuraSuggestions = filterLocationSuggestions("jagtpur", [], []);
  assert.ok(jagatpuraSuggestions.includes("Jagatpura, Jaipur"));

  const rajaparkSuggestions = filterLocationSuggestions("rajapark", [], []);
  assert.ok(rajaparkSuggestions.includes("Raja Park, Jaipur"));
});

test("search integration: Jaipur spelling variation query + propertyType filter + locations API", async () => {
  const uniqueEmail = `jaipur-search-test-${Date.now()}@example.com`;
  let createdOwnerId: string | null = null;
  let createdPropertyId: string | null = null;

  try {
    const [owner] = await db
      .insert(users)
      .values({
        name: "Jaipur Test Owner",
        email: uniqueEmail,
        phone: "9876501234",
        role: "owner",
        passwordHash: "not-used",
        consentAt: new Date(),
      })
      .returning();
    createdOwnerId = owner.id;

    const uniqueTitle = `Sunlit Test Residence ${Date.now()}`;
    const [prop] = await db
      .insert(properties)
      .values({
        ownerId: owner.id,
        category: "rent_home",
        propertyType: "Apartment",
        title: uniqueTitle,
        description: "Spacious home near Mansarovar Metro Station with cross ventilation.",
        price: 28000,
        priceType: "fixed",
        deposit: 125000,
        city: "Jaipur",
        locality: "Mansarovar",
        pinCode: "302020",
        landmark: "Metro Pillar 42",
        address: "Private Road 4, Sector 5",
        bhkOrRoomType: "2 BHK",
        areaSqft: 1150,
        bathrooms: 2,
        floor: "3rd of 5 floors",
        furnishingStatus: "Semi-furnished",
        availableFrom: "2026-12-01",
        ownerName: owner.name,
        ownerPhone: owner.phone!,
        amenities: ["Parking", "Lift"],
        images: ["https://example.com/test-jaipur.webp"],
        status: "live",
        verified: true,
      })
      .returning();
    createdPropertyId = prop.id;

    // 1. /api/locations matches Jaipur locality even with misspelled query
    const locRes = await callGet("locations?q=mansarowar");
    assert.equal(locRes.status, 200);
    const locJson = await locRes.json();
    assert.ok(
      Array.isArray(locJson.suggestions) &&
        locJson.suggestions.some((s: string) => s.toLowerCase().includes("mansarovar"))
    );

    // 2. /api/properties?q=mansarowar matches Mansarovar listing
    const propRes = await callGet("properties?q=mansarowar");
    assert.equal(propRes.status, 200);
    const propJson = await propRes.json();
    assert.ok(propJson.items.some((item: { id: string }) => item.id === createdPropertyId));

    // 3. /api/properties preserves q alongside propertyType filter
    const matchTypeRes = await callGet("properties?q=mansarowar&propertyType=Apartment");
    assert.equal(matchTypeRes.status, 200);
    const matchTypeJson = await matchTypeRes.json();
    assert.ok(matchTypeJson.items.some((item: { id: string }) => item.id === createdPropertyId));

    const mismatchTypeRes = await callGet("properties?q=mansarowar&propertyType=Villa");
    assert.equal(mismatchTypeRes.status, 200);
    const mismatchTypeJson = await mismatchTypeRes.json();
    assert.equal(
      mismatchTypeJson.items.some((item: { id: string }) => item.id === createdPropertyId),
      false
    );

    // 4. Direct findProperties landmark + variant check
    const byLandmark = await findProperties({ q: "Metro Pillar 42" });
    assert.ok(byLandmark.items.some((item) => item.id === createdPropertyId));
  } finally {
    if (createdPropertyId) {
      await db.delete(properties).where(eq(properties.id, createdPropertyId));
    }
    if (createdOwnerId) {
      await db.delete(users).where(eq(users.id, createdOwnerId));
    }
  }
});

