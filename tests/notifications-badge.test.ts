import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "../src/lib/api-handler";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
async function call(route: string, method: Method = "GET", input?: unknown, cookie?: string) {
  const headers = new Headers();
  if (input !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  const [pathname] = route.split("?");
  const request = new NextRequest(`http://localhost:3000/api/${route}`, { method, headers, ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
  return dispatch(request, method, { params: Promise.resolve({ segments: pathname.split("/") }) });
}
function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

test("Notifications badge: creates notifications on events, returns accurate unread count, and supports read/read-all", async () => {
  const testPhone = "+919876543233";
  const testName = "Test Notif User";

  // 1. Authenticate user via OTP
  await call("auth/otp/request", "POST", { phone: testPhone });
  const verifyRes = await call("auth/otp/verify", "POST", { phone: testPhone, code: "123456" });
  assert.equal(verifyRes.status, 200);
  const userCookie = cookieFrom(verifyRes, "aangan_access");
  await call("profile", "PATCH", { name: testName, consent: true, location: "Indiranagar, Bengaluru", city: "Bengaluru" }, userCookie);

  // 2. Fetch notifications initially
  const initialRes = await call("notifications", "GET", undefined, userCookie);
  assert.equal(initialRes.status, 200);
  const initialData = await initialRes.json() as { items: Array<{ id: string; isRead: boolean }>; unread: number };
  assert.ok(typeof initialData.unread === "number");

  // 3. Mark all read to ensure a known baseline
  await call("notifications/read-all", "PATCH", undefined, userCookie);
  const baselineRes = await call("notifications", "GET", undefined, userCookie);
  const baselineData = await baselineRes.json() as { items: Array<{ id: string; isRead: boolean }>; unread: number };
  assert.equal(baselineData.unread, 0);

  // 4. Express interest on a live property to generate notification
  const searchRes = await call("properties?category=rent_home&limit=1", "GET");
  const searchData = await searchRes.json() as { items: Array<{ id: string; title: string }> };
  if (searchData.items.length > 0) {
    const propertyId = searchData.items[0].id;
    const inquiryRes = await call(`properties/${propertyId}/inquiries`, "POST", {
      message: "I am interested in this home",
      tenantType: "family",
      timeframe: "within_15_days",
    }, userCookie);
    assert.equal(inquiryRes.status, 201);

    // 5. Verify unread count has incremented for the bell badge
    const afterInquiryRes = await call("notifications", "GET", undefined, userCookie);
    const afterInquiryData = await afterInquiryRes.json() as { items: Array<{ id: string; isRead: boolean; message: string }>; unread: number };
    assert.ok(afterInquiryData.unread >= 1, "Unread count should be at least 1 after inquiry");
    assert.ok(afterInquiryData.items.length >= 1, "Should have at least 1 notification item");
    const unreadItem = afterInquiryData.items.find((n) => !n.isRead);
    assert.ok(unreadItem, "Should find unread notification item");

    // 6. Mark single notification as read
    const markSingleRes = await call(`notifications/${unreadItem.id}`, "PATCH", undefined, userCookie);
    assert.equal(markSingleRes.status, 200);

    // 7. Verify unread count decremented
    const afterMarkRes = await call("notifications", "GET", undefined, userCookie);
    const afterMarkData = await afterMarkRes.json() as { items: Array<{ id: string; isRead: boolean }>; unread: number };
    assert.equal(afterMarkData.unread, afterInquiryData.unread - 1, "Unread count should decrement by 1");

    // 8. Test mark all read
    const markAllRes = await call("notifications/read-all", "PATCH", undefined, userCookie);
    assert.equal(markAllRes.status, 200);
    const finalRes = await call("notifications", "GET", undefined, userCookie);
    const finalData = await finalRes.json() as { items: Array<{ id: string; isRead: boolean }>; unread: number };
    assert.equal(finalData.unread, 0, "Unread count should be 0 after read-all");
  }

  const { pool } = await import("../src/db/index");
  await pool.query("DELETE FROM users WHERE phone = '+919876543233';");
  await pool.end();
});
