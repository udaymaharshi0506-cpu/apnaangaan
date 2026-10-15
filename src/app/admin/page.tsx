import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboardExperience } from "@/components/admin-experience";
import { getServerUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team workspace", robots: { index: false, follow: false } };
export default async function AdminPage() {
  const user = await getServerUser();
  if (!hasRole(user, "admin")) redirect("/admin/login");
  return <AdminDashboardExperience/>;
}
