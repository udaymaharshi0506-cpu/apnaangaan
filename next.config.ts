import path from "node:path";
import type { NextConfig } from "next";

const NO_STORE_SECURITY_HEADERS = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const AUTHENTICATED_ROUTE_PATTERNS = [
  "/admin",
  "/admin/:path*",
  "/owner",
  "/post-property",
  "/saved",
  "/inquiries",
  "/notifications",
  "/profile",
  "/setup",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return AUTHENTICATED_ROUTE_PATTERNS.map((source) => ({
      source,
      headers: NO_STORE_SECURITY_HEADERS,
    }));
  },
};

export default nextConfig;
