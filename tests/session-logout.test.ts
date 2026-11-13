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
  assert.ok(cookie?.value, `Expected ${name} cookie`);
  return `${name}=${cookie.value}`;
}

test("Session & logout: logout revokes access and refresh tokens server-side, clears cookies, and sets no-store headers", async () => {
  const phone = "+919876543288";
  const email = "session.tester@example.com";

  await call("auth/otp/request", "POST", { phone });
  const verifyRes = await call("auth/otp/verify", "POST", { phone, code: "123456" });
  assert.equal(verifyRes.status, 200);

  const initialAccessCookie = cookieFrom(verifyRes, "aangan_access");
  const profilePatch = await call(
    "profile",
    "PATCH",
    { name: "Session Tester", email, location: "Bengaluru", addOwnerRole: false, consent: true },
    initialAccessCookie,
  );
  assert.equal(profilePatch.status, 200);
  const accessCookie = cookieFrom(profilePatch, "aangan_access");
  const refreshCookie = cookieFrom(profilePatch, "aangan_refresh");

  // 1. Authenticated access works and carries Cache-Control: no-store
  const meBefore = await call("auth/me", "GET", undefined, accessCookie);
  assert.equal(meBefore.status, 200);
  assert.match(meBefore.headers.get("cache-control") || "", /no-store/);
  const meBeforeData = await meBefore.json();
  assert.equal(meBeforeData.user?.email, email);

  const profileBefore = await call("profile", "GET", undefined, accessCookie);
  assert.equal(profileBefore.status, 200);
  assert.match(profileBefore.headers.get("cache-control") || "", /no-store/);

  // 2. Logout with access + refresh cookies invalidates the session server-side and expires cookies
  const logoutRes = await call("auth/logout", "POST", undefined, `${accessCookie}; ${refreshCookie}`);
  assert.equal(logoutRes.status, 200);
  assert.match(logoutRes.headers.get("cache-control") || "", /no-store/);
  assert.equal(logoutRes.headers.get("pragma"), "no-cache");
  assert.equal(logoutRes.cookies.get("aangan_access")?.value, "");
  assert.equal(logoutRes.cookies.get("aangan_refresh")?.value, "");

  // 3. Replaying the exact logged-out access cookie must be rejected server-side
  const meAfter = await call("auth/me", "GET", undefined, accessCookie);
  assert.equal(meAfter.status, 200);
  assert.equal((await meAfter.json()).user, null);

  const profileAfter = await call("profile", "GET", undefined, accessCookie);
  assert.equal(profileAfter.status, 401);

  const leadsAfter = await call("customer/leads", "GET", undefined, accessCookie);
  assert.equal(leadsAfter.status, 401);

  // 4. Replaying the exact logged-out refresh cookie must fail with 401
  const refreshAfter = await call("auth/refresh", "POST", undefined, refreshCookie);
  assert.equal(refreshAfter.status, 401);

  // 5. Logout with ONLY the access cookie (no refresh cookie) also revokes the session server-side
  const loginRes = await call("auth/login", "POST", { email });
  assert.equal(loginRes.status, 200);
  const secondAccess = cookieFrom(loginRes, "aangan_access");
  const secondRefresh = cookieFrom(loginRes, "aangan_refresh");

  const accessOnlyLogout = await call("auth/logout", "POST", undefined, secondAccess);
  assert.equal(accessOnlyLogout.status, 200);
  assert.equal((await call("profile", "GET", undefined, secondAccess)).status, 401);
  assert.equal((await call("auth/refresh", "POST", undefined, secondRefresh)).status, 401);

  const { pool } = await import("../src/db/index");
  await pool.query("DELETE FROM users WHERE phone = $1 OR email = $2;", [phone, email]);
  await pool.end();
});

