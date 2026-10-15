import { bigint, boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const propertyCategory = pgEnum("property_category", ["buy_home", "rent_home", "rent_pg", "rent_commercial"]);
export const propertyStatus = pgEnum("property_status", ["pending_review", "live", "paused", "sold", "rented", "rejected"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "meeting_scheduled", "closed_won", "closed_lost"]);
export const meetingMode = pgEnum("meeting_mode", ["call", "site_visit"]);
export const meetingStatus = pgEnum("meeting_status", ["proposed", "confirmed", "completed", "cancelled"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: varchar("phone", { length: 20 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  name: varchar("name", { length: 150 }),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 20 }).notNull().default("customer"),
  roles: jsonb("roles").$type<Array<"customer" | "owner" | "admin">>().notNull().default(["customer"]),
  otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
  consentAt: timestamp("consent_at", { withTimezone: true }),
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
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  bhkOrRoomType: varchar("bhk_or_room_type", { length: 50 }).notNull(),
  areaSqft: integer("area_sqft").notNull(),
  bathrooms: integer("bathrooms").notNull().default(1),
  furnishingStatus: varchar("furnishing_status", { length: 40 }).notNull().default("Unfurnished"),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  availabilityDate: timestamp("availability_date", { withTimezone: true }),
  reraNumber: varchar("rera_number", { length: 100 }),
  deposit: bigint("deposit", { mode: "number" }),
  status: propertyStatus("status").notNull().default("pending_review"),
  verified: boolean("verified").notNull().default(false),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("properties_category_idx").on(table.category), index("properties_city_idx").on(table.city), index("properties_status_idx").on(table.status), index("properties_created_idx").on(table.createdAt)]);

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: leadStatus("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  preferredContactTime: varchar("preferred_contact_time", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("leads_status_idx").on(table.status), index("leads_customer_idx").on(table.customerId), index("leads_owner_idx").on(table.ownerId), uniqueIndex("leads_customer_property_unique").on(table.customerId, table.propertyId)]);

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

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
