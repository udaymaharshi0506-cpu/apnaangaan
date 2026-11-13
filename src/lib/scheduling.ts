export type MeetingStatusValue = "proposed" | "confirmed" | "rescheduled" | "completed" | "cancelled";
export type MeetingModeValue = "call" | "site_visit";

export const SAME_DAY_LEAD_MINUTES = 120; // Require at least 2 hours notice for same-day slots
export const SAME_DAY_BOOKING_CUTOFF_HOUR_IST = 18; // After 6:00 PM IST, same-day visits are closed
export const VISIT_START_HOUR_IST = 8; // Earliest same-day visit: 8:00 AM IST
export const VISIT_END_HOUR_IST = 21; // Latest same-day visit: 9:00 PM IST
export const MAX_SCHEDULE_ADVANCE_DAYS = 90;
export const DOUBLE_BOOKING_WINDOW_MINUTES = 60;

export const ACTIVE_MEETING_STATUSES: MeetingStatusValue[] = ["proposed", "confirmed", "rescheduled"];

const ALLOWED_TRANSITIONS: Record<MeetingStatusValue, MeetingStatusValue[]> = {
  proposed: ["confirmed", "rescheduled", "cancelled"],
  confirmed: ["completed", "rescheduled", "cancelled"],
  rescheduled: ["confirmed", "rescheduled", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const MEETING_STATUS_LABELS: Record<MeetingStatusValue, string> = {
  proposed: "Pending confirmation",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Returns human-friendly label for any meeting status. */
export function formatMeetingStatus(status: string | null | undefined): string {
  if (!status) return "Scheduled";
  return MEETING_STATUS_LABELS[status as MeetingStatusValue] || status;
}

/** Extracts calendar date & hour/minute components in Asia/Kolkata (UTC+5:30). */
export function getIstParts(date: Date) {
  const istMs = date.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dayKey: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`,
  };
}

/** Validates whether a proposed visit/call datetime meets past, lead-time, and same-day cutoff rules. */
export function validateVisitSlot(
  input: Date | string,
  now: Date = new Date()
): { valid: true; date: Date } | { valid: false; error: string } {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: "Invalid visit date or time." };
  }

  if (date.getTime() <= now.getTime()) {
    return { valid: false, error: "Choose a visit or call time in the future." };
  }

  const maxDateMs = now.getTime() + MAX_SCHEDULE_ADVANCE_DAYS * 24 * 60 * 60 * 1000;
  if (date.getTime() > maxDateMs) {
    return { valid: false, error: `Visits can only be scheduled up to ${MAX_SCHEDULE_ADVANCE_DAYS} days ahead.` };
  }

  const targetIst = getIstParts(date);
  const nowIst = getIstParts(now);

  if (targetIst.dayKey === nowIst.dayKey) {
    if (nowIst.hour >= SAME_DAY_BOOKING_CUTOFF_HOUR_IST) {
      return {
        valid: false,
        error: "Same-day booking cutoff has passed (6:00 PM IST). Please select tomorrow or a later date.",
      };
    }

    const minSameDayMs = now.getTime() + SAME_DAY_LEAD_MINUTES * 60 * 1000;
    if (date.getTime() < minSameDayMs) {
      return {
        valid: false,
        error: "Same-day bookings require at least 2 hours advance notice.",
      };
    }

    if (
      targetIst.hour < VISIT_START_HOUR_IST ||
      targetIst.hour > VISIT_END_HOUR_IST ||
      (targetIst.hour === VISIT_END_HOUR_IST && targetIst.minute > 0)
    ) {
      return {
        valid: false,
        error: "Same-day visits are available between 8:00 AM and 9:00 PM IST.",
      };
    }
  }

  return { valid: true, date };
}

/** Computes inclusive/exclusive bounds (+/- 60 minutes) to detect overlapping bookings. */
export function getSlotConflictBounds(target: Date, windowMinutes = DOUBLE_BOOKING_WINDOW_MINUTES) {
  const deltaMs = windowMinutes * 60 * 1000;
  return {
    windowStart: new Date(target.getTime() - deltaMs),
    windowEnd: new Date(target.getTime() + deltaMs),
  };
}

/** Checks whether a meeting status transition is allowed. */
export function canTransitionMeetingStatus(
  fromStatus: MeetingStatusValue,
  toStatus: MeetingStatusValue,
  options?: { hasNewScheduledAt?: boolean }
): { allowed: true } | { allowed: false; error: string } {
  if (fromStatus === toStatus) {
    if (toStatus === "rescheduled" && options?.hasNewScheduledAt) {
      return { allowed: true };
    }
    return { allowed: false, error: `Visit is already ${formatMeetingStatus(toStatus).toLowerCase()}.` };
  }

  if (fromStatus === "completed") {
    return { allowed: false, error: "Completed visits cannot change status." };
  }
  if (fromStatus === "cancelled") {
    return { allowed: false, error: "Cancelled visits cannot change status. Schedule a new visit instead." };
  }

  const allowedTargets = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowedTargets.includes(toStatus)) {
    return {
      allowed: false,
      error: `Cannot transition visit from "${formatMeetingStatus(fromStatus)}" to "${formatMeetingStatus(toStatus)}".`,
    };
  }

  return { allowed: true };
}

/** Formats a local YYYY-MM-DDTHH:MM string representing the earliest selectable slot for HTML datetime-local inputs. */
export function getMinVisitDateTimeLocal(now: Date = new Date()): string {
  const nowIst = getIstParts(now);
  let candidate: Date;

  if (nowIst.hour >= SAME_DAY_BOOKING_CUTOFF_HOUR_IST) {
    // Move to tomorrow 09:00 local time
    candidate = new Date(now.getTime());
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(9, 0, 0, 0);
  } else {
    candidate = new Date(now.getTime() + SAME_DAY_LEAD_MINUTES * 60 * 1000);
    // Round up to next 15-minute mark cleanly
    const mins = candidate.getMinutes();
    const rounded = Math.ceil(mins / 15) * 15;
    candidate.setMinutes(rounded, 0, 0);
  }

  const yyyy = candidate.getFullYear();
  const mm = String(candidate.getMonth() + 1).padStart(2, "0");
  const dd = String(candidate.getDate()).padStart(2, "0");
  const hh = String(candidate.getHours()).padStart(2, "0");
  const min = String(candidate.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

