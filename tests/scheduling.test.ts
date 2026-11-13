import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../src/db";
import { leads, meetings, notifications, properties, users } from "../src/db/schema";
import { dispatch } from "../src/lib/api-handler";
import {
  canTransitionMeetingStatus,
  getSlotConflictBounds,
  validateVisitSlot,
} from "../src/lib/scheduling";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from "../src/lib/seed";

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
  return dispatch(request, method, { params: Promise.resolve({ segments: route.split("/") }) });
}

function cookieFrom(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  assert.ok(cookie?.value, `Expected ${name} session cookie`);
  return `${name}=${cookie.value}`;
}

test("scheduling rules: validateVisitSlot rejects past, >90d, and enforces same-day cutoffs", () => {
  // 10:00 AM IST on 2026-06-15 => 04:30 UTC
  const morningIst = new Date("2026-06-15T04:30:00.000Z");

  assert.equal(validateVisitSlot(new Date("2026-06-15T04:00:00.000Z"), morningIst).valid, false);
  assert.equal(validateVisitSlot(new Date("2026-06-15T05:30:00.000Z"), morningIst).valid, false); // only +1h same day
  assert.equal(validateVisitSlot(new Date("2026-06-15T07:00:00.000Z"), morningIst).valid, true); // +2.5h same day (12:30 IST)
  assert.equal(validateVisitSlot(new Date("2026-06-15T16:00:00.000Z"), morningIst).valid, false); // 21:30 IST (after 9 PM)

  // After 6:00 PM IST cutoff (18:15 IST => 12:45 UTC)
  const eveningIst = new Date("2026-06-15T12:45:00.000Z");
  const lateSameDay = validateVisitSlot(new Date("2026-06-15T15:15:00.000Z"), eveningIst);
  assert.equal(lateSameDay.valid, false);
  if (!lateSameDay.valid) assert.match(lateSameDay.error, /cutoff/i);

  // Tomorrow works cleanly even after 6 PM cutoff
  assert.equal(validateVisitSlot(new Date("2026-06-16T05:00:00.000Z"), eveningIst).valid, true);

  // Beyond 90 days rejected
  const tooFar = new Date(morningIst.getTime() + 95 * 24 * 60 * 60 * 1000);
  assert.equal(validateVisitSlot(tooFar, morningIst).valid, false);
});

test("scheduling rules: conflict bounds and meeting status transition matrix", () => {
  const target = new Date("2026-06-16T10:00:00.000Z");
  const bounds = getSlotConflictBounds(target);
  assert.equal(bounds.windowStart.toISOString(), "2026-06-16T09:00:00.000Z");
  assert.equal(bounds.windowEnd.toISOString(), "2026-06-16T11:00:00.000Z");

  assert.equal(canTransitionMeetingStatus("proposed", "confirmed").allowed, true);
  assert.equal(canTransitionMeetingStatus("proposed", "rescheduled").allowed, true);
  assert.equal(canTransitionMeetingStatus("proposed", "cancelled").allowed, true);
  assert.equal(canTransitionMeetingStatus("proposed", "completed").allowed, false);

  assert.equal(canTransitionMeetingStatus("confirmed", "completed").allowed, true);
  assert.equal(canTransitionMeetingStatus("confirmed", "rescheduled").allowed, true);
  assert.equal(canTransitionMeetingStatus("rescheduled", "confirmed").allowed, true);
  assert.equal(canTransitionMeetingStatus("rescheduled", "rescheduled", { hasNewScheduledAt: true }).allowed, true);

  assert.equal(canTransitionMeetingStatus("completed", "cancelled").allowed, false);
  assert.equal(canTransitionMeetingStatus("cancelled", "confirmed").allowed, false);
});

