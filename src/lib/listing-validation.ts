import { parseIndianPinCode } from "@/lib/input-validation";

export const ACTIVE_VERTICALS = ["rent_home"] as const;
export type ActiveVertical = (typeof ACTIVE_VERTICALS)[number];

export const PROPERTY_TYPES_BY_VERTICAL: Record<ActiveVertical, readonly string[]> = {
  rent_home: ["Apartment", "Independent house", "Villa", "Studio apartment", "Floor"],
};

export const BHK_OPTIONS_BY_VERTICAL: Record<ActiveVertical, readonly string[]> = {
  rent_home: ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK", "4+ BHK", "Studio"],
};

export const LISTING_LIMITS = {
  rent_home: {
    minPrice: 1000, // ₹1,000/month minimum
    maxPrice: 5_000_000, // ₹50 lakh/month ceiling
    minAreaSqft: 100,
    maxAreaSqft: 50_000,
    maxDeposit: 50_000_000, // ₹5 Cr ceiling
    maxMaintenance: 500_000,
    maxBathrooms: 20,
    maxTotalFloors: 150,
  },
} as const;

export const MAX_LISTING_IMAGES = 15;
export const MIN_LISTING_IMAGES_UI = 5;

export function normalizeFromAllowlist(value: string, allowlist: readonly string[]): string | null {
  const target = value.trim().toLowerCase();
  const match = allowlist.find((item) => item.toLowerCase() === target);
  return match || null;
}

/** Validates an integer numeric string/number rejecting decimals, NaN, negative, or out-of-range values. */
export function validateStrictIntegerBound(
  raw: unknown,
  label: string,
  bounds: { min: number; max: number; allowZero?: boolean }
): { valid: true; value: number } | { valid: false; error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { valid: false, error: `${label} is required.` };
  }

  const str = typeof raw === "string" ? raw.replace(/,/g, "").trim() : String(raw);
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    return { valid: false, error: `${label} must be a whole number.` };
  }
  if (str.includes(".")) {
    return { valid: false, error: `${label} must be a whole number without decimals.` };
  }

  const num = Number(str);
  if (!Number.isSafeInteger(num)) {
    return { valid: false, error: `${label} is out of valid numeric range.` };
  }
  if (num < 0 || (!bounds.allowZero && num <= 0)) {
    return { valid: false, error: `${label} must be greater than zero.` };
  }
  if (num < bounds.min) {
    return { valid: false, error: `${label} must be at least ${bounds.min.toLocaleString("en-IN")}.` };
  }
  if (num > bounds.max) {
    return { valid: false, error: `${label} cannot exceed ${bounds.max.toLocaleString("en-IN")}.` };
  }

  return { valid: true, value: num };
}

