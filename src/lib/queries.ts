import { db } from "@/db";
import { properties, type Property } from "@/db/schema";
import { serializePublicProperty } from "@/lib/serializers";
import { and, asc, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

export type PropertyFilters = {
  category?: string;
  city?: string;
  q?: string;
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

export function formatPrice(price: number, category?: string) {
  if (category === "buy_home") {
    if (price >= 10000000) return `₹${(price / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
    return `₹${(price / 100000).toFixed(0)} L`;
  }
  if (price >= 100000) return `₹${(price / 100000).toFixed(2).replace(/\.00$/, "")} L/mo`;
  return `₹${price.toLocaleString("en-IN")}/mo`;
}

export const categoryLabel: Record<string, string> = {
  buy_home: "Homes for sale", rent_home: "Homes for rent", rent_pg: "PG & co-living", rent_commercial: "Commercial spaces",
};

export async function findProperties(filters: PropertyFilters = {}) {
  const conditions: SQL[] = [eq(properties.status, "live")];
  if (filters.category && ["buy_home", "rent_home", "rent_pg", "rent_commercial"].includes(filters.category)) conditions.push(eq(properties.category, filters.category as Property["category"]));
  if (filters.city && filters.city.toLowerCase() !== "all cities") conditions.push(or(ilike(properties.city, `%${filters.city}%`), ilike(properties.locality, `%${filters.city}%`))!);
  if (filters.q) conditions.push(or(ilike(properties.title, `%${filters.q}%`), ilike(properties.city, `%${filters.q}%`), ilike(properties.locality, `%${filters.q}%`), ilike(properties.propertyType, `%${filters.q}%`))!);
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
  const [items, [{ total }]] = await Promise.all([
    db.select().from(properties).where(where).orderBy(...sorting).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(properties).where(where),
  ]);
  return { items: items.map(serializePublicProperty), total, page, pages: Math.ceil(total / limit), limit };
}

export async function getProperty(id: string, includeInactive = false) {
  const [property] = await db.select().from(properties).where(includeInactive ? eq(properties.id, id) : and(eq(properties.id, id), eq(properties.status, "live"))).limit(1);
  return property || null;
}

export async function getSimilarProperties(property: Property, limit = 3) {
  const items = await db.select().from(properties).where(and(eq(properties.status, "live"), eq(properties.category, property.category))).orderBy(desc(properties.verified)).limit(limit + 1);
  return items.filter((item) => item.id !== property.id).slice(0, limit).map(serializePublicProperty);
}

export async function getTopNeighborhoods() {
  const rows = await db
    .select({
      locality: properties.locality,
      city: properties.city,
      images: properties.images,
    })
    .from(properties)
    .where(eq(properties.status, "live"))
    .orderBy(desc(properties.views));

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

  return neighborhoods;
}
