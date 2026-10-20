"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeAlert,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Heart,
  Home,
  Info,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  UsersRound,
  X,
  ZoomIn,
} from "lucide-react";
import { Brand } from "@/components/site-shell";
import { apiFetch, useApp } from "@/components/providers";
import { categoryLabel, formatPrice } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

export type AdminUser = {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  location?: string | null;
  email: string | null;
  role: string;
  roles: Array<"customer" | "owner" | "admin">;
  category: "customer" | "owner" | "admin";
  categoryLabel: string;
  consentAt: string | null;
  createdAt: string;
  listingsCount: number;
  inquiriesCount: number;
};

export type AdminLead = {
  id: string;
  status: string;
  adminNotes: string | null;
  preferredContactTime: string | null;
  occupantsCount?: string | null;
  tenantType?: string | null;
  profession?: string | null;
  groupGender?: string | null;
  moveInTimeline?: string | null;
  confirmedPhone?: string | null;
  seekerNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  property: PublicProperty;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    city?: string | null;
    location?: string | null;
  };
  owner: { id: string; name: string | null; phone: string | null; email: string | null };
  meeting: { id: string; scheduledAt: string; mode: string; status: string } | null;
  history: Array<{ eventType: string; detail: string; createdAt: string }>;
  callLogs: Array<{ party: string; outcome: string; notes: string | null; createdAt: string }>;
};

export type ModeratedProperty = PublicProperty & {
  status: string;
  views: number;
  liveSelfieUrl?: string | null;
  aadhaarCardUrl?: string | null;
  ownershipType?: string | null;
  coOwners?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  rejectionReason?: string | null;
  owner?: { id: string; name: string | null; phone: string | null; email: string | null } | null;
};

export type Stats = {
  listingsByCategory: Array<{ category: string; total: number }>;
  leadsByStatus: Array<{ status: string; total: number }>;
  inquiryTotal: number;
  pendingListings: number;
  totalListings?: number;
  totalUsers?: number;
  seekerCount?: number;
  ownerCount?: number;
  inquiriesByDay: Array<{ day: string; total: number }>;
  conversionRate: number;
};

function niceDate(date: string | Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const statuses = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "meeting_scheduled", label: "Meeting scheduled" },
  { value: "closed_won", label: "Closed · won" },
  { value: "closed_lost", label: "Closed · lost" },
];

