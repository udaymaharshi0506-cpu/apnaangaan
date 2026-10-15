import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";
import "./marketplace.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: { default: "Aangan — Find a place that feels like yours", template: "%s | Aangan" },
  description: "Find verified homes, rentals, PGs, and commercial spaces in India. No spam calls, no shared contact details — just a better way home.",
  applicationName: "Aangan",
  icons: { icon: "/app-icon.svg", apple: "/app-icon.svg" },
  keywords: ["verified homes", "property in India", "homes for rent", "buy home", "PG", "commercial rent"],
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#164f4c" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body><AppProviders><SiteShell>{children}</SiteShell></AppProviders></body></html>;
}
