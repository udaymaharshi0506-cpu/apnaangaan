import { db } from "@/db";
import { adminCallLogs, favorites, leadEvents, leads, meetings, notifications, otpChallenges, properties, savedSearches, uploadedImages, users, type Lead, type Property, type User } from "@/db/schema";
import { attachAdminChallenge, attachSession, clearSession, getAuthUser, getPendingAdmin, hasRole, publicSelf, rotateSession, verifyAdminCode } from "@/lib/auth";
import { findProperties, getProperty } from "@/lib/queries";
import { DEFAULT_ADMIN_EMAIL, ensureAdminAccount } from "@/lib/seed";
import { serializeAdminLead, serializeCustomerLead, serializeOwnerLead, serializePublicMeeting, serializePublicProperty } from "@/lib/serializers";
import { compare } from "bcryptjs";
import { and, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new HttpError(status, message); }
const uuid = z.string().uuid();
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status });
const safeNumber = (value: string | null) => value !== null && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined;
const pageFrom = (request: NextRequest) => Math.max(1, Math.min(10000, Number(request.nextUrl.searchParams.get("page")) || 1));

async function body<T extends z.ZodTypeAny>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  let input: unknown;
  try { input = await request.json(); } catch { throw new HttpError(400, "Please provide valid JSON."); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const pathStr = firstIssue?.path.join(".") || "input";
    const msg = firstIssue ? `${pathStr}: ${firstIssue.message}` : "Invalid input.";
    console.warn(`[Validation Error 422 on ${request.nextUrl.pathname}]:`, msg, parsed.error.issues);
    throw new HttpError(422, msg);
  }
  return parsed.data as z.infer<T>;
}
async function requireUser(request: NextRequest): Promise<User> {
  const user = await getAuthUser(request);
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  return user;
}
async function requireRole(request: NextRequest, role: "customer" | "owner" | "admin"): Promise<User> {
  const user = await requireUser(request);
  if (!hasRole(user, role)) throw new HttpError(403, "You do not have access to this action.");
  return user;
}
function validId(id: string) { if (!uuid.safeParse(id).success) fail(400, "Invalid ID."); return id; }
async function latestMeeting(leadId: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.leadId, leadId)).orderBy(desc(meetings.createdAt)).limit(1);
  return meeting || null;
}
async function sendNotification(userId: string, type: string, message: string, link?: string) {
  await db.insert(notifications).values({ userId, type, message, link });
}

const phoneSchema = z.object({ phone: z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number.") });
const propertyRawFields = {
  category: z.enum(["buy_home", "rent_home", "rent_pg", "rent_commercial"]),
  propertyType: z.string().trim().min(1).max(60),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(5000).optional(),
  price: z.coerce.number().int().positive("Price must be a positive number.").max(100000000000),
  priceType: z.enum(["fixed", "negotiable"]).optional(),
  address: z.string().trim().min(2, "Address must be at least 2 characters.").max(500),
  city: z.string().trim().min(2).max(100),
  locality: z.string().trim().min(2).max(120),
  pinCode: z.string().trim().max(10).nullable().optional(),
  landmark: z.string().trim().max(255).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  bhkOrRoomType: z.string().trim().min(1).max(50),
  areaSqft: z.coerce.number().int().positive("Area must be positive.").max(10000000),
  bathrooms: z.coerce.number().int().min(0).max(100).optional(),
  floor: z.string().trim().max(30).nullable().optional(),
  totalFloors: z.coerce.number().int().min(0).max(200).nullable().optional(),
  propertyAge: z.string().trim().max(50).nullable().optional(),
  facing: z.string().trim().max(30).nullable().optional(),
  furnishingStatus: z.enum(["Unfurnished", "Semi-furnished", "Fully furnished"]).optional(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  images: z.array(z.string().max(2000).refine((value) => value.startsWith("https://") || value.startsWith("http://") || value.startsWith("/"), "Use a valid image URL.")).min(1, "Please provide photos.").max(25),
  availabilityDate: z.string().nullable().optional().transform((val) => val && val.trim() ? val.trim() : null),
  reraNumber: z.string().trim().max(100).nullable().optional().transform((val) => val && val.trim() ? val.trim() : null),
  deposit: z.coerce.number().int().nonnegative().nullable().optional(),
  // Owner KYC & identity
  ownerName: z.string().trim().max(150).optional(),
  ownerPhone: z.string().trim().max(20).optional(),
  liveSelfieUrl: z.string().max(2000).nullable().optional(),
  aadhaarCardUrl: z.string().max(2000).nullable().optional(),
  ownershipType: z.enum(["sole_owner", "co_owner"]).optional(),
  coOwners: z.string().trim().max(1000).nullable().optional(),
  // Financials & Terms
  maintenanceStatus: z.string().trim().max(30).nullable().optional(),
  maintenanceAmount: z.coerce.number().int().nonnegative().nullable().optional(),
  possessionStatus: z.string().trim().max(50).nullable().optional(),
  possessionDate: z.string().nullable().optional().transform((val) => val && val.trim() ? val.trim() : null),
  loanStatus: z.string().trim().max(100).nullable().optional(),
  lockInPeriod: z.string().trim().max(50).nullable().optional(),
  noticePeriod: z.string().trim().max(50).nullable().optional(),
  tenantPreference: z.string().trim().max(100).nullable().optional(),
  bedCount: z.string().trim().max(50).nullable().optional(),
  genderPolicy: z.string().trim().max(50).nullable().optional(),
  houseRules: z.array(z.string().trim().max(100)).optional(),
  itemizedCharges: z.record(z.string(), z.unknown()).nullable().optional().transform((val) => val ?? {}),
};

const propertyInput = z.object({
  ...propertyRawFields,
  priceType: z.enum(["fixed", "negotiable"]).default("fixed"),
  bathrooms: z.coerce.number().int().min(0).max(100).default(1),
  furnishingStatus: z.enum(["Unfurnished", "Semi-furnished", "Fully furnished"]).default("Unfurnished"),
  amenities: z.array(z.string().trim().min(1).max(60)).default([]),
  houseRules: z.array(z.string().trim().max(100)).default([]),
  itemizedCharges: z.record(z.string(), z.unknown()).default({}),
}).superRefine((data, context) => {
  const allowed: Record<string, string[]> = {
    buy_home: ["Apartment", "Independent house", "Villa", "Plot", "Commercial"],
    rent_home: ["Apartment", "Independent house", "Villa", "Commercial"],
    rent_pg: ["PG", "Co-living", "Room"],
    rent_commercial: ["Office", "Shop", "Showroom", "Warehouse"]
  };
  const list = allowed[data.category];
  if (list && !list.map((s) => s.toLowerCase()).includes(data.propertyType.toLowerCase())) {
    context.addIssue({ code: "custom", path: ["propertyType"], message: `Property type "${data.propertyType}" does not match ${data.category}. Allowed: ${list.join(", ")}` });
  }
});

const propertyPatchSchema = z.object({
  ...propertyRawFields,
  status: z.enum(["paused", "sold", "rented", "live"]),
}).partial();

function rejectContactDetails(input: Record<string, unknown>) {
  for (const field of ["title", "description", "address", "city", "locality"]) {
    const value = input[field];
    if (typeof value === "string") {
      if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
        throw new HttpError(422, `Please remove email address from ${field}. Introductions are coordinated privately.`);
      }
      const phoneMatch = value.match(/(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}\b/);
      if (phoneMatch) {
        throw new HttpError(422, `Please remove phone number (${phoneMatch[0]}) from ${field}. Our team coordinates all introductions privately.`);
      }
    }
  }
  if (Array.isArray(input.images) && input.images.some((image) => typeof image === "string" && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(image))) {
    throw new HttpError(422, "Image URLs cannot contain contact details.");
  }
}


async function twilio(pathSuffix: string, values: Record<string, string>) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !service) fail(503, "SMS verification is not configured yet. Try a demo account.");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${service}/${pathSuffix}`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values), cache: "no-store" });
  if (!response.ok) fail(502, "We couldn't send or check a code right now. Please try again.");
  return response.json() as Promise<{ status: string }>;
}

async function sendResendOtp(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { success: false, error: "RESEND_API_KEY is not configured." };
  try {
    const from = process.env.RESEND_FROM_EMAIL?.trim() || "Aangan <info@apnaangaan.in>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${code} is your Aangan verification code`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="margin-bottom:20px;">
              <span style="font-size:26px;font-weight:800;color:#134e4a;letter-spacing:-0.5px;">aangan<span style="color:#d97706;">.</span></span>
            </div>
            <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 12px;">Your verification code</h2>
            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
              Enter this 6-digit code to verify your email and sign in to your Aangan account:
            </p>
            <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:20px;">
              <span style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#166534;">${code}</span>
            </div>
            <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;">
              This code will expire in 10 minutes. If you did not request this code, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      let errorMsg = await response.text();
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.message) errorMsg = parsed.message;
      } catch {}
      console.error("[Resend Error]", errorMsg);
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Resend Failed]", msg);
    return { success: false, error: msg };
  }
}

