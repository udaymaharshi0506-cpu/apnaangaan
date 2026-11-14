import { bigint, boolean, doublePrecision, index, integer, jsonb, numeric, pgEnum, pgTable, pgView, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const propertyCategory = pgEnum("property_category", ["rent_home"]);
export const propertyStatus = pgEnum("property_status", ["draft", "pending_review", "live", "paused", "sold", "rented", "rejected"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "meeting_scheduled", "closed_won", "closed_lost"]);
export const meetingMode = pgEnum("meeting_mode", ["call", "site_visit"]);
export const meetingStatus = pgEnum("meeting_status", ["proposed", "confirmed", "rescheduled", "completed", "cancelled"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: varchar("phone", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 150 }),
  city: varchar("city", { length: 120 }),
  location: varchar("location", { length: 255 }),
  liveSelfieUrl: text("live_selfie_url"),
  aadhaarCardUrl: text("aadhaar_card_url"),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 20 }).notNull().default("customer"),
  roles: jsonb("roles").$type<Array<"customer" | "owner" | "admin">>().notNull().default(["customer"]),
  otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: propertyCategory("category").notNull(),
  propertyType: varchar("property_type", { length: 60 }).notNull().default("Apartment"),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull().default(""),
  price: bigint("price", { mode: "number" }).notNull(),
  priceType: varchar("price_type", { length: 20 }).notNull().default("fixed"),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  locality: varchar("locality", { length: 120 }).notNull(),
  pinCode: varchar("pin_code", { length: 10 }),
  landmark: varchar("landmark", { length: 255 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  bhkOrRoomType: varchar("bhk_or_room_type", { length: 50 }).notNull(),
  areaSqft: integer("area_sqft").notNull(),
  bathrooms: integer("bathrooms").notNull().default(1),
  floor: varchar("floor", { length: 30 }),
  totalFloors: integer("total_floors"),
  propertyAge: varchar("property_age", { length: 50 }),
  facing: varchar("facing", { length: 30 }),
  furnishingStatus: varchar("furnishing_status", { length: 40 }).notNull().default("Unfurnished"),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  availabilityDate: timestamp("availability_date", { withTimezone: true }),
  reraNumber: varchar("rera_number", { length: 100 }),
  deposit: bigint("deposit", { mode: "number" }),
  // Owner KYC & verification details
  ownerName: varchar("owner_name", { length: 150 }),
  ownerPhone: varchar("owner_phone", { length: 20 }),
  liveSelfieUrl: text("live_selfie_url"),
  aadhaarCardUrl: text("aadhaar_card_url"),
  ownershipType: varchar("ownership_type", { length: 30 }).default("sole_owner"),
  coOwners: text("co_owners"),
  // Financials & Terms
  maintenanceStatus: varchar("maintenance_status", { length: 30 }),
  maintenanceAmount: integer("maintenance_amount"),
  possessionStatus: varchar("possession_status", { length: 50 }),
  possessionDate: timestamp("possession_date", { withTimezone: true }),
  loanStatus: varchar("loan_status", { length: 100 }),
  lockInPeriod: varchar("lock_in_period", { length: 50 }),
  noticePeriod: varchar("notice_period", { length: 50 }),
  tenantPreference: varchar("tenant_preference", { length: 100 }),
  bedCount: varchar("bed_count", { length: 50 }),
  genderPolicy: varchar("gender_policy", { length: 50 }),
  houseRules: jsonb("house_rules").$type<string[]>().notNull().default([]),
  itemizedCharges: jsonb("itemized_charges").$type<Record<string, unknown>>().notNull().default({}),
  status: propertyStatus("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  verified: boolean("verified").notNull().default(false),
  views: integer("views").notNull().default(0),
  // Managed listing & service tier fields
  listingMode: varchar("listing_mode", { length: 20 }).notNull().default("self"),
  managedTier: varchar("managed_tier", { length: 20 }).notNull().default("none"),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default("not_required"),
  transactionId: varchar("transaction_id", { length: 100 }),
  isRecommended: boolean("is_recommended").notNull().default(false),
  requestStatus: varchar("request_status", { length: 30 }).notNull().default("new"),
  assignedManagerId: uuid("assigned_manager_id").references(() => users.id),
  assignedManagerName: varchar("assigned_manager_name", { length: 150 }),
  // Rental & Ledger tracking
  rentalStatus: varchar("rental_status", { length: 30 }).notNull().default("available_pending"),
  monthlyRent: bigint("monthly_rent", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("properties_category_idx").on(table.category),
  index("properties_city_idx").on(table.city),
  index("properties_locality_idx").on(table.locality),
  index("properties_status_idx").on(table.status),
  index("properties_rental_status_idx").on(table.rentalStatus),
  index("properties_owner_idx").on(table.ownerId),
  index("properties_created_idx").on(table.createdAt),
  index("properties_live_lookup_idx").on(table.category, table.status, table.rentalStatus),
]);

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: leadStatus("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  preferredContactTime: varchar("preferred_contact_time", { length: 100 }),
  occupantsCount: varchar("occupants_count", { length: 50 }),
  tenantType: varchar("tenant_type", { length: 100 }),
  profession: varchar("profession", { length: 100 }),
  groupGender: varchar("group_gender", { length: 50 }),
  moveInTimeline: varchar("move_in_timeline", { length: 100 }),
  confirmedPhone: varchar("confirmed_phone", { length: 20 }),
  seekerNotes: text("seeker_notes"),
  ownerResponse: varchar("owner_response", { length: 50 }).notNull().default("pending"),
  ownerRespondedAt: timestamp("owner_responded_at", { withTimezone: true }),
  whatsappMessageId: varchar("whatsapp_message_id", { length: 100 }),
  whatsappStatus: varchar("whatsapp_status", { length: 50 }).default("pending"),
  whatsappReminderSentAt: timestamp("whatsapp_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("leads_status_idx").on(table.status), index("leads_customer_idx").on(table.customerId), index("leads_owner_idx").on(table.ownerId), uniqueIndex("leads_customer_property_unique").on(table.customerId, table.propertyId)]);

export const ownerInquiryView = pgView("owner_inquiry_view", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id").notNull(),
  propertyName: varchar("property_name", { length: 200 }).notNull(),
  ownerId: uuid("owner_id").notNull(),
  occupantsCount: varchar("occupants_count", { length: 50 }),
  tenantType: varchar("tenant_type", { length: 100 }),
  profession: varchar("profession", { length: 100 }),
  groupComposition: varchar("group_composition", { length: 50 }),
  status: leadStatus("status").notNull(),
  ownerResponse: varchar("owner_response", { length: 50 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}).as(sql`
  SELECT
    l.id AS id,
    l.property_id AS property_id,
    p.title AS property_name,
    l.owner_id AS owner_id,
    l.occupants_count AS occupants_count,
    l.tenant_type AS tenant_type,
    l.profession AS profession,
    COALESCE(l.group_gender, 'N/A') AS group_composition,
    l.status AS status,
    COALESCE(l.owner_response, 'pending') AS owner_response,
    l.created_at AS created_at,
    l.updated_at AS updated_at
  FROM leads l
  JOIN properties p ON l.property_id = p.id
`);

export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  scheduledByAdminId: uuid("scheduled_by_admin_id").notNull().references(() => users.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  mode: meetingMode("mode").notNull(),
  status: meetingStatus("status").notNull().default("proposed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("meetings_lead_idx").on(table.leadId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("notifications_user_idx").on(table.userId)]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.propertyId] })]);

export const adminCallLogs = pgTable("admin_call_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  party: varchar("party", { length: 20 }).notNull(),
  outcome: varchar("outcome", { length: 100 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("call_logs_lead_idx").on(table.leadId)]);

export const leadEvents = pgTable("lead_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id").references(() => users.id),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("lead_events_lead_idx").on(table.leadId)]);

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  query: jsonb("query").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpChallenges = pgTable("otp_challenges", {
  phone: varchar("phone", { length: 255 }).primaryKey(),
  email: varchar("email", { length: 255 }),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  requestCount: integer("request_count").notNull().default(1),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("refresh_tokens_user_idx").on(table.userId)]);

export const uploadedImages = pgTable("uploaded_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  data: text("data").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("uploaded_images_created_idx").on(table.createdAt)]);

export const managerRequests = pgTable("manager_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
  listingMode: varchar("listing_mode", { length: 20 }).notNull().default("managed"),
  managedTier: varchar("managed_tier", { length: 20 }).notNull().default("standard"),
  feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("499.00"),
  paymentStatus: varchar("payment_status", { length: 30 }).notNull().default("paid"),
  transactionId: varchar("transaction_id", { length: 100 }),
  isRecommended: boolean("is_recommended").notNull().default(false),
  requestStatus: varchar("request_status", { length: 30 }).notNull().default("new"),
  assignedManagerId: uuid("assigned_manager_id").references(() => users.id),
  assignedManagerName: varchar("assigned_manager_name", { length: 150 }),
  propertyTitle: varchar("property_title", { length: 255 }),
  locality: varchar("locality", { length: 120 }),
  city: varchar("city", { length: 100 }),
  ownerContactPhone: varchar("owner_contact_phone", { length: 25 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("manager_requests_owner_idx").on(table.ownerId),
  index("manager_requests_status_idx").on(table.requestStatus),
  index("manager_requests_created_idx").on(table.createdAt),
]);

export const rentalDeals = pgTable("rental_deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealCode: varchar("deal_code", { length: 50 }).unique(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  seekerId: uuid("seeker_id").references(() => users.id, { onDelete: "set null" }),
  seekerName: varchar("seeker_name", { length: 150 }),
  seekerPhone: varchar("seeker_phone", { length: 25 }),
  seekerEmail: varchar("seeker_email", { length: 255 }),
  leaseStartDate: timestamp("lease_start_date", { withTimezone: true }),
  leaseEndDate: timestamp("lease_end_date", { withTimezone: true }),
  monthlyRent: bigint("monthly_rent", { mode: "number" }).notNull().default(0),
  stayDurationMonths: integer("stay_duration_months").default(11),
  securityDepositTotal: numeric("security_deposit_total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  securityDepositCollected: numeric("security_deposit_collected", { precision: 12, scale: 2 }).notNull().default("0.00"),
  ownerFeeTotal: numeric("owner_fee_total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  ownerFeeCollected: numeric("owner_fee_collected", { precision: 12, scale: 2 }).notNull().default("0.00"),
  seekerFeeTotal: numeric("seeker_fee_total", { precision: 12, scale: 2 }).notNull().default("0.00"),
  seekerFeeCollected: numeric("seeker_fee_collected", { precision: 12, scale: 2 }).notNull().default("0.00"),
  dealStatus: varchar("deal_status", { length: 30 }).notNull().default("in_progress"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("rental_deals_property_idx").on(table.propertyId),
  index("rental_deals_owner_idx").on(table.ownerId),
  index("rental_deals_status_idx").on(table.dealStatus),
  index("rental_deals_created_idx").on(table.createdAt),
]);

export const transactionsLedger = pgTable("transactions_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  txnCode: varchar("txn_code", { length: 50 }).unique(),
  dealId: uuid("deal_id").references(() => rentalDeals.id, { onDelete: "set null" }),
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
  payerType: varchar("payer_type", { length: 20 }).notNull().default("seeker"),
  payerId: uuid("payer_id").references(() => users.id, { onDelete: "set null" }),
  payerName: varchar("payer_name", { length: 150 }),
  category: varchar("category", { length: 40 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull().default("credit"),
  paymentMode: varchar("payment_mode", { length: 30 }).notNull().default("upi"),
  referenceId: varchar("reference_id", { length: 120 }),
  status: varchar("status", { length: 20 }).notNull().default("settled"),
  reconciliationStatus: varchar("reconciliation_status", { length: 20 }).notNull().default("reconciled"),
  notes: text("notes"),
  recordedByAdminId: uuid("recorded_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  recordedByAdminName: varchar("recorded_by_admin_name", { length: 150 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("transactions_ledger_deal_idx").on(table.dealId),
  index("transactions_ledger_property_idx").on(table.propertyId),
  index("transactions_ledger_category_idx").on(table.category),
  index("transactions_ledger_status_idx").on(table.status),
  index("transactions_ledger_created_idx").on(table.createdAt),
]);

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type ManagerRequest = typeof managerRequests.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type OwnerInquiry = typeof ownerInquiryView.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type UploadedImage = typeof uploadedImages.$inferSelect;
export type RentalDeal = typeof rentalDeals.$inferSelect;
export type TransactionLedger = typeof transactionsLedger.$inferSelect;

