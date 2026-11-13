import type { Lead, Meeting, OwnerInquiry, Property, User } from "@/db/schema";

export type PublicPropertyInput = Omit<
  Property,
  | "ownerId"
  | "address"
  | "ownerName"
  | "ownerPhone"
  | "liveSelfieUrl"
  | "aadhaarCardUrl"
  | "ownershipType"
  | "coOwners"
  | "rejectionReason"
  | "status"
  | "updatedAt"
> &
  Partial<Pick<Property, "ownerId" | "address" | "status" | "updatedAt">>;

export type CustomerLeadInput = Pick<
  Lead,
  | "id"
  | "status"
  | "preferredContactTime"
  | "occupantsCount"
  | "tenantType"
  | "profession"
  | "groupGender"
  | "moveInTimeline"
  | "seekerNotes"
  | "ownerResponse"
  | "createdAt"
  | "updatedAt"
>;

export type PublicMeetingInput = Pick<Meeting, "id" | "scheduledAt" | "mode" | "status">;

/** Explicit allowlist: adding a column to the database cannot leak it into a public API. */
export function serializePublicProperty(property: PublicPropertyInput) {
  return {
    id: property.id,
    category: property.category,
    propertyType: property.propertyType,
    title: property.title,
    description: property.description,
    price: property.price,
    priceType: property.priceType,
    city: property.city,
    locality: property.locality,
    pinCode: property.pinCode,
    landmark: property.landmark,
    latitude: property.latitude,
    longitude: property.longitude,
    bhkOrRoomType: property.bhkOrRoomType,
    areaSqft: property.areaSqft,
    bathrooms: property.bathrooms,
    floor: property.floor,
    totalFloors: property.totalFloors,
    propertyAge: property.propertyAge,
    facing: property.facing,
    furnishingStatus: property.furnishingStatus,
    amenities: property.amenities,
    images: property.images,
    availabilityDate: property.availabilityDate,
    reraNumber: property.reraNumber,
    deposit: property.deposit,
    maintenanceStatus: property.maintenanceStatus,
    maintenanceAmount: property.maintenanceAmount,
    possessionStatus: property.possessionStatus,
    possessionDate: property.possessionDate,
    loanStatus: property.loanStatus,
    lockInPeriod: property.lockInPeriod,
    noticePeriod: property.noticePeriod,
    tenantPreference: property.tenantPreference,
    bedCount: property.bedCount,
    genderPolicy: property.genderPolicy,
    houseRules: property.houseRules,
    itemizedCharges: property.itemizedCharges,
    verified: property.verified,
    createdAt: property.createdAt,
  };
}

export function serializePublicMeeting(meeting: PublicMeetingInput | null | undefined) {
  if (!meeting) return null;
  return { id: meeting.id, scheduledAt: meeting.scheduledAt, mode: meeting.mode, status: meeting.status };
}

/** Admin property serializer preserves exact address alongside public listing fields. */
export function serializeAdminProperty(property: Property) {
  return {
    ...serializePublicProperty(property),
    address: property.address,
  };
}

/** Customer receives only their own inquiry's progress and the PUBLIC property (no raw phone/email/whatsapp/address). */
export function serializeCustomerLead(lead: CustomerLeadInput, property: PublicPropertyInput, meeting?: PublicMeetingInput | null) {
  return {
    id: lead.id,
    status: lead.status,
    preferredContactTime: lead.preferredContactTime,
    occupantsCount: lead.occupantsCount,
    tenantType: lead.tenantType,
    profession: lead.profession,
    groupGender: lead.groupGender,
    moveInTimeline: lead.moveInTimeline,
    seekerNotes: lead.seekerNotes,
    ownerResponse: lead.ownerResponse || "pending",
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: serializePublicProperty(property),
    meeting: serializePublicMeeting(meeting),
  };
}

/** 
 * Owner receives ONLY the 5 allowed fields:
 * 1. Property name/ID
 * 2. How many people (1 / 2 / 3-4 / 5+)
 * 3. Tenant type (Family / Working Professionals / Bachelors / Couple / Students)
 * 4. Profession / employment status (Job-Salaried / Business-Self-Employed / Student / Freelancer-Remote / Other)
 * 5. Group composition / gender (Family / Girls-All Female / Boys-All Male / Both-Co-ed)
 * Plus status, ownerResponse, and timestamps.
 * Strictly NO seeker name, phone, email, budget, dates/timeline, message text, location, or user ID.
 */
