import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginExperience } from "@/components/admin-experience";
import { getServerUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team sign in", robots: { index: false, follow: false } };
export default async function AdminLoginPage() {
  const user = await getServerUser();
  if (hasRole(user, "admin")) redirect("/admin");
  return <AdminLoginExperience/>;
}
