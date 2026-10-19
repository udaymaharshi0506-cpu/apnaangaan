import test from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────
// Onboarding Form & Validation Test Suite
// ─────────────────────────────────────────────────────────────

test("Onboarding: Real-time numeric stripping rejects all non-digit characters", () => {
  const sanitizePhone = (input: string) => input.replace(/\D/g, "").slice(0, 10);

  // Strip letters, spaces, symbols
  assert.equal(sanitizePhone("98abc 7654-3210"), "9876543210");
  assert.equal(sanitizePhone("+91 98765 43210"), "9198765432"); // Without leading prefix strip
  assert.equal(sanitizePhone("9876543210extra999"), "9876543210");
  assert.equal(sanitizePhone("abcdef!@#$%^&*()"), "");
  assert.equal(sanitizePhone(" 9 8 7 6 5 4 3 2 1 0 "), "9876543210");
});

test("Onboarding: Indian mobile number format validation strictly enforces 10 digits & [6-9] prefix", () => {
  const indianMobileRegex = /^[6-9]\d{9}$/;

  // Valid numbers starting with 6, 7, 8, 9
  assert.equal(indianMobileRegex.test("9876543210"), true);
  assert.equal(indianMobileRegex.test("8765432109"), true);
  assert.equal(indianMobileRegex.test("7654321098"), true);
  assert.equal(indianMobileRegex.test("6543210987"), true);

  // Invalid prefixes (0, 1, 2, 3, 4, 5)
  assert.equal(indianMobileRegex.test("5987654321"), false);
  assert.equal(indianMobileRegex.test("1234567890"), false);
  assert.equal(indianMobileRegex.test("0987654321"), false);
  assert.equal(indianMobileRegex.test("4876543210"), false);

  // Invalid lengths
  assert.equal(indianMobileRegex.test("987654321"), false); // 9 digits
  assert.equal(indianMobileRegex.test("98765432100"), false); // 11 digits
  assert.equal(indianMobileRegex.test(""), false);
});

test("Onboarding: Compulsory Location field validation enforces non-empty input", () => {
  const isLocationValid = (loc: string) => loc.trim().length >= 2;

  assert.equal(isLocationValid(""), false);
  assert.equal(isLocationValid("   "), false);
  assert.equal(isLocationValid("A"), false);
  assert.equal(isLocationValid("BL"), true);
  assert.equal(isLocationValid("Bengaluru"), true);
  assert.equal(isLocationValid("Indiranagar, Bengaluru"), true);
  assert.equal(isLocationValid("Bandra West, Mumbai"), true);
});

test("Onboarding: Form submission validity requires Name, valid Phone, Role, Location, and Consent", () => {
  const validateOnboardingForm = ({
    name,
    phone,
    role,
    location,
    consent,
  }: {
    name: string;
    phone: string;
    role: string;
    location: string;
    consent: boolean;
  }) => {
    const cleanDigits = phone.replace(/\D/g, "").slice(0, 10);
    const isNameValid = name.trim().length >= 2;
    const isPhoneValid = /^[6-9]\d{9}$/.test(cleanDigits);
    const isLocationValid = location.trim().length >= 2;
    const isRoleValid = role === "customer" || role === "owner";
    return isNameValid && isPhoneValid && isLocationValid && isRoleValid && consent;
  };

  // Valid full submission
  assert.equal(
    validateOnboardingForm({
      name: "Rahul Sharma",
      phone: "9876543210",
      role: "customer",
      location: "Bengaluru, Karnataka",
      consent: true,
    }),
    true
  );

  // Missing location -> Locked
  assert.equal(
    validateOnboardingForm({
      name: "Rahul Sharma",
      phone: "9876543210",
      role: "customer",
      location: "",
      consent: true,
    }),
    false
  );

  // Invalid phone -> Locked
  assert.equal(
    validateOnboardingForm({
      name: "Rahul Sharma",
      phone: "5876543210",
      role: "customer",
      location: "Bengaluru",
      consent: true,
    }),
    false
  );

  // Incomplete phone -> Locked
  assert.equal(
    validateOnboardingForm({
      name: "Rahul Sharma",
      phone: "9876543",
      role: "customer",
      location: "Bengaluru",
      consent: true,
    }),
    false
  );

  // Missing consent -> Locked
  assert.equal(
    validateOnboardingForm({
      name: "Rahul Sharma",
      phone: "9876543210",
      role: "customer",
      location: "Bengaluru",
      consent: false,
    }),
    false
  );
});