export function AdminLoginExperience() {
  const router = useRouter();
  const { refreshUser } = useApp();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (step === "password") {
        await apiFetch("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setStep("code");
      } else {
        await apiFetch("/api/admin/2fa", { method: "POST", body: JSON.stringify({ code }) });
        await refreshUser();
        router.push("/admin");
        router.refresh();
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-left">
        <div className="admin-login-top">
          <Brand />
          <Link href="/">
            <ArrowLeft size={15} /> Back to Aangan
          </Link>
        </div>
        <div className="admin-login-form">
          <span className="admin-login-symbol">
            <ShieldCheck size={29} />
          </span>
          <span className="eyebrow">INTERNAL ACCESS ONLY</span>
          <h1>{step === "password" ? "Welcome back, team." : "One last security step."}</h1>
          <p>
            {step === "password"
              ? "Sign in to the workspace that keeps every connection thoughtful, safe, and personal."
              : "Enter the six-digit code from your authenticator app."}
          </p>
          <form onSubmit={(event) => void submit(event)}>
            {step === "password" ? (
              <>
                <label className="form-label">WORK EMAIL</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@aangan.com"
                  required
                />
                <label className="form-label">PASSWORD</label>
                <input
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </>
            ) : (
              <>
                <label className="form-label">AUTHENTICATOR CODE</label>
                <input
                  className="form-input admin-code-input"
                  inputMode="numeric"
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                />
                {process.env.NODE_ENV !== "production" && (
                  <div
                    style={{
                      marginTop: "10px",
                      marginBottom: "14px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "rgba(180, 83, 9, 0.08)",
                      border: "1px solid rgba(180, 83, 9, 0.25)",
                      color: "#92400e",
                      fontSize: "0.875rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      Dev Security code (2FA): <strong style={{ letterSpacing: "1.5px", fontSize: "1rem" }}>000000</strong>
                    </span>
                    <button
                      type="button"
                      style={{
                        background: "#92400e",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "5px",
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      onClick={() => setCode("000000")}
                    >
                      Fill Code
                    </button>
                  </div>
                )}
              </>
            )}
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy}>
              {busy ? "Please wait..." : step === "password" ? "Continue securely" : "Verify and enter"}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
        <div className="admin-login-bottom">
          <LockKeyhole size={15} /> Protected workspace · Authorized team members only
        </div>
      </div>
      <div className="admin-login-right">
        <div className="admin-login-right-inner">
          <span className="admin-login-orbit" />
          <span className="admin-login-shield">
            <ShieldCheck size={63} strokeWidth={1.25} />
          </span>
          <span className="eyebrow light">THE HEART OF OUR PROMISE</span>
          <h2>
            Trust is built
            <br />
            behind the scenes.
          </h2>
          <p>Every inquiry is handled by a real person. Every detail is kept where it belongs.</p>
          <div className="admin-login-features">
            <span>
              <Check size={16} /> Both sides protected
            </span>
            <span>
              <Check size={16} /> One thoughtful connection at a time
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

export function DocumentLightboxModal({
  title,
  imageUrl,
  onClose,
}: {
  title: string;
  imageUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      className="lead-panel-backdrop"
      onClick={onClose}
      style={{
        zIndex: 400,
        background: "rgba(10, 18, 14, 0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(96vw, 920px)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#18181b",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            background: "#27272a",
            color: "#ffffff",
            borderBottom: "1px solid #3f3f46",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={16} color="#38bdf8" />
            <strong style={{ fontSize: "13px", letterSpacing: "-0.2px" }}>{title}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "#93c5fd",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open Original <ExternalLink size={12} />
            </a>
            <button
              onClick={onClose}
              aria-label="Close image preview"
              style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div
          style={{
            padding: "18px",
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "#09090b",
            minHeight: "320px",
          }}
        >
          <img
            src={imageUrl}
            alt={title}
            style={{
              maxWidth: "100%",
              maxHeight: "75vh",
              objectFit: "contain",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function RejectReasonModal({
  propertyTitle,
  ownerName,
  onConfirm,
  onClose,
  busy,
}: {
  propertyTitle: string;
  ownerName?: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const presets = [
    "Government Aadhaar card document is blurry, incomplete, or unreadable.",
    "Live selfie verification photo is blurry or does not match the Aadhaar document.",
    "Ownership proof or co-owner consent is missing or invalid.",
    "Property photos are low-resolution, watermarked, or downloaded from the web.",
    "Owner phone number / email provided in description (violates platform privacy).",
    "Street address, landmark, or location pin is inaccurate or unlocatable.",
    "Asking price, maintenance, or security deposit details seem unrealistic or contradictory.",
    "Mandatory RERA number or legal disclosure is required for this commercial/project listing.",
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    await onConfirm(reason.trim());
  }

  return (
    <div
      className="lead-panel-backdrop"
      onClick={onClose}
      style={{
        zIndex: 350,
        background: "rgba(10, 20, 15, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, 550px)",
          background: "#ffffff",
          borderRadius: "14px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.3)",
          border: "1px solid #fee2e2",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#fef2f2",
            padding: "18px 22px",
            borderBottom: "1px solid #fecaca",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#fee2e2",
                color: "#dc2626",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#991b1b", fontWeight: 700 }}>Reject Property Listing</h3>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#b91c1c" }}>
                This rejection reason will be displayed directly on the owner&apos;s dashboard.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close reject modal"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 22px" }}>
          <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, color: "#64748b" }}>Target Property</div>
            <strong style={{ fontSize: "13px", color: "#0f172a", display: "block", marginTop: "2px" }}>{propertyTitle}</strong>
            {ownerName && <span style={{ fontSize: "11px", color: "#64748b" }}>Owner: {ownerName}</span>}
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Quick Select Common Reasons:
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "130px", overflowY: "auto", padding: "2px" }}>
              {presets.map((preset, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setReason(preset)}
                  style={{
                    background: reason === preset ? "#fee2e2" : "#f1f5f9",
                    color: reason === preset ? "#991b1b" : "#475569",
                    border: reason === preset ? "1px solid #f87171" : "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "5px 9px",
                    fontSize: "11px",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "all 0.1s ease",
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              <span>Formal Rejection Feedback (Owner Visible) *</span>
              <span style={{ color: "#94a3b8", fontWeight: 400 }}>{reason.length}/1000</span>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain specifically what needs to be corrected so the owner knows exactly why the property was rejected and what to fix..."
              required
              rows={4}
              maxLength={1000}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "12.5px",
                lineHeight: "1.5",
                fontFamily: "inherit",
                color: "#0f172a",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn btn-outline"
              style={{ padding: "8px 16px", fontSize: "12px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="btn btn-primary"
              style={{
                background: "#dc2626",
                borderColor: "#dc2626",
                color: "#ffffff",
                padding: "8px 18px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {busy ? "Rejecting..." : "Confirm & Reject Listing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PropertyDetailModal({
  property,
  onClose,
  onRefresh,
}: {
  property: ModeratedProperty;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useApp();
  const [activePhoto, setActivePhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ title: string; url: string } | null>(null);

  const images = property.images && property.images.length > 0 ? property.images : [];
  const ownerDisplayName = property.ownerName || property.owner?.name || "Registered User";
  const ownerDisplayPhone = property.ownerPhone || property.owner?.phone;

  async function handleAction(action: "approve" | "reject" | "flag" | "pause" | "live", reason?: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/properties/${property.id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      toast(`Listing status updated: ${action === "approve" ? "approved & verified" : action}`);
      await onRefresh();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update property", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Are you sure you want to permanently delete "${property.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/properties/${property.id}`, { method: "DELETE" });
      toast("Listing permanently deleted");
      await onRefresh();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete property", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="lead-panel-backdrop" onClick={onClose}>
        <aside
          className="lead-panel admin-prop-panel"
          onClick={(e) => e.stopPropagation()}
          style={{ width: "min(100%, 740px)", display: "flex", flexDirection: "column" }}
        >
          {/* Header Bar */}
          <div className="lead-panel-top">
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {categoryLabel[property.category] || property.category} · {property.propertyType}
              </span>
              <h2 style={{ fontSize: "18px", margin: "4px 0 6px", lineHeight: "1.3" }}>{property.title}</h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span className={`status-pill status-${property.status}`}>
                  {property.status.replaceAll("_", " ")}
                </span>
                {property.verified && (
                  <span className="status-pill" style={{ background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}>
                    <BadgeCheck size={13} style={{ marginRight: "3px" }} /> Verified
                  </span>
                )}
                <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                  Listed {niceDate(property.createdAt)} · {property.views} views · ID: {property.id.slice(0, 8)}...
                </small>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close property detail"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: "4px" }}
            >
              <X size={22} />
            </button>
          </div>

          <div className="lead-panel-scroll">
            {/* Rejection Feedback Alert (if rejected or previous rejection reason exists) */}
            {(property.status === "rejected" || property.rejectionReason) && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  marginBottom: "18px",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "#dc2626", marginTop: "2px", flexShrink: 0 }}>
                  <ShieldAlert size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: "13px", color: "#991b1b" }}>
                    Listing Rejection Feedback (Owner Visible)
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#7f1d1d", lineHeight: "1.5" }}>
                    {property.rejectionReason || "No specific reason provided."}
                  </p>
                </div>
              </div>
            )}

            {/* SECTION 1: MANDATORY OWNER IDENTITY & KYC VERIFICATION */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldCheck size={16} color="#059669" /> 1. Owner Identity & KYC Documents
                </h3>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: property.liveSelfieUrl && property.aadhaarCardUrl ? "#dcfce7" : "#fef3c7",
                    color: property.liveSelfieUrl && property.aadhaarCardUrl ? "#15803d" : "#b45309",
                  }}
                >
                  {property.liveSelfieUrl && property.aadhaarCardUrl ? "KYC Documents Provided" : "Incomplete KYC Documents"}
                </span>
              </div>

              {/* KYC Documents Grid: Live Selfie & Aadhaar */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                {/* Live Selfie Card */}
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Camera size={13} color="#2563eb" /> Live Selfie Photo
                    </span>
                    {property.liveSelfieUrl ? (
                      <span style={{ fontSize: "9px", background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Uploaded
                      </span>
                    ) : (
                      <span style={{ fontSize: "9px", background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Missing
                      </span>
                    )}
                  </div>
                  {property.liveSelfieUrl ? (
                    <div
                      onClick={() => setLightbox({ title: `Live Selfie: ${ownerDisplayName}`, url: property.liveSelfieUrl! })}
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "140px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "#f1f5f9",
                        cursor: "pointer",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <img
                        src={property.liveSelfieUrl}
                        alt="Owner Live Selfie"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.35)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0,
                          transition: "opacity 0.15s ease",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: 600,
                          gap: "5px",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                      >
                        <ZoomIn size={16} /> Inspect Full Selfie
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        height: "140px",
                        borderRadius: "8px",
                        border: "1px dashed #cbd5e1",
                        background: "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        color: "#94a3b8",
                      }}
                    >
                      <Camera size={26} strokeWidth={1.5} />
                      <span style={{ fontSize: "11px" }}>No live selfie submitted</span>
                    </div>
                  )}
                  {property.liveSelfieUrl && (
                    <button
                      type="button"
                      onClick={() => setLightbox({ title: `Live Selfie: ${ownerDisplayName}`, url: property.liveSelfieUrl! })}
                      style={{
                        marginTop: "8px",
                        background: "none",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        padding: "5px",
                        fontSize: "10.5px",
                        cursor: "pointer",
                        color: "#0284c7",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <ZoomIn size={12} /> View Full Live Selfie
                    </button>
                  )}
                </div>

                {/* Aadhaar Card Document Card */}
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                      <FileCheck2 size={13} color="#059669" /> Aadhaar Card Document
                    </span>
                    {property.aadhaarCardUrl ? (
                      <span style={{ fontSize: "9px", background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Uploaded
                      </span>
                    ) : (
                      <span style={{ fontSize: "9px", background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Missing
                      </span>
                    )}
                  </div>
                  {property.aadhaarCardUrl ? (
                    <div
                      onClick={() => setLightbox({ title: `Aadhaar Card: ${ownerDisplayName}`, url: property.aadhaarCardUrl! })}
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "140px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "#f1f5f9",
                        cursor: "pointer",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <img
                        src={property.aadhaarCardUrl}
                        alt="Owner Aadhaar Card"
                        style={{ width: "100%", height: "100%", objectFit: "contain", background: "#f8fafc" }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.35)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0,
                          transition: "opacity 0.15s ease",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: 600,
                          gap: "5px",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                      >
                        <ZoomIn size={16} /> Inspect Aadhaar Card
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        height: "140px",
                        borderRadius: "8px",
                        border: "1px dashed #cbd5e1",
                        background: "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        color: "#94a3b8",
                      }}
                    >
                      <FileCheck2 size={26} strokeWidth={1.5} />
                      <span style={{ fontSize: "11px" }}>No Aadhaar card submitted</span>
                    </div>
                  )}
                  {property.aadhaarCardUrl && (
                    <button
                      type="button"
                      onClick={() => setLightbox({ title: `Aadhaar Card: ${ownerDisplayName}`, url: property.aadhaarCardUrl! })}
                      style={{
                        marginTop: "8px",
                        background: "none",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        padding: "5px",
                        fontSize: "10.5px",
                        cursor: "pointer",
                        color: "#059669",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      <ZoomIn size={12} /> View Full Aadhaar Card
                    </button>
                  )}
                </div>
              </div>

              {/* Ownership & Contact Details Box */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  fontSize: "11.5px",
                }}
              >
                <div>
                  <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Ownership Type
                  </span>
                  <strong style={{ color: "#0f172a", textTransform: "capitalize" }}>
                    {property.ownershipType ? property.ownershipType.replace("_", " ") : "Sole Owner"}
                  </strong>
                  {property.coOwners && (
                    <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                      Co-owners: {property.coOwners}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Owner Name
                  </span>
                  <strong style={{ color: "#0f172a" }}>{ownerDisplayName}</strong>
                </div>

                <div>
                  <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Owner Phone
                  </span>
                  {ownerDisplayPhone ? (
                    <a
                      href={`tel:${ownerDisplayPhone}`}
                      style={{ color: "var(--brand)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <Phone size={12} /> {ownerDisplayPhone}
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>Not provided</span>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Account Email
                  </span>
                  {property.owner?.email ? (
                    <a
                      href={`mailto:${property.owner.email}`}
                      style={{ color: "var(--brand)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px", overflowWrap: "anywhere" }}
                    >
                      <Mail size={12} /> {property.owner.email}
                    </a>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>No email on file</span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: FINANCIALS & PRICING */}
            <div style={{ marginBottom: "18px" }}>
              <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", margin: "0 0 8px" }}>
                2. Pricing & Financial Structure
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                }}
              >
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Asking Price / Rent</span>
                  <strong style={{ display: "block", fontSize: "15px", color: "var(--ink)", marginTop: "2px" }}>
                    {formatPrice(property.price, property.category)}
                  </strong>
                  <small style={{ fontSize: "10px", color: "var(--muted)" }}>Pricing: {property.priceType || "Fixed"}</small>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Security Deposit</span>
                  <strong style={{ display: "block", fontSize: "15px", color: "var(--ink)", marginTop: "2px" }}>
                    {property.deposit ? formatPrice(property.deposit) : "None / Negotiable"}
                  </strong>
                  <small style={{ fontSize: "10px", color: "var(--muted)" }}>Refundable deposit</small>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Maintenance</span>
                  <strong style={{ display: "block", fontSize: "15px", color: "var(--ink)", marginTop: "2px" }}>
                    {property.maintenanceStatus === "included"
                      ? "Included"
                      : property.maintenanceAmount
                      ? `₹${property.maintenanceAmount.toLocaleString("en-IN")}/mo`
                      : "Separate / NA"}
                  </strong>
                  <small style={{ fontSize: "10px", color: "var(--muted)" }}>Monthly maintenance charges</small>
                </div>
              </div>

              {/* Itemized charges if provided */}
              {property.itemizedCharges && Object.keys(property.itemizedCharges).length > 0 && (
                <div
                  style={{
                    background: "var(--surface-tint)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    marginTop: "8px",
                    fontSize: "11px",
                  }}
                >
                  <strong style={{ display: "block", color: "var(--ink)", marginBottom: "4px" }}>Itemized Monthly Breakdown:</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {Object.entries(property.itemizedCharges).map(([k, v]) => (
                      <span key={k} style={{ color: "var(--ink-soft)" }}>
                        <strong>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: EXACT LOCATION & GEOLOCATION */}
            <div className="lead-section" style={{ paddingTop: "14px" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                <MapPin size={15} color="var(--brand)" /> 3. Exact Location & Address
              </h3>
              <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", fontSize: "12px", lineHeight: "1.6" }}>
                <div style={{ marginBottom: "6px" }}>
                  <strong>Street Address:</strong> {property.address}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", color: "var(--ink-soft)" }}>
                  <div>
                    <strong>Landmark:</strong> {property.landmark || "Not specified"}
                  </div>
                  <div>
                    <strong>PIN Code:</strong> {property.pinCode || "Not specified"}
                  </div>
                  <div>
                    <strong>Locality & City:</strong> {property.locality}, {property.city}
                  </div>
                  <div>
                    <strong>Map Coordinates:</strong>{" "}
                    {property.latitude && property.longitude ? (
                      <span>
                        {property.latitude.toFixed(4)}, {property.longitude.toFixed(4)}
                      </span>
                    ) : (
                      <span>Not pinned</span>
                    )}
                  </div>
                </div>
                {property.latitude && property.longitude && (
                  <div style={{ marginTop: "10px" }}>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--brand)",
                        textDecoration: "underline",
                      }}
                    >
                      <MapPin size={12} /> Open in Google Maps <ExternalLink size={11} />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 4: ARCHITECTURE & LAYOUT SPECS */}
            <div className="lead-section">
              <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                4. Architecture & Space Specifications
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "11.5px" }}>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Layout / BHK</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>{property.bhkOrRoomType}</strong>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Super Built-up Area</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>{property.areaSqft.toLocaleString("en-IN")} sq.ft.</strong>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Floor / Total Floors</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>
                    {property.floor ? `Floor ${property.floor}` : "Ground"} {property.totalFloors ? `of ${property.totalFloors}` : ""}
                  </strong>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Facing Direction</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>{property.facing || "Not specified"}</strong>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Property Age</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>{property.propertyAge || "Not specified"}</strong>
                </div>
                <div style={{ background: "var(--surface-tint)", border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 11px" }}>
                  <span style={{ fontSize: "9px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Furnishing & Bath</span>
                  <strong style={{ display: "block", marginTop: "2px", color: "var(--ink)" }}>
                    {property.furnishingStatus} · {property.bathrooms} Baths
                  </strong>
                </div>
              </div>
            </div>

            {/* SECTION 5: POSSESSION & LEGAL COMPLIANCE */}
            <div className="lead-section">
              <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                5. Possession & Legal Compliance
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "11.5px" }}>
                <div>
                  <strong style={{ color: "var(--muted)" }}>Possession Status:</strong>{" "}
                  {property.possessionStatus || "Immediate / Ready to Move"}
                  {property.possessionDate && <span> ({niceDate(property.possessionDate)})</span>}
                </div>
                <div>
                  <strong style={{ color: "var(--muted)" }}>Loan / Mortgage:</strong>{" "}
                  {property.loanStatus || "None / Freehold"}
                </div>
                <div>
                  <strong style={{ color: "var(--muted)" }}>RERA Registration:</strong>{" "}
                  {property.reraNumber ? (
                    <span style={{ color: "var(--brand)", fontWeight: 700 }}>{property.reraNumber}</span>
                  ) : (
                    "Not provided / Non-project"
                  )}
                </div>
                <div>
                  <strong style={{ color: "var(--muted)" }}>Available From:</strong>{" "}
                  {property.availabilityDate ? niceDate(property.availabilityDate) : "Immediate"}
                </div>
              </div>
            </div>

            {/* SECTION 6: RENTAL / PG TERMS (if applicable) */}
            {(property.category === "rent_home" || property.category === "rent_pg" || property.lockInPeriod || property.noticePeriod || property.tenantPreference) && (
              <div className="lead-section">
                <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                  6. Rental & PG Policies
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", fontSize: "11px", marginBottom: "8px" }}>
                  {property.lockInPeriod && (
                    <div>
                      <strong style={{ color: "var(--muted)" }}>Lock-in:</strong> {property.lockInPeriod}
                    </div>
                  )}
                  {property.noticePeriod && (
                    <div>
                      <strong style={{ color: "var(--muted)" }}>Notice Period:</strong> {property.noticePeriod}
                    </div>
                  )}
                  {property.tenantPreference && (
                    <div>
                      <strong style={{ color: "var(--muted)" }}>Preference:</strong> {property.tenantPreference}
                    </div>
                  )}
                  {property.bedCount && (
                    <div>
                      <strong style={{ color: "var(--muted)" }}>Bed Count:</strong> {property.bedCount}
                    </div>
                  )}
                  {property.genderPolicy && (
                    <div>
                      <strong style={{ color: "var(--muted)" }}>Gender Policy:</strong> {property.genderPolicy}
                    </div>
                  )}
                </div>
                {property.houseRules && property.houseRules.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                    {property.houseRules.map((rule, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: "var(--surface-tint)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          padding: "2px 8px",
                          fontSize: "10.5px",
                          color: "var(--ink-soft)",
                        }}
                      >
                        • {rule}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 7: AMENITIES */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="lead-section">
                <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                  7. Amenities ({property.amenities.length})
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {property.amenities.map((amenity, i) => (
                    <span
                      key={i}
                      style={{
                        background: "var(--brand-pale)",
                        color: "var(--brand)",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 9px",
                        borderRadius: "6px",
                      }}
                    >
                      ✓ {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 8: DESCRIPTION */}
            <div className="lead-section">
              <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
                8. Full Property Description
              </h3>
              <div
                style={{
                  background: "var(--surface-tint)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "12.5px",
                  lineHeight: "1.7",
                  color: "var(--ink)",
                  whiteSpace: "pre-line",
                }}
              >
                {property.description}
              </div>
            </div>

            {/* SECTION 9: PROPERTY PHOTOS GALLERY */}
            <div className="lead-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <h3 style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", margin: 0 }}>
                  9. Uploaded Property Photos ({images.length})
                </h3>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>Click any photo to zoom full-screen</span>
              </div>
              {images.length > 0 ? (
                <div>
                  <div
                    onClick={() => setLightbox({ title: `${property.title} (Photo ${activePhoto + 1}/${images.length})`, url: images[activePhoto] })}
                    style={{
                      width: "100%",
                      height: "280px",
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                      background: "var(--surface-soft)",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    <img src={images[activePhoto]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div
                      style={{
                        position: "absolute",
                        right: "10px",
                        bottom: "10px",
                        background: "rgba(0,0,0,0.65)",
                        color: "#fff",
                        padding: "4px 9px",
                        borderRadius: "6px",
                        fontSize: "10.5px",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <ZoomIn size={13} /> View Full Photo ({activePhoto + 1}/{images.length})
                    </div>
                  </div>
                  {images.length > 1 && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActivePhoto(idx)}
                          style={{
                            width: "65px",
                            height: "50px",
                            borderRadius: "6px",
                            overflow: "hidden",
                            border: idx === activePhoto ? "2px solid var(--brand)" : "1px solid var(--border)",
                            padding: 0,
                            cursor: "pointer",
                            opacity: idx === activePhoto ? 1 : 0.65,
                            flexShrink: 0,
                          }}
                        >
                          <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "20px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", color: "var(--muted)", fontSize: "12px" }}>
                  No photos uploaded for this property
                </div>
              )}
            </div>

            {/* SECTION 10: ACTION BUTTONS IN DRAWER */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "20px", marginTop: "16px", borderTop: "1px solid var(--border)" }}>
              {property.status === "pending_review" ? (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void handleAction("approve")}
                    style={{ background: "#166534", padding: "10px 18px", fontWeight: 700 }}
                  >
                    <Check size={16} /> Approve & Go Live
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => setRejectModalOpen(true)}
                    style={{ color: "#dc2626", borderColor: "#fca5a5", padding: "10px 18px", fontWeight: 700 }}
                  >
                    <X size={16} /> Reject with Reason...
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => void handleAction("flag")}
                    style={{ padding: "10px 14px" }}
                  >
                    Flag for Review
                  </button>
                </>
              ) : property.status === "live" ? (
                <>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => void handleAction("pause")}
                    style={{ color: "#d97706", borderColor: "#fde68a" }}
                  >
                    Pause Listing
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => setRejectModalOpen(true)}
                    style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  >
                    Reject with Reason...
                  </button>
                  <Link
                    href={`/property/${property.id}`}
                    target="_blank"
                    className="btn btn-outline"
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                  >
                    View on Marketplace <ArrowUpRight size={14} />
                  </Link>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void handleAction("live")}
                  >
                    <Check size={16} /> Reactivate & Make Live
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => setRejectModalOpen(true)}
                    style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  >
                    Update Rejection Reason...
                  </button>
                </>
              )}

              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() => void handleDelete()}
                style={{ color: "#dc2626", borderColor: "#fca5a5", marginLeft: "auto" }}
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Rejection Reason Modal */}
      {rejectModalOpen && (
        <RejectReasonModal
          propertyTitle={property.title}
          ownerName={ownerDisplayName}
          busy={busy}
          onConfirm={async (reason) => {
            await handleAction("reject", reason);
            setRejectModalOpen(false);
          }}
          onClose={() => setRejectModalOpen(false)}
        />
      )}

      {/* Lightbox Modal for Full Image Inspection */}
      {lightbox && (
        <DocumentLightboxModal
          title={lightbox.title}
          imageUrl={lightbox.url}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

function LeadDetail({
  lead,
  onClose,
  onRefresh,
}: {
  lead: AdminLead;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useApp();
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.adminNotes || "");
  const [party, setParty] = useState<"customer" | "owner">("customer");
  const [outcome, setOutcome] = useState("");
  const [callNotes, setCallNotes] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingMode, setMeetingMode] = useState<"site_visit" | "call">("site_visit");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(lead.status);
    setNotes(lead.adminNotes || "");
  }, [lead]);

  async function updateLead() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ status, adminNotes: notes }) });
      await onRefresh();
      toast("Lead updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update lead", "error");
    } finally {
      setBusy(false);
    }
  }

  async function logContact() {
    if (!outcome.trim()) {
      toast("Add a contact outcome first", "error");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/call-logs", {
        method: "POST",
        body: JSON.stringify({ leadId: lead.id, party, outcome, notes: callNotes }),
      });
      setOutcome("");
      setCallNotes("");
      await onRefresh();
      toast("Contact attempt logged");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't log contact", "error");
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!meetingDate) {
      toast("Choose a meeting date and time", "error");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/meetings", {
        method: "POST",
        body: JSON.stringify({ leadId: lead.id, scheduledAt: new Date(meetingDate).toISOString(), mode: meetingMode }),
      });
      setMeetingDate("");
      await onRefresh();
      toast("Meeting proposed to both parties");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't schedule meeting", "error");
    } finally {
      setBusy(false);
    }
  }

  async function meetingAction(next: "confirmed" | "completed" | "cancelled") {
    if (!lead.meeting) return;
    try {
      await apiFetch(`/api/admin/meetings/${lead.meeting.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await onRefresh();
      toast(`Meeting ${next}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update meeting", "error");
    }
  }

  return (
    <div className="lead-panel-backdrop" onClick={onClose}>
      <aside className="lead-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lead-panel-top">
          <div>
            <span className="eyebrow">LEAD DETAILS</span>
            <h2>{lead.property.title}</h2>
            <small>
              Inquiry #{lead.id.slice(0, 8)} · {niceDate(lead.createdAt)}
            </small>
          </div>
          <button onClick={onClose} aria-label="Close lead detail">
            <X size={22} />
          </button>
        </div>
        <div className="lead-panel-scroll">
          <div className="admin-lead-property">
            <img src={lead.property.images[0] || ""} alt="" />
            <div>
              <span>{categoryLabel[lead.property.category]}</span>
              <strong>{lead.property.title}</strong>
              <small>
                {lead.property.locality}, {lead.property.city} · {formatPrice(lead.property.price, lead.property.category)}
              </small>
            </div>
          </div>
          <div className="admin-private-banner">
            <LockKeyhole size={18} />
            <span>Private admin view. Contact details on this screen are never returned to customers or owners.</span>
          </div>
          {/* SECTION 1: HOMESEEKER VERIFIED LIVING PROFILE & REQUIREMENTS */}
          {(() => {
            const effectiveSeekerPhone = lead.confirmedPhone || lead.customer.phone || "";
            const cleanDigits = effectiveSeekerPhone.replace(/\D/g, "").slice(-10);
            return (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    borderBottom: "1px solid #e2e8f0",
                    paddingBottom: "8px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <UserCheck size={16} color="#059669" /> 1. Homeseeker Verified Profile &amp; Preferences
                  </h3>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: "4px",
                      background: lead.confirmedPhone ? "#dcfce7" : "#fef3c7",
                      color: lead.confirmedPhone ? "#15803d" : "#b45309",
                    }}
                  >
                    {lead.confirmedPhone ? "Confirmed Contact" : "Contact Pending"}
                  </span>
                </div>

                {/* Seeker Contact Info Card with Quick Action CTAs */}
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "14px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                        Prospective Seeker Name
                      </div>
                      <strong style={{ fontSize: "15px", color: "var(--ink)", display: "block", marginTop: "2px" }}>
                        {lead.customer.name || "Unnamed seeker"}
                      </strong>
                      {(lead.customer.city || lead.customer.location) && (
                        <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
                          <MapPin size={12} color="var(--brand)" />
                          {[lead.customer.location, lead.customer.city].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Confirmed Mobile Badge */}
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, display: "block" }}>
                        CONFIRMED ACTIVE PHONE
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", justifyContent: "flex-end" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#0f766e",
                            background: "#ccfbf1",
                            padding: "3px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          {effectiveSeekerPhone || "No number provided"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons: Call, WhatsApp, Email, Copy */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                    {cleanDigits ? (
                      <>
                        <a
                          href={`tel:${effectiveSeekerPhone}`}
                          className="btn btn-outline"
                          style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          <Phone size={13} /> Call Seeker
                        </a>
                        <a
                          href={`https://wa.me/91${cleanDigits}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline"
                          style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px", color: "#16a34a", borderColor: "#86efac" }}
                        >
                          <MessageCircle size={13} /> WhatsApp
                        </a>
                      </>
                    ) : null}
                    {lead.customer.email && (
                      <a
                        href={`mailto:${lead.customer.email}`}
                        className="btn btn-outline"
                        style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      >
                        <Mail size={13} /> Email
                      </a>
                    )}
                    {effectiveSeekerPhone && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(effectiveSeekerPhone);
                          toast("Phone copied to clipboard");
                        }}
                        style={{ fontSize: "11px", padding: "6px 10px" }}
                        title="Copy phone"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Formal Sequenced Profiling Specs Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "11.5px" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <UsersRound size={13} color="var(--brand)" /> Occupants Count
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.occupantsCount || "Not specified"}
                    </strong>
                  </div>

                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Home size={13} color="var(--brand)" /> Tenant Type
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.tenantType || "Not specified"}
                    </strong>
                  </div>

                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Briefcase size={13} color="var(--brand)" /> Profession / Job
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.profession || "Not specified"}
                    </strong>
                  </div>

                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Users size={13} color="var(--brand)" /> Group / Gender
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.groupGender || "Not specified"}
                    </strong>
                  </div>

                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <CalendarDays size={13} color="var(--brand)" /> Move-in Timeline
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.moveInTimeline || "Ready to move / Immediate"}
                    </strong>
                  </div>

                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Clock3 size={13} color="var(--brand)" /> Contact Time
                    </span>
                    <strong style={{ display: "block", fontSize: "13px", color: "#0f172a", marginTop: "4px" }}>
                      {lead.preferredContactTime || "Anytime is fine"}
                    </strong>
                  </div>
                </div>

                {/* Special Notes or Requirements */}
                {lead.seekerNotes && (
                  <div
                    style={{
                      marginTop: "10px",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "8px",
                      padding: "10px 12px",
                    }}
                  >
                    <span style={{ fontSize: "10px", color: "#b45309", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Homeseeker Special Notes / Requirements
                    </span>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#92400e", lineHeight: "1.5" }}>
                      &ldquo;{lead.seekerNotes}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 2: PROPERTY OWNER DETAILS & DIRECT COORDINATION */}
          {(() => {
            const ownerPhone = lead.owner.phone || "";
            const cleanOwnerDigits = ownerPhone.replace(/\D/g, "").slice(-10);
            return (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    borderBottom: "1px solid #e2e8f0",
                    paddingBottom: "8px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#0f172a",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <KeyRound size={16} color="var(--brand)" /> 2. Property Owner Information
                  </h3>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                    Listing Owner
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                      Owner Name
                    </div>
                    <strong style={{ fontSize: "14px", color: "var(--ink)", display: "block", marginTop: "2px" }}>
                      {lead.owner.name || "Unnamed owner"}
                    </strong>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                      Owner of: {lead.property.title}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 700, display: "block" }}>
                      OWNER PHONE
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      {ownerPhone || "No phone"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                  {cleanOwnerDigits ? (
                    <>
                      <a
                        href={`tel:${ownerPhone}`}
                        className="btn btn-outline"
                        style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      >
                        <Phone size={13} /> Call Owner
                      </a>
                      <a
                        href={`https://wa.me/91${cleanOwnerDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline"
                        style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px", color: "#16a34a", borderColor: "#86efac" }}
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    </>
                  ) : null}
                  {lead.owner.email && (
                    <a
                      href={`mailto:${lead.owner.email}`}
                      className="btn btn-outline"
                      style={{ fontSize: "11px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    >
                      <Mail size={13} /> Email
                    </a>
                  )}
                  {ownerPhone && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(ownerPhone);
                        toast("Owner phone copied to clipboard");
                      }}
                      style={{ fontSize: "11px", padding: "6px 10px" }}
                      title="Copy owner phone"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="lead-section">
            <h3>Status & internal notes</h3>
            <label className="form-label">LEAD STATUS</label>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="form-label">PRIVATE TEAM NOTES</label>
            <textarea
              className="form-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes only your team can see..."
            />
            <button className="btn btn-primary" disabled={busy} onClick={() => void updateLead()}>
              Save lead update <ArrowRight size={16} />
            </button>
          </div>
          <div className="lead-section">
            <h3>Log a contact attempt</h3>
            <div className="form-two-cols">
              <div>
                <label className="form-label">PARTY CONTACTED</label>
                <select className="form-input" value={party} onChange={(e) => setParty(e.target.value as "customer" | "owner")}>
                  <option value="customer">Property seeker</option>
                  <option value="owner">Property owner</option>
                </select>
              </div>
              <div>
                <label className="form-label">OUTCOME</label>
                <input className="form-input" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Reached, no answer" />
              </div>
            </div>
            <textarea className="form-input" rows={2} value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="Optional call notes..." />
            <button className="btn btn-outline" disabled={busy} onClick={() => void logContact()}>
              <Phone size={16} /> Log contact
            </button>
          </div>
          <div className="lead-section">
            <h3>Arrange a meeting</h3>
            {lead.meeting && (
              <div className="admin-current-meeting">
                <CalendarDays size={19} />
                <div>
                  <strong>
                    {lead.meeting.mode === "call" ? "Call" : "Site visit"} · {lead.meeting.status}
                  </strong>
                  <span>{new Date(lead.meeting.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  <div>
                    {lead.meeting.status === "proposed" && <button onClick={() => void meetingAction("confirmed")}>Confirm</button>}
                    {lead.meeting.status === "confirmed" && <button onClick={() => void meetingAction("completed")}>Mark completed</button>}
                    {!["completed", "cancelled"].includes(lead.meeting.status) && <button onClick={() => void meetingAction("cancelled")}>Cancel</button>}
                  </div>
                </div>
              </div>
            )}
            <div className="form-two-cols">
              <div>
                <label className="form-label">DATE & TIME</label>
                <input className="form-input" type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">MEETING TYPE</label>
                <select className="form-input" value={meetingMode} onChange={(e) => setMeetingMode(e.target.value as "call" | "site_visit")}>
                  <option value="site_visit">Site visit</option>
                  <option value="call">Phone call</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={() => void schedule()}>
              <CalendarDays size={16} /> Propose meeting
            </button>
            <p className="admin-meeting-note">
              <LockKeyhole size={14} /> Both sides see only the time and status, never each other&apos;s identity.
            </p>
          </div>
          <div className="lead-section">
            <h3>Activity history</h3>
            {lead.history.length || lead.callLogs.length ? (
              <div className="lead-timeline">
                {lead.history.map((event, index) => (
                  <div key={index}>
                    <span className="timeline-dot" />
                    <strong>{event.detail}</strong>
                    <small>{new Date(event.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-muted">No activity logged yet.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function AdminDashboardExperience() {
  const router = useRouter();
  const { user, logout, toast } = useApp();
  const [view, setView] = useState<"overview" | "properties" | "moderation" | "leads" | "users">("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [moderation, setModeration] = useState<ModeratedProperty[]>([]);
  const [allProperties, setAllProperties] = useState<ModeratedProperty[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Selection modals
  const [selectedLead, setSelectedLead] = useState<AdminLead | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<ModeratedProperty | null>(null);
  const [rejectingProperty, setRejectingProperty] = useState<ModeratedProperty | null>(null);
  const [busyQuickModerate, setBusyQuickModerate] = useState(false);

  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [propStatusFilter, setPropStatusFilter] = useState("all");
  const [propCategoryFilter, setPropCategoryFilter] = useState("");
  const [propSearch, setPropSearch] = useState("");
  const [userCategoryTab, setUserCategoryTab] = useState<"all" | "customer" | "owner">("all");
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const [overview, leadData, pendingData] = await Promise.all([
        apiFetch<Stats>("/api/admin/dashboard/stats"),
        apiFetch<{ items: AdminLead[] }>(`/api/admin/leads${statusFilter ? `?status=${statusFilter}` : ""}`),
        apiFetch<{ items: ModeratedProperty[] }>("/api/admin/properties?status=pending_review"),
      ]);
      setStats(overview);
      setLeads(leadData.items);
      setModeration(pendingData.items);
      if (selectedLead) setSelectedLead(leadData.items.find((item) => item.id === selectedLead.id) || selectedLead);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't load dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedLead, toast]);

  const loadProperties = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (propStatusFilter && propStatusFilter !== "all") params.set("status", propStatusFilter);
      if (propCategoryFilter) params.set("category", propCategoryFilter);
      if (propSearch.trim()) params.set("q", propSearch.trim());
      params.set("limit", "100");

      const data = await apiFetch<{ items: ModeratedProperty[] }>(`/api/admin/properties?${params.toString()}`);
      setAllProperties(data.items);
      if (selectedProperty) {
        setSelectedProperty(data.items.find((p) => p.id === selectedProperty.id) || selectedProperty);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't load properties", "error");
    }
  }, [propStatusFilter, propCategoryFilter, propSearch, selectedProperty, toast]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (userCategoryTab !== "all") params.set("role", userCategoryTab);
      if (userSearch.trim()) params.set("q", userSearch.trim());
      params.set("limit", "100");

      const data = await apiFetch<{ items: AdminUser[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setUsers(data.items);
      setTotalUsers(data.total);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't load users", "error");
    } finally {
      setLoadingUsers(false);
    }
  }, [userCategoryTab, userSearch, toast]);

  useEffect(() => {
    void load();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === "properties") {
      void loadProperties();
    }
  }, [view, propStatusFilter, propCategoryFilter, propSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view === "users") {
      void loadUsers();
    }
  }, [view, userCategoryTab, userSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function quickModerate(id: string, action: "approve" | "reject" | "flag", reason?: string) {
    setBusyQuickModerate(true);
    try {
      await apiFetch(`/api/admin/properties/${id}/verify`, { method: "PATCH", body: JSON.stringify({ action, reason }) });
      toast(`Listing ${action === "approve" ? "approved and verified" : action === "reject" ? "rejected" : "flagged"}`);
      await Promise.all([load(), loadProperties()]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't review listing", "error");
    } finally {
      setBusyQuickModerate(false);
    }
  }

  const pending = stats?.pendingListings || 0;
  const totalListings = stats?.totalListings ?? allProperties.length;

  return (
    <main className="admin-app">
      <aside className={`admin-sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="admin-sidebar-brand">
          <Brand light />
          <button className="admin-mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="admin-workspace-label">AANGAN WORKSPACE</div>
        <nav>
          {[
            { value: "overview", label: "Overview", Icon: LayoutDashboard },
            { value: "properties", label: "All Properties", Icon: Home, count: totalListings },
            { value: "users", label: "Registered Users", Icon: UsersRound, count: stats?.totalUsers || totalUsers },
            { value: "moderation", label: "Listing moderation", Icon: BadgeCheck, count: pending },
            { value: "leads", label: "Lead inbox", Icon: ClipboardList, count: stats?.inquiryTotal },
          ].map(({ value, label, Icon, count }) => (
            <button
              key={value}
              className={view === value ? "active" : ""}
              onClick={() => {
                setView(value as typeof view);
                setMobileMenu(false);
              }}
            >
              <Icon size={19} />
              {label}
              {count ? <span>{count}</span> : null}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-trust">
            <ShieldCheck size={21} />
            <div>
              <strong>Privacy first</strong>
              <span>Only your team sees both sides.</span>
            </div>
          </div>
          <Link href="/" className="admin-back-site">
            <ArrowLeft size={16} /> Back to marketplace
          </Link>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" onClick={() => setMobileMenu(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="admin-breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "properties"
                ? "All Properties"
                : view === "users"
                ? "Registered Users"
                : view === "leads"
                ? "Lead inbox"
                : "Listing moderation"}
            </strong>
          </div>
          <div className="admin-topbar-right">
            <span className="admin-secure">
              <LockKeyhole size={14} /> Secure admin view
            </span>
            <button onClick={() => void logout()} className="admin-avatar" title="Log out">
              {user?.name?.charAt(0) || "A"}
            </button>
          </div>
        </header>

        <div className="admin-body">
          {/* VIEW: OVERVIEW */}
          {view === "overview" && (
            <>
              <div className="admin-page-intro">
                <div>
                  <span className="eyebrow">GOOD MORNING, TEAM</span>
                  <h1>Here’s what’s happening.</h1>
                  <p>Your people and properties, all in one place.</p>
                </div>
                <span className="admin-date">
                  <CalendarDays size={17} />
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </span>
              </div>
              <div className="admin-stat-grid">
                <div
                  className="admin-stat-card"
                  onClick={() => setView("properties")}
                  style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
                >
                  <span className="stat-icon green">
                    <Home size={21} />
                  </span>
                  <span>Live properties</span>
                  <strong>{stats?.listingsByCategory.reduce((sum, item) => sum + item.total, 0) || 0}</strong>
                  <small>Across four categories · View all →</small>
                </div>
                <div
                  className="admin-stat-card"
                  onClick={() => setView("leads")}
                  style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
                >
                  <span className="stat-icon orange">
                    <MessageSquare size={21} />
                  </span>
                  <span>Total inquiries</span>
                  <strong>{stats?.inquiryTotal || 0}</strong>
                  <small>Handled by your team · View leads →</small>
                </div>
                <div
                  className="admin-stat-card"
                  onClick={() => setView("users")}
                  style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
                >
                  <span className="stat-icon purple">
                    <UsersRound size={21} />
                  </span>
                  <span>Registered Users</span>
                  <strong>{stats?.totalUsers || totalUsers || 0}</strong>
                  <small>{stats?.seekerCount || 0} Seekers · {stats?.ownerCount || 0} Owners →</small>
                </div>
                <div
                  className="admin-stat-card"
                  onClick={() => setView("moderation")}
                  style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
                >
                  <span className="stat-icon blue">
                    <BadgeCheck size={21} />
                  </span>
                  <span>Awaiting review</span>
                  <strong>{pending}</strong>
                  <small>Listings to verify · Review queue →</small>
                </div>
              </div>

              <div className="admin-overview-grid">
                <div className="admin-chart-card">
                  <div className="admin-card-title">
                    <div>
                      <h3>Inquiry activity</h3>
                      <span>New inquiries over the past 7 days</span>
                    </div>
                    <span className="chart-chip">Last 7 days</span>
                  </div>
                  <div className="admin-bar-chart">
                    {(stats?.inquiriesByDay || []).map((item) => (
                      <div key={item.day} className="chart-column">
                        <strong>{item.total || ""}</strong>
                        <span
                          style={{
                            height: `${Math.max(
                              12,
                              (item.total / Math.max(1, ...(stats?.inquiriesByDay.map((day) => day.total) || [1]))) * 145
                            )}px`,
                          }}
                        />
                        <small>
                          {new Date(`${item.day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="admin-chart-card category-chart">
                  <div className="admin-card-title">
                    <div>
                      <h3>Listings by type</h3>
                      <span>Where the spaces are</span>
                    </div>
                  </div>
                  <div className="admin-category-bars">
                    {["buy_home", "rent_home", "rent_pg", "rent_commercial"].map((category, index) => {
                      const total = stats?.listingsByCategory.find((item) => item.category === category)?.total || 0;
                      const all = stats?.listingsByCategory.reduce((sum, item) => sum + item.total, 0) || 1;
                      return (
                        <div key={category}>
                          <span>{categoryLabel[category]}</span>
                          <strong>{total}</strong>
                          <div>
                            <span
                              className={`category-bar-${index}`}
                              style={{ width: `${Math.max(5, (total / all) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="admin-table-card">
                <div className="admin-card-title">
                  <div>
                    <h3>Recent inquiries</h3>
                    <span>Every connection starts here</span>
                  </div>
                  <button onClick={() => setView("leads")}>
                    View all <ArrowUpRight size={16} />
                  </button>
                </div>
                {leads.length ? (
                  <div className="admin-lead-rows">
                    {leads.slice(0, 4).map((lead) => (
                      <button key={lead.id} onClick={() => setSelectedLead(lead)}>
                        <span className="admin-row-avatar">{lead.customer.name?.charAt(0) || "?"}</span>
                        <span className="admin-row-person">
                          <strong>{lead.customer.name || "Property seeker"}</strong>
                          <small>
                            Interested in {lead.property.title}
                            {lead.tenantType ? ` · ${lead.tenantType}` : ""}
                          </small>
                        </span>
                        <span className={`status-pill status-${lead.status}`}>{lead.status.replaceAll("_", " ")}</span>
                        <span className="admin-row-date">{niceDate(lead.createdAt)}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty-mini">No inquiries yet. New leads will appear here as they come in.</div>
                )}
              </div>
            </>
          )}

          {/* VIEW: ALL PROPERTIES (NEW COMPREHENSIVE VIEW) */}
          {view === "properties" && (
            <>
              <div className="admin-page-intro">
                <div>
                  <span className="eyebrow">PORTFOLIO OVERVIEW</span>
                  <h1>All Properties</h1>
                  <p>Browse, inspect each detail, manage visibility, and moderate every listing on Apna Angaan.</p>
                </div>
                <span className="admin-date">
                  <Home size={17} /> {allProperties.length} properties found
                </span>
              </div>

              {/* Filter & Search Bar */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  background: "#fff",
                  padding: "16px",
                  borderRadius: "11px",
                  border: "1px solid #e5ebe5",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "#f9fbf8",
                    border: "1px solid #e3e9e3",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    flex: "1 1 240px",
                  }}
                >
                  <Search size={16} color="var(--muted)" />
                  <input
                    type="text"
                    value={propSearch}
                    onChange={(e) => setPropSearch(e.target.value)}
                    placeholder="Search title, locality, city, address..."
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: "12px", width: "100%" }}
                  />
                  {propSearch && (
                    <button
                      onClick={() => setPropSearch("")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <label className="admin-status-filter">
                    <SlidersHorizontal size={14} />
                    <select value={propStatusFilter} onChange={(e) => setPropStatusFilter(e.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="live">Live & verified</option>
                      <option value="pending_review">Pending review</option>
                      <option value="paused">Paused</option>
                      <option value="sold">Sold</option>
                      <option value="rented">Rented</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>

                  <label className="admin-status-filter">
                    <Building2 size={14} />
                    <select value={propCategoryFilter} onChange={(e) => setPropCategoryFilter(e.target.value)}>
                      <option value="">All categories</option>
                      <option value="buy_home">Buy a home</option>
                      <option value="rent_home">Rent a home</option>
                      <option value="rent_pg">PG & co-living</option>
                      <option value="rent_commercial">Commercial spaces</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
              </div>

              {/* Properties Table Card */}
              <div className="admin-table-card admin-full-table">
                <div className="admin-card-title">
                  <div>
                    <h3>
                      Properties List <span className="title-count">{allProperties.length}</span>
                    </h3>
                    <span>Click on any property to inspect all photos, full specifications, amenities, and owner details.</span>
                  </div>
                </div>

                {allProperties.length ? (
                  <div className="admin-lead-table">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2.4fr 1.1fr 1fr 1fr 0.9fr 120px",
                        gap: "10px",
                        alignItems: "center",
                        padding: "13px 20px",
                        borderTop: "1px solid #edf0eb",
                        borderBottom: "1px solid #edf0eb",
                        background: "#f9fbf8",
                        color: "#9aa99e",
                        fontSize: "8.5px",
                        letterSpacing: "1px",
                        fontWeight: 800,
                      }}
                    >
                      <span>PROPERTY & TYPE</span>
                      <span>LOCATION</span>
                      <span>PRICE</span>
                      <span>OWNER</span>
                      <span>STATUS</span>
                      <span style={{ textAlign: "right" }}>ACTIONS</span>
                    </div>

                    {allProperties.map((prop) => (
                      <div
                        key={prop.id}
                        onClick={() => setSelectedProperty(prop)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2.4fr 1.1fr 1fr 1fr 0.9fr 120px",
                          gap: "10px",
                          alignItems: "center",
                          padding: "12px 20px",
                          borderBottom: "1px solid #edf0eb",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                        className="admin-prop-row"
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <img
                            src={prop.images[0] || ""}
                            alt=""
                            style={{ width: "48px", height: "48px", borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <strong style={{ fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {prop.title}
                            </strong>
                            <small style={{ fontSize: "9px", color: "var(--brand)", fontWeight: 700 }}>
                              {categoryLabel[prop.category]} · {prop.propertyType}
                            </small>
                            <small style={{ fontSize: "9px", color: "var(--muted)" }}>
                              {prop.bhkOrRoomType} · {prop.areaSqft} sqft
                            </small>
                          </div>
                        </div>

                        <div>
                          <strong style={{ fontSize: "11px" }}>{prop.locality}</strong>
                          <small style={{ display: "block", fontSize: "9px", color: "var(--muted)" }}>{prop.city}</small>
                        </div>

                        <div>
                          <strong style={{ fontSize: "11px" }}>{formatPrice(prop.price, prop.category)}</strong>
                          <small style={{ display: "block", fontSize: "9px", color: "var(--muted)" }}>
                            {prop.deposit ? `Dep: ₹${(prop.deposit / 1000).toFixed(0)}k` : "No dep"}
                          </small>
                        </div>

                        <div>
                          <strong style={{ fontSize: "10.5px" }}>{prop.owner?.name || "Owner"}</strong>
                          <small style={{ display: "block", fontSize: "9px", color: "var(--muted)" }}>
                            {prop.owner?.phone || prop.owner?.email || "No direct phone"}
                          </small>
                        </div>

                        <div>
                          <span className={`status-pill status-${prop.status}`}>{prop.status.replaceAll("_", " ")}</span>
                        </div>

                        <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedProperty(prop)}
                            style={{
                              background: "var(--brand-pale)",
                              color: "var(--brand)",
                              border: "none",
                              borderRadius: "5px",
                              padding: "5px 9px",
                              fontSize: "10px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty-mini" style={{ padding: "40px" }}>
                    No properties match your filter criteria.
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW: LEADS INBOX */}
          {view === "leads" && (
            <>
              <div className="admin-page-intro">
                <div>
                  <span className="eyebrow">EVERY CONNECTION, HANDLED WITH CARE</span>
                  <h1>Lead inbox</h1>
                  <p>Only your team can see both parties’ contact details.</p>
                </div>
                <span className="admin-date">
                  <LockKeyhole size={17} /> Admin-only access
                </span>
              </div>
              <div className="admin-table-card admin-full-table">
                <div className="admin-card-title">
                  <div>
                    <h3>
                      All inquiries <span className="title-count">{stats?.inquiryTotal || 0}</span>
                    </h3>
                    <span>Reach out to both sides and make the right introduction.</span>
                  </div>
                  <label className="admin-status-filter">
                    <SlidersHorizontal size={16} />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="">All statuses</option>
                      {statuses.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
                {leads.length ? (
                  <div className="admin-lead-table">
                    <div className="admin-table-head">
                      <span>PROPERTY</span>
                      <span>SEEKER</span>
                      <span>OWNER</span>
                      <span>STATUS</span>
                      <span>RECEIVED</span>
                      <span />
                    </div>
                    {leads.map((lead) => (
                      <button key={lead.id} className="admin-lead-table-row" onClick={() => setSelectedLead(lead)}>
                        <span className="admin-property-cell">
                          <img src={lead.property.images[0] || ""} alt="" />
                          <span>
                            <strong>{lead.property.title}</strong>
                            <small>
                              {lead.property.locality} · {formatPrice(lead.property.price, lead.property.category)}
                            </small>
                          </span>
                        </span>
                        <span className="admin-person-cell">
                          <strong>{lead.customer.name || "—"}</strong>
                          <small>{lead.confirmedPhone || lead.customer.phone || "No phone"}</small>
                          {(lead.tenantType || lead.occupantsCount) && (
                            <span style={{ display: "inline-block", fontSize: "9px", background: "var(--brand-pale)", color: "var(--brand)", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, marginTop: "2px" }}>
                              {[lead.tenantType, lead.occupantsCount].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        <span className="admin-person-cell">
                          <strong>{lead.owner.name || "—"}</strong>
                          <small>{lead.owner.phone || "No phone"}</small>
                        </span>
                        <span>
                          <span className={`status-pill status-${lead.status}`}>{lead.status.replaceAll("_", " ")}</span>
                        </span>
                        <span className="admin-row-date">{niceDate(lead.createdAt)}</span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty-mini">No leads match this filter yet.</div>
                )}
              </div>
            </>
          )}

          {/* VIEW: REGISTERED USERS */}
          {view === "users" && (
            <>
              <div className="admin-page-intro">
                <div>
                  <span className="eyebrow">ACCOUNTS &amp; VERIFIED PROFILES</span>
                  <h1>Registered Users</h1>
                  <p>All registered Home Seekers and Property Owners with verified contact numbers.</p>
                </div>
                <span className="admin-date">
                  <UsersRound size={17} />
                  {stats?.totalUsers || totalUsers} accounts registered
                </span>
              </div>

              {/* Category selector pills & search */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {[
                    { key: "all", label: "All Users", count: stats?.totalUsers || totalUsers },
                    { key: "customer", label: "Home Seekers", count: stats?.seekerCount || 0 },
                    { key: "owner", label: "Owners / Rent", count: stats?.ownerCount || 0 },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setUserCategoryTab(tab.key as typeof userCategoryTab)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: userCategoryTab === tab.key ? "1px solid var(--brand)" : "1px solid var(--border)",
                        background: userCategoryTab === tab.key ? "var(--brand)" : "var(--surface)",
                        color: userCategoryTab === tab.key ? "#fff" : "var(--ink)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {tab.key === "customer" && <Home size={13} />}
                      {tab.key === "owner" && <KeyRound size={13} />}
                      {tab.key === "all" && <UsersRound size={13} />}
                      {tab.label}
                      <span
                        style={{
                          background: userCategoryTab === tab.key ? "rgba(255,255,255,0.25)" : "var(--surface-muted)",
                          color: userCategoryTab === tab.key ? "#fff" : "var(--muted)",
                          padding: "1px 6px",
                          borderRadius: "10px",
                          fontSize: "10px",
                        }}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ position: "relative", minWidth: "260px" }}>
                  <Search
                    size={15}
                    style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}
                  />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name, phone, or email..."
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 32px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: "11px",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Users Table */}
              <div className="admin-table-card admin-full-table">
                <div className="admin-card-title">
                  <div>
                    <h3>
                      {userCategoryTab === "customer"
                        ? "Home Seekers"
                        : userCategoryTab === "owner"
                        ? "Property Owners"
                        : "All Registered Accounts"}{" "}
                      <span className="title-count">{users.length}</span>
                    </h3>
                    <span>
                      {userCategoryTab === "customer"
                        ? "Seekers browsing and expressing interest in homes with their verified phone numbers."
                        : userCategoryTab === "owner"
                        ? "Owners and landlords listing properties for rent or sale with verified phone numbers."
                        : "Direct contact numbers collected from onboarding and signup."}
                    </span>
                  </div>
                </div>

                {loadingUsers ? (
                  <div className="admin-empty-mini" style={{ padding: "40px" }}>
                    Loading user records...
                  </div>
                ) : users.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.7fr 1fr 1.1fr 1.3fr 1fr 1fr 90px",
                        gap: "10px",
                        alignItems: "center",
                        padding: "12px 20px",
                        borderTop: "1px solid #edf0eb",
                        borderBottom: "1px solid #edf0eb",
                        background: "#f9fbf8",
                        color: "#9aa99e",
                        fontSize: "8.5px",
                        letterSpacing: "1px",
                        fontWeight: 800,
                      }}
                    >
                      <span>NAME / USER</span>
                      <span>CATEGORY</span>
                      <span style={{ color: "var(--brand)", fontWeight: 900 }}>CITY / LOCATION</span>
                      <span style={{ color: "var(--brand)", fontWeight: 900 }}>PHONE NUMBER</span>
                      <span>REGISTERED</span>
                      <span>ACTIVITY</span>
                      <span style={{ textAlign: "right" }}>ACTIONS</span>
                    </div>

                    {users.map((u) => {
                      const isAdmin = u.roles.includes("admin") || u.role === "admin";
                      const isOwner = !isAdmin && u.roles.includes("owner");
                      const cleanPhone = u.phone ? u.phone.replace(/[\s\-\(\)]/g, "") : null;
                      const formattedPhone = cleanPhone
                        ? cleanPhone.startsWith("+")
                          ? cleanPhone
                          : `+91 ${cleanPhone.slice(-10)}`
                        : null;

                      return (
                        <div
                          key={u.id}
                          className="admin-prop-row"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.7fr 1fr 1.1fr 1.3fr 1fr 1fr 90px",
                            gap: "10px",
                            alignItems: "center",
                            padding: "12px 20px",
                            borderBottom: "1px solid #edf0eb",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {/* Name / User */}
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <div
                              style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "50%",
                                background: isAdmin ? "#164f4c" : isOwner ? "#fff0dc" : "#e0f2fe",
                                color: isAdmin ? "#ffffff" : isOwner ? "#b47740" : "#0369a1",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 800,
                                fontSize: "12px",
                                flexShrink: 0,
                              }}
                            >
                              {u.name?.charAt(0).toUpperCase() || (isAdmin ? "A" : isOwner ? "O" : "S")}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                              <strong style={{ fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {u.name || (isAdmin ? "Platform Admin" : isOwner ? "Unnamed Owner" : "Unnamed Seeker")}
                              </strong>
                              <small style={{ fontSize: "9px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {u.email || "No email"}
                              </small>
                            </div>
                          </div>

                          {/* Category Badge */}
                          <div>
                            {isAdmin ? (
                              <span
                                className="status-pill"
                                style={{
                                  background: "#f1f5f9",
                                  color: "#0f172a",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 700,
                                  fontSize: "9.5px",
                                  border: "1px solid #cbd5e1",
                                }}
                              >
                                <ShieldCheck size={11} /> Platform Admin
                              </span>
                            ) : isOwner ? (
                              <span
                                className="status-pill"
                                style={{
                                  background: "#fff0dc",
                                  color: "#92400e",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 700,
                                  fontSize: "9.5px",
                                }}
                              >
                                <KeyRound size={11} /> Owner / Rent
                              </span>
                            ) : (
                              <span
                                className="status-pill"
                                style={{
                                  background: "#e0f2fe",
                                  color: "#0369a1",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 700,
                                  fontSize: "9.5px",
                                }}
                              >
                                <Home size={11} /> Home Seeker
                              </span>
                            )}
                          </div>

                          {/* City / Location Column */}
                          <div>
                            {(u.location || u.city) ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "var(--foreground)",
                                }}
                              >
                                <MapPin size={12} color="var(--brand)" />
                                {u.location || u.city}
                              </span>
                            ) : (
                              <span style={{ fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>
                                Not set
                              </span>
                            )}
                          </div>

                          {/* Phone Number Column */}
                          <div>
                            {formattedPhone ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <a
                                  href={`tel:${formattedPhone.replace(/\s+/g, "")}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    fontSize: "11.5px",
                                    fontWeight: 800,
                                    color: "var(--brand)",
                                    textDecoration: "none",
                                    background: "var(--brand-pale)",
                                    padding: "4px 8px",
                                    borderRadius: "5px",
                                  }}
                                  title="Click to call"
                                >
                                  <Phone size={12} />
                                  {formattedPhone}
                                </a>
                              </div>
                            ) : (
                              <span style={{ fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>
                                Not provided yet
                              </span>
                            )}
                          </div>

                          {/* Registered Date */}
                          <div>
                            <span style={{ fontSize: "10.5px", color: "var(--ink-soft)" }}>
                              {niceDate(u.createdAt)}
                            </span>
                            {u.consentAt && (
                              <small style={{ display: "block", fontSize: "9px", color: "#16a34a" }}>
                                ✓ Consent verified
                              </small>
                            )}
                          </div>

                          {/* Activity */}
                          <div>
                            {isOwner ? (
                              <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--ink)" }}>
                                {u.listingsCount} {u.listingsCount === 1 ? "listing" : "listings"}
                              </span>
                            ) : (
                              <span style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--ink)" }}>
                                {u.inquiriesCount} {u.inquiriesCount === 1 ? "inquiry" : "inquiries"}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "5px" }}>
                            {formattedPhone && (
                              <a
                                href={`tel:${formattedPhone.replace(/\s+/g, "")}`}
                                style={{
                                  background: "var(--brand-pale)",
                                  color: "var(--brand)",
                                  padding: "5px 7px",
                                  borderRadius: "5px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                                title="Call user"
                              >
                                <Phone size={11} /> Call
                              </a>
                            )}
                            {u.email && (
                              <a
                                href={`mailto:${u.email}`}
                                style={{
                                  background: "var(--surface-muted)",
                                  color: "var(--ink-soft)",
                                  padding: "5px 7px",
                                  borderRadius: "5px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                                title="Email user"
                              >
                                <Mail size={11} /> Email
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="admin-empty-mini" style={{ padding: "40px" }}>
                    No users found matching this category or search filter.
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW: LISTING MODERATION */}
          {view === "moderation" && (
            <>
              <div className="admin-page-intro">
                <div>
                  <span className="eyebrow">TRUST STARTS HERE</span>
                  <h1>Listing moderation</h1>
                  <p>Review every single detail, photos, and compliance before approving spaces to go live.</p>
                </div>
                <span className="admin-date">
                  <BadgeCheck size={17} />
                  {pending} awaiting review
                </span>
              </div>
              <div className="moderation-intro">
                <ShieldCheck size={21} />
                <p>
                  Click &ldquo;Inspect Full Details&rdquo; on any property to examine all uploaded photos, exact street address, amenities, and owner contact details. Verified listings get the Aangan badge and appear instantly live on search.
                </p>
              </div>
              {moderation.length ? (
                <div className="moderation-list">
                  {moderation.map((property) => (
                    <article key={property.id} className="moderation-card">
                      <img src={property.images[0] || ""} alt="" />
                      <div className="moderation-info">
                        <span>
                          {categoryLabel[property.category]} · {property.propertyType}
                        </span>
                        <h3>{property.title}</h3>
                        <p>
                          <MapPin size={14} />
                          {property.locality}, {property.city} · <strong>{property.bhkOrRoomType} ({property.areaSqft} sqft)</strong>
                        </p>
                        <strong>{formatPrice(property.price, property.category)}</strong>
                        <small style={{ marginBottom: "6px" }}>
                          {property.description.slice(0, 160)}
                          {property.description.length > 160 ? "..." : ""}
                        </small>
                        {property.reraNumber && (
                          <small style={{ color: "var(--brand)", fontWeight: 700 }}>RERA: {property.reraNumber}</small>
                        )}
                        {property.owner?.name && (
                          <small style={{ color: "var(--muted)", marginTop: "4px" }}>
                            Listed by: {property.owner.name} ({property.owner.phone || property.owner.email || "No contact"})
                          </small>
                        )}
                      </div>
                      <div className="moderation-actions">
                        <span className="status-pill status-pending_review">Pending review</span>
                        <button
                          className="btn btn-outline"
                          onClick={() => setSelectedProperty(property)}
                          style={{ fontWeight: 700, borderColor: "var(--brand)", color: "var(--brand)" }}
                        >
                          <Eye size={15} /> Inspect Full Details
                        </button>
                        <button className="btn btn-primary" onClick={() => void quickModerate(property.id, "approve")}>
                          <Check size={16} /> Approve & verify
                        </button>
                        <button className="btn btn-outline" onClick={() => setRejectingProperty(property)} style={{ color: "#dc2626" }}>
                          <X size={16} /> Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-moderation-empty">
                  <span>
                    <CheckCircle2 size={32} />
                  </span>
                  <h3>All caught up!</h3>
                  <p>No listings are waiting for review right now. All 44+ properties are verified and live on the marketplace.</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setView("properties")}
                    style={{ marginTop: "16px" }}
                  >
                    View All Live Properties
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Property Full Details Modal / Drawer */}
      {selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onRefresh={async () => {
            await Promise.all([load(), loadProperties()]);
          }}
        />
      )}

      {/* Quick Moderation Reject Reason Modal */}
      {rejectingProperty && (
        <RejectReasonModal
          propertyTitle={rejectingProperty.title}
          ownerName={rejectingProperty.ownerName || rejectingProperty.owner?.name}
          busy={busyQuickModerate}
          onConfirm={async (reason) => {
            await quickModerate(rejectingProperty.id, "reject", reason);
            setRejectingProperty(null);
          }}
          onClose={() => setRejectingProperty(null)}
        />
      )}

      {/* Lead CRM Detail Drawer */}
      {selectedLead && (
        <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} onRefresh={load} />
      )}
    </main>
  );
}
