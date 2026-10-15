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
    latitude: property.latitude,
    longitude: property.longitude,
    bhkOrRoomType: property.bhkOrRoomType,
    areaSqft: property.areaSqft,
    bathrooms: property.bathrooms,
    furnishingStatus: property.furnishingStatus,
    amenities: property.amenities,
    images: property.images,
    availabilityDate: property.availabilityDate,
    reraNumber: property.reraNumber,
    deposit: property.deposit,
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
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: serializePublicProperty(property),
    meeting: serializePublicMeeting(meeting),
  };
}

/** Owner receives an anonymous signal; no requester ID, name, phone or email. */
export function serializeOwnerLead(lead: Lead, property: Property, meeting?: Meeting | null) {
  return {
    id: lead.id,
    status: lead.status,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: { id: property.id, title: property.title, image: property.images[0] ?? null },
    message: `Someone is interested in ${property.title}.`,
    meeting: serializePublicMeeting(meeting),
  };
}

/** This serializer must only be called behind the admin authorization guard. */
export function serializeAdminLead(lead: Lead, property: Property, customer: User, owner: User, meeting?: Meeting | null, history: Array<{ eventType: string; detail: string; createdAt: Date }> = [], callLogs: Array<{ party: string; outcome: string; notes: string | null; createdAt: Date }> = []) {
  return {
    id: lead.id,
    status: lead.status,
    adminNotes: lead.adminNotes,
    preferredContactTime: lead.preferredContactTime,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    property: serializePublicProperty(property),
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    owner: { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email },
    meeting: serializePublicMeeting(meeting),
    history,
    callLogs,
  };
}

export type PublicProperty = ReturnType<typeof serializePublicProperty>;
export type CustomerLead = ReturnType<typeof serializeCustomerLead>;
export type OwnerLead = ReturnType<typeof serializeOwnerLead>;
