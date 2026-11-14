"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const t1Ref = useRef<NodeJS.Timeout | null>(null);
  const t2Ref = useRef<NodeJS.Timeout | null>(null);
  const finishRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = () => {
    if (t1Ref.current) { clearTimeout(t1Ref.current); t1Ref.current = null; }
    if (t2Ref.current) { clearTimeout(t2Ref.current); t2Ref.current = null; }
    if (finishRef.current) { clearTimeout(finishRef.current); finishRef.current = null; }
  };

  useEffect(() => {
    // When pathname changes, complete and dismiss the bar
    if (loading) {
      clearTimers();
      setProgress(100);
      finishRef.current = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
    }
    return () => clearTimers();
  }, [pathname, loading]);

  useEffect(() => {
    function handleLinkClick(e: MouseEvent) {
      try {
        const rawTarget = e.target;
        const el = rawTarget instanceof Element ? rawTarget : (rawTarget as Node)?.parentElement;
        if (!el || typeof el.closest !== "function") return;

        const anchor = el.closest("a");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href) return;

        // Skip external, anchors, mailto, tel, target _blank, or modifier clicks
        if (
          href.startsWith("http://") ||
          href.startsWith("https://") ||
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          anchor.target === "_blank" ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }

        const currentPath = window.location.pathname;
        if (href === currentPath) return;

        clearTimers();
        setLoading(true);
        setProgress(30);

        t1Ref.current = setTimeout(() => setProgress(75), 150);
        // Safety timeout: dismiss if navigation takes too long or is canceled
        t2Ref.current = setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 4000);
      } catch {
        // Silently ignore to never block browser navigation
      }
    }

    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
      clearTimers();
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
          background: "linear-gradient(90deg, var(--brand, #164f4c) 0%, var(--accent, #e5ac70) 50%, var(--brand-deep, #103f3e) 100%)",
          boxShadow: "0 0 10px rgba(22, 79, 76, 0.6), 0 0 5px rgba(229, 172, 112, 0.8)",
          transition: progress === 100 ? "width 0.2s ease-out, opacity 0.3s ease-out" : "width 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