export function serializeOwnerInquiry(
  inquiry: {
    id: string;
    propertyId: string;
    propertyName: string;
    occupantsCount?: string | null;
    tenantType?: string | null;
    profession?: string | null;
    groupComposition?: string | null;
    status: string;
    ownerResponse?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  meeting?: PublicMeetingInput | null
) {
  const group = inquiry.groupComposition || "N/A";
  return {
    id: inquiry.id,
    propertyId: inquiry.propertyId,
    propertyName: inquiry.propertyName,
    property: {
      id: inquiry.propertyId,
      title: inquiry.propertyName,
    },
    occupantsCount: inquiry.occupantsCount || null,
    tenantType: inquiry.tenantType || null,
    profession: inquiry.profession || null,
    groupComposition: group,
    groupGender: group,
    status: inquiry.status,
    ownerResponse: inquiry.ownerResponse || "pending",
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    meeting: serializePublicMeeting(meeting),
  };
}

export function serializeOwnerLead(
  lead: Lead | (OwnerInquiry & { title?: string }),
  property?: Property | null,
  _customerNameOrMeeting?: string | null | Meeting,
  maybeMeeting?: Meeting | null
) {
  let meeting: Meeting | null | undefined = maybeMeeting;
  if (_customerNameOrMeeting && typeof _customerNameOrMeeting === "object" && "mode" in _customerNameOrMeeting) {
    meeting = _customerNameOrMeeting as Meeting;
  }
  const propertyId = ("propertyId" in lead && lead.propertyId) ? lead.propertyId : property?.id || "";
  const propertyName = ("propertyName" in lead && lead.propertyName) ? lead.propertyName : property?.title || "";
  const group = ("groupComposition" in lead && lead.groupComposition) ? lead.groupComposition : (("groupGender" in lead ? (lead as any).groupGender : null) || "N/A");
  const ownerResponse = ("ownerResponse" in lead && lead.ownerResponse) ? lead.ownerResponse : "pending";

  return {
    id: lead.id,
    propertyId,
    propertyName,
    property: {
      id: propertyId,
      title: propertyName,
    },
    occupantsCount: lead.occupantsCount || null,
    tenantType: lead.tenantType || null,
    profession: lead.profession || null,
    groupComposition: group,
    groupGender: group,
    status: lead.status,
    ownerResponse,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    meeting: serializePublicMeeting(meeting),
  };
}

/** This serializer must only be called behind the admin authorization guard. */
export function serializeAdminLead(
  lead: Lead,
  property: Property,
  customer: User,
  owner: User,
  meeting?: PublicMeetingInput | null,
  history: Array<{ eventType: string; detail: string; createdAt: Date }> = [],
  callLogs: Array<{ party: string; outcome: string; notes: string | null; createdAt: Date }> = []
) {
  return {
    id: lead.id,
    status: lead.status,
    adminNotes: lead.adminNotes,
    preferredContactTime: lead.preferredContactTime,
    occupantsCount: lead.occupantsCount,
    tenantType: lead.tenantType,
    profession: lead.profession,
    groupGender: lead.groupGender,
    moveInTimeline: lead.moveInTimeline,
    confirmedPhone: lead.confirmedPhone,
    seekerNotes: lead.seekerNotes,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: serializeAdminProperty(property),
    customer: {
      id: customer.id,
      name: customer.name,
      phone: lead.confirmedPhone || customer.phone,
      email: customer.email,
      city: customer.city,
      location: customer.location,
    },
    owner: { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email },
    meeting: serializePublicMeeting(meeting),
    history,
    callLogs,
  };
}

export type PublicProperty = ReturnType<typeof serializePublicProperty>;
export type AdminProperty = ReturnType<typeof serializeAdminProperty>;
export type CustomerLead = ReturnType<typeof serializeCustomerLead>;
export type OwnerLead = ReturnType<typeof serializeOwnerLead>;
