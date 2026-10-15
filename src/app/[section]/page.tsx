import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginExperience, SetupExperience, WelcomeExperience } from "@/components/auth-experiences";
import { SignupExperience } from "@/components/signup-experience";
import { InquiriesExperience, NotificationsExperience, OwnerExperience, ProfileExperience, SavedExperience } from "@/components/member-experiences";
import { PostPropertyExperience } from "@/components/post-property";
import { PrivacyContent } from "@/components/privacy-content";
import { SearchExperience } from "@/components/search-experience";
import { findProperties } from "@/lib/queries";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const titles: Record<string, string> = { search: "Explore spaces", saved: "Saved spaces", inquiries: "My inquiries", owner: "Owner dashboard", profile: "Profile & settings", notifications: "Notifications", login: "Log in", signup: "Create your account", setup: "Finish your profile", welcome: "The Aangan way", "post-property": "List your property", privacy: "Privacy policy" };
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
      const result = await findProperties({ category: filters.category, q: filters.q, city: filters.city, minPrice: filters.minPrice ? Number(filters.minPrice) : undefined, maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined, minArea: filters.minArea ? Number(filters.minArea) : undefined, maxArea: filters.maxArea ? Number(filters.maxArea) : undefined, bhk: filters.bhk, furnishing: filters.furnishing, verified: filters.verified === "true", sort: filters.sort, page: filters.page ? Number(filters.page) : 1, limit: 12 });
      return <SearchExperience result={result} initialFilters={filters}/>;
    }
    case "login": return <LoginExperience next={filters.next}/>;
    case "signup": return <SignupExperience next={filters.next}/>;
    case "setup": return <SetupExperience next={filters.next}/>;
    case "welcome": return <WelcomeExperience/>;
    case "saved": return <SavedExperience/>;
    case "inquiries": return <InquiriesExperience/>;
    case "owner": return <OwnerExperience/>;
    case "post-property": return <PostPropertyExperience/>;
    case "profile": return <ProfileExperience/>;
    case "notifications": return <NotificationsExperience/>;
    case "privacy": return <PrivacyContent/>;
    default: notFound();
  }
}
