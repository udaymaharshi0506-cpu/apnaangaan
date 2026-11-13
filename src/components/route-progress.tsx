"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // When pathname or searchParams change, finish the loading bar
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    // Intercept internal link clicks to trigger top progress bar immediately
    function handleLinkClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external, hash links, mailto/tel, new tab, or modifier keys
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        target.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if it's the exact same url
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      // Start loading bar animation
      setLoading(true);
      setProgress(25);

      const p1 = setTimeout(() => setProgress(65), 120);
      const p2 = setTimeout(() => setProgress(85), 350);

      return () => {
        clearTimeout(p1);
        clearTimeout(p2);
      };
    }

    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "3px",
        zIndex: 99999,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--brand) 0%, var(--accent) 50%, var(--brand-deep) 100%)",
          boxShadow: "0 0 10px rgba(22, 79, 76, 0.6), 0 0 5px rgba(229, 172, 112, 0.8)",
          transition: progress === 100 ? "width 0.2s ease-out, opacity 0.3s ease-out" : "width 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
