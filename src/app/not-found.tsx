import Link from "next/link";
import { ArrowRight, Building2, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          backgroundColor: "var(--brand-pale, #e8f1ed)",
          display: "grid",
          placeItems: "center",
          color: "var(--brand, #164f4c)",
          marginBottom: "1.5rem",
        }}
      >
        <Building2 size={32} strokeWidth={1.8} />
      </div>

      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: 800,
          letterSpacing: "1.5px",
          color: "var(--brand, #164f4c)",
          textTransform: "uppercase",
          marginBottom: "0.5rem",
        }}
      >
        404 · Page Not Found
      </span>

      <h1
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
          fontWeight: 800,
          letterSpacing: "-1px",
          color: "var(--ink, #203a36)",
          margin: "0 0 0.75rem",
        }}
      >
        We couldn’t find that page
      </h1>

      <p
        style={{
          color: "var(--muted, #71807a)",
          maxWidth: 460,
          fontSize: "1rem",
          lineHeight: 1.6,
          margin: "0 0 2rem",
        }}
      >
        The listing or link you’re looking for may have moved, expired, or been taken off the market.
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link href="/" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Home size={16} /> Return Home
        </Link>
        <Link
          href="/search"
          className="btn btn-secondary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--border, #e5e9e3)",
            color: "var(--ink, #203a36)",
          }}
        >
          <Search size={16} /> Explore All Homes <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}