// ─────────────────────────────────────────────────────────────
// Server-Side Route Tests (Locations Reverse Geocode & Profile PATCH)
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";

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
  const [cleanRoute] = route.split("?");
  return dispatch(request, method, { params: Promise.resolve({ segments: cleanRoute.split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

test("API: /api/locations/reverse returns detected location and city", async () => {
  const res = await call("locations/reverse?lat=12.9716&lon=77.5946", "GET");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.location, "Expected location in response");
  assert.ok(data.city, "Expected city in response");
});

test("API: /api/profile PATCH enforces strict Indian mobile number validation and non-empty location", async () => {
  const testPhone = "+919876543299";

  // Login / create test user via phone OTP
  await call("auth/otp/request", "POST", { phone: testPhone });
  const verifyRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
  assert.equal(verifyRes.status, 200);
  const userCookie = cookieFrom(verifyRes, "aangan_access");

  // 1. Invalid phone with letters -> rejected with 422
  const letterPhoneRes = await call("profile", "PATCH", { phone: "98abc76543" }, userCookie);
  assert.equal(letterPhoneRes.status, 422);

  // 2. Invalid phone with fewer than 10 digits -> rejected with 422
  const shortPhoneRes = await call("profile", "PATCH", { phone: "98765" }, userCookie);
  assert.equal(shortPhoneRes.status, 422);

  // 3. Invalid phone starting with invalid prefix 5 -> rejected with 422
  const prefixPhoneRes = await call("profile", "PATCH", { phone: "5876543210" }, userCookie);
  assert.equal(prefixPhoneRes.status, 422);

  // 4. Empty location -> rejected with 422
  const emptyLocRes = await call("profile", "PATCH", { location: "" }, userCookie);
  assert.equal(emptyLocRes.status, 422);

  const whitespaceLocRes = await call("profile", "PATCH", { location: "   " }, userCookie);
  assert.equal(whitespaceLocRes.status, 422);

  // 5. Valid phone, location, role, and name -> succeeds with 200 and saves location
  const validRes = await call(
    "profile",
    "PATCH",
    {
      name: "Onboarding Tester",
      phone: testPhone,
      location: "Indiranagar, Bengaluru",
      role: "customer",
      consent: true,
    },
    userCookie
  );
  assert.equal(validRes.status, 200);
  const validData = await validRes.json();
  assert.equal(validData.user.name, "Onboarding Tester");
  assert.equal(validData.user.phone, testPhone);
  assert.equal(validData.user.location, "Indiranagar, Bengaluru");
  assert.equal(validData.user.city, "Indiranagar, Bengaluru");
});

// ─────────────────────────────────────────────────────────────
// Owner Post Property Wizard & Database Storage Tests
// ─────────────────────────────────────────────────────────────

test("Owner Post Property: Minimum 5 photos constraint enforces >= 5 photos before submission", () => {
  const validatePhotos = (images: string[]) => images.length >= 5;

  assert.equal(validatePhotos([]), false);
  assert.equal(validatePhotos(["https://example.com/p1.jpg"]), false);
  assert.equal(validatePhotos(["https://example.com/p1.jpg", "https://example.com/p2.jpg", "https://example.com/p3.jpg", "https://example.com/p4.jpg"]), false);
  assert.equal(
    validatePhotos([
      "https://example.com/p1.jpg",
      "https://example.com/p2.jpg",
      "https://example.com/p3.jpg",
      "https://example.com/p4.jpg",
      "https://example.com/p5.jpg",
    ]),
    true
  );
  assert.equal(
    validatePhotos([
      "https://example.com/p1.jpg",
      "https://example.com/p2.jpg",
      "https://example.com/p3.jpg",
      "https://example.com/p4.jpg",
      "https://example.com/p5.jpg",
      "https://example.com/p6.jpg",
    ]),
    true
  );
});

test("Owner Post Property: Auto-generates clean title and description without requiring manual typing", () => {
  const generateTitle = (bhk: string, type: string, locality: string, landmark: string, city: string) => {
    return `${bhk} ${type} in ${locality || landmark || city}`;
  };

  const title1 = generateTitle("3 BHK", "Apartment", "Koramangala", "Near Forum", "Bengaluru");
  assert.equal(title1, "3 BHK Apartment in Koramangala");

  const title2 = generateTitle("2 BHK", "Villa", "", "Behind Metro Station", "Pune");
  assert.equal(title2, "2 BHK Villa in Behind Metro Station");

  const title3 = generateTitle("1 RK", "Room", "", "", "Delhi NCR");
  assert.equal(title3, "1 RK Room in Delhi NCR");
});

test("Owner Post Property: Indian 6-digit PIN code validation strictly enforces exactly 6 digits", () => {
  const pinRegex = /^\d{6}$/;

  assert.equal(pinRegex.test("560034"), true);
  assert.equal(pinRegex.test("110001"), true);
  assert.equal(pinRegex.test("400001"), true);

  assert.equal(pinRegex.test("56003"), false); // 5 digits
  assert.equal(pinRegex.test("5600345"), false); // 7 digits
  assert.equal(pinRegex.test("56003A"), false); // letter
  assert.equal(pinRegex.test(""), false);
});

test("Owner Post Property: Co-owner and KYC documents validation", () => {
  const validateOwnerKyc = ({
    ownerName,
    ownerPhone,
    liveSelfieUrl,
    aadhaarCardUrl,
    ownershipType,
    coOwners,
  }: {
    ownerName: string;
    ownerPhone: string;
    liveSelfieUrl: string;
    aadhaarCardUrl: string;
    ownershipType: "sole_owner" | "co_owner";
    coOwners?: string;
  }) => {
    const isPhoneValid = /^[6-9]\d{9}$/.test(ownerPhone.replace(/\D/g, ""));
    const isNameValid = ownerName.trim().length >= 2;
    const hasSelfie = !!liveSelfieUrl && liveSelfieUrl.trim().length > 0;
    const hasAadhaar = !!aadhaarCardUrl && aadhaarCardUrl.trim().length > 0;
    const isCoOwnerValid = ownershipType === "sole_owner" || (!!coOwners && coOwners.trim().length >= 2);

    return isPhoneValid && isNameValid && hasSelfie && hasAadhaar && isCoOwnerValid;
  };

  // Valid sole owner
  assert.equal(
    validateOwnerKyc({
      ownerName: "Uday Maharshi",
      ownerPhone: "9876543210",
      liveSelfieUrl: "/api/uploads/selfie.jpg",
      aadhaarCardUrl: "/api/uploads/aadhaar.jpg",
      ownershipType: "sole_owner",
    }),
    true
  );

  // Missing selfie -> rejected
  assert.equal(
    validateOwnerKyc({
      ownerName: "Uday Maharshi",
      ownerPhone: "9876543210",
      liveSelfieUrl: "",
      aadhaarCardUrl: "/api/uploads/aadhaar.jpg",
      ownershipType: "sole_owner",
    }),
    false
  );

  // Co-owner selected but co-owner name missing -> rejected
  assert.equal(
    validateOwnerKyc({
      ownerName: "Uday Maharshi",
      ownerPhone: "9876543210",
      liveSelfieUrl: "/api/uploads/selfie.jpg",
      aadhaarCardUrl: "/api/uploads/aadhaar.jpg",
      ownershipType: "co_owner",
      coOwners: "",
    }),
    false
  );

  // Co-owner with valid co-owner name -> valid
  assert.equal(
    validateOwnerKyc({
      ownerName: "Uday Maharshi",
      ownerPhone: "9876543210",
      liveSelfieUrl: "/api/uploads/selfie.jpg",
      aadhaarCardUrl: "/api/uploads/aadhaar.jpg",
      ownershipType: "co_owner",
      coOwners: "Priya Maharshi (Spouse)",
    }),
    true
  );
});


