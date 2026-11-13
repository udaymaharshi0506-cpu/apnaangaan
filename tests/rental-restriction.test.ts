import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/db";
import { properties, users } from "../src/db/schema";
import { dispatch } from "../src/lib/api-handler";
import { validateVerticalRules } from "../src/lib/listing-validation";
import { findProperties, getProperty } from "../src/lib/queries";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (cookie) headers.set("Cookie", cookie);
  const request = new NextRequest(`http://localhost:3000/api/${route}`, {
    method,
    headers,
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
  return dispatch(request, method, { params: Promise.resolve({ segments: route.split("?")[0].split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

test("rental restriction: validateVerticalRules rejects non-rental categories, transaction types, and property types", () => {
  const validRental = {
    category: "rent_home",
    propertyType: "Apartment",
    bhkOrRoomType: "2 BHK",
    price: 32000,
    areaSqft: 1100,
    deposit: 64000,
    pinCode: "302020",
    images: ["https://example.com/photo.webp"],
  };

  assert.equal(validateVerticalRules(validRental), null);

  // Reject Buy, PG, and Commercial categories
  assert.ok(validateVerticalRules({ ...validRental, category: "buy_home" }));
  assert.ok(validateVerticalRules({ ...validRental, category: "buy" }));
  assert.ok(validateVerticalRules({ ...validRental, category: "rent_pg" }));
  assert.ok(validateVerticalRules({ ...validRental, category: "pg" }));
  assert.ok(validateVerticalRules({ ...validRental, category: "rent_commercial" }));
  assert.ok(validateVerticalRules({ ...validRental, category: "commercial" }));

  // Reject non-rent transaction types
  assert.ok(validateVerticalRules({ ...validRental, transactionType: "buy" }));
  assert.ok(validateVerticalRules({ ...validRental, transactionType: "sale" }));
  assert.ok(validateVerticalRules({ ...validRental, transactionType: "purchase" }));

  // Reject Commercial and PG property types
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "Shop" }));
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "Office" }));
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "Retail" }));
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "Commercial Space" }));
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "PG / Hostel" }));
  assert.ok(validateVerticalRules({ ...validRental, propertyType: "Warehouse" }));
});

test("API: rejects queries and payloads attempting Buy, PG, or Commercial listings", async () => {
  // 1. Query rejection (GET /api/properties)
  assert.equal((await call("properties?category=buy_home")).status, 422);
  assert.equal((await call("properties?category=buy")).status, 422);
  assert.equal((await call("properties?category=rent_pg")).status, 422);
  assert.equal((await call("properties?category=pg")).status, 422);
  assert.equal((await call("properties?category=rent_commercial")).status, 422);
  assert.equal((await call("properties?category=commercial")).status, 422);
  assert.equal((await call("properties?transactionType=buy")).status, 422);
  assert.equal((await call("properties?propertyType=Shop")).status, 422);
  assert.equal((await call("properties?propertyType=PG")).status, 422);
  assert.equal((await call("properties?propertyType=Commercial+Space")).status, 422);

  // Valid rental queries succeed (200)
  assert.equal((await call("properties")).status, 200);
  assert.equal((await call("properties?category=rent_home")).status, 200);
  assert.equal((await call("properties?transactionType=rent")).status, 200);
  assert.equal((await call("properties?propertyType=Apartment")).status, 200);
  assert.equal((await call("properties?propertyType=Villa")).status, 200);

  // 2. Payload rejection on create/draft (POST /api/properties)
  const testPhone = "+919866333001";
  let ownerId: string | null = null;
  let createdPropId: string | null = null;

  try {
    await call("auth/otp/request", "POST", { phone: testPhone });
    const verifyRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
    assert.equal(verifyRes.status, 200);
    const ownerCookie = cookieFrom(verifyRes, "aangan_access");
    ownerId = (await verifyRes.json()).user.id;

    await call("profile", "PATCH", { name: "Test Rental Owner", addOwnerRole: true, consent: true }, ownerCookie);

    const baseListing = {
      propertyType: "Apartment",
      price: 28000,
      address: "Plot 12, Vaishali Marg",
      city: "Jaipur",
      locality: "Vaishali Nagar",
      pinCode: "302021",
      bhkOrRoomType: "2 BHK",
      areaSqft: 1100,
      images: ["https://example.com/home1.webp"],
    };

    // Attempting to create Buy listing rejected
    const buyCreate = await call("properties", "POST", { ...baseListing, category: "buy_home" }, ownerCookie);
    assert.equal(buyCreate.status, 422);

    // Attempting to create Commercial listing rejected
    const commCreate = await call("properties", "POST", { ...baseListing, category: "rent_commercial", propertyType: "Shop" }, ownerCookie);
    assert.equal(commCreate.status, 422);

    // Attempting to create PG listing rejected
    const pgCreate = await call("properties", "POST", { ...baseListing, category: "rent_pg", propertyType: "PG" }, ownerCookie);
    assert.equal(pgCreate.status, 422);

    // Attempting transactionType: "buy" rejected
    const buyTxCreate = await call("properties", "POST", { ...baseListing, transactionType: "buy" }, ownerCookie);
    assert.equal(buyTxCreate.status, 422);

    // Attempting commercial propertyType rejected
    const shopCreate = await call("properties", "POST", { ...baseListing, propertyType: "Shop" }, ownerCookie);
    assert.equal(shopCreate.status, 422);

    // Valid residential home rental succeeds
    const validCreate = await call("properties", "POST", { ...baseListing, category: "rent_home" }, ownerCookie);
    assert.equal(validCreate.status, 201);
    const validJson = await validCreate.json();
    createdPropId = validJson.property.id;
    assert.equal(validJson.property.category, "rent_home");

    // Attempting to PATCH property to Buy or Commercial rejected
    const patchBuy = await call(`properties/${createdPropId}`, "PATCH", { category: "buy_home" }, ownerCookie);
    assert.equal(patchBuy.status, 422);

    const patchShop = await call(`properties/${createdPropId}`, "PATCH", { propertyType: "Office" }, ownerCookie);
    assert.equal(patchShop.status, 422);
  } finally {
    if (createdPropId) {
      await db.delete(properties).where(eq(properties.id, createdPropId));
    }
    if (ownerId) {
      await db.delete(users).where(eq(users.id, ownerId));
    }
  }
});

