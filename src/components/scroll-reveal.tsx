"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScrollReveal({
  children,
  className = "",
  threshold = 0.05,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // On mobile devices, reveal immediately to prevent any blank screen or lag
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setRevealed(true);
      return;
    }

    // Safety fallback: guaranteed reveal within 400ms even if observer is slow
    const fallbackTimer = setTimeout(() => {
      setRevealed(true);
    }, 400);

    const el = ref.current;
    if (!el) return () => clearTimeout(fallbackTimer);

    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      clearTimeout(fallbackTimer);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRevealed(true);
          clearTimeout(fallbackTimer);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px 50px 0px" }
    );

    observer.observe(el);

    return () => {
      clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, [threshold]);

  return (
    <div ref={ref} className={`scroll-reveal ${revealed ? "revealed" : ""} ${className}`}>
      {children}
    </div>
  );
}
