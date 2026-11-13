import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/db";
import { notifications, properties, users } from "../src/db/schema";
import { dispatch } from "../src/lib/api-handler";
import { detectContactInfo } from "../src/lib/contact-filter";
import {
  containsDevanagari,
  extractIndianPhoneDigits,
  normalizeWhitespace,
  parseIndianPhone,
  parseIndianPinCode,
} from "../src/lib/input-validation";
import { validateVerticalRules } from "../src/lib/listing-validation";
import { ApiError, apiFetch, isNetworkDropError } from "../src/components/providers";

async function call(route: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined) headers.set("Content-Type", "application/json");
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
  assert.ok(cookie?.value, `Expected ${name} cookie`);
  return `${name}=${cookie.value}`;
}

test("input-validation: trims whitespace-only strings and preserves Hindi/Devanagari text cleanly", () => {
  assert.equal(normalizeWhitespace("   \t\n\u00A0\u200B  "), "");
  assert.equal(normalizeWhitespace("  मानसरोवर, जयपुर  "), "मानसरोवर, जयपुर");
  assert.equal(containsDevanagari("मानसरोवर, जयपुर"), true);
  assert.equal(containsDevanagari("Mansarovar, Jaipur"), false);

  // Decomposed Devanagari nukta (NFD) normalizes canonically to NFC
  const nfdHindi = "\u0915\u093C\u092E\u0930\u093E";
  assert.equal(normalizeWhitespace(`  ${nfdHindi}  `), nfdHindi.normalize("NFC"));

  // Contact filter permits clean Hindi property text while blocking embedded numbers
  assert.deepEqual(detectContactInfo("मानसरोवर मेट्रो स्टेशन के पास सुंदर 2 BHK फ्लैट"), { blocked: false });
  assert.equal(detectContactInfo("संपर्क करें 9876543210").blocked, true);
});

test("input-validation: validates Indian phone numbers (+91 / 10 digits) and 6-digit PIN codes (302xxx)", () => {
  assert.equal(extractIndianPhoneDigits("+91 98765 43210"), "9876543210");
  assert.equal(extractIndianPhoneDigits("919876543210"), "9876543210");
  assert.equal(extractIndianPhoneDigits("09876543210"), "9876543210");

  assert.deepEqual(parseIndianPhone("+91 98765-43210"), { valid: true, digits: "9876543210", e164: "+919876543210" });
  assert.deepEqual(parseIndianPhone("+919876543210"), { valid: true, digits: "9876543210", e164: "+919876543210" });
  assert.deepEqual(parseIndianPhone("9876543210"), { valid: true, digits: "9876543210", e164: "+919876543210" });
  assert.equal(parseIndianPhone("5876543210").valid, false);
  assert.equal(parseIndianPhone("+1 9876543210").valid, false);
  assert.equal(parseIndianPhone("98765").valid, false);

  assert.deepEqual(parseIndianPinCode("302020"), { valid: true, value: "302020" });
  assert.deepEqual(parseIndianPinCode(" 302 001 "), { valid: true, value: "302001" });
  assert.equal(parseIndianPinCode("000000").valid, false);
  assert.equal(parseIndianPinCode("30202").valid, false);
  assert.equal(parseIndianPinCode("3020201").valid, false);
  assert.equal(parseIndianPinCode("30202A").valid, false);

  const invalidPinErr = validateVerticalRules({
    category: "rent_home",
    propertyType: "Apartment",
    bhkOrRoomType: "2 BHK",
    price: 25000,
    areaSqft: 950,
    pinCode: "000000",
  });
  assert.ok(invalidPinErr && invalidPinErr.includes("PIN code"));
});

