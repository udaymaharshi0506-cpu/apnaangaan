export type PriceFormatOptions = {
  period?: "month" | "total";
};

function trimDecimals(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/**
 * Formats an Indian Rupee amount cleanly using INR grouping, Lakh, or Crore.
 */
export function formatIndianCurrency(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 10_000_000) {
    return `${sign}₹${trimDecimals(abs / 10_000_000)} Cr`;
  }
  if (abs >= 100_000) {
    return `${sign}₹${trimDecimals(abs / 100_000)} Lakh`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/**
 * Formats a property price or deposit consistently across cards, detail pages, and dashboards.
 * Monthly rental verticals append "/month" unless `period: "total"` is passed.
 */
export function formatPrice(
  price: number,
  category = "rent_home",
  options: PriceFormatOptions = {}
): string {
  const isTotal = options.period === "total" || category === "buy_home";
  if (!Number.isFinite(price) || price <= 0) {
    return isTotal ? "₹0" : "₹0/month";
  }
  const base = formatIndianCurrency(price);
  return isTotal ? base : `${base}/month`;
}

export const categoryLabel: Record<string, string> = {
  rent_home: "Homes for rent",
};
