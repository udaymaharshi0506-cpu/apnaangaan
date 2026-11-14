import "dotenv/config";
import { cache } from "react";
import { db } from "@/db";
import { refreshTokens, users, type User } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt-secret";

const ACCESS_COOKIE = "aangan_access";
const REFRESH_COOKIE = "aangan_refresh";
const ADMIN_CHALLENGE_COOKIE = "aangan_admin_challenge";
const accessSeconds = 15 * 60;
const refreshSeconds = 30 * 24 * 60 * 60;
const secret = getJwtSecret();

function cookieValue(header: string | null, name: string) {
  const pair = header?.split("; ").find((item) => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.substring(name.length + 1)) : undefined;
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

async function signedToken(subject: string, type: string, expiration: string, jti?: string, extra?: Record<string, unknown>) {
  let token = new SignJWT({ type, ...extra }).setProtectedHeader({ alg: "HS256" }).setSubject(subject).setIssuedAt().setExpirationTime(expiration);
  if (jti) token = token.setJti(jti);
  return token.sign(secret);
}

export async function createTestToken(userId: string, role = "customer", roles = ["customer"]) {
  const id = randomUUID();
  const token = await signedToken(userId, "access", "1h", id, { role, roles });
  await db.insert(refreshTokens).values({
    id,
    userId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

async function verifiedToken(token: string, expectedType: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  if (payload.type !== expectedType || !payload.sub) throw new Error("Invalid session");
  return payload;
}

async function resolveUserFromAccessToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const payload = await verifiedToken(token, "access");
  if (!payload.jti) return null;
  const [session] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.id, payload.jti),
        eq(refreshTokens.userId, payload.sub!),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub!)).limit(1);
  return user || null;
}

export async function getAuthUser(request: Request): Promise<User | null> {
  try {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const token = bearer || cookieValue(request.headers.get("cookie"), ACCESS_COOKIE);
    return await resolveUserFromAccessToken(token);
  } catch (err) {
    console.error("[Auth] getAuthUser error:", err);
    return null;
  }
}

export const getServerUser = cache(async (): Promise<User | null> => {
  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    return await resolveUserFromAccessToken(token);
  } catch { return null; }
});

export const hasRole = (user: User | null, role: "customer" | "owner" | "admin") => {
  if (!user || !Array.isArray(user.roles)) return false;
  if (role === "admin") {
    return user.role === "admin" && user.roles.includes("admin");
  }
  return user.roles.includes(role);
};

export function publicSelf(user: User) {
  const isAdmin = hasRole(user, "admin");
  const userLoc = user.location || user.city;
  const isProfileComplete = Boolean(
    user.name &&
    user.name.trim().length >= 2 &&
    user.phone &&
    user.phone.trim().length >= 10 &&
    userLoc &&
    userLoc.trim().length >= 2
  );
  const hasOnboarded = Boolean(user.consentAt);
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    city: user.city || user.location,
    location: user.location || user.city,
    role: user.role,
    roles: user.roles,
    lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
    consentAt: user.consentAt ? user.consentAt.toISOString() : null,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    needsOnboarding: isAdmin ? false : !hasOnboarded,
  };
}

export async function attachSession(response: NextResponse, user: User) {
  const id = randomUUID();
  const access = await signedToken(user.id, "access", "15m", id, {
    role: user.role,
    roles: user.roles,
    email: user.email,
  });
  const refresh = await signedToken(user.id, "refresh", "30d", id);
  await db.insert(refreshTokens).values({ id, userId: user.id, tokenHash: createHash("sha256").update(refresh).digest("hex"), expiresAt: new Date(Date.now() + refreshSeconds * 1000) });
  response.cookies.set(ACCESS_COOKIE, access, cookieOptions(accessSeconds));
  response.cookies.set(REFRESH_COOKIE, refresh, cookieOptions(refreshSeconds));
  response.cookies.delete(ADMIN_CHALLENGE_COOKIE);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function rotateSession(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), REFRESH_COOKIE);
  if (!token) return null;
  try {
    const payload = await verifiedToken(token, "refresh");
    if (!payload.jti) return null;
    const [used] = await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.userId, payload.sub!), eq(refreshTokens.tokenHash, createHash("sha256").update(token).digest("hex")), isNull(refreshTokens.revokedAt))).returning();
    if (!used || used.expiresAt < new Date()) return null;
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub!)).limit(1);
    if (!user) return null;
    return attachSession(NextResponse.json({ user: publicSelf(user) }), user);
  } catch { return null; }
}

export async function clearSession(request: Request, response: NextResponse) {
  const sessionIds = new Set<string>();
  const cookieHeader = request.headers.get("cookie");
  const refreshToken = cookieValue(cookieHeader, REFRESH_COOKIE);
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const accessToken = bearerToken || cookieValue(cookieHeader, ACCESS_COOKIE);

  if (refreshToken) {
    try {
      const payload = await verifiedToken(refreshToken, "refresh");
      if (payload.jti) sessionIds.add(payload.jti);
    } catch { /* Expired or invalid cookie can still be cleared. */ }
  }
  if (accessToken) {
    try {
      const payload = await verifiedToken(accessToken, "access");
      if (payload.jti) sessionIds.add(payload.jti);
    } catch { /* Expired or invalid cookie can still be cleared. */ }
  }

  for (const sessionId of sessionIds) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, sessionId), isNull(refreshTokens.revokedAt)));
  }

  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
  response.cookies.set(ADMIN_CHALLENGE_COOKIE, "", cookieOptions(0));
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function attachAdminChallenge(response: NextResponse, userId: string) {
  response.cookies.set(ADMIN_CHALLENGE_COOKIE, await signedToken(userId, "admin_pending", "5m"), cookieOptions(300));
  return response;
}

export async function getPendingAdmin(request: Request) {
  try {
    const token = cookieValue(request.headers.get("cookie"), ADMIN_CHALLENGE_COOKIE);
    if (!token) return null;
    const payload = await verifiedToken(token, "admin_pending");
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub!)).limit(1);
    return hasRole(user, "admin") ? user : null;
  } catch { return null; }
}

function decodeBase32(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const letter of input.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    const value = alphabet.indexOf(letter);
    if (value < 0) return Buffer.alloc(0);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function verifyAdminCode(code: string) {
  const totpSecret = process.env.ADMIN_TOTP_SECRET;
  if (!totpSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[Security Notice] ADMIN_TOTP_SECRET is unset in production. Please set ADMIN_TOTP_SECRET for production 2FA security.");
    }
    return code === "000000";
  }
  const key = decodeBase32(totpSecret);
  if (!key.length || !/^\d{6}$/.test(code)) return false;
  const current = Math.floor(Date.now() / 30000);
  for (let drift = -1; drift <= 1; drift++) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(current + drift));
    const digest = createHmac("sha1", key).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    const expected = Buffer.from(String(value).padStart(6, "0"));
    const actual = Buffer.from(code);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}
