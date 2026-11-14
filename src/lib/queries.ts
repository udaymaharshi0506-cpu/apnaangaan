import { cache } from "react";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { expandLocationSearchVariants } from "@/lib/search-utils";
import { serializePublicProperty, type PublicPropertyInput } from "@/lib/serializers";
import { and, asc, count, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";

/** Explicit DB column allowlist for public, customer, and non-sensitive property reads.
 *  Projects out ownerId, address, ownerName, ownerPhone, liveSelfieUrl, aadhaarCardUrl, coOwners, and rejectionReason at the query layer. */
export const publicPropertyColumns = {
  id: properties.id,
  category: properties.category,
  propertyType: properties.propertyType,
  title: properties.title,
  description: properties.description,
  price: properties.price,
  priceType: properties.priceType,
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
  maintenanceStatus: properties.maintenanceStatus,
  maintenanceAmount: properties.maintenanceAmount,
  possessionStatus: properties.possessionStatus,
  possessionDate: properties.possessionDate,
  loanStatus: properties.loanStatus,
  lockInPeriod: properties.lockInPeriod,
  noticePeriod: properties.noticePeriod,
  tenantPreference: properties.tenantPreference,
  bedCount: properties.bedCount,
  genderPolicy: properties.genderPolicy,
  houseRules: properties.houseRules,
  itemizedCharges: properties.itemizedCharges,
  verified: properties.verified,
  views: properties.views,
  createdAt: properties.createdAt,
} as const;

/** Owner dashboard property projection (adds status, rejectionReason, updatedAt while still omitting address and personal/KYC columns). */
export const ownerPropertyColumns = {
  ...publicPropertyColumns,
  status: properties.status,
  rejectionReason: properties.rejectionReason,
  updatedAt: properties.updatedAt,
} as const;

export type PropertyFilters = {
  category?: string;
  city?: string;
  location?: string;
  q?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  bhk?: string;
  furnishing?: string;
  minArea?: number;
  maxArea?: number;
  verified?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
};

export { categoryLabel, formatIndianCurrency, formatPrice } from "@/lib/format";

// 60-second in-memory cache for live city listing counts to eliminate redundant GROUP BY queries
let cachedCities: { timestamp: number; data: Array<{ name: string; count: number }> } | null = null;
async function getCachedCityCounts(liveCondition: SQL | undefined) {
  const now = Date.now();
  if (cachedCities && now - cachedCities.timestamp < 60000) {
    return cachedCities.data;
  }
  try {
    const cityCounts = await db
      .select({ city: properties.city, count: count() })
      .from(properties)
      .where(liveCondition)
      .groupBy(properties.city)
      .orderBy(desc(count()));
    const data = cityCounts
      .filter((c) => c.city && c.city.trim().length > 0)
      .map((c) => ({ name: c.city.trim(), count: Number(c.count) }));
    cachedCities = { timestamp: now, data };
    return data;
  } catch {
    return cachedCities?.data || [];
  }
}

export async function findProperties(filters: PropertyFilters = {}) {
  try {
    // Strict Live-Only Rule: Return only active, available properties
    // (status IN ('live', 'available_pending') AND status != 'rejected' AND rental_status != 'rented')
    const conditions: SQL[] = [
      eq(properties.category, "rent_home"),
      or(eq(properties.status, "live"), sql`${properties.status}::text = 'available_pending'`)!,
      ne(properties.status, "rejected"),
      ne(properties.rentalStatus, "rented"),
    ];

    const locQuery = (filters.location || filters.city || "").trim();
    if (locQuery && locQuery.toLowerCase() !== "all cities") {
      const locTerms = expandLocationSearchVariants(locQuery);
      if (locTerms.length > 0) {
        conditions.push(
          or(
            ...locTerms.flatMap((term) => [
              ilike(properties.city, `%${term}%`),
              ilike(properties.locality, `%${term}%`),
              ilike(properties.address, `%${term}%`),
              ilike(properties.landmark, `%${term}%`),
              ilike(properties.pinCode, `%${term}%`),
            ])
          )!
        );
      }
    }

    if (filters.q) {
      const qClean = filters.q.trim();
      if (!locQuery || qClean.toLowerCase() !== locQuery.toLowerCase()) {
        const qTerms = expandLocationSearchVariants(qClean);
        if (qTerms.length > 0) {
          conditions.push(
            or(
              ...qTerms.flatMap((term) => [
                ilike(properties.title, `%${term}%`),
                ilike(properties.city, `%${term}%`),
                ilike(properties.locality, `%${term}%`),
                ilike(properties.address, `%${term}%`),
                ilike(properties.landmark, `%${term}%`),
                ilike(properties.pinCode, `%${term}%`),
                ilike(properties.propertyType, `%${term}%`),
                ilike(properties.bhkOrRoomType, `%${term}%`),
              ])
            )!
          );
        }
      }
    }

    if (filters.propertyType) conditions.push(ilike(properties.propertyType, `%${filters.propertyType}%`));
    if (filters.minPrice !== undefined) conditions.push(gte(properties.price, filters.minPrice));
    if (filters.maxPrice !== undefined) conditions.push(lte(properties.price, filters.maxPrice));
    if (filters.minArea !== undefined) conditions.push(gte(properties.areaSqft, filters.minArea));
    if (filters.maxArea !== undefined) conditions.push(lte(properties.areaSqft, filters.maxArea));
    if (filters.bhk) conditions.push(ilike(properties.bhkOrRoomType, `%${filters.bhk}%`));
    if (filters.furnishing) conditions.push(ilike(properties.furnishingStatus, `%${filters.furnishing}%`));
    if (filters.verified) conditions.push(eq(properties.verified, true));
    const where = and(...conditions);
    const limit = Math.min(Math.max(filters.limit || 12, 1), 30);
    const page = Math.max(filters.page || 1, 1);
    const sorting = filters.sort === "price_asc" ? [asc(properties.price)] : filters.sort === "price_desc" ? [desc(properties.price)] : filters.sort === "newest" ? [desc(properties.createdAt)] : [desc(properties.verified), asc(properties.price)];

    const liveCondition = and(
      eq(properties.category, "rent_home"),
      or(eq(properties.status, "live"), sql`${properties.status}::text = 'available_pending'`),
      ne(properties.status, "rejected"),
      ne(properties.rentalStatus, "rented")
    );

    const [items, [{ total }], availableCities] = await Promise.all([
      db.select(publicPropertyColumns).from(properties).where(where).orderBy(...sorting).limit(limit).offset((page - 1) * limit),
      db.select({ total: count() }).from(properties).where(where),
      getCachedCityCounts(liveCondition),
    ]);

    return {
      items: items.map(serializePublicProperty),
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      availableCities,
    };
  } catch (error) {
    console.error("Database query failed in findProperties:", error);
    return {
      items: [],
      total: 0,
      page: 1,
      pages: 1,
      limit: filters.limit || 12,
      availableCities: [
        { name: "Jaipur", count: 0 },
        { name: "Bengaluru", count: 0 },
        { name: "Mumbai", count: 0 },
        { name: "Gurugram", count: 0 },
        { name: "Pune", count: 0 },
        { name: "Hyderabad", count: 0 },
      ],
    };
  }
}

export const getProperty = cache(async (id: string, includeInactive = false) => {
  try {
    const [property] = await db
      .select(publicPropertyColumns)
      .from(properties)
      .where(
        includeInactive
          ? and(eq(properties.id, id), eq(properties.category, "rent_home"))
          : and(eq(properties.id, id), eq(properties.status, "live"), eq(properties.category, "rent_home"))
      )
      .limit(1);
    return property || null;
  } catch (error) {
    console.error("Database query failed in getProperty:", error);
    return null;
  }
});

/** Server-only lookup for lead creation: fetches public columns + internal ownerId (never serialized in responses). */
export async function getPropertyForLeadCreation(id: string) {
  try {
    const [property] = await db
      .select({ ...publicPropertyColumns, ownerId: properties.ownerId })
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.status, "live"), eq(properties.category, "rent_home")))
      .limit(1);
    return property || null;
  } catch (error) {
    console.error("Database query failed in getPropertyForLeadCreation:", error);
    return null;
  }
}