export function validateVerticalRules(
  data: {
    category?: string;
    transactionType?: string;
    propertyType?: string;
    bhkOrRoomType?: string;
    price?: unknown;
    areaSqft?: unknown;
    deposit?: unknown;
    bathrooms?: unknown;
    floor?: string | null;
    totalFloors?: unknown;
    maintenanceStatus?: string | null;
    maintenanceAmount?: unknown;
    pinCode?: string | null;
    images?: string[];
  },
  options: { isDraft?: boolean; requireMinUiPhotos?: boolean } = {}
): string | null {
  if (data.transactionType && !["rent", "rental"].includes(String(data.transactionType).toLowerCase().trim())) {
    return "Only rent transaction type is supported. Buy listings are rejected.";
  }

  const rawCat = String(data.category || "rent_home").toLowerCase().trim();
  if (["buy", "buy_home", "sale", "purchase", "pg", "rent_pg", "paying_guest", "paying guest", "coliving", "co-living", "commercial", "rent_commercial", "office", "retail", "shop"].includes(rawCat)) {
    return "Only residential home rentals are supported. Buy, PG, and Commercial listings are rejected.";
  }
  if (!ACTIVE_VERTICALS.includes(rawCat as ActiveVertical) && !["rent", "home", "residential"].includes(rawCat)) {
    return "Only rental home listings (rent_home) are currently accepted.";
  }

  const limits = LISTING_LIMITS.rent_home;

  if (!options.isDraft || data.propertyType) {
    if (data.propertyType && /\b(shop|office|retail|commercial|pg|paying guest|hostel|warehouse|showroom|industrial|plot|land)\b/i.test(data.propertyType)) {
      return "Only residential home rentals are supported. Commercial and PG property types are rejected.";
    }
    if (!data.propertyType || !normalizeFromAllowlist(data.propertyType, PROPERTY_TYPES_BY_VERTICAL.rent_home)) {
      return `Invalid property type. Allowed: ${PROPERTY_TYPES_BY_VERTICAL.rent_home.join(", ")}.`;
    }
  }

  if (!options.isDraft || data.bhkOrRoomType) {
    if (data.bhkOrRoomType && /\b(desk|retail|shop|office|commercial|sharing|bed)\b/i.test(data.bhkOrRoomType)) {
      return "Only residential home configurations are supported.";
    }
    if (!data.bhkOrRoomType || !normalizeFromAllowlist(data.bhkOrRoomType, BHK_OPTIONS_BY_VERTICAL.rent_home)) {
      return `Invalid BHK / configuration. Allowed: ${BHK_OPTIONS_BY_VERTICAL.rent_home.join(", ")}.`;
    }
  }

  if (!options.isDraft || (data.price !== undefined && data.price !== null && String(data.price).trim() !== "")) {
    const priceRes = validateStrictIntegerBound(data.price, "Monthly rent", {
      min: limits.minPrice,
      max: limits.maxPrice,
    });
    if (!priceRes.valid) return priceRes.error;
  }

  if (!options.isDraft || (data.areaSqft !== undefined && data.areaSqft !== null && String(data.areaSqft).trim() !== "")) {
    const areaRes = validateStrictIntegerBound(data.areaSqft, "Built-up area (sq ft)", {
      min: limits.minAreaSqft,
      max: limits.maxAreaSqft,
    });
    if (!areaRes.valid) return areaRes.error;
  }

  if (data.deposit !== undefined && data.deposit !== null && String(data.deposit).trim() !== "") {
    const depRes = validateStrictIntegerBound(data.deposit, "Security deposit", {
      min: 0,
      max: limits.maxDeposit,
      allowZero: true,
    });
    if (!depRes.valid) return depRes.error;
  }

  if (data.bathrooms !== undefined && data.bathrooms !== null && String(data.bathrooms).trim() !== "") {
    const bathRes = validateStrictIntegerBound(data.bathrooms, "Bathrooms", {
      min: 0,
      max: limits.maxBathrooms,
      allowZero: true,
    });
    if (!bathRes.valid) return bathRes.error;
  }

  if (data.totalFloors !== undefined && data.totalFloors !== null && String(data.totalFloors).trim() !== "") {
    const totalFloorsRes = validateStrictIntegerBound(data.totalFloors, "Total floors", {
      min: 0,
      max: limits.maxTotalFloors,
      allowZero: true,
    });
    if (!totalFloorsRes.valid) return totalFloorsRes.error;

    if (data.floor && /^\d+$/.test(data.floor.trim())) {
      const floorNum = Number(data.floor.trim());
      if (floorNum > totalFloorsRes.value) {
        return `Floor number (${floorNum}) cannot exceed total floors (${totalFloorsRes.value}).`;
      }
    }
  }

  if (data.maintenanceStatus === "separate" && !options.isDraft) {
    const maintRes = validateStrictIntegerBound(data.maintenanceAmount, "Monthly maintenance", {
      min: 1,
      max: limits.maxMaintenance,
    });
    if (!maintRes.valid) return maintRes.error;
  } else if (
    data.maintenanceAmount !== undefined &&
    data.maintenanceAmount !== null &&
    String(data.maintenanceAmount).trim() !== ""
  ) {
    const maintRes = validateStrictIntegerBound(data.maintenanceAmount, "Monthly maintenance", {
      min: 0,
      max: limits.maxMaintenance,
      allowZero: true,
    });
    if (!maintRes.valid) return maintRes.error;
  }

  if (data.pinCode !== undefined && data.pinCode !== null && String(data.pinCode).trim() !== "") {
    const pinRes = parseIndianPinCode(String(data.pinCode));
    if (!pinRes.valid) {
      return pinRes.error;
    }
  }

  if (Array.isArray(data.images)) {
    if (data.images.length > MAX_LISTING_IMAGES) {
      return `Maximum ${MAX_LISTING_IMAGES} property photos allowed.`;
    }
    if (!options.isDraft && options.requireMinUiPhotos && data.images.length < MIN_LISTING_IMAGES_UI) {
      return `Please upload at least ${MIN_LISTING_IMAGES_UI} property photos.`;
    }
  }

  return null;
}

