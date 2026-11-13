import { db } from "@/db";
import { adminCallLogs, favorites, leadEvents, leads, managerRequests, meetings, notifications, otpChallenges, ownerInquiryView, properties, rentalDeals, savedSearches, transactionsLedger, uploadedImages, users, type Lead, type ManagerRequest, type Property, type RentalDeal, type TransactionLedger, type User } from "@/db/schema";
import { attachAdminChallenge, attachSession, clearSession, getAuthUser, getPendingAdmin, hasRole, publicSelf, rotateSession, verifyAdminCode } from "@/lib/auth";
import { findProperties, getProperty, getPropertyForLeadCreation, getUnavailablePropertyStatus, ownerPropertyColumns, publicPropertyColumns } from "@/lib/queries";
import { DEFAULT_ADMIN_EMAIL, ensureAdminAccount } from "@/lib/seed";
import { ACTIVE_MEETING_STATUSES, canTransitionMeetingStatus, formatMeetingStatus, getSlotConflictBounds, validateVisitSlot } from "@/lib/scheduling";
import { serializeAdminLead, serializeAdminProperty, serializeCustomerLead, serializeOwnerInquiry, serializeOwnerLead, serializePublicMeeting, serializePublicProperty } from "@/lib/serializers";
import { detectContactInfo, findFirstContactViolation } from "@/lib/contact-filter";
import { normalizeWhitespace, parseIndianPhone, parseIndianPinCode } from "@/lib/input-validation";
import { filterLocationSuggestions } from "@/lib/search-utils";
import { validateImageUploadBytes } from "@/lib/image-validation";
import {
  BHK_OPTIONS_BY_VERTICAL,
  LISTING_LIMITS,
  MAX_LISTING_IMAGES,
  normalizeFromAllowlist,
  PROPERTY_TYPES_BY_VERTICAL,
  validateVerticalRules,
} from "@/lib/listing-validation";
import { handleOwnerResponse, sendOwnerInterestWhatsAppWithRetry } from "@/lib/whatsapp";
import { compare } from "bcryptjs";
import { and, count, desc, eq, gt, gte, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new HttpError(status, message); }
const uuid = z.string().uuid();
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
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
  const [meeting] = await db
    .select({
      id: meetings.id,
      scheduledAt: meetings.scheduledAt,
      mode: meetings.mode,
      status: meetings.status,
    })
    .from(meetings)
    .where(eq(meetings.leadId, leadId))
    .orderBy(desc(meetings.createdAt))
    .limit(1);
  return meeting || null;
}

async function assertNoSlotConflict(
  lead: { id: string; propertyId: string; customerId: string },
  targetTime: Date,
  excludeMeetingId?: string
) {
  const { windowStart, windowEnd } = getSlotConflictBounds(targetTime);
  const conditions = [
    inArray(meetings.status, ACTIVE_MEETING_STATUSES),
    gt(meetings.scheduledAt, windowStart),
    lt(meetings.scheduledAt, windowEnd),
    or(eq(leads.propertyId, lead.propertyId), eq(leads.customerId, lead.customerId)),
  ];
  if (excludeMeetingId) {
    conditions.push(ne(meetings.id, excludeMeetingId));
  }
  const [conflict] = await db
    .select({ id: meetings.id, scheduledAt: meetings.scheduledAt, propertyId: leads.propertyId })
    .from(meetings)
    .innerJoin(leads, eq(meetings.leadId, leads.id))
    .where(and(...conditions))
    .limit(1);

  if (conflict) {
    const scope = conflict.propertyId === lead.propertyId ? "this property" : "this customer";
    fail(409, `Another visit or call is already booked for ${scope} within 60 minutes of that time. Choose a different slot.`);
  }
}

/** Explicit DB column allowlist for customer-facing lead queries: projects out phone, email, whatsapp, ownerId, customerId, and adminNotes. */
const customerLeadColumns = {
  id: leads.id,
  status: leads.status,
  preferredContactTime: leads.preferredContactTime,
  occupantsCount: leads.occupantsCount,
  tenantType: leads.tenantType,
  profession: leads.profession,
  groupGender: leads.groupGender,
  moveInTimeline: leads.moveInTimeline,
  seekerNotes: leads.seekerNotes,
  ownerResponse: leads.ownerResponse,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
} as const;

/** Explicit DB column allowlist for owner inquiry queries via the dedicated owner_inquiry_view (projects out ownerId). */
const ownerInquiryColumns = {
  id: ownerInquiryView.id,
  propertyId: ownerInquiryView.propertyId,
  propertyName: ownerInquiryView.propertyName,
  occupantsCount: ownerInquiryView.occupantsCount,
  tenantType: ownerInquiryView.tenantType,
  profession: ownerInquiryView.profession,
  groupComposition: ownerInquiryView.groupComposition,
  status: ownerInquiryView.status,
  ownerResponse: ownerInquiryView.ownerResponse,
  createdAt: ownerInquiryView.createdAt,
  updatedAt: ownerInquiryView.updatedAt,
} as const;
async function sendNotification(userId: string, type: string, message: string, link?: string) {
  try {
    await db.insert(notifications).values({ userId, type, message, link });
  } catch (err) {
    console.error("Failed to insert notification:", err);
  }
}

const preprocessIntInput = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.replace(/,/g, "").trim();
    if (trimmed === "") return null;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
    return Number(trimmed);
  }
  return value;
};

const requiredInt = (min: number, max: number, label: string) =>
  z.preprocess(
    preprocessIntInput,
    z
      .number({ error: `${label} must be a whole number.` })
      .int(`${label} must be a whole number without decimals.`)
      .min(min, `${label} must be at least ${min.toLocaleString("en-IN")}.`)
      .max(max, `${label} cannot exceed ${max.toLocaleString("en-IN")}.`)
  );

const optionalNullableInt = (min: number, max: number, label: string) =>
  z.preprocess(
    preprocessIntInput,
    z
      .union([
        z.null(),
        z
          .number({ error: `${label} must be a whole number.` })
          .int(`${label} must be a whole number without decimals.`)
          .min(min, `${label} must be at least ${min.toLocaleString("en-IN")}.`)
          .max(max, `${label} cannot exceed ${max.toLocaleString("en-IN")}.`),
      ])
      .optional()
  );

const cleanText = (max: number) => z.string().transform(normalizeWhitespace).pipe(z.string().max(max));
const requiredCleanText = (min: number, max: number, minMsg?: string) =>
  z.string().transform(normalizeWhitespace).pipe(minMsg ? z.string().min(min, minMsg).max(max) : z.string().min(min).max(max));

const phoneSchema = z.object({ phone: z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number.") });
const propertyRawFields = {
  category: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? normalizeWhitespace(val).toLowerCase() : undefined))
    .refine(
      (val) => {
        if (val === undefined) return true;
        if (["buy", "buy_home", "sale", "purchase", "pg", "rent_pg", "paying_guest", "paying guest", "coliving", "co-living", "commercial", "rent_commercial", "office", "retail", "shop"].includes(val)) {
          return false;
        }
        return val === "rent_home" || val === "rent" || val === "home" || val === "residential";
      },
      "Only residential home rentals (rent_home) are supported. Buy, PG, and Commercial listings are rejected."
    )
    .transform((val) => (val !== undefined ? ("rent_home" as const) : undefined)),
  transactionType: z
    .string()
    .optional()
    .refine(
      (val) => val === undefined || ["rent", "rental"].includes(val.toLowerCase().trim()),
      "Only rent transaction type is supported. Buy listings are rejected."
    ),
  propertyType: requiredCleanText(1, 60).refine(
    (val) => {
      if (/\b(shop|office|retail|commercial|pg|paying guest|hostel|warehouse|showroom|industrial|plot|land)\b/i.test(val)) {
        return false;
      }
      return Boolean(normalizeFromAllowlist(val, PROPERTY_TYPES_BY_VERTICAL.rent_home));
    },
    `Invalid property type. Only residential homes (${PROPERTY_TYPES_BY_VERTICAL.rent_home.join(", ")}) are allowed.`
  ),
  title: cleanText(180).optional(),
  description: cleanText(5000).optional(),
  price: requiredInt(LISTING_LIMITS.rent_home.minPrice, LISTING_LIMITS.rent_home.maxPrice, "Monthly rent"),
  priceType: z.enum(["fixed", "negotiable"]).optional(),
  address: requiredCleanText(2, 500, "Address must be at least 2 characters."),
  city: requiredCleanText(2, 100),
  locality: requiredCleanText(2, 120),
  pinCode: z
    .string()
    .max(16)
    .nullable()
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      const cleaned = normalizeWhitespace(String(val ?? "")).replace(/\s+/g, "");
      return cleaned ? cleaned : null;
    })
    .refine((val) => val === undefined || val === null || parseIndianPinCode(val).valid, "PIN code must be a valid 6-digit Indian postal code (e.g. 302020)."),
  landmark: cleanText(255).nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  bhkOrRoomType: requiredCleanText(1, 50),
  areaSqft: requiredInt(LISTING_LIMITS.rent_home.minAreaSqft, LISTING_LIMITS.rent_home.maxAreaSqft, "Built-up area (sq ft)"),
  bathrooms: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxBathrooms, "Bathrooms"),
  floor: cleanText(30).nullable().optional(),
  totalFloors: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxTotalFloors, "Total floors"),
  propertyAge: cleanText(50).nullable().optional(),
  facing: cleanText(30).nullable().optional(),
  furnishingStatus: z.enum(["Unfurnished", "Semi-furnished", "Fully furnished"]).optional(),
  amenities: z.array(requiredCleanText(1, 60)).max(50).optional(),
  images: z.array(z.string().trim().max(2000).refine((value) => value.startsWith("https://") || value.startsWith("http://") || value.startsWith("/"), "Use a valid image URL.")).min(1, "Please provide photos.").max(MAX_LISTING_IMAGES, `Maximum ${MAX_LISTING_IMAGES} photos allowed.`),
  availabilityDate: z.string().nullable().optional().transform((val) => (val === undefined ? undefined : val && normalizeWhitespace(val) ? normalizeWhitespace(val) : null)),
  reraNumber: cleanText(100).nullable().optional().transform((val) => (val === undefined ? undefined : val ? val : null)),
  deposit: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxDeposit, "Security deposit"),
  // Owner KYC & identity
  ownerName: cleanText(150).optional(),
  ownerPhone: z
    .string()
    .max(25)
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      const clean = normalizeWhitespace(val);
      if (!clean) return "";
      const parsed = parseIndianPhone(clean);
      return parsed.valid ? parsed.e164 : clean;
    })
    .refine(
      (val) => val === undefined || val === "" || parseIndianPhone(val).valid,
      "Please enter a valid 10-digit Indian mobile number (+91 / starts with 6, 7, 8, or 9)."
    ),
  liveSelfieUrl: z.string().max(2000).nullable().optional(),
  aadhaarCardUrl: z.string().max(2000).nullable().optional(),
  ownershipType: z.enum(["sole_owner", "co_owner"]).optional(),
  coOwners: cleanText(1000).nullable().optional(),
  // Financials & Terms
  maintenanceStatus: cleanText(30).nullable().optional(),
  maintenanceAmount: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxMaintenance, "Monthly maintenance"),
  possessionStatus: cleanText(50).nullable().optional(),
  possessionDate: z.string().nullable().optional().transform((val) => (val === undefined ? undefined : val && normalizeWhitespace(val) ? normalizeWhitespace(val) : null)),
  loanStatus: cleanText(100).nullable().optional(),
  lockInPeriod: cleanText(50).nullable().optional(),
  noticePeriod: cleanText(50).nullable().optional(),
  tenantPreference: cleanText(100).nullable().optional(),
  bedCount: cleanText(50).nullable().optional(),
  genderPolicy: cleanText(50).nullable().optional(),
  houseRules: z.array(cleanText(100)).optional(),
  itemizedCharges: z.record(z.string(), z.unknown()).nullable().optional().transform((val) => (val === undefined ? undefined : val ?? {})),
  listingMode: z.enum(["self", "managed"]).optional(),
  managedTier: z.enum(["none", "standard", "premium"]).optional(),
  isRecommended: z.boolean().optional(),
};

const propertyInput = z.object({
  ...propertyRawFields,
  category: propertyRawFields.category.transform((v) => v ?? ("rent_home" as const)),
  status: z.enum(["draft", "pending_review"]).optional(),
  priceType: z.enum(["fixed", "negotiable"]).default("fixed"),
  bathrooms: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxBathrooms, "Bathrooms").transform((v) => v ?? 1),
  furnishingStatus: z.enum(["Unfurnished", "Semi-furnished", "Fully furnished"]).default("Unfurnished"),
  amenities: z.array(requiredCleanText(1, 60)).default([]),
  houseRules: z.array(cleanText(100)).default([]),
  itemizedCharges: z.record(z.string(), z.unknown()).default({}),
}).superRefine((data, context) => {
  const err = validateVerticalRules(data, { isDraft: false });
  if (err) {
    context.addIssue({ code: "custom", path: ["propertyType"], message: err });
  }
});

const propertyDraftInput = z.object({
  ...propertyRawFields,
  category: propertyRawFields.category.transform((v) => v ?? ("rent_home" as const)),
  status: z.literal("draft"),
  propertyType: cleanText(60)
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        if (/\b(shop|office|retail|commercial|pg|paying guest|hostel|warehouse|showroom|industrial|plot|land)\b/i.test(val)) {
          return false;
        }
        return Boolean(normalizeFromAllowlist(val, PROPERTY_TYPES_BY_VERTICAL.rent_home));
      },
      `Invalid property type. Only residential homes (${PROPERTY_TYPES_BY_VERTICAL.rent_home.join(", ")}) are allowed.`
    ),
  address: cleanText(500).optional(),
  city: cleanText(100).optional(),
  locality: cleanText(120).optional(),
  bhkOrRoomType: cleanText(50).optional(),
  price: optionalNullableInt(LISTING_LIMITS.rent_home.minPrice, LISTING_LIMITS.rent_home.maxPrice, "Monthly rent"),
  areaSqft: optionalNullableInt(LISTING_LIMITS.rent_home.minAreaSqft, LISTING_LIMITS.rent_home.maxAreaSqft, "Built-up area (sq ft)"),
  bathrooms: optionalNullableInt(0, LISTING_LIMITS.rent_home.maxBathrooms, "Bathrooms"),
  priceType: z.enum(["fixed", "negotiable"]).default("fixed"),
  furnishingStatus: z.enum(["Unfurnished", "Semi-furnished", "Fully furnished"]).default("Unfurnished"),
  amenities: z.array(requiredCleanText(1, 60)).default([]),
  images: z.array(z.string().trim().max(2000).refine((value) => value.startsWith("https://") || value.startsWith("http://") || value.startsWith("/"), "Use a valid image URL.")).max(MAX_LISTING_IMAGES).default([]),
  houseRules: z.array(cleanText(100)).default([]),
  itemizedCharges: z.record(z.string(), z.unknown()).default({}),
}).superRefine((data, context) => {
  const err = validateVerticalRules(data, { isDraft: true });
  if (err) {
    context.addIssue({ code: "custom", path: ["propertyType"], message: err });
  }
});

