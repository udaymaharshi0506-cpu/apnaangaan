import type { Lead, Meeting, Property, User } from "@/db/schema";

/** Explicit allowlist: adding a column to the database cannot leak it into a public API. */
export function serializePublicProperty(property: Property) {
  return {
    id: property.id,
    category: property.category,
    propertyType: property.propertyType,
    title: property.title,
    description: property.description,
    price: property.price,
    priceType: property.priceType,
    address: property.address,
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

export function serializePublicMeeting(meeting: Meeting | null | undefined) {
  if (!meeting) return null;
  return { id: meeting.id, scheduledAt: meeting.scheduledAt, mode: meeting.mode, status: meeting.status };
}

/** Customer receives only their own inquiry's progress and the PUBLIC property. */
export function serializeCustomerLead(lead: Lead, property: Property, meeting?: Meeting | null) {
  return {
    id: lead.id,
    status: lead.status,
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
    property: serializePublicProperty(property),
    meeting: serializePublicMeeting(meeting),
  };
}

/** Owner receives ONLY anonymous interest; strictly NO customer name, phone number, email, or requester ID. */
export function serializeOwnerLead(
  lead: Lead,
  property: Property,
  _customerNameOrMeeting?: string | null | Meeting,
  maybeMeeting?: Meeting | null
) {
  let meeting: Meeting | null | undefined = maybeMeeting;
  if (_customerNameOrMeeting && typeof _customerNameOrMeeting === "object" && "mode" in _customerNameOrMeeting) {
    meeting = _customerNameOrMeeting as Meeting;
  }
  return {
    id: lead.id,
    status: lead.status,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: { id: property.id, title: property.title, image: property.images?.[0] ?? null },
    message: `Someone is interested in ${property.title}.`,
    occupantsCount: lead.occupantsCount,
    tenantType: lead.tenantType,
    profession: lead.profession,
    groupGender: lead.groupGender,
    moveInTimeline: lead.moveInTimeline,
    meeting: serializePublicMeeting(meeting),
  };
}

/** This serializer must only be called behind the admin authorization guard. */
export function serializeAdminLead(
  lead: Lead,
  property: Property,
  customer: User,
  owner: User,
  meeting?: Meeting | null,
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
    property: serializePublicProperty(property),
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
export type CustomerLead = ReturnType<typeof serializeCustomerLead>;
export type OwnerLead = ReturnType<typeof serializeOwnerLead>;
