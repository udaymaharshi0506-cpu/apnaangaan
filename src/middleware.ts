import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const ACCESS_COOKIE = "aangan_access";

function applyAntiCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore static assets, internal Next chunks, and icons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname.includes(".") ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  let payload: Record<string, unknown> | null = null;

  if (token) {
    try {
      const verified = await jwtVerify(token, getJwtSecret(), {
        algorithms: ["HS256"],
      });
      if (verified.payload && verified.payload.type === "access") {
        payload = verified.payload as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }
  }

  const userRoles = Array.isArray(payload?.roles) ? (payload?.roles as string[]) : [];
  const isAdmin = payload?.role === "admin" && userRoles.includes("admin");
  const isOwner = userRoles.includes("owner") || isAdmin;
  const isAuthenticated = Boolean(payload && payload.sub);

  // 1. Strict Backend RBAC for /admin Routes
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login") {
      if (isAdmin) {
        return applyAntiCacheHeaders(NextResponse.redirect(new URL("/admin", request.url)));
      }
      return applyAntiCacheHeaders(NextResponse.next());
    }

    // Require authentication
    if (!isAuthenticated) {
      return applyAntiCacheHeaders(NextResponse.redirect(new URL("/admin/login", request.url)));
    }

    // Require admin role: block customers and owners at HTTP edge before any page/component renders
    if (!isAdmin) {
      return applyAntiCacheHeaders(NextResponse.redirect(new URL("/", request.url)));
    }

    return applyAntiCacheHeaders(NextResponse.next());
  }

  // 2. Strict RBAC for Owner Routes (/owner, /post-property)
  if (
    pathname === "/owner" ||
    pathname.startsWith("/owner/") ||
    pathname === "/post-property" ||
    pathname.startsWith("/post-property/")
  ) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return applyAntiCacheHeaders(NextResponse.redirect(loginUrl));
    }
    if (!isOwner) {
      return applyAntiCacheHeaders(NextResponse.redirect(new URL("/profile", request.url)));
    }
    return applyAntiCacheHeaders(NextResponse.next());
  }

  // 3. Strict RBAC for Customer Protected Routes (/profile, /inquiries, /saved, /notifications)
  if (
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/inquiries" ||
    pathname.startsWith("/inquiries/") ||
    pathname === "/saved" ||
    pathname.startsWith("/saved/") ||
    pathname === "/notifications" ||
    pathname.startsWith("/notifications/")
  ) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return applyAntiCacheHeaders(NextResponse.redirect(loginUrl));
    }
    return applyAntiCacheHeaders(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/owner",
    "/owner/:path*",
    "/post-property",
    "/post-property/:path*",
    "/profile",
    "/profile/:path*",
    "/inquiries",
    "/inquiries/:path*",
    "/saved",
    "/saved/:path*",
    "/notifications",
    "/notifications/:path*",
  ],
};
