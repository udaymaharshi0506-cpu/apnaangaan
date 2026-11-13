import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";
import "./marketplace.css";
import "./workspace.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.apnaangaan.in"),
  title: { default: "Apnaangaan — Find a place that feels like yours", template: "%s | Apnaangaan" },
  description: "Find verified homes for rent in India. No spam calls, no shared contact details — just a better way home.",
  applicationName: "Apnaangaan",
  icons: { icon: "/app-icon.svg", apple: "/app-icon.svg" },
  keywords: ["verified homes", "rental homes in India", "homes for rent", "flats for rent", "apartments for rent", "house for rent"],
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#164f4c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body><AppProviders><SiteShell>{children}</SiteShell></AppProviders></body></html>;
}