test("apiFetch: handles mid-submit & mid-upload network drops with clear retry errors and no duplicate POSTs", async () => {
  const originalFetch = globalThis.fetch;
  let postAttempts = 0;

  try {
    // 1. Mid-submit JSON POST failure does NOT silently duplicate; throws retryable ApiError
    globalThis.fetch = async () => {
      postAttempts += 1;
      throw new TypeError("Failed to fetch");
    };

    await assert.rejects(
      () => apiFetch("/api/properties", { method: "POST", body: JSON.stringify({ title: "Test" }) }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(isNetworkDropError(err), true);
        assert.match(err.message, /Retry/i);
        return true;
      }
    );
    assert.equal(postAttempts, 1, "Non-idempotent POST must not silently double-fire on mid-flight network drop");

    // 2. Upload FormData failure shows upload-specific retry message after safe retry
    let uploadAttempts = 0;
    globalThis.fetch = async () => {
      uploadAttempts += 1;
      throw new TypeError("NetworkError");
    };
    const fd = new FormData();
    fd.append("file", new Blob(["abc"], { type: "image/webp" }), "test.webp");
    await assert.rejects(
      () => apiFetch("/api/uploads", { method: "POST", body: fd }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(isNetworkDropError(err), true);
        assert.match(err.message, /upload/i);
        assert.match(err.message, /Retry/i);
        return true;
      }
    );
    assert.equal(uploadAttempts, 2, "Safe upload retry attempts once before surfacing explicit Retry prompt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API validation: enforces trimmed whitespace, Hindi/Devanagari inputs, +91 phone, and 302xxx PIN codes", async () => {
  const phone = "+919866444001";
  let createdUserId: string | null = null;
  let createdPropId: string | null = null;

  try {
    await call("auth/otp/request", "POST", { phone });
    const verifyRes = await call("auth/otp/verify", "POST", { phone, code: "123456" });
    assert.equal(verifyRes.status, 200);
    const cookie = cookieFrom(verifyRes, "aangan_access");
    createdUserId = (await verifyRes.json()).user.id;

    // 1. Whitespace-only name rejected
    const wsProfileRes = await call("profile", "PATCH", { name: "   \t  ", city: "जयपुर" }, cookie);
    assert.equal(wsProfileRes.status, 422);

    // 2. Valid Hindi/Devanagari name & city + "+91 9866444001" accepted cleanly
    const hindiProfileRes = await call(
      "profile",
      "PATCH",
      {
        name: "  राजेश शर्मा  ",
        city: "  जयपुर  ",
        location: " मानसरोवर, जयपुर ",
        role: "owner",
        consent: true,
      },
      cookie
    );
    assert.equal(hindiProfileRes.status, 200);
    const updatedUser = (await hindiProfileRes.json()).user;
    assert.equal(updatedUser.name, "राजेश शर्मा");
    assert.equal(updatedUser.city, "मानसरोवर, जयपुर");

    // 3. Invalid PIN code ("000000") and invalid ownerPhone rejected
    const badPinRes = await call(
      "properties",
      "POST",
      {
        category: "rent_home",
        propertyType: "Apartment",
        price: 22000,
        address: "सेक्टर 5, मानसरोवर",
        city: "जयपुर",
        locality: "मानसरोवर",
        pinCode: "000000",
        bhkOrRoomType: "2 BHK",
        areaSqft: 1050,
        images: ["https://example.com/photo1.webp"],
      },
      cookie
    );
    assert.equal(badPinRes.status, 422);

    // 4. Valid Hindi address/locality + Jaipur 302020 PIN + "+91 98664 44001" succeeds
    const okPropRes = await call(
      "properties",
      "POST",
      {
        category: "rent_home",
        propertyType: "Apartment",
        price: 22000,
        address: "  सेक्टर 5, मध्यम मार्ग  ",
        city: "  जयपुर  ",
        locality: "  मानसरोवर  ",
        landmark: "  मेट्रो स्टेशन के पास  ",
        pinCode: "302 020",
        ownerName: "  राजेश शर्मा  ",
        ownerPhone: "+91 98664 44001",
        bhkOrRoomType: "2 BHK",
        areaSqft: 1050,
        images: ["https://example.com/photo1.webp"],
      },
      cookie
    );
    assert.equal(okPropRes.status, 201);
    const propJson = await okPropRes.json();
    createdPropId = propJson.property.id;
    assert.equal(propJson.property.pinCode, "302020");
    assert.equal(propJson.property.city, "जयपुर");
    assert.equal(propJson.property.locality, "मानसरोवर");
  } finally {
    if (createdPropId) {
      await db.delete(properties).where(eq(properties.id, createdPropId));
    }
    if (createdUserId) {
      await db.delete(notifications).where(eq(notifications.userId, createdUserId));
      await db.delete(users).where(eq(users.id, createdUserId));
    }
  }
});

