"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: "rgba(22, 79, 76, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#164f4c",
          marginBottom: "1.25rem",
        }}
      >
        <AlertTriangle size={28} />
      </div>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#111827", marginBottom: "0.5rem" }}>
        Something went wrong
      </h2>
      <p style={{ color: "#6b7280", maxWidth: 440, fontSize: "0.95rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
        We encountered a temporary issue while loading this page. Please try refreshing or return to the homepage.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            backgroundColor: "#164f4c",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            border: "none",
          }}
        >
          <RefreshCw size={15} /> Try again
        </button>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            color: "#374151",
            fontWeight: 500,
            fontSize: "0.9rem",
            textDecoration: "none",
            backgroundColor: "#ffffff",
          }}
        >
          <Home size={15} /> Home
        </Link>
      </div>
    </div>
  );
}