/** Returns the status of a property when it is not live, or null if deleted/missing. */
export async function getUnavailablePropertyStatus(id: string): Promise<string | null> {
  try {
    const [row] = await db.select({ status: properties.status }).from(properties).where(eq(properties.id, id)).limit(1);
    return row ? row.status : null;
  } catch {
    return null;
  }
}

/** Server-only ownership check without projecting ownerId into page/component props. */
export async function isPropertyOwner(propertyId: string, userId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ ownerId: properties.ownerId }).from(properties).where(eq(properties.id, propertyId)).limit(1);
    return !!row && row.ownerId === userId;
  } catch {
    return false;
  }
}

export async function getSimilarProperties(property: PublicPropertyInput, limit = 3) {
  try {
    const items = await db.select(publicPropertyColumns).from(properties).where(and(eq(properties.status, "live"), eq(properties.category, "rent_home"))).orderBy(desc(properties.verified)).limit(limit + 1);
    return items.filter((item) => item.id !== property.id).slice(0, limit).map(serializePublicProperty);
  } catch (error) {
    console.error("Database query failed in getSimilarProperties:", error);
    return [];
  }
}

export const getTopNeighborhoods = cache(async () => {
  try {
    const rows = await db
      .select({
        locality: properties.locality,
        city: properties.city,
        images: properties.images,
      })
      .from(properties)
      .where(and(eq(properties.status, "live"), eq(properties.category, "rent_home")))
      .orderBy(desc(properties.views))
      .limit(30);

    const seen = new Set<string>();
    const neighborhoods: Array<{ name: string; city: string; image: string }> = [];

    for (const row of rows) {
      if (row.locality && !seen.has(row.locality.toLowerCase())) {
        seen.add(row.locality.toLowerCase());
        const firstImage = Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : "";
        neighborhoods.push({
          name: row.locality,
          city: row.city,
          image: firstImage || "https://images.pexels.com/photos/7672061/pexels-photo-7672061.jpeg?auto=compress&cs=tinysrgb&w=850",
        });
        if (neighborhoods.length >= 3) break;
      }
    }

    if (neighborhoods.length > 0) return neighborhoods;
  } catch (error) {
    console.error("Database query failed in getTopNeighborhoods:", error);
  }

  // Graceful fallback neighborhoods so the layout renders attractively even if database has 0 listings
  return [
    { name: "Koramangala", city: "Bengaluru", image: "https://images.pexels.com/photos/7672061/pexels-photo-7672061.jpeg?auto=compress&cs=tinysrgb&w=850" },
    { name: "Bandra West", city: "Mumbai", image: "https://images.pexels.com/photos/7018401/pexels-photo-7018401.jpeg?auto=compress&cs=tinysrgb&w=850" },
    { name: "Cyber City", city: "Gurugram", image: "https://images.pexels.com/photos/31737842/pexels-photo-31737842.jpeg?auto=compress&cs=tinysrgb&w=850" },
  ];
});
