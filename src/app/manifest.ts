import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aangan — A more thoughtful way home",
    short_name: "Aangan",
    description: "Discover verified homes and spaces in India, with your privacy protected.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#164f4c",
    lang: "en-IN",
    icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
