import { db } from "@/db";
import { users } from "@/db/schema";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";

export const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@aangan.com";
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AanganSecure2026!";

/** Ensure the administrative account exists so authorized team members can log into /admin. */
export async function ensureAdminAccount() {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
    const [existing] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    if (!existing) {
      const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
      const passwordHash = await hash(password, 12);
      await db
        .insert(users)
        .values({
          email: adminEmail,
          name: "Aangan Admin",
          role: "admin",
          roles: ["customer", "owner", "admin"],
          passwordHash,
          consentAt: new Date(),
        })
        .onConflictDoNothing();
    }
  } catch (err) {
    console.warn("Admin initialization notice:", err instanceof Error ? err.message : err);
  }
}

/** Test utility */
export async function ensureSeedData() {
  await ensureAdminAccount();
}
