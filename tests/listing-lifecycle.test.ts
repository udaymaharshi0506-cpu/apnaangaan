import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/db";
import { notifications, properties, uploadedImages, users } from "../src/db/schema";
import { dispatch } from "../src/lib/api-handler";
import {
  detectImageFormatFromBytes,
  getCanvasTransformForExif,
  MAX_IMAGE_FILE_BYTES,
  readJpegExifOrientation,
  validateImageUploadBytes,
} from "../src/lib/image-validation";
import { validateVerticalRules } from "../src/lib/listing-validation";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from "../src/lib/seed";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined && !(input instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (cookie) headers.set("Cookie", cookie);
  const request = new NextRequest(`http://localhost:3000/api/${route}`, {
    method,
    headers,
    ...(input !== undefined
      ? { body: input instanceof FormData ? input : JSON.stringify(input) }
      : {}),
  });
  return dispatch(request, method, { params: Promise.resolve({ segments: route.split("?")[0].split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

test("listing validation: enforces bounds, integer-only values, valid BHK/types, and floor coherence", () => {
  const validBase = {
    category: "rent_home",
    propertyType: "Apartment",
    bhkOrRoomType: "2 BHK",
    price: 35000,
    areaSqft: 1150,
    deposit: 70000,
    bathrooms: 2,
    floor: "3",
    totalFloors: 6,
    pinCode: "560034",
    images: ["https://example.com/1.webp"],
  };
  assert.equal(validateVerticalRules(validBase), null);

  // Reject negative, zero, decimal, and absurd prices
  assert.ok(validateVerticalRules({ ...validBase, price: 0 }));
  assert.ok(validateVerticalRules({ ...validBase, price: -25000 }));
  assert.ok(validateVerticalRules({ ...validBase, price: 25000.75 }));
  assert.ok(validateVerticalRules({ ...validBase, price: 999_999_999 }));

  // Reject bad area & decimals
  assert.ok(validateVerticalRules({ ...validBase, areaSqft: 0 }));
  assert.ok(validateVerticalRules({ ...validBase, areaSqft: -500 }));
  assert.ok(validateVerticalRules({ ...validBase, areaSqft: 1100.5 }));
  assert.ok(validateVerticalRules({ ...validBase, areaSqft: 500_000 }));

  // Reject invalid BHK & property type
  assert.ok(validateVerticalRules({ ...validBase, bhkOrRoomType: "12 BHK" }));
  assert.ok(validateVerticalRules({ ...validBase, bhkOrRoomType: "1.5 BHK" }));
  assert.ok(validateVerticalRules({ ...validBase, propertyType: "Warehouse" }));

  // Reject floor > totalFloors & >15 images
  assert.ok(validateVerticalRules({ ...validBase, floor: "10", totalFloors: 5 }));
  assert.ok(validateVerticalRules({ ...validBase, maintenanceStatus: "separate", maintenanceAmount: 0 }));
  assert.ok(validateVerticalRules({ ...validBase, images: Array.from({ length: 16 }, (_, i) => `https://example.com/${i}.webp`) }));
});

test("image validation: verifies magic bytes, blocks spoofed .txt/.exe, and parses EXIF orientation", () => {
  // Valid headers
  const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const webpBytes = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

  assert.equal(detectImageFormatFromBytes(jpegBytes)?.mime, "image/jpeg");
  assert.equal(detectImageFormatFromBytes(pngBytes)?.mime, "image/png");
  assert.equal(detectImageFormatFromBytes(webpBytes)?.mime, "image/webp");

  // Renamed .txt, PE .exe, SVG script, and oversized payloads must fail
  const fakeTxtAsJpg = new TextEncoder().encode("This is actually plain text disguised as JPG.");
  const fakeExeAsJpg = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0, 0, 0]);
  const fakeSvgAsPng = new TextEncoder().encode("<svg onload=alert(1)></svg>");

  assert.equal(validateImageUploadBytes(fakeTxtAsJpg).valid, false);
  assert.equal(validateImageUploadBytes(fakeExeAsJpg).valid, false);
  assert.equal(validateImageUploadBytes(fakeSvgAsPng).valid, false);
  assert.equal(validateImageUploadBytes(webpBytes, MAX_IMAGE_FILE_BYTES + 1).valid, false);

  // Synthetic JPEG with APP1 EXIF IFD0 tag 0x0112 = Orientation 6 (90° CW mobile portrait)
  const exifJpeg = Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, 0x00, 0x1e, // APP1 length = 30 (2 length bytes + 6 Exif\0\0 + 8 TIFF header + 14 IFD0)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, // Big-endian "MM"
    0x00, 0x2a, // TIFF magic 42
    0x00, 0x00, 0x00, 0x08, // IFD0 offset = 8
    0x00, 0x01, // 1 entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation = 6
  ]);
  assert.equal(readJpegExifOrientation(exifJpeg), 6);
  const rotated = getCanvasTransformForExif(6, 1200, 800);
  assert.equal(rotated.canvasWidth, 800);
  assert.equal(rotated.canvasHeight, 1200);
});

test("e2e listing lifecycle: upload magic-byte rejection, draft/edit/pause/reactivate/delete, and search sync", async () => {
  const ownerPhone = "+919866222001";
  const createdUploadIds: string[] = [];
  const createdPropIds: string[] = [];

  try {
    await call("auth/otp/request", "POST", { phone: ownerPhone });
    const verifyOwner = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
    const ownerCookie = cookieFrom(verifyOwner, "aangan_access");
    await call("profile", "PATCH", { name: "Lifecycle Owner", email: "lifecycle-owner@example.com", addOwnerRole: true, consent: true }, ownerCookie);

    // Admin auth
    const adminStep1 = await call("admin/login", "POST", { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });
    const adminVerify = await call("admin/2fa", "POST", { code: "000000" }, cookieFrom(adminStep1, "aangan_admin_challenge"));
    const adminCookie = cookieFrom(adminVerify, "aangan_access");

    // 1. Server upload rejects .txt/.exe renamed to .jpg
    const spoofedForm = new FormData();
    spoofedForm.append("file", new Blob([new TextEncoder().encode("MZ\x90\x00not_an_image_payload")], { type: "image/jpeg" }), "virus.jpg");
    const spoofedUpload = await call("uploads", "POST", spoofedForm, ownerCookie);
    assert.equal(spoofedUpload.status, 422);

    // Server upload enforces 15 max image count
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const maxCountForm = new FormData();
    maxCountForm.append("file", new Blob([Buffer.from(pngBase64, "base64")], { type: "image/png" }), "photo.png");
    maxCountForm.append("existingCount", "15");
    const maxCountRes = await call("uploads", "POST", maxCountForm, ownerCookie);
    assert.equal(maxCountRes.status, 422);

    // Genuine WebP upload succeeds and stores verified image/webp
    const webpBuf = Buffer.from("524946461a000000574542505650384c0d0000002f00000010071011118888fe0700", "hex");
    const validUploadForm = new FormData();
    validUploadForm.append("file", new Blob([webpBuf], { type: "image/jpeg" }), "misnamed.jpg"); // Even with wrong Content-Type/ext, magic bytes identify WebP!
    const validUploadRes = await call("uploads", "POST", validUploadForm, ownerCookie);
    assert.equal(validUploadRes.status, 201);
    const uploadedData = await validUploadRes.json();
    assert.equal(uploadedData.mime, "image/webp");
    assert.ok(uploadedData.url.endsWith(".webp"));
    const uploadMatch = String(uploadedData.url).match(/\/api\/uploads\/([a-f0-9-]{36})\./);
    if (uploadMatch) createdUploadIds.push(uploadMatch[1]);

    // 2. Reject invalid numeric bounds on listing creation
    const invalidProp = await call(
      "properties",
      "POST",
      {
        category: "rent_home",
        propertyType: "Apartment",
        price: 35000.5, // decimal blocked
        address: "10 Garden Street",
        city: "Bengaluru",
        locality: "Jayanagar",
        bhkOrRoomType: "2 BHK",
        areaSqft: 1000,
        images: [uploadedData.url],
      },
      ownerCookie
    );
    assert.equal(invalidProp.status, 422);

    // 3. Save Draft -> hidden from public search & admin queue
    const draftRes = await call(
      "properties",
      "POST",
      {
        status: "draft",
        category: "rent_home",
        propertyType: "Apartment",
        city: "Bengaluru",
        locality: "Jayanagar",
        bhkOrRoomType: "2 BHK",
        price: 34000,
        images: [uploadedData.url],
      },
      ownerCookie
    );
    assert.equal(draftRes.status, 201);
    const { property: draftProp, status: draftStatus } = await draftRes.json();
    assert.equal(draftStatus, "draft");
    createdPropIds.push(draftProp.id);

    // Draft hidden from public & admin moderation
    assert.equal((await call(`properties/${draftProp.id}`)).status, 404);
    const adminPropsData = await (await call("admin/properties?status=all", "GET", undefined, adminCookie)).json();
    assert.equal(adminPropsData.items.some((i: { id: string }) => i.id === draftProp.id), false);

    // Owner loads full editable draft via GET /api/owner/properties/:id
    const ownerEditFetch = await call(`owner/properties/${draftProp.id}`, "GET", undefined, ownerCookie);
    assert.equal(ownerEditFetch.status, 200);
    assert.equal((await ownerEditFetch.json()).property.status, "draft");

    // 4. Publish draft -> pending_review -> Admin approves -> Live in search
    const submitDraftRes = await call(
      `properties/${draftProp.id}`,
      "PATCH",
      {
        status: "pending_review",
        address: "10 Garden Street, Block 3",
        pinCode: "560011",
        landmark: "Near Jayanagar Metro",
        areaSqft: 1180,
        deposit: 70000,
      },
      ownerCookie
    );
    assert.equal(submitDraftRes.status, 200);
    assert.equal((await submitDraftRes.json()).status, "pending_review");

    const approveRes = await call(`admin/properties/${draftProp.id}/verify`, "PATCH", { action: "approve" }, adminCookie);
    assert.equal(approveRes.status, 200);
    assert.equal((await call(`properties/${draftProp.id}`)).status, 200);
    const searchLive = await (await call("properties?city=Bengaluru&limit=50")).json();
    assert.equal(searchLive.items.some((x: { id: string }) => x.id === draftProp.id), true);

    // 5. Pause listing -> immediately disappears from search & detail (404)
    const pauseRes = await call(`properties/${draftProp.id}`, "PATCH", { status: "paused" }, ownerCookie);
    assert.equal(pauseRes.status, 200);
    assert.equal((await pauseRes.json()).status, "paused");
    assert.equal((await call(`properties/${draftProp.id}`)).status, 404);
    const searchPaused = await (await call("properties?city=Bengaluru&limit=50")).json();
    assert.equal(searchPaused.items.some((x: { id: string }) => x.id === draftProp.id), false);

    // 6. Re-activate paused listing -> immediately visible in search again
    const reactivateRes = await call(`properties/${draftProp.id}`, "PATCH", { status: "live" }, ownerCookie);
    assert.equal(reactivateRes.status, 200);
    assert.equal((await reactivateRes.json()).status, "live");
    assert.equal((await call(`properties/${draftProp.id}`)).status, 200);

    // 7. Edit listing content (e.g. reorder/price change) -> returns to pending_review & hidden from search
    const editRes = await call(`properties/${draftProp.id}`, "PATCH", { price: 36000 }, ownerCookie);
    assert.equal(editRes.status, 200);
    assert.equal((await editRes.json()).status, "pending_review");
    assert.equal((await call(`properties/${draftProp.id}`)).status, 404);

    // 8. Delete listing -> permanently removed
    const deleteRes = await call(`properties/${draftProp.id}`, "DELETE", undefined, ownerCookie);
    assert.equal(deleteRes.status, 200);
    assert.equal((await call(`properties/${draftProp.id}`)).status, 404);
    assert.equal((await call(`owner/properties/${draftProp.id}`, "GET", undefined, ownerCookie)).status, 404);
  } finally {
    if (createdPropIds.length > 0) {
      await db.delete(properties).where(inArray(properties.id, createdPropIds));
    }
    if (createdUploadIds.length > 0) {
      await db.delete(uploadedImages).where(inArray(uploadedImages.id, createdUploadIds));
    }
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.phone, ownerPhone));
    if (u) {
      await db.delete(notifications).where(eq(notifications.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  }
});

