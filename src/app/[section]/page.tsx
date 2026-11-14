import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { notFound, redirect } from "next/navigation";
import { getServerUser, hasRole } from "@/lib/auth";
import { findProperties } from "@/lib/queries";

const ExperienceFallback = () => (
  <div className="container" style={{ padding: "40px 16px", minHeight: "60vh" }}>
    <div style={{ height: "320px", borderRadius: "16px", background: "var(--surface-soft, rgba(0,0,0,0.04))" }} />
  </div>
);

// Route-level code-splitting to eliminate monolithic bundles on dynamic section routes
const SearchExperience = dynamicImport(() => import("@/components/search-experience").then((m) => m.SearchExperience), { loading: ExperienceFallback });
const LoginExperience = dynamicImport(() => import("@/components/auth-experiences").then((m) => m.LoginExperience), { loading: ExperienceFallback });
const SignupExperience = dynamicImport(() => import("@/components/signup-experience").then((m) => m.SignupExperience), { loading: ExperienceFallback });
const SetupExperience = dynamicImport(() => import("@/components/auth-experiences").then((m) => m.SetupExperience), { loading: ExperienceFallback });
const WelcomeExperience = dynamicImport(() => import("@/components/auth-experiences").then((m) => m.WelcomeExperience), { loading: ExperienceFallback });
const SavedExperience = dynamicImport(() => import("@/components/member-experiences").then((m) => m.SavedExperience), { loading: ExperienceFallback });
const InquiriesExperience = dynamicImport(() => import("@/components/member-experiences").then((m) => m.InquiriesExperience), { loading: ExperienceFallback });
const OwnerExperience = dynamicImport(() => import("@/components/member-experiences").then((m) => m.OwnerExperience), { loading: ExperienceFallback });
const PostPropertyExperience = dynamicImport(() => import("@/components/post-property").then((m) => m.PostPropertyExperience), { loading: ExperienceFallback });
const ProfileExperience = dynamicImport(() => import("@/components/member-experiences").then((m) => m.ProfileExperience), { loading: ExperienceFallback });
const NotificationsExperience = dynamicImport(() => import("@/components/member-experiences").then((m) => m.NotificationsExperience), { loading: ExperienceFallback });
const PrivacyContent = dynamicImport(() => import("@/components/privacy-content").then((m) => m.PrivacyContent), { loading: ExperienceFallback });

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const titles: Record<string, string> = { search: "Explore rental homes", saved: "Saved rental homes", inquiries: "My inquiries", owner: "Owner dashboard", profile: "Profile & settings", notifications: "Notifications", login: "Log in", signup: "Create your account", setup: "Finish your profile", welcome: "The Apnaangaan way", "post-property": "List your property", privacy: "Privacy policy" };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: titles[section] || "Page not found", ...(section === "profile" || section === "inquiries" || section === "owner" || section === "notifications" ? { robots: { index: false, follow: false } } : {}) };
}
export default async function SectionPage({ params, searchParams }: Props) {
  const { section } = await params;
  const raw = await searchParams;
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") filters[key] = value;
  switch (section) {
    case "search": {
      const result = await findProperties({
        category: "rent_home",
        q: filters.q,
        city: filters.city,
        location: filters.location,
        propertyType: filters.propertyType,
        minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
        maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
        minArea: filters.minArea ? Number(filters.minArea) : undefined,
        maxArea: filters.maxArea ? Number(filters.maxArea) : undefined,
        bhk: filters.bhk,
        furnishing: filters.furnishing,
        verified: filters.verified === "true",
        sort: filters.sort,
        page: filters.page ? Number(filters.page) : 1,
        limit: 12,
      });
      return <SearchExperience result={result} initialFilters={filters} />;
    }
    case "login": return <LoginExperience next={filters.next}/>;
    case "signup": return <SignupExperience next={filters.next}/>;
    case "setup": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/setup")}`);
      return <SetupExperience next={filters.next}/>;
    }
    case "welcome": return <WelcomeExperience/>;
    case "saved": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/saved")}`);
      return <SavedExperience/>;
    }
    case "inquiries": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/inquiries")}`);
      return <InquiriesExperience/>;
    }
    case "owner": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/owner")}`);
      if (!hasRole(user, "owner") && !hasRole(user, "admin")) redirect("/profile");
      return <OwnerExperience/>;
    }
    case "post-property": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/post-property")}`);
      if (!hasRole(user, "owner") && !hasRole(user, "admin")) redirect("/profile");
      return <PostPropertyExperience/>;
    }
    case "profile": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/profile")}`);
      return <ProfileExperience/>;
    }
    case "notifications": {
      const user = await getServerUser();
      if (!user) redirect(`/login?next=${encodeURIComponent("/notifications")}`);
      return <NotificationsExperience/>;
    }
    case "privacy": return <PrivacyContent/>;
    default: notFound();
  }
}