test("e2e enquiry blocking, double-booking prevention, and cross-dashboard visit transitions", async () => {
  const ownerPhone = "+919866111001";
  const seekerOnePhone = "+919866111002";
  const seekerTwoPhone = "+919866111003";
  const createdPropertyIds: string[] = [];

  try {
    // Sign in Owner
    await call("auth/otp/request", "POST", { phone: ownerPhone });
    const verifyOwner = await call("auth/otp/verify", "POST", { phone: ownerPhone, code: "123456" });
    const ownerCookie = cookieFrom(verifyOwner, "aangan_access");
    await call("profile", "PATCH", { name: "Owner Schedule", email: "owner-sched@example.com", addOwnerRole: true, consent: true }, ownerCookie);

    // Sign in Seeker 1
    await call("auth/otp/request", "POST", { phone: seekerOnePhone });
    const verifyS1 = await call("auth/otp/verify", "POST", { phone: seekerOnePhone, code: "123456" });
    const seekerOneCookie = cookieFrom(verifyS1, "aangan_access");
    await call("profile", "PATCH", { name: "Seeker One", email: "seeker1@example.com", addOwnerRole: false, consent: true }, seekerOneCookie);

    // Sign in Seeker 2
    await call("auth/otp/request", "POST", { phone: seekerTwoPhone });
    const verifyS2 = await call("auth/otp/verify", "POST", { phone: seekerTwoPhone, code: "123456" });
    const seekerTwoCookie = cookieFrom(verifyS2, "aangan_access");
    await call("profile", "PATCH", { name: "Seeker Two", email: "seeker2@example.com", addOwnerRole: false, consent: true }, seekerTwoCookie);

    // Sign in Admin
    const adminStep1 = await call("admin/login", "POST", { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });
    assert.equal(adminStep1.status, 200);
    const challengeCookie = cookieFrom(adminStep1, "aangan_admin_challenge");
    const adminVerify = await call("admin/2fa", "POST", { code: "000000" }, challengeCookie);
    assert.equal(adminVerify.status, 200);
    const adminCookie = cookieFrom(adminVerify, "aangan_access");

    // Create a property -> starts pending_review, promote to live
    const propRes = await call(
      "properties",
      "POST",
      {
        category: "rent_home",
        propertyType: "Apartment",
        title: "Scheduling Test Residency",
        description: "Quiet residential apartment for end to end visit scheduling verification.",
        price: 32000,
        deposit: 64000,
        address: "88 Cedar Lane",
        city: "Bengaluru",
        locality: "Indiranagar",
        bhkOrRoomType: "2 BHK",
        areaSqft: 1120,
        bathrooms: 2,
        furnishingStatus: "Semi-furnished",
        amenities: ["Lift", "Parking"],
        images: ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg"],
      },
      ownerCookie
    );
    assert.equal(propRes.status, 201);
    const { property } = await propRes.json();
    createdPropertyIds.push(property.id);

    // Pause listing and verify enquiries are blocked with 422
    await db.update(properties).set({ status: "paused", verified: true }).where(eq(properties.id, property.id));
    const pausedInquiry = await call(
      "leads",
      "POST",
      {
        propertyId: property.id,
        occupantsCount: "2",
        tenantType: "Couple",
        profession: "Job-Salaried",
        confirmedPhone: "9866111002",
      },
      seekerOneCookie
    );
    assert.equal(pausedInquiry.status, 422);

    // Deleted/non-existent listing blocked with 404
    const deletedInquiry = await call(
      "leads",
      "POST",
      {
        propertyId: "00000000-0000-4000-8000-000000000999",
        occupantsCount: "2",
        tenantType: "Couple",
        profession: "Job-Salaried",
        confirmedPhone: "9866111002",
      },
      seekerOneCookie
    );
    assert.equal(deletedInquiry.status, 404);

    // Activate listing to live
    await db.update(properties).set({ status: "live", verified: true }).where(eq(properties.id, property.id));

    // Enquiries from Seeker 1 and Seeker 2 succeed; duplicate by Seeker 1 returns idempotent 200
    const leadRes1 = await call(
      "leads",
      "POST",
      {
        propertyId: property.id,
        occupantsCount: "2",
        tenantType: "Couple",
        profession: "Job-Salaried",
        confirmedPhone: "9866111002",
      },
      seekerOneCookie
    );
    assert.equal(leadRes1.status, 201);
    const lead1 = (await leadRes1.json()).lead;

    const dupLeadRes = await call(
      "leads",
      "POST",
      {
        propertyId: property.id,
        occupantsCount: "2",
        tenantType: "Couple",
        profession: "Job-Salaried",
        confirmedPhone: "9866111002",
      },
      seekerOneCookie
    );
    assert.equal(dupLeadRes.status, 200);
    const dupJson = await dupLeadRes.json();
    assert.equal(dupJson.duplicate, true);

    const leadRes2 = await call(
      "leads",
      "POST",
      {
        propertyId: property.id,
        occupantsCount: "1",
        tenantType: "Working Professionals",
        profession: "Job-Salaried",
        confirmedPhone: "9866111003",
      },
      seekerTwoCookie
    );
    assert.equal(leadRes2.status, 201);
    const lead2 = (await leadRes2.json()).lead;

    // Past date rejected (422)
    const pastSlot = new Date(Date.now() - 3600_000).toISOString();
    const pastRes = await call(
      "admin/meetings",
      "POST",
      { leadId: lead1.id, scheduledAt: pastSlot, mode: "site_visit" },
      adminCookie
    );
    assert.equal(pastRes.status, 422);

    // Valid future slot (tomorrow + 48h to stay comfortably outside any cutoff window)
    const baseSlot = new Date(Date.now() + 48 * 3600_000);
    baseSlot.setMinutes(0, 0, 0);
    const proposeRes = await call(
      "admin/meetings",
      "POST",
      { leadId: lead1.id, scheduledAt: baseSlot.toISOString(), mode: "site_visit" },
      adminCookie
    );
    assert.equal(proposeRes.status, 201);
    const proposedMeeting = (await proposeRes.json()).meeting;
    assert.equal(proposedMeeting.status, "proposed");

    // Double-booking conflict within 30 minutes on same property rejected (409)
    const conflictSlot = new Date(baseSlot.getTime() + 30 * 60_000).toISOString();
    const conflictRes = await call(
      "admin/meetings",
      "POST",
      { leadId: lead2.id, scheduledAt: conflictSlot, mode: "site_visit" },
      adminCookie
    );
    assert.equal(conflictRes.status, 409);

    // Non-overlapping slot 90 minutes later succeeds (201)
    const freeSlot = new Date(baseSlot.getTime() + 90 * 60_000).toISOString();
    const lead2MeetingRes = await call(
      "admin/meetings",
      "POST",
      { leadId: lead2.id, scheduledAt: freeSlot, mode: "call" },
      adminCookie
    );
    assert.equal(lead2MeetingRes.status, 201);
    const lead2Meeting = (await lead2MeetingRes.json()).meeting;

    // Owner confirms lead 1 visit via PATCH /api/leads/:id/meeting
    const ownerConfirmRes = await call(
      `leads/${lead1.id}/meeting`,
      "PATCH",
      { status: "confirmed" },
      ownerCookie
    );
    assert.equal(ownerConfirmRes.status, 200);
    assert.equal((await ownerConfirmRes.json()).meeting.status, "confirmed");

    // Synced check across Customer, Owner, and Admin
    const [custLeadsRes, ownerLeadsRes] = await Promise.all([
      call("customer/leads", "GET", undefined, seekerOneCookie),
      call("owner/leads", "GET", undefined, ownerCookie),
    ]);
    const custLead = (await custLeadsRes.json()).items.find((x: { id: string }) => x.id === lead1.id);
    const ownerLead = (await ownerLeadsRes.json()).items.find((x: { id: string }) => x.id === lead1.id);
    assert.equal(custLead.meeting.status, "confirmed");
    assert.equal(ownerLead.meeting.status, "confirmed");
    assert.ok(!JSON.stringify(ownerLead).includes(seekerOnePhone));

    // Customer cannot mark meeting completed (blocked with 422 enum rejection)
    const seekerCompleteAttempt = await call(
      `leads/${lead1.id}/meeting`,
      "PATCH",
      { status: "completed" },
      seekerOneCookie
    );
    assert.equal(seekerCompleteAttempt.status, 422);

    // Admin reschedules meeting to a new open slot (+3 hours from baseSlot)
    const newSlot = new Date(baseSlot.getTime() + 3 * 3600_000).toISOString();
    const reschedRes = await call(
      `admin/meetings/${proposedMeeting.id}`,
      "PATCH",
      { status: "rescheduled", scheduledAt: newSlot },
      adminCookie
    );
    assert.equal(reschedRes.status, 200);
    const reschedJson = await reschedRes.json();
    assert.equal(reschedJson.meeting.status, "rescheduled");
    assert.equal(new Date(reschedJson.meeting.scheduledAt).toISOString(), newSlot);

    // Admin marks rescheduled visit completed
    const completeRes = await call(
      `admin/meetings/${proposedMeeting.id}`,
      "PATCH",
      { status: "completed" },
      adminCookie
    );
    assert.equal(completeRes.status, 200);
    assert.equal((await completeRes.json()).meeting.status, "completed");

    // Further state changes from completed fail (422)
    const cancelAfterComplete = await call(
      `admin/meetings/${proposedMeeting.id}`,
      "PATCH",
      { status: "cancelled" },
      adminCookie
    );
    assert.equal(cancelAfterComplete.status, 422);

    // Cancel lead 2 meeting via Seeker 2 and verify lead reverts to contacted
    const seekerCancelRes = await call(
      `leads/${lead2.id}/meeting`,
      "PATCH",
      { status: "cancelled" },
      seekerTwoCookie
    );
    assert.equal(seekerCancelRes.status, 200);
    assert.equal((await seekerCancelRes.json()).meeting.status, "cancelled");
    assert.equal(lead2Meeting.status, "proposed");

    const [lead2Row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, lead2.id));
    assert.equal(lead2Row.status, "contacted");
  } finally {
    if (createdPropertyIds.length > 0) {
      const propLeads = await db.select({ id: leads.id }).from(leads).where(inArray(leads.propertyId, createdPropertyIds));
      const leadIds = propLeads.map((l) => l.id);
      if (leadIds.length > 0) {
        await db.delete(meetings).where(inArray(meetings.leadId, leadIds));
        await db.delete(leads).where(inArray(leads.id, leadIds));
      }
      await db.delete(properties).where(inArray(properties.id, createdPropertyIds));
    }
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.phone, [ownerPhone, seekerOnePhone, seekerTwoPhone]));
    const userIds = testUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
});