const propertyPatchSchema = z.object({
  ...propertyRawFields,
  status: z.enum(["draft", "paused", "rented", "live", "pending_review"]),
}).partial();

const DEFAULT_CONTACT_PROTECTED_FIELDS = ["title", "description", "address", "city", "locality", "landmark"] as const;

function rejectContactDetails(input: Record<string, unknown>, fields: readonly string[] = DEFAULT_CONTACT_PROTECTED_FIELDS) {
  const violation = findFirstContactViolation(input, fields);
  if (violation) {
    throw new HttpError(422, `${violation.field}: ${violation.reason}`);
  }
  if (
    Array.isArray(input.images) &&
    input.images.some((image) => {
      if (typeof image !== "string") return false;
      const check = detectContactInfo(image);
      return check.blocked && check.category !== "link";
    })
  ) {
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
    const from = process.env.RESEND_FROM_EMAIL?.trim() || "Apnaangaan <info@apnaangaan.in>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${code} is your Apnaangaan verification code`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="margin-bottom:20px;">
              <span style="font-size:26px;font-weight:800;color:#134e4a;letter-spacing:-0.5px;">apnaangaan<span style="color:#d97706;">.</span></span>
            </div>
            <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 12px;">Your verification code</h2>
            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
              Enter this 6-digit code to verify your email and sign in to your Apnaangaan account:
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

async function assertNotAdminIdentifier(identifier: string, isEmail: boolean) {
  const clean = identifier.toLowerCase().trim();
  const [matched] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(isEmail ? sql`lower(${users.email}) = ${clean}` : eq(users.phone, clean))
    .limit(1);
  if (matched && (matched.role === "admin" || matched.roles?.includes("admin"))) {
    fail(403, "Administrator accounts must sign in through the team portal.");
  }
}

async function handleUserProfileUpdate(request: NextRequest, isExplicitOnboarding = false): Promise<NextResponse> {
  const user = await requireUser(request);

  const input = await body(request, z.object({
    email: z.string().trim().email().optional(),
    name: cleanText(150).optional(),
    city: cleanText(120).optional(),
    location: cleanText(255).optional(),
    phone: cleanText(25).optional(),
    role: z.string().optional(),
    addOwnerRole: z.boolean().optional(),
    consent: z.boolean().optional(),
  }));

  // Name validation if provided or during explicit onboarding (supports Hindi/Devanagari & rejects whitespace-only)
  if ((isExplicitOnboarding || input.name !== undefined) && (!input.name || input.name.length < 2)) {
    fail(422, "Please enter your full name (at least 2 characters).");
  }

  // Location validation
  if (input.location !== undefined && input.location.length < 2) {
    fail(422, "City / Location cannot be empty (at least 2 characters).");
  }
  if (input.city !== undefined && input.city.length < 2) {
    fail(422, "City cannot be empty (at least 2 characters).");
  }
  const targetLocation = (input.location || input.city) || undefined;
  if (isExplicitOnboarding && (!targetLocation || targetLocation.length < 2)) {
    fail(422, "City / Location is required and cannot be empty.");
  }

  // Phone validation (+91 / 10-digit Indian mobile number)
  let cleanPhone: string | undefined = undefined;
  if (input.phone) {
    const parsedPhone = parseIndianPhone(input.phone);
    if (!parsedPhone.valid) {
      fail(422, parsedPhone.error);
    }
    cleanPhone = parsedPhone.e164;
    const core = parsedPhone.digits;

    const [existingPhone] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(or(eq(users.phone, cleanPhone), eq(users.phone, core)), sql`${users.id} != ${user.id}`))
      .limit(1);

    if (existingPhone) {
      if (!existingPhone.name && existingPhone.email?.includes("@apnaangaan.in")) {
        await db.update(users).set({ phone: null }).where(eq(users.id, existingPhone.id));
      } else {
        fail(409, "This phone number is already registered with another account.");
      }
    }
  } else if (isExplicitOnboarding && !user.phone) {
    fail(422, "Phone number is required during onboarding.");
  }

  // Role mapping: "Home Seeker", "Home Owner", "Owner/Rent", "customer", "owner"
  const rawRole = (input.role || "").toLowerCase().trim();
  if (rawRole === "admin") {
    fail(403, "Administrator roles cannot be self-assigned.");
  }
  const isOwner =
    rawRole === "owner" ||
    rawRole.includes("owner") ||
    rawRole.includes("rent") ||
    Boolean(input.addOwnerRole);

  let roles: Array<"customer" | "owner" | "admin"> = user.roles || ["customer"];
  if (isOwner) {
    if (!roles.includes("owner")) roles = [...roles, "owner"];
  } else if (rawRole.includes("seeker") || rawRole === "customer") {
    if (!hasRole(user, "admin")) roles = ["customer"];
  }

  const finalRole = hasRole(user, "admin")
    ? "admin"
    : roles.includes("owner")
    ? "owner"
    : "customer";

  // Email update if provided and different
  let cleanEmail: string | undefined = undefined;
  if (input.email) {
    const normalized = input.email.trim().toLowerCase();
    if (normalized !== user.email?.toLowerCase()) {
      const [existingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = ${normalized}`, sql`${users.id} != ${user.id}`))
        .limit(1);
      if (existingEmail) {
        fail(409, "This email is already registered with another account.");
      }
      cleanEmail = normalized;
    }
  }

  try {
    const [updated] = await db
      .update(users)
      .set({
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(targetLocation ? { location: targetLocation, city: targetLocation } : {}),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        ...(cleanEmail ? { email: cleanEmail } : {}),
        role: finalRole,
        roles,
        ...(input.consent !== false ? { consentAt: user.consentAt || new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return attachSession(
      respond({ user: publicSelf(updated), message: "Profile saved successfully." }),
      updated
    );
  } catch (err: any) {
    console.error("[Profile Update Error]:", err);
    if (err && typeof err === "object" && err.code === "23505") {
      fail(409, "A user with this email or phone number already exists.");
    }
    fail(500, "Could not save profile details. Please try again.");
  }
}

async function handle(request: NextRequest, method: string, segments: string[]): Promise<NextResponse> {
  const route = segments.join("/");
  const params = request.nextUrl.searchParams;

  // Email / Gmail verification (via Resend when configured; development code / console otherwise).
  if (route === "auth/otp/request" && method === "POST") {
    const input = await body(request, z.object({
      email: z.string().trim().email("Enter a valid email address.").max(255).optional(),
      phone: z.string().optional(),
      type: z.enum(["login", "signup"]).optional(),
    }).refine((d) => d.email || d.phone, { message: "Email address is required." }));

    const identifier = (input.email || input.phone!).toLowerCase().trim();
    const isEmail = identifier.includes("@");
    await assertNotAdminIdentifier(identifier, isEmail);

    // If requested for login, verify that user account actually exists
    if (input.type === "login") {
      const [existingUser] = isEmail
        ? await db.select({ id: users.id, role: users.role, roles: users.roles }).from(users).where(sql`lower(${users.email}) = ${identifier}`).limit(1)
        : await db.select({ id: users.id, role: users.role, roles: users.roles }).from(users).where(eq(users.phone, identifier)).limit(1);

      if (!existingUser) {
        fail(404, "No account found with this email. Please check your spelling or sign up to create your account.");
      }
      if (existingUser.role === "admin" || existingUser.roles.includes("admin")) {
        fail(403, "Administrator accounts must sign in through the team portal.");
      }
    }

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
        console.error(`[Apnaangaan Auth] Failed to dispatch OTP to ${identifier}:`, result.error);
        fail(502, `Could not send verification email: ${result.error || "Please verify your Resend domain/API key."}`);
      }
    } else {
      console.log(`[Apnaangaan Auth] OTP for ${identifier}: ${code}`);
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

  if (route === "auth/login" && method === "POST") {
    const input = await body(request, z.object({
      email: z.string().trim().email("Enter a valid email address.").max(255),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code sent to your email."),
    }));

    const identifier = input.email.toLowerCase().trim();
    const now = new Date();

    try {
      let [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${identifier}`)
        .limit(1);

      if (!user) {
        fail(404, "No account found with this email. Please sign up to create your account.");
      }
      if (user.role === "admin" || user.roles.includes("admin")) {
        fail(403, "Administrator accounts must sign in through the team portal.");
      }

      // Verify OTP challenge strictly
      const [challenge] = await db.select().from(otpChallenges).where(eq(otpChallenges.phone, identifier)).limit(1);
      if (!challenge || challenge.expiresAt < now || challenge.attempts >= 5) {
        fail(400, "Verification code has expired or too many attempts. Please request a new code.");
      }

      await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.phone, identifier));

      const expected = Buffer.from(challenge.codeHash);
      const actual = Buffer.from(createHash("sha256").update(input.code).digest("hex"));
      const isTestBypass = process.env.NODE_ENV !== "production" && input.code === "123456";
      if (!isTestBypass && (expected.length !== actual.length || !timingSafeEqual(expected, actual))) {
        fail(400, "That verification code is not correct.");
      }

      await db.update(otpChallenges).set({ codeHash: "used", expiresAt: now, attempts: 5 }).where(eq(otpChallenges.phone, identifier));

      const [updated] = await db
        .update(users)
        .set({
          lastLogin: now,
          otpVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();

      return attachSession(respond({ user: publicSelf(updated), message: "Welcome back to Apnaangaan." }), updated);
    } catch (err: any) {
      if (err?.status) throw err;
      console.error("[Login Error]:", err);
      fail(500, "Could not complete login. Please try again.");
    }
  }

  if (route === "auth/otp/verify" && method === "POST") {
    const input = await body(request, z.object({
      email: z.string().trim().email().max(255).optional(),
      phone: z.string().optional(),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
    }).refine((d) => d.email || d.phone, { message: "Email is required." }));

    const identifier = (input.email || input.phone!).toLowerCase().trim();
    const isEmail = identifier.includes("@");
    await assertNotAdminIdentifier(identifier, isEmail);

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

    const now = new Date();
    try {
      let [user] = isEmail
        ? await db.select().from(users).where(sql`lower(${users.email}) = ${identifier}`).limit(1)
        : await db.select().from(users).where(eq(users.phone, identifier)).limit(1);

      if (!user) {
        const fallbackEmail = isEmail ? identifier : `user_${identifier.replace(/\D/g, "")}@apnaangaan.in`;
        const [created] = await db.insert(users).values({
          email: fallbackEmail,
          phone: !isEmail ? identifier : null,
          role: "customer",
          roles: ["customer"],
          lastLogin: now,
          otpVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: users.email,
          set: {
            lastLogin: now,
            otpVerifiedAt: now,
            updatedAt: now,
          },
        }).returning();
        user = created;
      } else {
        const [updated] = await db.update(users).set({
          lastLogin: now,
          otpVerifiedAt: now,
          updatedAt: now,
        }).where(eq(users.id, user.id)).returning();
        user = updated;
      }

      return attachSession(respond({ user: publicSelf(user), message: "Welcome to Apnaangaan." }), user);
    } catch (err: any) {
      console.error("[OTP Verify Error]:", err);
      fail(500, "Could not verify code and complete login. Please try again.");
    }
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
    const fallbackCities = ["Bengaluru", "Mumbai", "Delhi NCR", "Gurugram", "Hyderabad", "Pune", "Jaipur", "Noida", "Chennai", "Kolkata", "Ahmedabad", "Chandigarh"];

    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (googleKey && q.length >= 2) {
      try {
        const gRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:in&key=${encodeURIComponent(googleKey)}`
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          if (Array.isArray(gData.predictions) && gData.predictions.length > 0) {
            const places = gData.predictions.map((p: any) => p.description.replace(/, India$/, ""));
            return respond({ suggestions: places.slice(0, 8), source: "google" });
          }
        }
      } catch (err) {
        console.warn("Google Places API lookup error:", err);
      }
    }

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
      return respond({ suggestions: filterLocationSuggestions(q, Array.from(combined), fallbackCities, 8) });
    } catch (err) {
      console.warn("Locations lookup fallback due to DB connection:", err);
      return respond({ suggestions: filterLocationSuggestions(q, [], fallbackCities, 8) });
    }
  }

  if (route === "locations/reverse" && method === "GET") {
    const lat = params.get("lat");
    const lon = params.get("lon") || params.get("lng");
    if (!lat || !lon) fail(400, "Latitude and longitude are required.");

    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (googleKey) {
      try {
        const gRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lon)}&key=${encodeURIComponent(googleKey)}`
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          if (Array.isArray(gData.results) && gData.results.length > 0) {
            const first = gData.results[0];
            let sublocality = "";
            let locality = "";
            let city = "";
            for (const comp of first.address_components || []) {
              if (comp.types.includes("sublocality") || comp.types.includes("neighborhood")) sublocality = comp.long_name;
              if (comp.types.includes("locality")) locality = comp.long_name;
              if (!city && comp.types.includes("administrative_area_level_2")) city = comp.long_name;
            }
            const label = [sublocality, locality || city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") ||
              first.formatted_address?.split(",").slice(0, 2).join(", ").trim();
            if (label) {
              return respond({ location: label, city: locality || city || label, address: first.formatted_address, source: "google" });
            }
          }
        }
      } catch (err) {
        console.warn("Google Maps reverse geocode error:", err);
      }
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14&addressdetails=1`, {
        headers: { "User-Agent": "ApnaangaanApp/1.0 (contact@apnaangaan.in)" },
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
    const rawCategory = params.get("category");
    const rawTx = params.get("transactionType") || params.get("type");
    const rawPropType = params.get("propertyType");

    if (rawCategory) {
      const catLower = rawCategory.toLowerCase().trim();
      if (["buy", "buy_home", "sale", "purchase", "pg", "rent_pg", "paying_guest", "paying guest", "coliving", "co-living", "commercial", "rent_commercial", "office", "retail", "shop"].includes(catLower)) {
        fail(422, "Only residential home rentals are supported. Buy, PG, and Commercial queries are rejected.");
      }
      if (!["rent_home", "rent", "home", "residential"].includes(catLower)) {
        fail(422, "Invalid category. Only residential home rentals (rent_home) are supported.");
      }
    }

    if (rawTx) {
      const txLower = rawTx.toLowerCase().trim();
      if (["buy", "sale", "purchase"].includes(txLower)) {
        fail(422, "Only rental transactions are supported. Buy queries are rejected.");
      }
      if (!["rent", "rental"].includes(txLower)) {
        fail(422, "Invalid transaction type. Only Rent is supported.");
      }
    }

    if (rawPropType) {
      const ptLower = rawPropType.toLowerCase().trim();
      if (/\b(shop|office|retail|commercial|pg|paying guest|hostel|warehouse|showroom|industrial|plot|land)\b/i.test(ptLower)) {
        fail(422, "Only residential home rentals are supported. Commercial and PG property types are rejected.");
      }
    }

    return respond(await findProperties({ category: "rent_home", city: params.get("city") || undefined, q: params.get("q") || undefined, propertyType: params.get("propertyType") || undefined, minPrice: safeNumber(params.get("minPrice")), maxPrice: safeNumber(params.get("maxPrice")), minArea: safeNumber(params.get("minArea")), maxArea: safeNumber(params.get("maxArea")), bhk: params.get("bhk") || undefined, furnishing: params.get("furnishing") || undefined, verified: params.get("verified") === "true", sort: params.get("sort") || undefined, page: pageFrom(request), limit: safeNumber(params.get("limit")) }));
  }
  if (segments[0] === "properties" && segments.length === 2 && method === "GET") {
    const property = await getProperty(validId(segments[1]));
    if (!property || property.category !== "rent_home") fail(404, "Property not found.");
    await db.update(properties).set({ views: sql`${properties.views} + 1` }).where(eq(properties.id, property.id));
    return respond({ property: serializePublicProperty(property) });
  }
  if (route === "properties" && method === "POST") {
    const user = await requireRole(request, "owner");
    if (!user.phone || !user.name || !user.consentAt) {
      fail(403, "Please complete your profile and verify your phone number before posting a property.");
    }
    let rawJson: unknown;
    try { rawJson = await request.clone().json(); } catch { throw new HttpError(400, "Please provide valid JSON."); }
    const isDraftSave = Boolean(rawJson && typeof rawJson === "object" && (rawJson as Record<string, unknown>).status === "draft");

    if (isDraftSave) {
      const draftInput = await body(request, propertyDraftInput);
      rejectContactDetails(draftInput);
      const normalizedPropertyType = draftInput.propertyType
        ? (normalizeFromAllowlist(draftInput.propertyType, PROPERTY_TYPES_BY_VERTICAL.rent_home) || "Apartment")
        : "Apartment";
      const normalizedBhk = draftInput.bhkOrRoomType
        ? (normalizeFromAllowlist(draftInput.bhkOrRoomType, BHK_OPTIONS_BY_VERTICAL.rent_home) || "2 BHK")
        : "2 BHK";
      const draftCity = draftInput.city?.trim() || user.city || "Bengaluru";
      const draftLocality = draftInput.locality?.trim() || "Draft location";
      const draftAddress = draftInput.address?.trim() || "Draft address pending";
      const draftArea = draftInput.areaSqft ?? 1000;
      const draftPrice = draftInput.price ?? 10000;
      const title = draftInput.title?.trim() || `${normalizedBhk} ${normalizedPropertyType} in ${draftLocality || draftCity}`;
      const description = draftInput.description?.trim() || `${normalizedBhk} ${normalizedPropertyType} (${draftArea} sq ft) in ${draftLocality || draftCity}.`;

      const [property] = await db.insert(properties).values({
        ...draftInput,
        category: "rent_home",
        propertyType: normalizedPropertyType,
        bhkOrRoomType: normalizedBhk,
        address: draftAddress,
        city: draftCity,
        locality: draftLocality,
        areaSqft: draftArea,
        price: draftPrice,
        bathrooms: draftInput.bathrooms ?? 1,
        title,
        description,
        ownerId: user.id,
        availabilityDate: draftInput.availabilityDate ? new Date(draftInput.availabilityDate) : null,
        possessionDate: draftInput.possessionDate ? new Date(draftInput.possessionDate) : null,
        latitude: draftInput.latitude ?? null,
        longitude: draftInput.longitude ?? null,
        reraNumber: draftInput.reraNumber || null,
        deposit: draftInput.deposit ?? null,
        ownerName: draftInput.ownerName || user.name,
        ownerPhone: draftInput.ownerPhone || user.phone,
        liveSelfieUrl: draftInput.liveSelfieUrl || null,
        aadhaarCardUrl: draftInput.aadhaarCardUrl || null,
        ownershipType: draftInput.ownershipType || "sole_owner",
        coOwners: draftInput.coOwners || null,
        pinCode: draftInput.pinCode || null,
        landmark: draftInput.landmark || null,
        floor: draftInput.floor || null,
        totalFloors: draftInput.totalFloors ?? null,
        propertyAge: draftInput.propertyAge || null,
        facing: draftInput.facing || null,
        maintenanceStatus: draftInput.maintenanceStatus || null,
        maintenanceAmount: draftInput.maintenanceAmount ?? null,
        possessionStatus: draftInput.possessionStatus || null,
        loanStatus: draftInput.loanStatus || null,
        lockInPeriod: draftInput.lockInPeriod || null,
        noticePeriod: draftInput.noticePeriod || null,
        tenantPreference: draftInput.tenantPreference || null,
        bedCount: draftInput.bedCount || null,
        genderPolicy: draftInput.genderPolicy || null,
        houseRules: draftInput.houseRules || [],
        itemizedCharges: draftInput.itemizedCharges || {},
        status: "draft",
        verified: false,
      }).returning(ownerPropertyColumns);
      return respond({ property: serializePublicProperty(property), status: property.status, message: "Draft saved to your owner dashboard." }, 201);
    }

    const input = await body(request, propertyInput);
    rejectContactDetails(input);
    const normalizedPropertyType = normalizeFromAllowlist(input.propertyType, PROPERTY_TYPES_BY_VERTICAL.rent_home) || input.propertyType;
    const normalizedBhk = normalizeFromAllowlist(input.bhkOrRoomType, BHK_OPTIONS_BY_VERTICAL.rent_home) || input.bhkOrRoomType;
    const title = input.title?.trim() || `${normalizedBhk} ${normalizedPropertyType} in ${input.locality || input.landmark || input.city}`;
    const description = input.description?.trim() || `${normalizedBhk} ${normalizedPropertyType} (${input.areaSqft} sq ft) located in ${input.locality || input.city}. Furnishing: ${input.furnishingStatus || "Unfurnished"}.`;
    const [property] = await db.insert(properties).values({
      ...input,
      propertyType: normalizedPropertyType,
      bhkOrRoomType: normalizedBhk,
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
      listingMode: input.listingMode || "self",
      managedTier: input.managedTier || "none",
      isRecommended: Boolean(input.isRecommended),
    }).returning(ownerPropertyColumns);
    if (input.liveSelfieUrl || input.aadhaarCardUrl) {
      await db.update(users).set({
        liveSelfieUrl: input.liveSelfieUrl || undefined,
        aadhaarCardUrl: input.aadhaarCardUrl || undefined,
      }).where(eq(users.id, user.id));
    }

    const modeLabel = input.listingMode === "managed" ? "Managed Listing" : "Self-Listing";
    await sendNotification(user.id, "listing", `Your ${modeLabel} "${property.title}" was submitted for verification.`, "/owner");

    // Real-time notification to all platform administrators
    try {
      const adminUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`roles::jsonb ? 'admin' OR role = 'admin'`);
      await Promise.all(
        adminUsers.map((a) =>
          sendNotification(
            a.id,
            "listing",
            `🔔 New ${modeLabel} submitted by ${user.name || "Owner"} for "${property.title}".`,
            "/admin?view=requests"
          )
        )
      );
    } catch (notifErr) {
      console.error("Failed to notify admins of new listing:", notifErr);
    }

    // Automatically record in manager_requests queue
    await db
      .insert(managerRequests)
      .values({
        ownerId: user.id,
        propertyId: property.id,
        listingMode: input.listingMode || "self",
        managedTier: input.managedTier || "none",
        feeAmount: "0.00",
        paymentStatus: "not_required",
        isRecommended: Boolean(input.isRecommended),
        requestStatus: "new",
        propertyTitle: property.title,
        locality: property.locality,
        city: property.city,
        ownerContactPhone: user.phone,
      })
      .catch(() => null);

    return respond({ property: serializePublicProperty(property), status: property.status, message: "Listing submitted for verification." }, 201);
  }
  if (segments[0] === "properties" && segments.length === 2 && ["PATCH", "DELETE"].includes(method)) {
    const user = await requireRole(request, "owner");
    const [existing] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, validId(segments[1])))
      .limit(1);
    if (!existing || existing.category !== "rent_home") fail(404, "Listing not found.");
    if (existing.ownerId !== user.id && !hasRole(user, "admin")) fail(403, "You do not have permission to modify this listing.");
    if (method === "DELETE") {
      await db.delete(properties).where(eq(properties.id, existing.id));
      return respond({ message: "Listing permanently deleted." });
    }
    const input = await body(request, propertyPatchSchema);
    rejectContactDetails(input);
    const { status: requestedStatus, availabilityDate, possessionDate, itemizedCharges, ...rawChanges } = input;
    const changes = Object.fromEntries(Object.entries(rawChanges).filter(([, value]) => value !== undefined)) as Record<string, unknown>;
    if (typeof changes.propertyType === "string") {
      const normType = normalizeFromAllowlist(changes.propertyType, PROPERTY_TYPES_BY_VERTICAL.rent_home);
      if (normType) changes.propertyType = normType;
    }
    if (typeof changes.bhkOrRoomType === "string") {
      const normBhk = normalizeFromAllowlist(changes.bhkOrRoomType, BHK_OPTIONS_BY_VERTICAL.rent_home);
      if (normBhk) changes.bhkOrRoomType = normBhk;
    }
    const hasContentChanges =
      Object.keys(changes).length > 0 ||
      availabilityDate !== undefined ||
      possessionDate !== undefined ||
      itemizedCharges !== undefined;

    if (requestedStatus === "draft" && existing.status !== "draft") {
      fail(422, "Submitted or live listings cannot be reverted to draft. Pause the listing instead.");
    }

    const stayingInDraft = existing.status === "draft" && requestedStatus !== "pending_review";
    if (hasContentChanges || (existing.status === "draft" && requestedStatus === "pending_review")) {
      const merged = {
        category: existing.category,
        propertyType: (changes.propertyType as string | undefined) ?? existing.propertyType,
        bhkOrRoomType: (changes.bhkOrRoomType as string | undefined) ?? existing.bhkOrRoomType,
        price: changes.price !== undefined ? changes.price : existing.price,
        areaSqft: changes.areaSqft !== undefined ? changes.areaSqft : existing.areaSqft,
        deposit: changes.deposit !== undefined ? changes.deposit : existing.deposit,
        bathrooms: changes.bathrooms !== undefined ? changes.bathrooms : existing.bathrooms,
        floor: changes.floor !== undefined ? (changes.floor as string | null) : existing.floor,
        totalFloors: changes.totalFloors !== undefined ? changes.totalFloors : existing.totalFloors,
        maintenanceStatus: changes.maintenanceStatus !== undefined ? (changes.maintenanceStatus as string | null) : existing.maintenanceStatus,
        maintenanceAmount: changes.maintenanceAmount !== undefined ? changes.maintenanceAmount : existing.maintenanceAmount,
        pinCode: changes.pinCode !== undefined ? (changes.pinCode as string | null) : existing.pinCode,
        images: (changes.images as string[] | undefined) ?? existing.images,
      };
      const verticalErr = validateVerticalRules(merged, { isDraft: stayingInDraft });
      if (verticalErr) fail(422, verticalErr);
      if (!stayingInDraft && (!merged.images || merged.images.length < 1)) {
        fail(422, "Please attach at least 1 property photo before submitting for review.");
      }

      const nextStatus = stayingInDraft ? "draft" : "pending_review";
      const [updated] = await db.update(properties).set({
        ...changes,
        ...(availabilityDate !== undefined ? { availabilityDate: availabilityDate ? new Date(availabilityDate) : null } : {}),
        ...(possessionDate !== undefined ? { possessionDate: possessionDate ? new Date(possessionDate) : null } : {}),
        ...(itemizedCharges !== undefined ? { itemizedCharges: itemizedCharges ?? {} } : {}),
        status: nextStatus,
        verified: false,
        rejectionReason: null,
        updatedAt: new Date(),
      }).where(eq(properties.id, existing.id)).returning(ownerPropertyColumns);
      if (!stayingInDraft) {
        await sendNotification(user.id, "listing", `Changes to "${updated.title}" were submitted for admin review before going live.`, "/owner");
      }
      return respond({
        property: serializePublicProperty(updated),
        status: updated.status,
        message: stayingInDraft ? "Draft updated." : "Changes submitted for re-verification.",
      });
    }

    if (requestedStatus) {
      if (requestedStatus === "live") {
        if (!existing.verified || (existing.status !== "paused" && existing.status !== "rented")) {
          fail(422, "Only admin-approved listings can be made live.");
        }
      }
      if (requestedStatus === "pending_review") {
        const [updated] = await db.update(properties).set({
          status: "pending_review",
          verified: false,
          rejectionReason: null,
          updatedAt: new Date(),
        }).where(eq(properties.id, existing.id)).returning(ownerPropertyColumns);
        await sendNotification(user.id, "listing", `Your listing "${updated.title}" was resubmitted for verification.`, "/owner");
        return respond({ property: serializePublicProperty(updated), status: updated.status, message: "Listing resubmitted for verification." });
      }
      const [updated] = await db.update(properties).set({ status: requestedStatus, updatedAt: new Date() }).where(eq(properties.id, existing.id)).returning(ownerPropertyColumns);
      const statusLabel = requestedStatus === "live" ? "is now live" : requestedStatus === "paused" ? "is now paused" : `has been marked as ${requestedStatus}`;
      await sendNotification(user.id, "listing", `Your listing "${updated.title}" ${statusLabel}.`, "/owner");
      return respond({ property: serializePublicProperty(updated), status: updated.status });
    }

    fail(422, "Provide listing changes or a status update.");
  }
  if (route.startsWith("owner/")) {
    await requireRole(request, "owner");
  }
  if (route === "owner/properties" && method === "GET") {
    const user = await requireRole(request, "owner");
    const page = pageFrom(request);
    const [items, [{ total }], counts] = await Promise.all([
      db.select(ownerPropertyColumns).from(properties).where(eq(properties.ownerId, user.id)).orderBy(desc(properties.createdAt)).limit(24).offset((page - 1) * 24),
      db.select({ total: count() }).from(properties).where(eq(properties.ownerId, user.id)),
      db.select({ propertyId: leads.propertyId, total: count() }).from(leads).where(eq(leads.ownerId, user.id)).groupBy(leads.propertyId),
    ]);
    const countMap = new Map(counts.map((item) => [item.propertyId, item.total]));
    return respond({
      items: items.map((item) => ({
        ...serializePublicProperty(item),
        status: item.status,
        views: item.views,
        inquiryCount: countMap.get(item.id) || 0,
        rejectionReason: item.rejectionReason,
      })),
      total,
      page,
      pages: Math.ceil(total / 24),
    });
  }
  if (segments[0] === "owner" && segments[1] === "properties" && segments.length === 3 && method === "GET") {
    const user = await requireRole(request, "owner");
    const id = validId(segments[2]);
    const [row] = await db
      .select({
        id: properties.id,
        ownerId: properties.ownerId,
        category: properties.category,
        propertyType: properties.propertyType,
        title: properties.title,
        description: properties.description,
        price: properties.price,
        priceType: properties.priceType,
        address: properties.address,
        city: properties.city,
        locality: properties.locality,
        pinCode: properties.pinCode,
        landmark: properties.landmark,
        latitude: properties.latitude,
        longitude: properties.longitude,
        bhkOrRoomType: properties.bhkOrRoomType,
        areaSqft: properties.areaSqft,
        bathrooms: properties.bathrooms,
        floor: properties.floor,
        totalFloors: properties.totalFloors,
        propertyAge: properties.propertyAge,
        facing: properties.facing,
        furnishingStatus: properties.furnishingStatus,
        amenities: properties.amenities,
        images: properties.images,
        availabilityDate: properties.availabilityDate,
        reraNumber: properties.reraNumber,
        deposit: properties.deposit,
        ownerName: properties.ownerName,
        ownerPhone: properties.ownerPhone,
        liveSelfieUrl: properties.liveSelfieUrl,
        aadhaarCardUrl: properties.aadhaarCardUrl,
        ownershipType: properties.ownershipType,
        coOwners: properties.coOwners,
        maintenanceStatus: properties.maintenanceStatus,
        maintenanceAmount: properties.maintenanceAmount,
        lockInPeriod: properties.lockInPeriod,
        noticePeriod: properties.noticePeriod,
        tenantPreference: properties.tenantPreference,
        houseRules: properties.houseRules,
        status: properties.status,
        verified: properties.verified,
        rejectionReason: properties.rejectionReason,
      })
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);
    if (!row) fail(404, "Listing not found.");
    if (row.ownerId !== user.id && !hasRole(user, "admin")) {
      fail(403, "You do not have permission to view this listing.");
    }
    return respond({ property: row });
  }

  if (route === "owner/manager-requests" && method === "POST") {
    const user = await requireRole(request, "owner");
    let json: Record<string, unknown>;
    try {
      json = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid JSON payload.");
    }

    const managedTier = json.managedTier === "premium" ? "premium" : "standard";
    const listingMode = "managed";
    const feeAmount = managedTier === "premium" ? "999.00" : "499.00";
    const tierLabel = managedTier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";
    const isRecommended = managedTier === "premium";
    const propertyTitle = typeof json.propertyTitle === "string" ? json.propertyTitle.trim() : null;
    const locality = typeof json.locality === "string" ? json.locality.trim() : null;
    const city = typeof json.city === "string" ? json.city.trim() : (user.city || "Bengaluru");
    const ownerContactPhone = typeof json.ownerContactPhone === "string" && json.ownerContactPhone.trim() ? json.ownerContactPhone.trim() : (user.phone || null);
    const notes = typeof json.notes === "string" ? json.notes.trim() : null;
    const propertyId = typeof json.propertyId === "string" ? json.propertyId : null;
    const transactionId = "TXN_MGR_" + Math.random().toString(36).substring(2, 9).toUpperCase() + "_" + Date.now().toString().slice(-4);

    const [created] = await db
      .insert(managerRequests)
      .values({
        ownerId: user.id,
        propertyId,
        listingMode,
        managedTier,
        feeAmount,
        paymentStatus: "paid",
        transactionId,
        isRecommended,
        requestStatus: "new",
        propertyTitle: propertyTitle || (locality ? `Rental home in ${locality}` : "Rental Home"),
        locality: locality || "Locality pending",
        city,
        ownerContactPhone,
        notes,
      })
      .returning();

    // 1. Immediate Owner notification (toast on frontend + persistent bell notification)
    await sendNotification(
      user.id,
      "manager_request",
      `Your Hire a Manager request (${tierLabel}) has been confirmed! An Apna Aangan manager will contact you shortly.`,
      "/owner"
    );

    // 2. Real-time Admin notification to all administrators
    try {
      const adminUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`roles::jsonb ? 'admin' OR role = 'admin'`);

      const adminMessage = `🔔 New Hire a Manager Request: ${user.name || "Owner"} (${ownerContactPhone || "No phone"}) selected ${tierLabel} for ${propertyTitle || locality || "a rental property"}.`;
      await Promise.all(
        adminUsers.map((admin) =>
          sendNotification(admin.id, "manager_request", adminMessage, `/admin?view=requests&id=${created.id}`)
        )
      );
    } catch (notifErr) {
      console.error("Failed to notify admins of manager request:", notifErr);
    }

    return respond(
      {
        request: created,
        message: `Your Hire a Manager request (${tierLabel}) has been submitted successfully! An Apna Aangan manager will reach out to you.`,
      },
      201
    );
  }

  if (route === "owner/manager-requests" && method === "GET") {
    const user = await requireRole(request, "owner");
    const items = await db
      .select()
      .from(managerRequests)
      .where(eq(managerRequests.ownerId, user.id))
      .orderBy(desc(managerRequests.createdAt))
      .limit(50);
    return respond({ items });
  }

  // Lead creation never returns owner contact information; owner notifications are anonymous.
  const isPropertyInquiryRoute = segments[0] === "properties" && segments.length === 3 && segments[2] === "inquiries";
  if ((route === "leads" || isPropertyInquiryRoute) && method === "POST") {
    const user = await requireUser(request);
    if (!hasRole(user, "customer") && !hasRole(user, "owner")) fail(403, "Only property seekers can express interest.");
    if (!user.consentAt || !user.phone) fail(403, "Please complete your profile and provide a contact phone number before sending an inquiry.");
    const input = await body(
      request,
      z.object({
        propertyId: uuid.optional(),
        preferredContactTime: cleanText(100).optional(),
        occupantsCount: cleanText(50).optional(),
        tenantType: cleanText(100).optional(),
        profession: cleanText(100).optional(),
        groupGender: cleanText(50).optional(),
        moveInTimeline: cleanText(100).optional(),
        confirmedPhone: cleanText(25).optional(),
        seekerNotes: cleanText(1000).optional().transform((v) => (v ? v : undefined)),
        message: cleanText(1000).optional().transform((v) => (v ? v : undefined)),
      })
    );
    rejectContactDetails(input, ["seekerNotes", "message"]);
    const targetPropertyId = isPropertyInquiryRoute ? validId(segments[1]) : input.propertyId;
    if (!targetPropertyId) fail(400, "Property ID is required.");
    const property = await getPropertyForLeadCreation(targetPropertyId);
    if (!property) {
      const unavailableStatus = await getUnavailablePropertyStatus(targetPropertyId);
      if (unavailableStatus === "paused") {
        fail(422, "This listing is paused by the owner and is not accepting inquiries right now.");
      }
      if (unavailableStatus === "rented" || unavailableStatus === "sold") {
        fail(422, "This listing is no longer available and is not accepting inquiries.");
      }
      fail(404, "Property not found.");
    }
    if (property.ownerId === user.id) fail(422, "You cannot inquire about your own listing.");
    const propertyId = targetPropertyId;
    const {
      preferredContactTime,
      occupantsCount,
      tenantType,
      profession,
      groupGender,
      moveInTimeline,
      confirmedPhone,
      seekerNotes,
      message,
    } = input;

    let validPhone: string | null = user.phone || null;
    if (confirmedPhone) {
      const parsedPhone = parseIndianPhone(confirmedPhone);
      if (!parsedPhone.valid) {
        fail(422, parsedPhone.error);
      }
      validPhone = parsedPhone.e164;
    }
    if (validPhone && !user.phone) {
      await db.update(users).set({ phone: validPhone }).where(eq(users.id, user.id));
    }

    const [previous] = await db
      .select({ ...customerLeadColumns, confirmedPhone: leads.confirmedPhone })
      .from(leads)
      .where(and(eq(leads.customerId, user.id), eq(leads.propertyId, propertyId)))
      .limit(1);
    if (previous) {
      const isWithin24h = (Date.now() - new Date(previous.createdAt).getTime()) < 24 * 60 * 60 * 1000;
      if (isWithin24h) {
        // Idempotency: Duplicate interest within 24h must NOT send a second WhatsApp message or duplicate notifications
        return respond({
          duplicate: true,
          lead: serializeCustomerLead(previous, property, await latestMeeting(previous.id)),
          message: "You have already expressed interest in this property within the last 24 hours. Our team is coordinating with the owner.",
        });
      }
      const [updated] = await db
        .update(leads)
        .set({
          preferredContactTime: preferredContactTime || previous.preferredContactTime,
          occupantsCount: occupantsCount || previous.occupantsCount,
          tenantType: tenantType || previous.tenantType,
          profession: profession || previous.profession,
          groupGender: groupGender || previous.groupGender || "N/A",
          moveInTimeline: moveInTimeline || previous.moveInTimeline,
          confirmedPhone: validPhone || previous.confirmedPhone,
          seekerNotes: seekerNotes || previous.seekerNotes,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, previous.id))
        .returning(customerLeadColumns);
      return respond({ lead: serializeCustomerLead(updated, property, await latestMeeting(previous.id)), message: "Your inquiry details have been updated." });
    }

    const effectiveGroup = groupGender || "N/A";
    const [created] = await db
      .insert(leads)
      .values({
        customerId: user.id,
        ownerId: property.ownerId,
        propertyId,
        preferredContactTime: preferredContactTime || null,
        occupantsCount: occupantsCount || null,
        tenantType: tenantType || null,
        profession: profession || null,
        groupGender: effectiveGroup,
        moveInTimeline: moveInTimeline || null,
        confirmedPhone: validPhone,
        seekerNotes: seekerNotes || message || null,
        ownerResponse: "pending",
      })
      .onConflictDoNothing()
      .returning(customerLeadColumns);

    if (!created) {
      const [existing] = await db
        .select(customerLeadColumns)
        .from(leads)
        .where(and(eq(leads.customerId, user.id), eq(leads.propertyId, propertyId)))
        .limit(1);
      return respond({ lead: serializeCustomerLead(existing, property), message: "You've already expressed interest in this property." });
    }

    const seekerDisplayName = user.name?.trim() || "A home seeker";
    const profileSummary = [
      tenantType ? `${tenantType}` : "",
      occupantsCount ? `(${occupantsCount})` : "",
      profession ? `· ${profession}` : "",
      effectiveGroup !== "N/A" ? `· ${effectiveGroup}` : "",
    ].filter(Boolean).join(" ");

    // Fetch owner phone for WhatsApp dispatch
    const [ownerUser] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, property.ownerId)).limit(1);

    // DELIVERY CHANNEL A: WhatsApp to owner (retries with backoff; never interrupts lead/website notification)
    if (ownerUser?.phone) {
      void sendOwnerInterestWhatsAppWithRetry({
        toPhone: ownerUser.phone,
        propertyName: property.title,
        occupantsCount: occupantsCount || "1",
        tenantType: tenantType || "Family",
        profession: profession || "Other",
        groupComposition: effectiveGroup,
        leadId: created.id,
      }).then(async (waResult) => {
        if (waResult.messageId) {
          await db
            .update(leads)
            .set({
              whatsappMessageId: waResult.messageId,
              whatsappStatus: waResult.success ? "sent" : "failed",
            })
            .where(eq(leads.id, created.id))
            .catch(() => null);
        }
      }).catch(() => null);
    }

    // DELIVERY CHANNEL B: Website real-time notification (bell icon + unread badge) & Seeker notification
    await Promise.all([
      db.insert(leadEvents).values({
        leadId: created.id,
        eventType: "created",
        detail: `${seekerDisplayName} expressed interest${profileSummary ? `: ${profileSummary}` : "."}`,
      }),
      sendNotification(
        property.ownerId,
        "interest",
        `${seekerDisplayName} is interested in "${property.title}" · ${occupantsCount || "1"} ${tenantType || "Family"} (${profession || "Professional"}).`,
        "/owner"
      ),
      sendNotification(
        user.id,
        "inquiry",
        `Your interest in "${property.title}" was received. Our team will be in touch.`,
        "/inquiries"
      ),
    ]);
    return respond({ lead: serializeCustomerLead(created, property), message: "Your interest has been noted. Our team will reach out to arrange a viewing or call." }, 201);
  }
  if (route === "customer/leads" && method === "GET") {
    const user = await requireRole(request, "customer");
    const page = pageFrom(request);
    const [rows, [{ total }]] = await Promise.all([
      db.select({ lead: customerLeadColumns, property: publicPropertyColumns }).from(leads).innerJoin(properties, eq(leads.propertyId, properties.id)).where(eq(leads.customerId, user.id)).orderBy(desc(leads.createdAt)).limit(12).offset((page - 1) * 12),
      db.select({ total: count() }).from(leads).where(eq(leads.customerId, user.id)),
    ]);
    return respond({ items: await Promise.all(rows.map(async ({ lead, property }) => serializeCustomerLead(lead, property, await latestMeeting(lead.id)))), total, page, pages: Math.ceil(total / 12) });
  }
  if ((route === "owner/leads" || route === "owner/inquiries") && method === "GET") {
    const user = await requireRole(request, "owner");
    const page = pageFrom(request);
    // CRITICAL: Owner-facing code queries ONLY the dedicated ownerInquiryView, NEVER the inquiries table or customer PII.
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(ownerInquiryColumns)
        .from(ownerInquiryView)
        .where(eq(ownerInquiryView.ownerId, user.id))
        .orderBy(desc(ownerInquiryView.createdAt))
        .limit(20)
        .offset((page - 1) * 20),
      db
        .select({ total: count() })
        .from(ownerInquiryView)
        .where(eq(ownerInquiryView.ownerId, user.id)),
    ]);
    return respond({
      items: await Promise.all(
        rows.map(async (row) => serializeOwnerInquiry(row, await latestMeeting(row.id)))
      ),
      total,
      page,
      pages: Math.ceil(total / 20),
    });
  }
  if (
    segments[0] === "owner" &&
    (segments[1] === "leads" || segments[1] === "inquiries") &&
    segments.length === 3 &&
    method === "GET"
  ) {
    const user = await requireRole(request, "owner");
    const id = validId(segments[2]);
    // ACCESS CONTROL: Query only ownerInquiryView filtered by authenticated owner ID (prevent IDOR)
    const [row] = await db
      .select({ ...ownerInquiryColumns, ownerId: ownerInquiryView.ownerId })
      .from(ownerInquiryView)
      .where(eq(ownerInquiryView.id, id))
      .limit(1);

    if (!row) {
      fail(404, "Inquiry not found.");
    }
    if (row.ownerId !== user.id) {
      fail(403, "You do not have access to this inquiry.");
    }
    return respond({ inquiry: serializeOwnerInquiry(row, await latestMeeting(row.id)) });
  }
  if (
    segments[0] === "owner" &&
    (segments[1] === "leads" || segments[1] === "inquiries") &&
    segments.length === 4 &&
    segments[3] === "response" &&
    ["PATCH", "POST"].includes(method)
  ) {
    const user = await requireRole(request, "owner");
    const id = validId(segments[2]);
    const input = await body(
      request,
      z.object({
        response: z.enum(["interested", "not_interested"]),
      })
    );

    // Verify ownership before responding
    const [lead] = await db
      .select({ id: leads.id, ownerId: leads.ownerId })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead) {
      fail(404, "Inquiry not found.");
    }
    if (lead.ownerId !== user.id) {
      fail(403, "You do not have access to this inquiry.");
    }

    const result = await handleOwnerResponse(id, input.response, "website");
    return respond({ success: true, message: `Response noted: ${input.response}`, result });
  }
  if (segments[0] === "leads" && segments.length === 3 && segments[2] === "meeting" && method === "GET") {
    const user = await requireUser(request);
    const [lead] = await db
      .select({ id: leads.id, customerId: leads.customerId, ownerId: leads.ownerId })
      .from(leads)
      .where(eq(leads.id, validId(segments[1])))
      .limit(1);
    if (!lead) fail(404, "Inquiry not found.");
    if (lead.customerId !== user.id && lead.ownerId !== user.id && !hasRole(user, "admin")) {
      fail(403, "You do not have access to this inquiry.");
    }
    return respond({ meeting: serializePublicMeeting(await latestMeeting(lead.id)) });
  }
  if (segments[0] === "leads" && segments.length === 3 && segments[2] === "meeting" && method === "PATCH") {
    const user = await requireUser(request);
    const leadId = validId(segments[1]);
    const [lead] = await db
      .select({
        id: leads.id,
        customerId: leads.customerId,
        ownerId: leads.ownerId,
        propertyId: leads.propertyId,
        status: leads.status,
      })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!lead) fail(404, "Inquiry not found.");
    const isAdminUser = hasRole(user, "admin");
    if (lead.customerId !== user.id && lead.ownerId !== user.id && !isAdminUser) {
      fail(403, "You do not have access to this inquiry.");
    }
    const input = await body(
      request,
      z.object({
        status: z.enum(["confirmed", "rescheduled", "cancelled"]),
        scheduledAt: z.string().datetime().optional(),
      })
    );
    const [current] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.leadId, lead.id))
      .orderBy(desc(meetings.createdAt))
      .limit(1);
    if (!current) fail(404, "No meeting scheduled for this inquiry.");

    const transition = canTransitionMeetingStatus(current.status, input.status, {
      hasNewScheduledAt: Boolean(input.scheduledAt),
    });
    if (!transition.allowed) fail(422, transition.error);

    let nextScheduledAt = current.scheduledAt;
    if (input.scheduledAt) {
      const slot = validateVisitSlot(input.scheduledAt);
      if (!slot.valid) fail(422, slot.error);
      await assertNoSlotConflict(lead, slot.date, current.id);
      nextScheduledAt = slot.date;
    }

    const [updated] = await db
      .update(meetings)
      .set({
        status: input.status,
        scheduledAt: nextScheduledAt,
      })
      .where(eq(meetings.id, current.id))
      .returning();

    if (input.status === "cancelled" && lead.status === "meeting_scheduled") {
      await db.update(leads).set({ status: "contacted", updatedAt: new Date() }).where(eq(leads.id, lead.id));
    } else if (["confirmed", "rescheduled"].includes(input.status) && ["new", "contacted"].includes(lead.status)) {
      await db.update(leads).set({ status: "meeting_scheduled", updatedAt: new Date() }).where(eq(leads.id, lead.id));
    }

    const actorLabel = isAdminUser ? "Team" : lead.ownerId === user.id ? "Owner" : "Seeker";
    const statusLabel = formatMeetingStatus(input.status);
    const slotText = input.scheduledAt ? ` for ${nextScheduledAt.toISOString()}` : "";
    await db.insert(leadEvents).values({
      leadId: lead.id,
      adminId: isAdminUser ? user.id : null,
      eventType: "meeting_updated",
      detail: `${actorLabel} marked ${current.mode === "call" ? "call" : "site visit"} as ${statusLabel}${slotText}.`,
    });

    const notificationsToSend: Array<Promise<unknown>> = [];
    if (lead.customerId !== user.id) {
      notificationsToSend.push(
        sendNotification(
          lead.customerId,
          "meeting",
          `${actorLabel} updated your ${current.mode === "call" ? "call" : "site visit"} status to ${statusLabel}.`,
          "/inquiries"
        )
      );
    }
    if (lead.ownerId !== user.id) {
      notificationsToSend.push(
        sendNotification(
          lead.ownerId,
          "meeting",
          `${actorLabel} updated the ${current.mode === "call" ? "call" : "site visit"} status to ${statusLabel}.`,
          "/owner"
        )
      );
    }
    if (current.scheduledByAdminId && current.scheduledByAdminId !== user.id) {
      notificationsToSend.push(
        sendNotification(
          current.scheduledByAdminId,
          "meeting",
          `${actorLabel} marked lead visit as ${statusLabel}${input.status === "rescheduled" ? " — review new slot." : "."}`,
          "/admin"
        )
      );
    }
    await Promise.all(notificationsToSend);

    return respond({ meeting: serializePublicMeeting(updated) });
  }

  if (route === "favorites" && method === "GET") {
    const user = await requireUser(request);
    const rows = await db.select({ property: publicPropertyColumns }).from(favorites).innerJoin(properties, eq(favorites.propertyId, properties.id)).where(and(eq(favorites.userId, user.id), eq(properties.status, "live"), eq(properties.category, "rent_home"))).orderBy(desc(favorites.createdAt)).limit(100);
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
      db
        .select({
          id: notifications.id,
          type: notifications.type,
          message: notifications.message,
          link: notifications.link,
          isRead: notifications.isRead,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(20)
        .offset((page - 1) * 20),
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
    const id = validId(segments[1]);
    const [existing] = await db.select({ id: notifications.id, userId: notifications.userId }).from(notifications).where(eq(notifications.id, id)).limit(1);
    if (!existing) fail(404, "Notification not found.");
    if (existing.userId !== user.id) fail(403, "You do not have access to this notification.");
    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return respond({ ok: true });
  }
  if (route === "profile" && method === "GET") return respond({ user: publicSelf(await requireUser(request)) });
  if (route === "profile" && method === "PATCH") {
    return await handleUserProfileUpdate(request, false);
  }

  if ((route === "auth/onboarding" || route === "onboarding") && (method === "POST" || method === "PATCH")) {
    return await handleUserProfileUpdate(request, true);
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
    const id = validId(segments[1]);
    const [existing] = await db.select({ id: savedSearches.id, userId: savedSearches.userId }).from(savedSearches).where(eq(savedSearches.id, id)).limit(1);
    if (!existing) fail(404, "Saved search not found.");
    if (existing.userId !== user.id) fail(403, "You do not have access to this saved search.");
    await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)));
    return respond({ ok: true });
  }

  if (route === "uploads" && method === "POST") {
    const user = await requireUser(request);
    if (!hasRole(user, "owner") && !hasRole(user, "admin")) fail(403, "Only property owners and administrators can upload listing photos.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "Upload a genuine JPG, PNG, or WebP image under 10 MB.");

    const existingCountRaw = form.get("existingCount");
    if (existingCountRaw !== null && Number(existingCountRaw) >= MAX_LISTING_IMAGES) {
      throw new HttpError(422, `Maximum ${MAX_LISTING_IMAGES} property photos allowed.`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const imageCheck = validateImageUploadBytes(bytes, file.size);
    if (!imageCheck.valid) {
      throw new HttpError(422, imageCheck.error);
    }
    const { mime: fileType, ext } = imageCheck.format;

    // 1. Cloudinary upload (if configured)
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = "aangan/properties";
        const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
        const upload = new FormData();
        upload.append("file", new Blob([new Uint8Array(bytes)], { type: fileType }), `${randomUUID()}.${ext}`);
        upload.append("api_key", process.env.CLOUDINARY_API_KEY);
        upload.append("timestamp", String(timestamp));
        upload.append("folder", folder);
        upload.append("signature", signature);
        const result = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: upload });
        if (result.ok) {
          const data = await result.json() as { secure_url: string };
          return respond({ url: data.secure_url, mime: fileType }, 201);
        }
      } catch (err) {
        console.warn("[Uploads] Cloudinary upload failed:", err);
      }
    }

    // 2. Supabase Storage (if configured with JWT or service role key)
    if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.startsWith("sb_publishable_")))) {
      try {
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
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
          return respond({ url: publicUrl, mime: fileType }, 201);
        }
      } catch (err) {
        console.warn("[Uploads] Supabase storage upload failed:", err);
      }
    }

    // 3. PostgreSQL Database-backed storage (100% reliable on Vercel and locally)
    const filename = `${randomUUID()}.${ext}`;
    const base64Data = bytes.toString("base64");

    const [record] = await db.insert(uploadedImages).values({
      filename,
      contentType: fileType,
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

    return respond({ url: `/api/uploads/${record.id}.${ext}`, mime: fileType }, 201);
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
      const slot = validateVisitSlot(input.scheduledAt);
      if (!slot.valid) fail(422, slot.error);
      const time = slot.date;
      const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
      if (!lead) fail(404, "Lead not found.");

      const existingActive = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.leadId, lead.id), inArray(meetings.status, ACTIVE_MEETING_STATUSES)))
        .orderBy(desc(meetings.createdAt));

      const latestActiveId = existingActive[0]?.id;
      await assertNoSlotConflict(lead, time, latestActiveId);

      if (existingActive.length > 0) {
        await db
          .update(meetings)
          .set({ status: "cancelled" })
          .where(and(eq(meetings.leadId, lead.id), inArray(meetings.status, ACTIVE_MEETING_STATUSES)));
      }

      const initialStatus = existingActive.length > 0 ? "rescheduled" : "proposed";
      const [meeting] = await db.insert(meetings).values({ leadId: lead.id, scheduledByAdminId: admin.id, scheduledAt: time, mode: input.mode, status: initialStatus }).returning();
      if (!["closed_won", "closed_lost"].includes(lead.status)) {
        await db.update(leads).set({ status: "meeting_scheduled", updatedAt: new Date() }).where(eq(leads.id, lead.id));
      }
      await db.insert(leadEvents).values({ leadId: lead.id, adminId: admin.id, eventType: initialStatus === "rescheduled" ? "meeting_rescheduled" : "meeting_proposed", detail: `${input.mode === "call" ? "Call" : "Site visit"} ${initialStatus} for ${time.toISOString()}.` });
      const label = initialStatus === "rescheduled" ? "rescheduled" : "proposed";
      await Promise.all([
        sendNotification(lead.customerId, "meeting", `A viewing or call has been ${label}. Check your inquiries for details.`, "/inquiries"),
        sendNotification(lead.ownerId, "meeting", `A viewing or call has been ${label} for your listing. Check your interests for details.`, "/owner"),
      ]);
      return respond({ meeting: serializePublicMeeting(meeting) }, 201);
    }
    if (segments[1] === "meetings" && segments.length === 3 && method === "PATCH") {
      const id = validId(segments[2]);
      const input = await body(
        request,
        z.object({
          status: z.enum(["proposed", "confirmed", "rescheduled", "completed", "cancelled"]),
          scheduledAt: z.string().datetime().optional(),
          mode: z.enum(["call", "site_visit"]).optional(),
        })
      );
      const [existing] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
      if (!existing) fail(404, "Meeting not found.");

      const transition = canTransitionMeetingStatus(existing.status, input.status, {
        hasNewScheduledAt: Boolean(input.scheduledAt),
      });
      if (!transition.allowed) fail(422, transition.error);

      const [lead] = await db.select().from(leads).where(eq(leads.id, existing.leadId)).limit(1);
      if (!lead) fail(404, "Lead not found.");

      let nextScheduledAt = existing.scheduledAt;
      if (input.status === "rescheduled") {
        if (!input.scheduledAt) fail(422, "Choose a new date and time to reschedule the visit.");
        const slot = validateVisitSlot(input.scheduledAt);
        if (!slot.valid) fail(422, slot.error);
        await assertNoSlotConflict(lead, slot.date, existing.id);
        nextScheduledAt = slot.date;
      } else if (input.scheduledAt) {
        const slot = validateVisitSlot(input.scheduledAt);
        if (!slot.valid) fail(422, slot.error);
        await assertNoSlotConflict(lead, slot.date, existing.id);
        nextScheduledAt = slot.date;
      }

      const [meeting] = await db
        .update(meetings)
        .set({
          status: input.status,
          scheduledAt: nextScheduledAt,
          mode: input.mode ?? existing.mode,
        })
        .where(eq(meetings.id, id))
        .returning();

      if (input.status === "cancelled" && lead.status === "meeting_scheduled") {
        await db.update(leads).set({ status: "contacted", updatedAt: new Date() }).where(eq(leads.id, lead.id));
      } else if (["confirmed", "rescheduled"].includes(input.status) && ["new", "contacted"].includes(lead.status)) {
        await db.update(leads).set({ status: "meeting_scheduled", updatedAt: new Date() }).where(eq(leads.id, lead.id));
      }

      const readable = formatMeetingStatus(input.status);
      await db.insert(leadEvents).values({
        leadId: lead.id,
        adminId: admin.id,
        eventType: "meeting_updated",
        detail: `Meeting ${readable}${input.scheduledAt ? ` (${nextScheduledAt.toISOString()})` : ""}.`,
      });
      await Promise.all([
        sendNotification(lead.customerId, "meeting", `Your viewing or call is now ${readable.toLowerCase()}.`, "/inquiries"),
        sendNotification(lead.ownerId, "meeting", `A viewing or call for your listing is now ${readable.toLowerCase()}.`, "/owner"),
      ]);
      return respond({ meeting: serializePublicMeeting(meeting) });
    }
    if (route === "admin/properties" && method === "GET") {
      const status = params.get("status");
      const category = params.get("category");
      const q = params.get("q")?.trim();
      const page = pageFrom(request);
      const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));

      const conditions: any[] = [];
      if (status && status !== "all" && ["draft", "pending_review", "live", "paused", "rejected", "sold", "rented"].includes(status)) {
        conditions.push(eq(properties.status, status as Property["status"]));
      } else {
        conditions.push(ne(properties.status, "draft"));
      }
      if (category) {
        const catLower = category.toLowerCase().trim();
        if (["buy", "buy_home", "sale", "purchase", "pg", "rent_pg", "paying_guest", "paying guest", "coliving", "co-living", "commercial", "rent_commercial", "office", "retail", "shop"].includes(catLower)) {
          fail(422, "Only residential home rentals are supported. Buy, PG, and Commercial queries are rejected.");
        }
      }
      conditions.push(eq(properties.category, "rent_home"));
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
          ...serializeAdminProperty(property),
          status: property.status,
          views: property.views,
          liveSelfieUrl: property.liveSelfieUrl,
          aadhaarCardUrl: property.aadhaarCardUrl,
          ownershipType: property.ownershipType,
          coOwners: property.coOwners,
          ownerName: property.ownerName || owner?.name || null,
          ownerPhone: property.ownerPhone || owner?.phone || null,
          rejectionReason: property.rejectionReason,
          owner: owner?.id
            ? {
                ...owner,
                name: property.ownerName || owner.name,
                phone: property.ownerPhone || owner.phone,
              }
            : null,
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    }

    if (segments[1] === "properties" && segments.length === 4 && segments[3] === "verify" && method === "PATCH") {
      const id = validId(segments[2]);
      const { action, reason } = await body(
        request,
        z.object({
          action: z.enum(["approve", "reject", "flag", "pause", "live"]),
          reason: z.string().trim().max(1000).optional(),
        })
      );
      const nextStatus = (action === "approve" || action === "live") ? "live" : action === "pause" ? "paused" : action === "reject" ? "rejected" : "pending_review";
      const verified = (action === "approve" || action === "live") ? true : action === "reject" ? false : undefined;
      const [property] = await db.update(properties).set({
        status: nextStatus,
        rejectionReason: action === "reject" ? (reason?.trim() || "Listing does not comply with our verification standards.") : action === "approve" || action === "live" ? null : undefined,
        ...(verified !== undefined ? { verified } : {}),
        updatedAt: new Date(),
      }).where(eq(properties.id, id)).returning();
      if (!property) fail(404, "Listing not found.");
      const notificationMsg = action === "reject"
        ? `Your listing "${property.title}" was not approved. Reason: ${reason?.trim() || "Listing did not meet guidelines."}`
        : `Your listing "${property.title}" status has been updated to ${nextStatus}.`;
      await sendNotification(property.ownerId, "listing", notificationMsg, "/owner");
      return respond({ status: property.status, verified: property.verified, rejectionReason: property.rejectionReason });
    }

    if (segments[1] === "properties" && segments.length === 3 && method === "DELETE") {
      const id = validId(segments[2]);
      const [existing] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
      if (!existing || existing.category !== "rent_home") fail(404, "Listing not found.");
      await db.delete(properties).where(eq(properties.id, id));
      return respond({ message: "Listing permanently deleted by admin." });
    }

    if (route === "admin/users" && method === "GET") {
      const roleFilter = params.get("role");
      const q = params.get("q")?.trim();
      const page = pageFrom(request);
      const limit = Math.min(2000, Math.max(1, Number(params.get("limit")) || 50));

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
            lastLogin: users.lastLogin,
            consentAt: users.consentAt,
            otpVerifiedAt: users.otpVerifiedAt,
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
          lastLogin: u.lastLogin,
          listingsCount: propCounts[u.id] || 0,
          inquiriesCount: leadCounts[u.id] || 0,
        };
      });

      return respond({ items, total, page, pages: Math.ceil(total / limit) });
    }

    if (segments[0] === "admin" && segments[1] === "users" && segments.length === 3 && method === "GET") {
      const id = validId(segments[2]);
      const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!u) fail(404, "User not found.");

      const [userProps, userLeads] = await Promise.all([
        db
          .select({
            id: properties.id,
            title: properties.title,
            category: properties.category,
            propertyType: properties.propertyType,
            price: properties.price,
            status: properties.status,
            verified: properties.verified,
            city: properties.city,
            locality: properties.locality,
            createdAt: properties.createdAt,
          })
          .from(properties)
          .where(eq(properties.ownerId, id))
          .orderBy(desc(properties.createdAt)),
        db
          .select({
            id: leads.id,
            propertyId: leads.propertyId,
            status: leads.status,
            createdAt: leads.createdAt,
            propertyTitle: properties.title,
            propertyCategory: properties.category,
            propertyCity: properties.city,
          })
          .from(leads)
          .innerJoin(properties, eq(leads.propertyId, properties.id))
          .where(eq(leads.customerId, id))
          .orderBy(desc(leads.createdAt)),
      ]);

      const isAdmin = u.roles.includes("admin") || u.role === "admin";
      const isOwner = !isAdmin && u.roles.includes("owner");

      return respond({
        user: {
          id: u.id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          city: u.city,
          location: u.location,
          role: u.role,
          roles: u.roles,
          lastLogin: u.lastLogin,
          consentAt: u.consentAt,
          otpVerifiedAt: u.otpVerifiedAt,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          category: isAdmin ? "admin" : isOwner ? "owner" : "customer",
          categoryLabel: isAdmin ? "Platform Admin" : isOwner ? "Owner / Rent" : "Home Seeker",
          listingsCount: userProps.length,
          inquiriesCount: userLeads.length,
        },
        properties: userProps,
        inquiries: userLeads,
      });
    }

    if (route === "admin/manager-requests" && method === "GET") {
      const q = params.get("q")?.trim();
      const statusFilter = params.get("status")?.trim();
      const tierFilter = params.get("tier")?.trim();
      const modeFilter = params.get("mode")?.trim();
      const page = pageFrom(request);
      const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 30));

      const conditions: any[] = [];
      if (statusFilter && statusFilter !== "all") {
        conditions.push(eq(managerRequests.requestStatus, statusFilter));
      }
      if (tierFilter && tierFilter !== "all") {
        conditions.push(eq(managerRequests.managedTier, tierFilter));
      }
      if (modeFilter && modeFilter !== "all") {
        conditions.push(eq(managerRequests.listingMode, modeFilter));
      }
      if (q) {
        conditions.push(
          or(
            ilike(managerRequests.propertyTitle, `%${q}%`),
            ilike(managerRequests.locality, `%${q}%`),
            ilike(managerRequests.city, `%${q}%`),
            ilike(managerRequests.ownerContactPhone, `%${q}%`),
            ilike(users.name, `%${q}%`),
            ilike(users.email, `%${q}%`),
            ilike(users.phone, `%${q}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [{ total }], allRows] = await Promise.all([
        db
          .select({
            id: managerRequests.id,
            ownerId: managerRequests.ownerId,
            propertyId: managerRequests.propertyId,
            listingMode: managerRequests.listingMode,
            managedTier: managerRequests.managedTier,
            feeAmount: managerRequests.feeAmount,
            paymentStatus: managerRequests.paymentStatus,
            transactionId: managerRequests.transactionId,
            isRecommended: managerRequests.isRecommended,
            requestStatus: managerRequests.requestStatus,
            assignedManagerId: managerRequests.assignedManagerId,
            assignedManagerName: managerRequests.assignedManagerName,
            propertyTitle: managerRequests.propertyTitle,
            locality: managerRequests.locality,
            city: managerRequests.city,
            ownerContactPhone: managerRequests.ownerContactPhone,
            notes: managerRequests.notes,
            createdAt: managerRequests.createdAt,
            updatedAt: managerRequests.updatedAt,
            owner: {
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            },
          })
          .from(managerRequests)
          .innerJoin(users, eq(managerRequests.ownerId, users.id))
          .where(where)
          .orderBy(desc(managerRequests.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db
          .select({ total: count() })
          .from(managerRequests)
          .innerJoin(users, eq(managerRequests.ownerId, users.id))
          .where(where),
        db
          .select({
            status: managerRequests.requestStatus,
            tier: managerRequests.managedTier,
            fee: managerRequests.feeAmount,
          })
          .from(managerRequests),
      ]);

      const stats = {
        total: allRows.length,
        newCount: allRows.filter((r) => r.status === "new").length,
        assignedCount: allRows.filter((r) => r.status === "assigned").length,
        inReviewCount: allRows.filter((r) => r.status === "in_review").length,
        publishedCount: allRows.filter((r) => r.status === "published").length,
        standardCount: allRows.filter((r) => r.tier === "standard").length,
        premiumCount: allRows.filter((r) => r.tier === "premium").length,
        totalRevenue: allRows.reduce((acc, r) => acc + (Number(r.fee) || 0), 0),
      };

      return respond({ items, total, stats, page, pages: Math.ceil(total / limit) });
    }

    if (segments[1] === "manager-requests" && segments.length === 3 && method === "PATCH") {
      const id = validId(segments[2]);
      const [existing] = await db
        .select()
        .from(managerRequests)
        .where(eq(managerRequests.id, id))
        .limit(1);
      if (!existing) fail(404, "Manager request not found.");

      let bodyJson: Record<string, unknown>;
      try {
        bodyJson = (await request.json()) as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Invalid JSON payload.");
      }

      const updates: Partial<typeof managerRequests.$inferInsert> = {
        updatedAt: new Date(),
      };

      const action = String(bodyJson.action || "update_status");
      const tierLabel = existing.managedTier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";

      if (action === "assign_manager") {
        const managerName = String(bodyJson.managerName || "").trim();
        if (!managerName) fail(400, "Manager name is required for assignment.");
        updates.assignedManagerName = managerName;
        updates.requestStatus = "assigned";
        if (typeof bodyJson.managerId === "string") {
          updates.assignedManagerId = bodyJson.managerId;
        }

        // Send status update notification to owner
        await sendNotification(
          existing.ownerId,
          "manager_request",
          `Manager ${managerName} has been assigned to your ${tierLabel} request. They will coordinate your property listing.`,
          "/owner"
        );
      } else if (action === "toggle_recommended") {
        const nextRecommended = Boolean(bodyJson.isRecommended);
        updates.isRecommended = nextRecommended;

        if (existing.propertyId) {
          await db
            .update(properties)
            .set({ isRecommended: nextRecommended, updatedAt: new Date() })
            .where(eq(properties.id, existing.propertyId));
        }
      } else if (action === "update_details") {
        if (typeof bodyJson.propertyTitle === "string") updates.propertyTitle = bodyJson.propertyTitle.trim();
        if (typeof bodyJson.locality === "string") updates.locality = bodyJson.locality.trim();
        if (typeof bodyJson.city === "string") updates.city = bodyJson.city.trim();
        if (typeof bodyJson.notes === "string") updates.notes = bodyJson.notes.trim();
      } else {
        const newStatus = String(bodyJson.status || existing.requestStatus);
        const validStatuses = ["new", "assigned", "in_review", "published", "rejected"];
        if (!validStatuses.includes(newStatus)) {
          fail(400, `Invalid request status. Expected one of: ${validStatuses.join(", ")}`);
        }
        updates.requestStatus = newStatus;
        if (typeof bodyJson.notes === "string") updates.notes = bodyJson.notes.trim();

        if (newStatus === "in_review") {
          await sendNotification(
            existing.ownerId,
            "manager_request",
            `Your ${tierLabel} verification and listing optimization is currently in progress.`,
            "/owner"
          );
        } else if (newStatus === "published") {
          await sendNotification(
            existing.ownerId,
            "manager_request",
            `Your managed listing is now published and live on Apna Aangan!`,
            "/owner"
          );
          if (existing.propertyId) {
            await db
              .update(properties)
              .set({ status: "live", verified: true, isRecommended: existing.isRecommended, updatedAt: new Date() })
              .where(eq(properties.id, existing.propertyId));
          }
        } else if (newStatus === "rejected") {
          await sendNotification(
            existing.ownerId,
            "manager_request",
            `Update on your ${tierLabel} request: ${bodyJson.notes || "Listing could not be approved. Please review details."}`,
            "/owner"
          );
        }
      }

      const [updated] = await db
        .update(managerRequests)
        .set(updates)
        .where(eq(managerRequests.id, id))
        .returning();

      return respond({ request: updated, message: "Manager request updated successfully." });
    }

    if (route === "admin/dashboard/stats" && method === "GET") {
      const [listingCounts, statusCounts, [{ total: inquiryTotal }], [{ pending }], [{ totalAll: totalListings }], [{ totalUsers }], [{ totalOwners }], [{ seekerCount }], [{ totalManagerRequests }], [{ newManagerRequests }], recent] = await Promise.all([
        db.select({ category: properties.category, total: count() }).from(properties).where(and(or(eq(properties.status, "live"), eq(properties.status, "rented")), eq(properties.category, "rent_home"))).groupBy(properties.category),
        db.select({ status: leads.status, total: count() }).from(leads).groupBy(leads.status),
        db.select({ total: count() }).from(leads),
        db.select({ pending: count() }).from(properties).where(and(eq(properties.status, "pending_review"), eq(properties.category, "rent_home"))),
        db.select({ totalAll: count() }).from(properties).where(and(eq(properties.category, "rent_home"), ne(properties.status, "rejected"))),
        db.select({ totalUsers: count() }).from(users),
        db.select({ totalOwners: count() }).from(users).where(and(sql`${users.roles}::jsonb ? 'owner'`, sql`NOT (${users.roles}::jsonb ? 'admin')`)),
        db.select({ seekerCount: count() }).from(users).where(and(sql`NOT (${users.roles}::jsonb ? 'owner')`, sql`NOT (${users.roles}::jsonb ? 'admin')`)),
        db.select({ totalManagerRequests: count() }).from(managerRequests),
        db.select({ newManagerRequests: count() }).from(managerRequests).where(eq(managerRequests.requestStatus, "new")),
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
        managerRequestsCount: totalManagerRequests,
        newManagerRequestsCount: newManagerRequests,
        inquiriesByDay: byDay,
        conversionRate: inquiryTotal ? Math.round(((statusCounts.find((item) => item.status === "closed_won")?.total || 0) / inquiryTotal) * 100) : 0,
      });
    }

    if (route === "admin/dashboard-summary" && method === "GET") {
      const [allProps, allDeals, allTxns] = await Promise.all([
        db.select().from(properties),
        db.select().from(rentalDeals).orderBy(desc(rentalDeals.createdAt)),
        db.select().from(transactionsLedger).orderBy(desc(transactionsLedger.createdAt)),
      ]);

      const propMap = new Map(allProps.map((p) => [p.id, p]));

      // 1. Strict Property Counting Rule: Exclude Rejected Listings Everywhere
      // Only count properties that are actively live/listed or rented
      const liveProps = allProps.filter((p) => p.status !== "rejected" && p.rentalStatus !== "inactive");

      const rentedFlats = liveProps.filter((p) => p.rentalStatus === "rented" || p.status === "rented").length;
      const pendingFlats = liveProps.filter(
        (p) =>
          (p.rentalStatus === "available_pending" || p.rentalStatus === "deal_in_progress" || p.status === "live") &&
          p.rentalStatus !== "rented" &&
          p.status !== "rented"
      ).length;

      // Strict Live Inventory Check: total_live_flats === rented_flats + pending_flats
      const totalFlats = rentedFlats + pendingFlats;
      const availableOnly = liveProps.filter(
        (p) => p.rentalStatus === "available_pending" && p.status !== "rented"
      ).length;
      const dealInProgressOnly = liveProps.filter(
        (p) => p.rentalStatus === "deal_in_progress" && p.status !== "rented"
      ).length;
      const underReview = liveProps.filter((p) => p.status === "pending_review" || !p.verified).length;
      const occupancyRate = totalFlats > 0 ? Math.round((rentedFlats / totalFlats) * 100) : 0;

      // 2. Rule B — Closed Deals Only in Deposit & Brokerage Collection Tracker:
      // A flat's brokerage and security deposit enter tracking ONLY when the deal is Closed / Rented
      // (deal_status = 'closed' OR 'active_rented' AND property status = 'rented') on non-rejected property.
      const closedDeals = allDeals.filter((d) => {
        const p = propMap.get(d.propertyId);
        if (!p || p.status === "rejected" || p.rentalStatus === "inactive") return false;
        const isClosed = d.dealStatus === "closed" || d.dealStatus === "active_rented";
        const isRented = p.rentalStatus === "rented" || p.status === "rented";
        return isClosed && isRented;
      });

      // Security Deposit Overview (Closed Deals Only)
      const totalExpectedDeposit = closedDeals.reduce((sum, d) => sum + Number(d.securityDepositTotal || 0), 0);
      const collectedDeposit = closedDeals.reduce((sum, d) => sum + Number(d.securityDepositCollected || 0), 0);
      const remainingDeposit = Math.max(0, totalExpectedDeposit - collectedDeposit);

      // Brokerage Fees (Closed Deals Only)
      const ownerExpected = closedDeals.reduce((sum, d) => sum + Number(d.ownerFeeTotal || 0), 0);
      const ownerCollected = closedDeals.reduce((sum, d) => sum + Number(d.ownerFeeCollected || 0), 0);
      const pendingFromOwners = Math.max(0, ownerExpected - ownerCollected);

      const seekerExpected = closedDeals.reduce((sum, d) => sum + Number(d.seekerFeeTotal || 0), 0);
      const seekerCollected = closedDeals.reduce((sum, d) => sum + Number(d.seekerFeeCollected || 0), 0);
      const pendingFromSeekers = Math.max(0, seekerExpected - seekerCollected);

      const totalPendingFees = pendingFromOwners + pendingFromSeekers;

      // 3. Rule C & Revenue Recognition:
      // Only settled transactions linked to valid (non-rejected) properties count toward revenue and account balance.
      const validSettledTxns = allTxns.filter((t) => {
        if (t.status !== "settled") return false;
        if (t.propertyId) {
          const p = propMap.get(t.propertyId);
          if (p && (p.status === "rejected" || p.rentalStatus === "inactive")) return false;
        }
        if (t.dealId) {
          const d = allDeals.find((deal) => deal.id === t.dealId);
          if (d) {
            const p = propMap.get(d.propertyId);
            if (p && (p.status === "rejected" || p.rentalStatus === "inactive")) return false;
          }
        }
        return true;
      });

      const currentMonthPrefix = new Date().toISOString().slice(0, 7);

      // Total Revenue = SUM(amount) WHERE status = 'settled' AND category IN ('owner_brokerage', 'seeker_brokerage', 'managed_listing_fee')
      const ownerFeesAllTime = validSettledTxns
        .filter((t) => t.category === "owner_brokerage" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const seekerFeesAllTime = validSettledTxns
        .filter((t) => t.category === "seeker_brokerage" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const managedListingFeesAllTime = validSettledTxns
        .filter((t) => t.category === "managed_listing_fee" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const totalRevenueAllTime = ownerFeesAllTime + seekerFeesAllTime + managedListingFeesAllTime;

      // This Month Revenue
      const thisMonthTxns = validSettledTxns.filter(
        (t) => t.createdAt.toISOString().slice(0, 7) === currentMonthPrefix
      );
      const ownerFeesMonth = thisMonthTxns
        .filter((t) => t.category === "owner_brokerage" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const seekerFeesMonth = thisMonthTxns
        .filter((t) => t.category === "seeker_brokerage" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const managedFeesMonth = thisMonthTxns
        .filter((t) => t.category === "managed_listing_fee" && t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const totalRevenueThisMonth = ownerFeesMonth + seekerFeesMonth + managedFeesMonth;

      // Money in Our Account (Net Settled) = SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) WHERE status = 'settled'
      const totalSettledCredits = validSettledTxns
        .filter((t) => t.direction === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalSettledDebits = validSettledTxns
        .filter((t) => t.direction === "debit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const netAccountBalance = totalSettledCredits - totalSettledDebits;

      // Groupings for Tab 1 Analytics (strictly over non-rejected liveProps & closedDeals)
      const localityMap = new Map<string, { locality: string; rented: number; pending: number; total: number }>();
      liveProps.forEach((p) => {
        const loc = p.locality || "Unknown";
        const cur = localityMap.get(loc) || { locality: loc, rented: 0, pending: 0, total: 0 };
        cur.total += 1;
        if (p.rentalStatus === "rented" || p.status === "rented") cur.rented += 1;
        else cur.pending += 1;
        localityMap.set(loc, cur);
      });
      const byLocality = Array.from(localityMap.values()).sort((a, b) => b.total - a.total);

      const typeMap = new Map<string, { type: string; rented: number; pending: number; total: number }>();
      liveProps.forEach((p) => {
        const t = p.propertyType || "Apartment";
        const cur = typeMap.get(t) || { type: t, rented: 0, pending: 0, total: 0 };
        cur.total += 1;
        if (p.rentalStatus === "rented" || p.status === "rented") cur.rented += 1;
        else cur.pending += 1;
        typeMap.set(t, cur);
      });
      const byPropertyType = Array.from(typeMap.values()).sort((a, b) => b.total - a.total);

      const durationMap = new Map<string, { duration: string; dealsCount: number; totalRent: number }>();
      closedDeals.forEach((d) => {
        const dur = `${d.stayDurationMonths || 11} Months`;
        const cur = durationMap.get(dur) || { duration: dur, dealsCount: 0, totalRent: 0 };
        cur.dealsCount += 1;
        cur.totalRent += Number(d.monthlyRent || 0);
        durationMap.set(dur, cur);
      });
      const byStayDuration = Array.from(durationMap.values());

      const cashflowSummary = {
        securityDeposit: {
          expected: totalExpectedDeposit,
          collected: collectedDeposit,
          remaining: remainingDeposit,
          collectedPct: totalExpectedDeposit > 0 ? Math.round((collectedDeposit / totalExpectedDeposit) * 100) : 100,
        },
        ownerBrokerage: {
          expected: ownerExpected,
          collected: ownerCollected,
          remaining: pendingFromOwners,
          collectedPct: ownerExpected > 0 ? Math.round((ownerCollected / ownerExpected) * 100) : 100,
        },
        seekerBrokerage: {
          expected: seekerExpected,
          collected: seekerCollected,
          remaining: pendingFromSeekers,
          collectedPct: seekerExpected > 0 ? Math.round((seekerCollected / seekerExpected) * 100) : 100,
        },
        totalCashflow: {
          expected: totalExpectedDeposit + ownerExpected + seekerExpected,
          collected: collectedDeposit + ownerCollected + seekerCollected,
          remaining: remainingDeposit + pendingFromOwners + pendingFromSeekers,
          collectedPct:
            totalExpectedDeposit + ownerExpected + seekerExpected > 0
              ? Math.round(
                  ((collectedDeposit + ownerCollected + seekerCollected) /
                    (totalExpectedDeposit + ownerExpected + seekerExpected)) *
                    100
                )
              : 100,
        },
      };

      return respond({
        kpis: {
          totalFlatsListed: {
            total: totalFlats,
            rented: rentedFlats,
            availablePending: pendingFlats,
            underReview,
          },
          flatsCurrentlyRented: {
            count: rentedFlats,
            occupancyRate,
          },
          flatsPendingAvailable: {
            count: pendingFlats,
            available: availableOnly,
            dealInProgress: dealInProgressOnly,
          },
          totalRevenue: {
            allTime: totalRevenueAllTime,
            thisMonth: totalRevenueThisMonth,
            breakdown: {
              ownerFees: ownerFeesAllTime,
              seekerFees: seekerFeesAllTime,
              managedListingFees: managedListingFeesAllTime,
            },
            thisMonthBreakdown: {
              ownerFees: ownerFeesMonth,
              seekerFees: seekerFeesMonth,
              managedListingFees: managedFeesMonth,
            },
          },
          moneyInAccount: {
            netCollected: netAccountBalance,
            totalCredits: totalSettledCredits,
            totalDebits: totalSettledDebits,
          },
          securityDepositOverview: {
            totalExpected: totalExpectedDeposit,
            collectedSoFar: collectedDeposit,
            remainingPending: remainingDeposit,
          },
          pendingBrokerageFees: {
            pendingFromOwners,
            pendingFromSeekers,
            totalPending: totalPendingFees,
          },
        },
        analytics: {
          byLocality,
          byPropertyType,
          byStayDuration,
          cashflowSummary,
        },
      });
    }

    if (route === "admin/deals-ledger" && method === "GET") {
      const search = (request.nextUrl.searchParams.get("search") || "").trim().toLowerCase();
      const rentalStatusFilter = request.nextUrl.searchParams.get("rentalStatus") || "all";
      const ownerFeeStatusFilter = request.nextUrl.searchParams.get("ownerFeeStatus") || "all";
      const seekerFeeStatusFilter = request.nextUrl.searchParams.get("seekerFeeStatus") || "all";
      const depositStatusFilter = request.nextUrl.searchParams.get("depositStatus") || "all";
      const localityFilter = (request.nextUrl.searchParams.get("locality") || "").trim().toLowerCase();

      const [dealsList, propsList, txnsList, usersList] = await Promise.all([
        db.select().from(rentalDeals).orderBy(desc(rentalDeals.createdAt)),
        db.select().from(properties),
        db.select().from(transactionsLedger).orderBy(desc(transactionsLedger.createdAt)),
        db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email }).from(users),
      ]);

      // Strict exclusion of rejected properties everywhere
      const liveProps = propsList.filter((p) => p.status !== "rejected" && p.rentalStatus !== "inactive");
      const livePropMap = new Map(liveProps.map((p) => [p.id, p]));
      const userMap = new Map(usersList.map((u) => [u.id, u]));

      // Only deals linked to valid live properties
      const validDeals = dealsList.filter((d) => livePropMap.has(d.propertyId));

      // Enrich deals
      let enrichedDeals = validDeals.map((deal) => {
        const prop = livePropMap.get(deal.propertyId);
        const owner = userMap.get(deal.ownerId);

        const depTotal = Number(deal.securityDepositTotal || 0);
        const depCollected = Number(deal.securityDepositCollected || 0);
        const depRemaining = Math.max(0, depTotal - depCollected);
        const depositStatus = depRemaining <= 0 ? "collected" : depCollected > 0 ? "partial" : "pending";

        const ownerTotal = Number(deal.ownerFeeTotal || 0);
        const ownerCollected = Number(deal.ownerFeeCollected || 0);
        const ownerRemaining = Math.max(0, ownerTotal - ownerCollected);
        const ownerFeeStatus = ownerRemaining <= 0 ? "paid" : ownerCollected > 0 ? "partial" : "pending";

        const seekerTotal = Number(deal.seekerFeeTotal || 0);
        const seekerCollected = Number(deal.seekerFeeCollected || 0);
        const seekerRemaining = Math.max(0, seekerTotal - seekerCollected);
        const seekerFeeStatus = seekerRemaining <= 0 ? "paid" : seekerCollected > 0 ? "partial" : "pending";

        const dealTxns = txnsList.filter((t) => t.dealId === deal.id && t.status === "settled");
        const ownerLastTxn = dealTxns.find((t) => t.category === "owner_brokerage");
        const seekerLastTxn = dealTxns.find((t) => t.category === "seeker_brokerage" || t.category === "security_deposit");

        const hasOverdueOrPending = depRemaining > 0 || ownerRemaining > 0 || seekerRemaining > 0;

        return {
          id: deal.id,
          dealCode: deal.dealCode || `DEAL-${deal.id.slice(0, 8).toUpperCase()}`,
          dealStatus: deal.dealStatus,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          leaseStartDate: deal.leaseStartDate,
          leaseEndDate: deal.leaseEndDate,
          monthlyRent: Number(deal.monthlyRent || prop?.price || 0),
          stayDurationMonths: deal.stayDurationMonths || 11,
          notes: deal.notes,
          hasOverdueOrPending,
          property: {
            id: prop?.id || deal.propertyId,
            title: prop?.title || "Rental Property",
            locality: prop?.locality || "Bengaluru",
            address: prop?.address || "",
            propertyType: prop?.propertyType || "Apartment",
            bhkOrRoomType: prop?.bhkOrRoomType || "2 BHK",
            rentalStatus: prop?.rentalStatus || "available_pending",
          },
          owner: {
            id: deal.ownerId,
            name: owner?.name || prop?.ownerName || "Owner",
            phone: owner?.phone || prop?.ownerPhone || "",
            email: owner?.email || "",
            feeStatus: ownerFeeStatus,
            feeTotal: ownerTotal,
            feeCollected: ownerCollected,
            feeRemaining: ownerRemaining,
            lastPaymentDate: ownerLastTxn?.createdAt || null,
            lastPaymentMode: ownerLastTxn?.paymentMode || null,
          },
          seeker: {
            id: deal.seekerId || null,
            name: deal.seekerName || "Prospective Tenant",
            phone: deal.seekerPhone || "",
            email: deal.seekerEmail || "",
            feeStatus: seekerFeeStatus,
            feeTotal: seekerTotal,
            feeCollected: seekerCollected,
            feeRemaining: seekerRemaining,
            lastPaymentDate: seekerLastTxn?.createdAt || null,
            lastPaymentMode: seekerLastTxn?.paymentMode || null,
          },
          securityDeposit: {
            total: depTotal,
            collected: depCollected,
            remaining: depRemaining,
            status: depositStatus,
          },
        };
      });

      // Filter deals
      if (search) {
        enrichedDeals = enrichedDeals.filter(
          (d) =>
            d.dealCode.toLowerCase().includes(search) ||
            d.property.title.toLowerCase().includes(search) ||
            d.property.locality.toLowerCase().includes(search) ||
            d.owner.name.toLowerCase().includes(search) ||
            d.owner.phone.toLowerCase().includes(search) ||
            d.seeker.name.toLowerCase().includes(search) ||
            d.seeker.phone.toLowerCase().includes(search)
        );
      }
      if (localityFilter) {
        enrichedDeals = enrichedDeals.filter((d) => d.property.locality.toLowerCase().includes(localityFilter));
      }
      if (rentalStatusFilter !== "all") {
        enrichedDeals = enrichedDeals.filter((d) => d.property.rentalStatus === rentalStatusFilter);
      }
      if (ownerFeeStatusFilter !== "all") {
        enrichedDeals = enrichedDeals.filter((d) => d.owner.feeStatus === ownerFeeStatusFilter);
      }
      if (seekerFeeStatusFilter !== "all") {
        enrichedDeals = enrichedDeals.filter((d) => d.seeker.feeStatus === seekerFeeStatusFilter);
      }
      if (depositStatusFilter !== "all") {
        enrichedDeals = enrichedDeals.filter((d) => d.securityDeposit.status === depositStatusFilter);
      }

      // Flat Inventory View (Strictly non-rejected liveProps)
      const activeDealMap = new Map(validDeals.filter((d) => d.dealStatus === "closed" || d.dealStatus === "active_rented").map((d) => [d.propertyId, d]));
      const inventory = liveProps.map((p) => {
        const owner = userMap.get(p.ownerId);
        const activeDeal = activeDealMap.get(p.id);

        let rentalStatusLabel = "Pending (Available to Rent)";
        if (p.rentalStatus === "rented" || p.status === "rented") rentalStatusLabel = "Rented (Active)";
        else if (p.rentalStatus === "deal_in_progress") rentalStatusLabel = "Deal In Progress";
        else if (p.status === "pending_review" || !p.verified) rentalStatusLabel = "Verification Pending";

        const daysVacant = Math.max(1, Math.round((Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

        return {
          id: p.id,
          title: p.title,
          locality: p.locality,
          city: p.city,
          propertyType: p.propertyType,
          bhkOrRoomType: p.bhkOrRoomType,
          monthlyRent: Number(p.monthlyRent || p.price),
          deposit: Number(p.deposit || 0),
          rentalStatus: p.rentalStatus || "available_pending",
          rentalStatusLabel,
          status: p.status,
          verified: p.verified,
          ownerName: p.ownerName || owner?.name || "Owner",
          ownerPhone: p.ownerPhone || owner?.phone || "",
          currentTenant: activeDeal
            ? {
                name: activeDeal.seekerName,
                phone: activeDeal.seekerPhone,
                leaseStartDate: activeDeal.leaseStartDate,
                leaseEndDate: activeDeal.leaseEndDate,
              }
            : null,
          daysVacant,
          createdAt: p.createdAt,
        };
      });

      // Filter transactions: exclude any tied to rejected properties
      const validTxns = txnsList.filter((t) => {
        if (t.propertyId && !livePropMap.has(t.propertyId)) return false;
        if (t.dealId) {
          const d = dealsList.find((deal) => deal.id === t.dealId);
          if (d && !livePropMap.has(d.propertyId)) return false;
        }
        return true;
      });

      // Compute Running Account Balance on Valid Transactions
      const sortedAscTxns = [...validTxns].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      let runningBalance = 0;
      const txnsWithRunningBalance = sortedAscTxns.map((t) => {
        const amt = Number(t.amount || 0);
        if (t.status === "settled") {
          if (t.direction === "credit") runningBalance += amt;
          else if (t.direction === "debit") runningBalance -= amt;
        }
        return {
          ...t,
          runningBalance,
        };
      });
      const chronologicalTxns = txnsWithRunningBalance.reverse();

      return respond({
        deals: enrichedDeals,
        inventory,
        transactions: chronologicalTxns,
        totalDeals: enrichedDeals.length,
        totalInventory: inventory.length,
        totalTransactions: chronologicalTxns.length,
      });
    }

    if (route === "admin/record-payment" && method === "POST") {
      let json: Record<string, unknown>;
      try {
        json = (await request.json()) as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Invalid JSON payload.");
      }

      const amountNum = Number(json.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new HttpError(422, "Please enter a valid payment amount greater than zero.");
      }

      const dealId = typeof json.dealId === "string" && json.dealId ? json.dealId : null;
      const propertyId = typeof json.propertyId === "string" && json.propertyId ? json.propertyId : null;
      const category = (typeof json.category === "string" ? json.category : "owner_brokerage") as
        | "owner_brokerage"
        | "seeker_brokerage"
        | "security_deposit"
        | "managed_listing_fee"
        | "refund_or_payout";
      const payerType = (typeof json.payerType === "string" ? json.payerType : "seeker") as "owner" | "seeker" | "other";
      const payerName = typeof json.payerName === "string" && json.payerName.trim() ? json.payerName.trim() : "Payer";
      const direction = json.direction === "debit" ? "debit" : "credit";
      const paymentMode = typeof json.paymentMode === "string" && json.paymentMode ? json.paymentMode : "upi";
      const referenceId =
        typeof json.referenceId === "string" && json.referenceId.trim()
          ? json.referenceId.trim()
          : `REF-${paymentMode.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      const notes = typeof json.notes === "string" ? json.notes.trim() : null;

      const txnCode = `TXN-${category.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;

      const [transaction] = await db
        .insert(transactionsLedger)
        .values({
          txnCode,
          dealId,
          propertyId,
          payerType,
          payerName,
          category,
          amount: amountNum.toFixed(2),
          direction,
          paymentMode,
          referenceId,
          status: "settled",
          reconciliationStatus: "reconciled",
          notes,
          recordedByAdminId: admin.id,
          recordedByAdminName: admin.name || "Aangan Admin",
        })
        .returning();

      // If tied to a deal, update collected amounts on rental_deals
      let updatedDeal: RentalDeal | null = null;
      if (dealId) {
        const [existingDeal] = await db.select().from(rentalDeals).where(eq(rentalDeals.id, dealId));
        if (existingDeal) {
          const updates: Partial<typeof rentalDeals.$inferInsert> = {
            updatedAt: new Date(),
          };
          if (category === "owner_brokerage") {
            const current = Number(existingDeal.ownerFeeCollected || 0);
            updates.ownerFeeCollected = (current + amountNum).toFixed(2);
          } else if (category === "seeker_brokerage") {
            const current = Number(existingDeal.seekerFeeCollected || 0);
            updates.seekerFeeCollected = (current + amountNum).toFixed(2);
          } else if (category === "security_deposit") {
            const current = Number(existingDeal.securityDepositCollected || 0);
            updates.securityDepositCollected = (current + amountNum).toFixed(2);
          }

          const [d] = await db.update(rentalDeals).set(updates).where(eq(rentalDeals.id, dealId)).returning();
          updatedDeal = d;
        }
      }

      return respond(
        {
          transaction,
          updatedDeal,
          message: `Payment of ₹${amountNum.toLocaleString("en-IN")} recorded successfully for ${category.replace("_", " ")}.`,
        },
        201
      );
    }

    if (
      segments[0] === "admin" &&
      segments[1] === "properties" &&
      segments.length === 4 &&
      (segments[3] === "status" || segments[3] === "rental-status") &&
      method === "PATCH"
    ) {
      const propId = segments[2];
      const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const rentalStatus = typeof json.rentalStatus === "string" ? json.rentalStatus : undefined;
      const status = typeof json.status === "string" ? (json.status as any) : undefined;

      const updates: any = { updatedAt: new Date() };
      if (rentalStatus) updates.rentalStatus = rentalStatus;
      if (status) updates.status = status;

      const [updated] = await db.update(properties).set(updates).where(eq(properties.id, propId)).returning();
      return respond({ property: updated, message: "Property rental status updated successfully." });
    }

    if (route === "admin/rental-deals" && method === "POST") {
      const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const propertyId = String(json.propertyId || "");
      if (!propertyId) throw new HttpError(422, "Property ID is required.");

      const [prop] = await db.select().from(properties).where(eq(properties.id, propertyId));
      if (!prop) throw new HttpError(404, "Property not found.");

      const monthlyRent = Number(json.monthlyRent || prop.price || 0);
      const stayDurationMonths = Number(json.stayDurationMonths || 11);
      const securityDepositTotal = Number(json.securityDepositTotal || monthlyRent * 2).toFixed(2);
      const ownerFeeTotal = Number(json.ownerFeeTotal || monthlyRent * 0.5).toFixed(2);
      const seekerFeeTotal = Number(json.seekerFeeTotal || monthlyRent * 0.5).toFixed(2);

      const dealCode = `DEAL-AA-${Date.now().toString().slice(-4)}`;
      const [deal] = await db
        .insert(rentalDeals)
        .values({
          dealCode,
          propertyId,
          ownerId: prop.ownerId,
          seekerName: typeof json.seekerName === "string" ? json.seekerName : "Tenant",
          seekerPhone: typeof json.seekerPhone === "string" ? json.seekerPhone : "",
          seekerEmail: typeof json.seekerEmail === "string" ? json.seekerEmail : "",
          leaseStartDate: json.leaseStartDate ? new Date(String(json.leaseStartDate)) : new Date(),
          leaseEndDate: json.leaseEndDate ? new Date(String(json.leaseEndDate)) : null,
          monthlyRent,
          stayDurationMonths,
          securityDepositTotal,
          securityDepositCollected: Number(json.securityDepositCollected || 0).toFixed(2),
          ownerFeeTotal,
          ownerFeeCollected: Number(json.ownerFeeCollected || 0).toFixed(2),
          seekerFeeTotal,
          seekerFeeCollected: Number(json.seekerFeeCollected || 0).toFixed(2),
          dealStatus: (json.dealStatus as any) || "in_progress",
          notes: typeof json.notes === "string" ? json.notes : "",
        })
        .returning();

      if (json.dealStatus === "active_rented") {
        await db.update(properties).set({ rentalStatus: "rented" }).where(eq(properties.id, propertyId));
      } else {
        await db.update(properties).set({ rentalStatus: "deal_in_progress" }).where(eq(properties.id, propertyId));
      }

      return respond({ deal, message: "Rental deal created successfully." }, 201);
    }
  }

  if (route === "whatsapp/webhook" && method === "GET") {
    const mode = request.nextUrl.searchParams.get("hub.mode");
    const token = request.nextUrl.searchParams.get("hub.verify_token");
    const challenge = request.nextUrl.searchParams.get("hub.challenge");
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "aangan_wa_verify_secret";
    if (mode === "subscribe" && token === verifyToken) {
      return new NextResponse(challenge || "", { status: 200 });
    }
    fail(403, "Webhook verification failed.");
  }

  if (route === "whatsapp/webhook" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as any;
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const messageObj = change?.value?.messages?.[0];

      if (messageObj) {
        const payloadStr = (messageObj?.button?.payload || messageObj?.interactive?.button_reply?.id || "") as string;
        const textBody = (messageObj?.text?.body?.trim()?.toLowerCase() || "") as string;

        let responseType: "interested" | "not_interested" | null = null;
        let leadId = "";

        if (payloadStr.startsWith("INTERESTED_")) {
          responseType = "interested";
          leadId = payloadStr.replace("INTERESTED_", "");
        } else if (payloadStr.startsWith("NOT_INTERESTED_")) {
          responseType = "not_interested";
          leadId = payloadStr.replace("NOT_INTERESTED_", "");
        } else if (textBody === "interested") {
          responseType = "interested";
        } else if (textBody.includes("not interested")) {
          responseType = "not_interested";
        }

        if (responseType && uuid.safeParse(leadId).success) {
          await handleOwnerResponse(leadId, responseType, "whatsapp");
        }
      }
    } catch (e) {
      console.error("WhatsApp webhook processing error:", e);
    }
    return respond({ status: "ok" });
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