async function getAdminLead(lead: Lead, property: Property, customer: User, owner: User) {
  const [meeting, history, logs] = await Promise.all([
    latestMeeting(lead.id),
    db.select({ eventType: leadEvents.eventType, detail: leadEvents.detail, createdAt: leadEvents.createdAt }).from(leadEvents).where(eq(leadEvents.leadId, lead.id)).orderBy(desc(leadEvents.createdAt)),
    db.select({ party: adminCallLogs.party, outcome: adminCallLogs.outcome, notes: adminCallLogs.notes, createdAt: adminCallLogs.createdAt }).from(adminCallLogs).where(eq(adminCallLogs.leadId, lead.id)).orderBy(desc(adminCallLogs.createdAt)),
  ]);
  return serializeAdminLead(lead, property, customer, owner, meeting, history, logs);
}

async function handle(request: NextRequest, method: string, segments: string[]): Promise<NextResponse> {
  const route = segments.join("/");
  const params = request.nextUrl.searchParams;

  // Email / Gmail verification (via Resend when configured; development code / console otherwise).
  if (route === "auth/otp/request" && method === "POST") {
    const input = await body(request, z.object({
      email: z.string().trim().email("Enter a valid email address.").max(255).optional(),
      phone: z.string().optional(),
    }).refine((d) => d.email || d.phone, { message: "Email address is required." }));

    const identifier = (input.email || input.phone!).toLowerCase().trim();
    const isEmail = identifier.includes("@");
    const now = new Date();
    const [previous] = await db.select().from(otpChallenges).where(eq(otpChallenges.phone, identifier)).limit(1);

    if (previous && now.getTime() - previous.requestedAt.getTime() < 15000) {
      fail(429, "Please wait 15 seconds before requesting another code.");
    }
    const inWindow = previous && now.getTime() - previous.windowStartedAt.getTime() < 3600000;
    if (inWindow && previous.requestCount >= 15) {
      fail(429, "Too many requests. Please try again in an hour.");
    }

    const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
    const code = hasResend
      ? randomInt(100000, 1000000).toString()
      : "123456";

    if (isEmail && hasResend) {
      const result = await sendResendOtp(identifier, code);
      if (!result.success) {
        console.error(`[Aangan Auth] Failed to dispatch OTP to ${identifier}:`, result.error);
        fail(502, `Could not send verification email: ${result.error || "Please verify your Resend domain/API key."}`);
      }
    } else {
      console.log(`[Aangan Auth] OTP for ${identifier}: ${code}`);
    }

    await db.insert(otpChallenges).values({
      phone: identifier,
      email: isEmail ? identifier : null,
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60000),
      attempts: 0,
      requestCount: inWindow ? previous.requestCount + 1 : 1,
      windowStartedAt: inWindow ? previous.windowStartedAt : now,
      requestedAt: now,
    }).onConflictDoUpdate({
      target: otpChallenges.phone,
      set: {
        email: isEmail ? identifier : null,
        codeHash: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + 10 * 60000),
        attempts: 0,
        requestCount: inWindow ? previous!.requestCount + 1 : 1,
        windowStartedAt: inWindow ? previous!.windowStartedAt : now,
        requestedAt: now,
      },
    });

    return respond({
      message: `Verification code sent${isEmail ? " to " + identifier : ""}.`,
      ...(hasResend ? {} : { code }),
    });
  }

  if (route === "auth/otp/verify" && method === "POST") {
    const input = await body(request, z.object({
      email: z.string().trim().email().max(255).optional(),
      phone: z.string().optional(),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
    }).refine((d) => d.email || d.phone, { message: "Email is required." }));

    const identifier = (input.email || input.phone!).toLowerCase().trim();
    const isEmail = identifier.includes("@");

    const [challenge] = await db.select().from(otpChallenges).where(eq(otpChallenges.phone, identifier)).limit(1);
    if (!challenge || challenge.expiresAt < new Date() || challenge.attempts >= 5) {
      fail(400, "Code expired or too many attempts. Request a new code.");
    }

    await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.phone, identifier));

    const expected = Buffer.from(challenge.codeHash);
    const actual = Buffer.from(createHash("sha256").update(input.code).digest("hex"));
    const isTestBypass = process.env.NODE_ENV !== "production" && input.code === "123456";
    if (!isTestBypass && (expected.length !== actual.length || !timingSafeEqual(expected, actual))) {
      fail(400, "That code is not correct.");
    }

    await db.update(otpChallenges).set({ codeHash: "used", expiresAt: new Date(), attempts: 5 }).where(eq(otpChallenges.phone, identifier));

    let [user] = isEmail
      ? await db.select().from(users).where(eq(users.email, identifier)).limit(1)
      : await db.select().from(users).where(eq(users.phone, identifier)).limit(1);

    if (!user) {
      const [created] = await db.insert(users).values({
        email: isEmail ? identifier : null,
        phone: !isEmail ? identifier : null,
        role: "customer",
        roles: ["customer"],
        otpVerifiedAt: new Date(),
      }).returning();
      user = created;
    } else {
      await db.update(users).set({ otpVerifiedAt: new Date() }).where(eq(users.id, user.id));
    }

    return attachSession(respond({ user: publicSelf(user), message: "Welcome to Aangan." }), user);
  }
  if (route === "auth/me" && method === "GET") {
    const user = await getAuthUser(request);
    if (!user) {
      const refreshed = await rotateSession(request);
      if (refreshed) return refreshed;
    }
    return respond({ user: user ? publicSelf(user) : null });
  }
  if (route === "auth/refresh" && method === "POST") return (await rotateSession(request)) || respond({ error: "Session expired. Please sign in again." }, 401);
  if (route === "auth/logout" && method === "POST") return clearSession(request, respond({ message: "Signed out." }));

  if (route === "admin/login" && method === "POST") {
    await ensureAdminAccount();
    const { email, password } = await body(request, z.object({ email: z.email().max(255), password: z.string().min(1).max(200) }));
    const [admin] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!admin || !hasRole(admin, "admin") || !admin.passwordHash || !(await compare(password, admin.passwordHash))) fail(401, "Incorrect email or password.");
    return attachAdminChallenge(respond({ requires2fa: true, message: "Enter your authenticator code." }), admin.id);
  }
  if (route === "admin/2fa" && method === "POST") {
    const admin = await getPendingAdmin(request);
    if (!admin) throw new HttpError(401, "Your login challenge has expired. Please start again.");
    const { code } = await body(request, z.object({ code: z.string().regex(/^\d{6}$/) }));
    if (!verifyAdminCode(code)) fail(401, "Incorrect authenticator code.");
    return attachSession(respond({ user: publicSelf(admin) }), admin);
  }

  if (route === "locations" && method === "GET") {
    const q = (params.get("q") || "").toLowerCase().trim();
    const fallbackCities = ["Bengaluru", "Mumbai", "Delhi", "Gurugram", "Hyderabad", "Pune", "Jaipur", "Noida", "Chennai", "Kolkata", "Ahmedabad", "Chandigarh"];
    try {
      const rows = await db
        .selectDistinct({ locality: properties.locality, city: properties.city })
        .from(properties)
        .where(eq(properties.status, "live"));
      const combined = new Set<string>();
      for (const row of rows) {
        if (row.locality && row.city) combined.add(`${row.locality}, ${row.city}`);
        if (row.city) combined.add(row.city);
      }
      const filtered = Array.from(combined).filter((item) => item.toLowerCase().includes(q)).slice(0, 8);
      return respond({ suggestions: filtered.length > 0 ? filtered : fallbackCities.filter((c) => c.toLowerCase().includes(q)).slice(0, 8) });
    } catch (err) {
      console.warn("Locations lookup fallback due to DB connection:", err);
      return respond({ suggestions: fallbackCities.filter((c) => c.toLowerCase().includes(q)).slice(0, 8) });
    }
  }

  if (route === "locations/reverse" && method === "GET") {
    const lat = params.get("lat");
    const lon = params.get("lon") || params.get("lng");
    if (!lat || !lon) fail(400, "Latitude and longitude are required.");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=1`, {
        headers: { "User-Agent": "AanganApp/1.0 (contact@apnaangan.in)" },
      });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const area = addr.suburb || addr.neighbourhood || addr.residential || addr.subdistrict || addr.quarter || addr.road;
        const city = addr.city || addr.town || addr.municipality || addr.city_district || addr.state_district || addr.state;
        const label = [area, city].filter(Boolean).join(", ") || city || data.display_name?.split(",").slice(0, 2).join(", ").trim();
        if (label) return respond({ location: label, city: city || label, address: data.display_name });
      }
    } catch (err) {
      console.warn("Nominatim reverse geocode error:", err);
    }
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`);
      if (res.ok) {
        const data = await res.json();
        const area = data.locality;
        const city = data.city || data.principalSubdivision;
        const label = [area, city].filter(Boolean).join(", ") || city || "Detected Location";
        return respond({ location: label, city: city || label });
      }
    } catch {}
    return respond({ location: "Bengaluru, Karnataka", city: "Bengaluru" });
  }

  // Public property responses always pass through the explicit PII-free serializer.
  if (route === "properties" && method === "GET") {
    return respond(await findProperties({ category: params.get("category") || undefined, city: params.get("city") || undefined, q: params.get("q") || undefined, minPrice: safeNumber(params.get("minPrice")), maxPrice: safeNumber(params.get("maxPrice")), minArea: safeNumber(params.get("minArea")), maxArea: safeNumber(params.get("maxArea")), bhk: params.get("bhk") || undefined, furnishing: params.get("furnishing") || undefined, verified: params.get("verified") === "true", sort: params.get("sort") || undefined, page: pageFrom(request), limit: safeNumber(params.get("limit")) }));
  }
  if (segments[0] === "properties" && segments.length === 2 && method === "GET") {
    const property = await getProperty(validId(segments[1]));
    if (!property) fail(404, "Property not found.");
    await db.update(properties).set({ views: sql`${properties.views} + 1` }).where(eq(properties.id, property.id));
    return respond({ property: serializePublicProperty(property) });
  }
  if (route === "properties" && method === "POST") {
    const user = await requireUser(request);
    if (!user.phone || !user.name || !user.consentAt) {
      fail(403, "Please complete your profile and verify your phone number before posting a property.");
    }
    if (!user.roles.includes("owner")) {
      const updatedRoles: Array<"customer" | "owner" | "admin"> = [...user.roles, "owner"];
      await db.update(users).set({ roles: updatedRoles, role: user.role !== "admin" ? "owner" : user.role, updatedAt: new Date() }).where(eq(users.id, user.id));
      user.roles = updatedRoles;
    }
    const input = await body(request, propertyInput);
    rejectContactDetails(input);
    const title = input.title?.trim() || `${input.bhkOrRoomType} ${input.propertyType} in ${input.locality || input.landmark || input.city}`;
    const description = input.description?.trim() || `${input.bhkOrRoomType} ${input.propertyType} (${input.areaSqft} sq ft) located in ${input.locality || input.city}. Furnishing: ${input.furnishingStatus || "Unfurnished"}.`;
    const [property] = await db.insert(properties).values({
      ...input,
      title,
      description,
      ownerId: user.id,
      availabilityDate: input.availabilityDate ? new Date(input.availabilityDate) : null,
      possessionDate: input.possessionDate ? new Date(input.possessionDate) : null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      reraNumber: input.reraNumber || null,
      deposit: input.deposit ?? null,
      ownerName: input.ownerName || user.name,
      ownerPhone: input.ownerPhone || user.phone,
      liveSelfieUrl: input.liveSelfieUrl || null,
      aadhaarCardUrl: input.aadhaarCardUrl || null,
      ownershipType: input.ownershipType || "sole_owner",
      coOwners: input.coOwners || null,
      pinCode: input.pinCode || null,
      landmark: input.landmark || null,
      floor: input.floor || null,
      totalFloors: input.totalFloors ?? null,
      propertyAge: input.propertyAge || null,
      facing: input.facing || null,
      maintenanceStatus: input.maintenanceStatus || null,
      maintenanceAmount: input.maintenanceAmount ?? null,
      possessionStatus: input.possessionStatus || null,
      loanStatus: input.loanStatus || null,
      lockInPeriod: input.lockInPeriod || null,
      noticePeriod: input.noticePeriod || null,
      tenantPreference: input.tenantPreference || null,
      bedCount: input.bedCount || null,
      genderPolicy: input.genderPolicy || null,
      houseRules: input.houseRules || [],
      itemizedCharges: input.itemizedCharges || {},
      status: "pending_review",
      verified: false,
    }).returning();
    if (input.liveSelfieUrl || input.aadhaarCardUrl) {
      await db.update(users).set({
        liveSelfieUrl: input.liveSelfieUrl || undefined,
        aadhaarCardUrl: input.aadhaarCardUrl || undefined,
      }).where(eq(users.id, user.id));
    }
    await sendNotification(user.id, "listing", `Your listing ${property.title} was submitted for verification.`, "/owner");
    return respond({ property: serializePublicProperty(property), status: property.status, message: "Listing submitted for verification." }, 201);
  }
  if (segments[0] === "properties" && segments.length === 2 && ["PATCH", "DELETE"].includes(method)) {
    const user = await requireRole(request, "owner");
    const [existing] = await db.select().from(properties).where(eq(properties.id, validId(segments[1]))).limit(1);
    if (!existing || (existing.ownerId !== user.id && !hasRole(user, "admin"))) fail(404, "Listing not found.");
    if (method === "DELETE") {
      await db.delete(properties).where(eq(properties.id, existing.id));
      return respond({ message: "Listing permanently deleted." });
    }
    const input = await body(request, propertyPatchSchema);
    rejectContactDetails(input);
    if (input.status) {
      if (input.status === "live" && !existing.verified) fail(422, "Only verified listings can be made live.");
      const [updated] = await db.update(properties).set({ status: input.status, updatedAt: new Date() }).where(eq(properties.id, existing.id)).returning();
      return respond({ property: serializePublicProperty(updated), status: updated.status });
    }
    const { status: _ignoredStatus, availabilityDate, possessionDate, itemizedCharges, ...changes } = input;
    const [updated] = await db.update(properties).set({
      ...changes,
      ...(availabilityDate !== undefined ? { availabilityDate: availabilityDate ? new Date(availabilityDate) : null } : {}),
      ...(possessionDate !== undefined ? { possessionDate: possessionDate ? new Date(possessionDate) : null } : {}),
      ...(itemizedCharges !== undefined ? { itemizedCharges: itemizedCharges ?? {} } : {}),
      status: "pending_review",
      verified: false,
      updatedAt: new Date(),
    }).where(eq(properties.id, existing.id)).returning();
    return respond({ property: serializePublicProperty(updated), status: updated.status, message: "Changes submitted for re-verification." });
  }
  if (route === "owner/properties" && method === "GET") {
    const user = await requireRole(request, "owner");
    const page = pageFrom(request);
    const [items, [{ total }], counts] = await Promise.all([
      db.select().from(properties).where(eq(properties.ownerId, user.id)).orderBy(desc(properties.createdAt)).limit(12).offset((page - 1) * 12),
      db.select({ total: count() }).from(properties).where(eq(properties.ownerId, user.id)),
      db.select({ propertyId: leads.propertyId, total: count() }).from(leads).where(eq(leads.ownerId, user.id)).groupBy(leads.propertyId),
    ]);
    const countMap = new Map(counts.map((item) => [item.propertyId, item.total]));
    return respond({ items: items.map((item) => ({ ...serializePublicProperty(item), status: item.status, views: item.views, inquiryCount: countMap.get(item.id) || 0 })), total, page, pages: Math.ceil(total / 12) });
  }

  // Lead creation never returns owner contact information; owner notifications are anonymous.
  if (route === "leads" && method === "POST") {
    const user = await requireUser(request);
    if (!hasRole(user, "customer") && !hasRole(user, "owner")) fail(403, "Only property seekers can express interest.");
    if (!user.consentAt || !user.phone) fail(403, "Please complete your profile and provide a contact phone number before sending an inquiry.");
    const { propertyId, preferredContactTime } = await body(request, z.object({ propertyId: uuid, preferredContactTime: z.string().trim().max(100).optional() }));
    const property = await getProperty(propertyId);
    if (!property) fail(404, "Property not found.");
    if (property.ownerId === user.id) fail(422, "You cannot inquire about your own listing.");
    const [previous] = await db.select().from(leads).where(and(eq(leads.customerId, user.id), eq(leads.propertyId, propertyId))).limit(1);
    if (previous) return respond({ lead: serializeCustomerLead(previous, property, await latestMeeting(previous.id)), message: "You've already expressed interest in this property." });
    const [created] = await db.insert(leads).values({ customerId: user.id, ownerId: property.ownerId, propertyId, preferredContactTime: preferredContactTime || null }).onConflictDoNothing().returning();
    if (!created) {
      const [existing] = await db.select().from(leads).where(and(eq(leads.customerId, user.id), eq(leads.propertyId, propertyId))).limit(1);
      return respond({ lead: serializeCustomerLead(existing, property), message: "You've already expressed interest in this property." });
    }
    const seekerDisplayName = user.name?.trim() || "A home seeker";
    await Promise.all([
      db.insert(leadEvents).values({ leadId: created.id, eventType: "created", detail: `${seekerDisplayName} expressed interest.` }),
      sendNotification(property.ownerId, "interest", `A verified home seeker showed interest in your property "${property.title}".`, "/owner"),
      sendNotification(user.id, "inquiry", `Your interest in "${property.title}" was received. Our team will be in touch.`, "/inquiries"),
    ]);
    return respond({ lead: serializeCustomerLead(created, property), message: "Your interest has been noted. Our team will reach out to arrange a viewing or call." }, 201);
  }
  if (route === "customer/leads" && method === "GET") {
    const user = await requireUser(request);
    const page = pageFrom(request);
    const [rows, [{ total }]] = await Promise.all([
      db.select({ lead: leads, property: properties }).from(leads).innerJoin(properties, eq(leads.propertyId, properties.id)).where(eq(leads.customerId, user.id)).orderBy(desc(leads.createdAt)).limit(12).offset((page - 1) * 12),
      db.select({ total: count() }).from(leads).where(eq(leads.customerId, user.id)),
    ]);
    return respond({ items: await Promise.all(rows.map(async ({ lead, property }) => serializeCustomerLead(lead, property, await latestMeeting(lead.id)))), total, page, pages: Math.ceil(total / 12) });
  }
  if (route === "owner/leads" && method === "GET") {
    const user = await requireRole(request, "owner");
    const page = pageFrom(request);
    const customer = alias(users, "lead_customer");
    const [rows, [{ total }]] = await Promise.all([
      db.select({ lead: leads, property: properties, customerName: customer.name }).from(leads).innerJoin(properties, eq(leads.propertyId, properties.id)).innerJoin(customer, eq(leads.customerId, customer.id)).where(eq(leads.ownerId, user.id)).orderBy(desc(leads.createdAt)).limit(12).offset((page - 1) * 12),
      db.select({ total: count() }).from(leads).where(eq(leads.ownerId, user.id)),
    ]);
    return respond({ items: await Promise.all(rows.map(async ({ lead, property, customerName }) => serializeOwnerLead(lead, property, customerName, await latestMeeting(lead.id)))), total, page, pages: Math.ceil(total / 12) });
  }
  if (segments[0] === "leads" && segments.length === 3 && segments[2] === "meeting" && method === "GET") {
    const user = await requireUser(request);
    const [lead] = await db.select().from(leads).where(eq(leads.id, validId(segments[1]))).limit(1);
    if (!lead || (lead.customerId !== user.id && lead.ownerId !== user.id && !hasRole(user, "admin"))) fail(404, "Inquiry not found.");
    return respond({ meeting: serializePublicMeeting(await latestMeeting(lead.id)) });
  }

  if (route === "favorites" && method === "GET") {
    const user = await requireUser(request);
    const rows = await db.select({ property: properties }).from(favorites).innerJoin(properties, eq(favorites.propertyId, properties.id)).where(and(eq(favorites.userId, user.id), eq(properties.status, "live"))).orderBy(desc(favorites.createdAt)).limit(100);
    return respond({ items: rows.map(({ property }) => serializePublicProperty(property)) });
  }
  if (segments[0] === "favorites" && segments.length === 2 && ["POST", "DELETE"].includes(method)) {
    const user = await requireUser(request);
    const id = validId(segments[1]);
    if (method === "POST") {
      const property = await getProperty(id);
      if (!property) fail(404, "Property not found.");
      await db.insert(favorites).values({ userId: user.id, propertyId: id }).onConflictDoNothing();
      return respond({ saved: true });
    }
    await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.propertyId, id)));
    return respond({ saved: false });
  }
  if (route === "notifications" && method === "GET") {
    const user = await requireUser(request);
    const page = pageFrom(request);
    const [items, [{ total }], [{ unread }]] = await Promise.all([
      db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(20).offset((page - 1) * 20),
      db.select({ total: count() }).from(notifications).where(eq(notifications.userId, user.id)),
      db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false))),
    ]);
    return respond({ items, total, unread, page, pages: Math.ceil(total / 20) });
  }
  if (route === "notifications/read-all" && method === "PATCH") {
    const user = await requireUser(request);
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.id));
    return respond({ ok: true });
  }
  if (segments[0] === "notifications" && segments.length === 2 && method === "PATCH") {
    const user = await requireUser(request);
    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, validId(segments[1])), eq(notifications.userId, user.id)));
    return respond({ ok: true });
  }
  if (route === "profile" && method === "GET") return respond({ user: publicSelf(await requireUser(request)) });
  if (route === "profile" && method === "PATCH") {
    const user = await requireUser(request);
    const input = await body(request, z.object({
      name: z.string().trim().min(2).max(150).optional(),
      city: z.string().trim().min(2).max(120).optional(),
      location: z.string().trim().max(255).optional(),
      phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(20).optional(),
      email: z.union([z.email(), z.literal("")]).optional(),
      role: z.enum(["customer", "owner"]).optional(),
      addOwnerRole: z.boolean().optional(),
      consent: z.boolean().optional(),
    }));

    if (input.location !== undefined && (!input.location || input.location.trim().length === 0)) {
      fail(422, "Location is required and cannot be empty.");
    }

    let cleanPhone: string | undefined = undefined;
    if (input.phone) {
      const raw = input.phone.trim();
      const core = raw.startsWith("+91")
        ? raw.slice(3)
        : (raw.startsWith("91") && raw.length === 12 ? raw.slice(2) : raw);

      // Strict numeric-only validation: letters, spaces, and symbols are completely rejected
      if (!/^\d+$/.test(core)) {
        fail(422, "Phone number must contain only numeric digits (0–9). Letters and special characters are not allowed.");
      }
      if (core.length !== 10) {
        fail(422, "Phone number must be exactly 10 digits.");
      }
      if (!/^[6-9]\d{9}$/.test(core)) {
        fail(422, "Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
      }
      cleanPhone = `+91${core}`;
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(or(eq(users.phone, cleanPhone), eq(users.phone, core)), sql`${users.id} != ${user.id}`))
        .limit(1);
      if (existing) {
        fail(409, "This phone number is already registered with another account.");
      }
    }

    if (input.addOwnerRole && !user.phone && !cleanPhone) {
      fail(422, "A verified phone number is required to activate owner tools.");
    }

    let cleanEmail: string | null | undefined = undefined;
    if (input.email !== undefined) {
      cleanEmail = input.email ? input.email.trim().toLowerCase() : null;
      if (cleanEmail && cleanEmail !== user.email) {
        const [existingEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, cleanEmail), sql`${users.id} != ${user.id}`))
          .limit(1);
        if (existingEmail) {
          fail(409, "This email is already registered with another account.");
        }
      }
    }

    const isOwner = input.role === "owner" || !!input.addOwnerRole;
    let roles: Array<"customer" | "owner" | "admin"> = user.roles;
    if (isOwner && !roles.includes("owner")) {
      roles = [...roles, "owner"];
    } else if (input.role === "customer" && !roles.includes("admin")) {
      roles = ["customer"];
    }

    if (input.consent === false) fail(422, "Consent is required to use your account. You may delete your account instead.");

    const targetLocation = (input.location || input.city)?.trim();

    const [updated] = await db.update(users).set({
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(targetLocation ? { location: targetLocation, city: targetLocation } : {}),
      ...(cleanPhone ? { phone: cleanPhone } : {}),
      ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
      roles,
      role: roles.includes("owner") && user.role !== "admin" ? "owner" : (input.role === "customer" && user.role !== "admin" ? "customer" : user.role),
      ...(input.consent ? { consentAt: new Date() } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id)).returning();

    return respond({ user: publicSelf(updated) });
  }
  if (route === "profile" && method === "DELETE") {
    const user = await requireUser(request);
    const { confirmation } = await body(request, z.object({ confirmation: z.literal("DELETE") }));
    if (confirmation !== "DELETE" || hasRole(user, "admin")) fail(403, "This account cannot be deleted here.");
    await db.delete(users).where(eq(users.id, user.id));
    return clearSession(request, respond({ message: "Your account and personal data were deleted." }));
  }
  if (route === "saved-searches" && method === "GET") {
    const user = await requireUser(request);
    return respond({ items: await db.select().from(savedSearches).where(eq(savedSearches.userId, user.id)).orderBy(desc(savedSearches.createdAt)).limit(50) });
  }
  if (route === "saved-searches" && method === "POST") {
    const user = await requireUser(request);
    const { label, query } = await body(request, z.object({ label: z.string().trim().min(2).max(120), query: z.record(z.string(), z.string().max(150)) }));
    const [saved] = await db.insert(savedSearches).values({ userId: user.id, label, query }).returning();
    return respond({ saved }, 201);
  }
  if (segments[0] === "saved-searches" && segments.length === 2 && method === "DELETE") {
    const user = await requireUser(request);
    await db.delete(savedSearches).where(and(eq(savedSearches.id, validId(segments[1])), eq(savedSearches.userId, user.id)));
    return respond({ ok: true });
  }

  if (route === "uploads" && method === "POST") {
    const user = await requireUser(request);
    if (!hasRole(user, "owner") && !hasRole(user, "admin")) fail(403, "Only property owners and administrators can upload listing photos.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "Upload a JPG, PNG, or WebP image under 10 MB.");
    
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/jpg"];
    const fileType = file.type || (file.name.endsWith(".png") ? "image/png" : file.name.endsWith(".webp") ? "image/webp" : "image/jpeg");
    if (!allowedMimes.includes(fileType) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
      throw new HttpError(422, "Upload a JPG, PNG, or WebP image under 10 MB.");
    }
    if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new HttpError(422, "Upload an image under 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());

    // 1. Cloudinary upload (if configured)
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = "aangan/properties";
        const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
        const upload = new FormData();
        upload.append("file", new Blob([new Uint8Array(bytes)], { type: fileType }), file.name);
        upload.append("api_key", process.env.CLOUDINARY_API_KEY);
        upload.append("timestamp", String(timestamp));
        upload.append("folder", folder);
        upload.append("signature", signature);
        const result = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: upload });
        if (result.ok) {
          const data = await result.json() as { secure_url: string };
          return respond({ url: data.secure_url }, 201);
        }
      } catch (err) {
        console.warn("[Uploads] Cloudinary upload failed:", err);
      }
    }

    // 2. Supabase Storage (if configured with JWT or service role key)
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.startsWith("sb_publishable_")))) {
      try {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
        const ext = fileType === "image/png" ? "png" : fileType === "image/webp" ? "webp" : "jpg";
        const filename = `${randomUUID()}.${ext}`;
        const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/property-images/${filename}`, {
          method: "POST",
          headers: {
            "apikey": key,
            "Authorization": `Bearer ${key}`,
            "Content-Type": fileType,
          },
          body: bytes,
        });
        if (uploadRes.ok) {
          const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/property-images/${filename}`;
          return respond({ url: publicUrl }, 201);
        }
      } catch (err) {
        console.warn("[Uploads] Supabase storage upload failed:", err);
      }
    }

    // 3. PostgreSQL Database-backed storage (100% reliable on Vercel and locally)
    const ext = fileType === "image/png" ? "png" : fileType === "image/webp" ? "webp" : "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const base64Data = bytes.toString("base64");

    const [record] = await db.insert(uploadedImages).values({
      filename,
      contentType: fileType === "image/png" ? "image/png" : fileType === "image/webp" ? "image/webp" : "image/jpeg",
      data: base64Data,
      size: bytes.length,
    }).returning({ id: uploadedImages.id });

    // In local development, mirror to filesystem if possible
    if (process.env.NODE_ENV !== "production") {
      try {
        const folder = path.join(process.cwd(), "public", "uploads");
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, `${record.id}.${ext}`), bytes);
      } catch {
        // Safe to ignore in environments with read-only file systems
      }
    }

    return respond({ url: `/api/uploads/${record.id}.${ext}` }, 201);
  }
  if (segments[0] === "uploads" && segments.length === 2 && method === "GET") {
    const rawFilename = segments[1];
    const idMatch = rawFilename.match(/^([a-f0-9-]{36})(\.(jpg|png|webp))?$/);
    if (!idMatch) fail(404, "Image not found.");

    const imageId = idMatch[1];
    const ext = idMatch[3] || "jpg";
    const localFilename = idMatch[3] ? rawFilename : `${imageId}.${ext}`;

    // 1. Try local filesystem cache first
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", "uploads", localFilename));
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // Not on local filesystem, query database
    }

    // 2. Query uploaded_images table in database
    try {
      const [record] = await db
        .select()
        .from(uploadedImages)
        .where(or(eq(uploadedImages.id, imageId), eq(uploadedImages.filename, rawFilename)))
        .limit(1);

      if (record) {
        const bytes = Buffer.from(record.data, "base64");
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            "Content-Type": record.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    } catch (dbErr) {
      console.error("[Uploads] Database image retrieval error:", dbErr);
    }

    fail(404, "Image not found.");
  }

  // Every endpoint below requires admin authorization before using AdminLeadSerializer.
  if (route.startsWith("admin/")) {
    const admin = await requireRole(request, "admin");
    if (route === "admin/leads" && method === "GET") {
      const page = pageFrom(request);
      const customer = alias(users, "lead_customer");
      const owner = alias(users, "lead_owner");
      const statusFilter = params.get("status");
      const where = statusFilter && ["new", "contacted", "meeting_scheduled", "closed_won", "closed_lost"].includes(statusFilter) ? eq(leads.status, statusFilter as Lead["status"]) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db.select({ lead: leads, property: properties, customer, owner }).from(leads).innerJoin(properties, eq(leads.propertyId, properties.id)).innerJoin(customer, eq(leads.customerId, customer.id)).innerJoin(owner, eq(leads.ownerId, owner.id)).where(where).orderBy(desc(leads.createdAt)).limit(20).offset((page - 1) * 20),
        db.select({ total: count() }).from(leads).where(where),
      ]);
      return respond({ items: await Promise.all(rows.map(({ lead, property, customer, owner }) => getAdminLead(lead, property, customer, owner))), total, page, pages: Math.ceil(total / 20) });
    }
    if (segments[1] === "leads" && segments.length === 3 && method === "GET") {
      const id = validId(segments[2]);
      const customer = alias(users, "lead_customer");
      const owner = alias(users, "lead_owner");
      const [row] = await db.select({ lead: leads, property: properties, customer, owner }).from(leads).innerJoin(properties, eq(leads.propertyId, properties.id)).innerJoin(customer, eq(leads.customerId, customer.id)).innerJoin(owner, eq(leads.ownerId, owner.id)).where(eq(leads.id, id)).limit(1);
      if (!row) fail(404, "Lead not found.");
      return respond({ lead: await getAdminLead(row.lead, row.property, row.customer, row.owner) });
    }
    if (segments[1] === "leads" && segments.length === 3 && method === "PATCH") {
      const id = validId(segments[2]);
      const input = await body(request, z.object({ status: z.enum(["new", "contacted", "meeting_scheduled", "closed_won", "closed_lost"]).optional(), adminNotes: z.string().max(10000).optional() }).refine((value) => value.status !== undefined || value.adminNotes !== undefined));
      const [lead] = await db.update(leads).set({ ...input, updatedAt: new Date() }).where(eq(leads.id, id)).returning();
      if (!lead) fail(404, "Lead not found.");
      await db.insert(leadEvents).values({ leadId: id, adminId: admin.id, eventType: input.status ? "status_change" : "admin_note", detail: input.status ? `Status changed to ${input.status}.` : "Admin added a private note." });
      if (input.status) await Promise.all([sendNotification(lead.customerId, "inquiry", "There's an update on your property inquiry.", "/inquiries"), sendNotification(lead.ownerId, "interest", "An inquiry on your property has been updated.", "/owner")]);
      return respond({ status: lead.status, message: "Lead updated." });
    }
    if (route === "admin/call-logs" && method === "POST") {
      const input = await body(request, z.object({ leadId: uuid, party: z.enum(["customer", "owner"]), outcome: z.string().trim().min(2).max(100), notes: z.string().trim().max(3000).optional() }));
      const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, input.leadId)).limit(1);
      if (!lead) fail(404, "Lead not found.");
      const [log] = await db.insert(adminCallLogs).values({ leadId: input.leadId, adminId: admin.id, party: input.party, outcome: input.outcome, notes: input.notes || null }).returning();
      await db.insert(leadEvents).values({ leadId: input.leadId, adminId: admin.id, eventType: "contact_attempt", detail: `Contacted ${input.party}: ${input.outcome}.` });
      return respond({ log }, 201);
    }
    if (route === "admin/meetings" && method === "POST") {
      const input = await body(request, z.object({ leadId: uuid, scheduledAt: z.string().datetime(), mode: z.enum(["call", "site_visit"]) }));
      const time = new Date(input.scheduledAt);
      if (time <= new Date()) fail(422, "Choose a time in the future.");
      const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
      if (!lead) fail(404, "Lead not found.");
      const [meeting] = await db.insert(meetings).values({ leadId: lead.id, scheduledByAdminId: admin.id, scheduledAt: time, mode: input.mode, status: "proposed" }).returning();
      await db.update(leads).set({ status: "meeting_scheduled", updatedAt: new Date() }).where(eq(leads.id, lead.id));
      await db.insert(leadEvents).values({ leadId: lead.id, adminId: admin.id, eventType: "meeting_proposed", detail: `${input.mode === "call" ? "Call" : "Site visit"} proposed for ${time.toISOString()}.` });
      await Promise.all([sendNotification(lead.customerId, "meeting", "A viewing or call has been proposed. Check your inquiries for details.", "/inquiries"), sendNotification(lead.ownerId, "meeting", "A viewing or call has been proposed for your listing. Check your interests for details.", "/owner")]);
      return respond({ meeting: serializePublicMeeting(meeting) }, 201);
    }
    if (segments[1] === "meetings" && segments.length === 3 && method === "PATCH") {
      const id = validId(segments[2]);
      const { status } = await body(request, z.object({ status: z.enum(["proposed", "confirmed", "completed", "cancelled"]) }));
      const [meeting] = await db.update(meetings).set({ status }).where(eq(meetings.id, id)).returning();
      if (!meeting) fail(404, "Meeting not found.");
      const [lead] = await db.select().from(leads).where(eq(leads.id, meeting.leadId)).limit(1);
      await db.insert(leadEvents).values({ leadId: lead.id, adminId: admin.id, eventType: "meeting_updated", detail: `Meeting ${status}.` });
      await Promise.all([sendNotification(lead.customerId, "meeting", `Your viewing or call is ${status}.`, "/inquiries"), sendNotification(lead.ownerId, "meeting", `A viewing or call for your listing is ${status}.`, "/owner")]);
      return respond({ meeting: serializePublicMeeting(meeting) });
    }
    if (route === "admin/properties" && method === "GET") {
      const status = params.get("status");
      const category = params.get("category");
      const q = params.get("q")?.trim();
      const page = pageFrom(request);
      const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));

      const conditions: any[] = [];
      if (status && status !== "all" && ["pending_review", "live", "paused", "rejected", "sold", "rented"].includes(status)) {
        conditions.push(eq(properties.status, status as Property["status"]));
      }
      if (category && ["buy_home", "rent_home", "rent_pg", "rent_commercial"].includes(category)) {
        conditions.push(eq(properties.category, category as Property["category"]));
      }
      if (q) {
        conditions.push(or(
          ilike(properties.title, `%${q}%`),
          ilike(properties.city, `%${q}%`),
          ilike(properties.locality, `%${q}%`),
          ilike(properties.address, `%${q}%`)
        ));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, [{ total }]] = await Promise.all([
        db
          .select({
            property: properties,
            owner: {
              id: users.id,
              name: users.name,
              phone: users.phone,
              email: users.email,
            },
          })
          .from(properties)
          .leftJoin(users, eq(properties.ownerId, users.id))
          .where(where)
          .orderBy(desc(properties.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ total: count() }).from(properties).where(where),
      ]);

      return respond({
        items: items.map(({ property, owner }) => ({
          ...serializePublicProperty(property),
          status: property.status,
          views: property.views,
          owner: owner?.id ? owner : null,
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    }

    if (segments[1] === "properties" && segments.length === 4 && segments[3] === "verify" && method === "PATCH") {
      const id = validId(segments[2]);
      const { action } = await body(request, z.object({ action: z.enum(["approve", "reject", "flag", "pause", "live"]) }));
      const nextStatus = (action === "approve" || action === "live") ? "live" : action === "pause" ? "paused" : action === "reject" ? "rejected" : "pending_review";
      const verified = (action === "approve" || action === "live") ? true : action === "reject" ? false : undefined;
      const [property] = await db.update(properties).set({
        status: nextStatus,
        ...(verified !== undefined ? { verified } : {}),
        updatedAt: new Date(),
      }).where(eq(properties.id, id)).returning();
      if (!property) fail(404, "Listing not found.");
      await sendNotification(property.ownerId, "listing", `Your listing "${property.title}" status has been updated to ${nextStatus}.`, "/owner");
      return respond({ status: property.status, verified: property.verified });
    }

    if (segments[1] === "properties" && segments.length === 3 && method === "DELETE") {
      const id = validId(segments[2]);
      const [existing] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
      if (!existing) fail(404, "Listing not found.");
      await db.delete(properties).where(eq(properties.id, id));
      return respond({ message: "Listing permanently deleted by admin." });
    }

    if (route === "admin/users" && method === "GET") {
      const roleFilter = params.get("role");
      const q = params.get("q")?.trim();
      const page = pageFrom(request);
      const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));

      const conditions: any[] = [];
      if (roleFilter === "owner") {
        conditions.push(and(sql`${users.roles}::jsonb ? 'owner'`, sql`NOT (${users.roles}::jsonb ? 'admin')`));
      } else if (roleFilter === "customer" || roleFilter === "seeker") {
        conditions.push(and(sql`NOT (${users.roles}::jsonb ? 'owner')`, sql`NOT (${users.roles}::jsonb ? 'admin')`));
      }

      if (q) {
        conditions.push(or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(users.phone, `%${q}%`),
          ilike(users.city, `%${q}%`),
          ilike(users.location, `%${q}%`)
        ));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [userRows, [{ total }]] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            phone: users.phone,
            city: users.city,
            location: users.location,
            email: users.email,
            role: users.role,
            roles: users.roles,
            consentAt: users.consentAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ total: count() }).from(users).where(where),
      ]);

      const userIds = userRows.map((u) => u.id);
      const propCounts: Record<string, number> = {};
      const leadCounts: Record<string, number> = {};

      if (userIds.length > 0) {
        const [props, custLeads] = await Promise.all([
          db
            .select({ ownerId: properties.ownerId, total: count() })
            .from(properties)
            .where(inArray(properties.ownerId, userIds))
            .groupBy(properties.ownerId),
          db
            .select({ customerId: leads.customerId, total: count() })
            .from(leads)
            .where(inArray(leads.customerId, userIds))
            .groupBy(leads.customerId),
        ]);
        props.forEach((p) => { propCounts[p.ownerId] = p.total; });
        custLeads.forEach((l) => { leadCounts[l.customerId] = l.total; });
      }

      const items = userRows.map((u) => {
        const isAdmin = u.roles.includes("admin") || u.role === "admin";
        const isOwner = !isAdmin && u.roles.includes("owner");
        return {
          ...u,
          location: u.location || u.city,
          city: u.city || u.location,
          category: isAdmin ? "admin" : isOwner ? "owner" : "customer",
          categoryLabel: isAdmin ? "Platform Admin" : isOwner ? "Owner / Rent" : "Home Seeker",
          listingsCount: propCounts[u.id] || 0,
          inquiriesCount: leadCounts[u.id] || 0,
        };
      });

      return respond({ items, total, page, pages: Math.ceil(total / limit) });
    }

    if (route === "admin/dashboard/stats" && method === "GET") {
      const [listingCounts, statusCounts, [{ total: inquiryTotal }], [{ pending }], [{ totalAll: totalListings }], [{ totalUsers }], [{ totalOwners }], [{ seekerCount }], recent] = await Promise.all([
        db.select({ category: properties.category, total: count() }).from(properties).where(eq(properties.status, "live")).groupBy(properties.category),
        db.select({ status: leads.status, total: count() }).from(leads).groupBy(leads.status),
        db.select({ total: count() }).from(leads),
        db.select({ pending: count() }).from(properties).where(eq(properties.status, "pending_review")),
        db.select({ totalAll: count() }).from(properties),
        db.select({ totalUsers: count() }).from(users),
        db.select({ totalOwners: count() }).from(users).where(and(sql`${users.roles}::jsonb ? 'owner'`, sql`NOT (${users.roles}::jsonb ? 'admin')`)),
        db.select({ seekerCount: count() }).from(users).where(and(sql`NOT (${users.roles}::jsonb ? 'owner')`, sql`NOT (${users.roles}::jsonb ? 'admin')`)),
        db.select({ createdAt: leads.createdAt }).from(leads).where(gte(leads.createdAt, new Date(Date.now() - 7 * 86400000))),
      ]);
      const byDay = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
        return { day, total: recent.filter((row) => row.createdAt.toISOString().slice(0, 10) === day).length };
      });
      return respond({
        listingsByCategory: listingCounts,
        leadsByStatus: statusCounts,
        inquiryTotal,
        pendingListings: pending,
        totalListings,
        totalUsers,
        seekerCount,
        ownerCount: totalOwners,
        inquiriesByDay: byDay,
        conversionRate: inquiryTotal ? Math.round(((statusCounts.find((item) => item.status === "closed_won")?.total || 0) / inquiryTotal) * 100) : 0,
      });
    }
  }
  throw new HttpError(404, "Endpoint not found.");
}

export async function dispatch(request: NextRequest, method: string, context: { params: Promise<{ segments: string[] }> }) {
  try { return await handle(request, method, (await context.params).segments); }
  catch (error: any) {
    if (error instanceof HttpError) return respond({ error: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return respond({ error: "This record already exists." }, 409);
    
    const errString = String(error?.message || error?.cause?.message || error || "");
    const isDbConnError =
      errString.includes("ECONNREFUSED") ||
      errString.includes("ETIMEDOUT") ||
      errString.includes("ENOTFOUND") ||
      error?.cause?.code === "ECONNREFUSED" ||
      error?.code === "ECONNREFUSED";

    if (isDbConnError) {
      console.error("[Database Connection Error on API]:", errString);
      return respond({
        error: "Database connection failed. Please ensure DATABASE_URL is configured in your Vercel Project Settings."
      }, 503);
    }

    console.error("API request failed:", error);
    return respond({ error: "Something went wrong. Please try again." }, 500);
  }
}
