"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, BadgeCheck, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Eye, Heart, Home, KeyRound, LockKeyhole, MapPin, MessageSquare, Moon, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";
import { PropertyCard } from "@/components/property-card";
import { formatPrice } from "@/lib/format";
import { extractIndianPhoneDigits, normalizeWhitespace, parseIndianPhone } from "@/lib/input-validation";
import { formatMeetingStatus } from "@/lib/scheduling";
import type { PublicProperty } from "@/lib/serializers";

type PublicMeeting = { id: string; scheduledAt: string; mode: "call" | "site_visit"; status: string } | null;
type Inquiry = {
  id: string;
  status: string;
  ownerResponse?: string;
  preferredContactTime: string | null;
  occupantsCount?: string | null;
  tenantType?: string | null;
  profession?: string | null;
  groupGender?: string | null;
  moveInTimeline?: string | null;
  seekerNotes?: string | null;
  createdAt: string;
  property: PublicProperty;
  meeting: PublicMeeting;
};
type OwnerListing = PublicProperty & { status: string; views: number; inquiryCount: number; rejectionReason?: string | null };
type AnonymousInterest = {
  id: string;
  propertyId: string;
  propertyName: string;
  property: { id: string; title: string };
  occupantsCount: string | null;
  tenantType: string | null;
  profession: string | null;
  groupComposition: string | null;
  groupGender: string | null;
  status: string;
  ownerResponse: string;
  createdAt: string;
  updatedAt: string;
  meeting?: PublicMeeting;
};
type Notice = { id: string; message: string; link: string | null; type: string; isRead: boolean; createdAt: string };
type SavedSearch = { id: string; label: string; query: Record<string, string>; createdAt: string };

function AccountGate({ title, description, icon: Icon = LockKeyhole }: { title: string; description: string; icon?: typeof LockKeyhole }) {
  return <div className="account-gate"><span><Icon size={30}/></span><h2>{title}</h2><p>{description}</p><Link href="/login" className="btn btn-primary">Log in to continue <ArrowRight size={17}/></Link></div>;
}
function PageIntro({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="member-intro"><div><span className="eyebrow"><span className="eyebrow-line"/> {eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}
function EmptyState({ icon: Icon, title, text, href, cta }: { icon: typeof Heart; title: string; text: string; href: string; cta: string }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon size={30} strokeWidth={1.7}/></span><h3>{title}</h3><p>{text}</p><Link href={href} className="btn btn-primary">{cta} <ArrowRight size={17}/></Link></div>;
}
function LoadErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="form-error" role="alert" style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <span>{message}</span>
      <button type="button" className="btn btn-outline" style={{ fontSize: "12px", padding: "6px 12px", height: "auto" }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
function niceDate(date: string) { return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

export function SavedExperience() {
  const { user, loading, refreshFavorites } = useApp();
  const [items, setItems] = useState<PublicProperty[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    if (!user) { setFetching(false); return; }
    setFetching(true);
    setLoadError("");
    try { const data = await apiFetch<{ items: PublicProperty[] }>("/api/favorites"); setItems(data.items); }
    catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : "Network connection dropped while loading saved homes. Tap Retry.");
    }
    finally { setFetching(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Your favourites live here." description="Sign in to keep a little collection of places that feel like they could be yours." icon={Heart}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="YOUR SHORTLIST" title="Saved spaces, just for you." text="The places that made you pause. Come back to them whenever you're ready." action={<Link href="/search" className="btn btn-outline"><Search size={17}/> Find more spaces</Link>}/>{loadError && <LoadErrorBanner message={loadError} onRetry={() => void load()}/>}{fetching ? <div className="loading-cards">Loading your saved spaces...</div> : items.length ? <div className="property-grid">{items.map((property) => <PropertyCard key={property.id} property={property}/>)}</div> : !loadError ? <EmptyState icon={Heart} title="Nothing saved just yet" text="See a place you love? Tap the heart and you'll find it here whenever you need it." href="/search" cta="Explore homes"/> : null}<button className="sr-only" onClick={() => { void load(); void refreshFavorites(); }}>Refresh saved</button></div></main>;
}

function MeetingSyncCard({
  meeting,
  label,
  busy,
  onAction,
}: {
  meeting: NonNullable<PublicMeeting>;
  label: string;
  busy: boolean;
  onAction: (status: "confirmed" | "rescheduled" | "cancelled") => void;
}) {
  const canConfirm = meeting.status === "proposed" || meeting.status === "rescheduled";
  const canReschedule = meeting.status === "proposed" || meeting.status === "confirmed";
  const canCancel = !["completed", "cancelled"].includes(meeting.status);

  return (
    <div className="inquiry-meeting" style={{ flexWrap: "wrap", justifyContent: "space-between", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <CalendarDays size={19} />
        <div>
          <strong>
            {label} · {formatMeetingStatus(meeting.status)}
          </strong>
          <span>
            {new Date(meeting.scheduledAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      {(canConfirm || canReschedule || canCancel) && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {canConfirm && (
            <button type="button" disabled={busy} className="btn btn-primary" style={{ fontSize: "11px", padding: "5px 10px", height: "auto" }} onClick={() => onAction("confirmed")}>
              <Check size={13} /> Confirm
            </button>
          )}
          {canReschedule && (
            <button type="button" disabled={busy} className="btn btn-outline" style={{ fontSize: "11px", padding: "5px 10px", height: "auto" }} onClick={() => onAction("rescheduled")}>
              Request reschedule
            </button>
          )}
          {canCancel && (
            <button type="button" disabled={busy} className="btn btn-outline" style={{ fontSize: "11px", padding: "5px 10px", height: "auto" }} onClick={() => onAction("cancelled")}>
              <X size={13} /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inquirySteps = ["Submitted", "Under review", "Meeting scheduled", "Closed"];
function stepIndex(status: string) { return status === "new" ? 0 : status === "contacted" ? 1 : status === "meeting_scheduled" ? 2 : 3; }
export function InquiriesExperience() {
  const { user, loading, toast } = useApp();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) { setFetching(false); return; }
    setFetching(true);
    setLoadError("");
    try {
      const data = await apiFetch<{ items: Inquiry[] }>("/api/customer/leads");
      setItems(data.items);
    } catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : "Network connection dropped while loading inquiries. Tap Retry.");
    } finally {
      setFetching(false);
    }
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  async function updateMeeting(leadId: string, status: "confirmed" | "rescheduled" | "cancelled") {
    if (updatingLeadId) return;
    setUpdatingLeadId(leadId);
    try {
      const data = await apiFetch<{ meeting: PublicMeeting }>(`/api/leads/${leadId}/meeting`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === leadId
            ? {
                ...entry,
                meeting: data.meeting,
                status: status === "cancelled" && entry.status === "meeting_scheduled" ? "contacted" : entry.status,
              }
            : entry
        )
      );
      toast(`Visit ${formatMeetingStatus(status).toLowerCase()}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update visit status. Tap to retry.", "error");
    } finally {
      setUpdatingLeadId(null);
    }
  }

  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Stay in the loop." description="Sign in to track your property interests and upcoming viewings." icon={MessageSquare}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="YOUR PROPERTY JOURNEY" title="My inquiries" text="Everything is in one place. Our team coordinates each next step, privately." action={<Link href="/search" className="btn btn-outline">Explore more <ArrowUpRight size={17}/></Link>}/>{loadError && <LoadErrorBanner message={loadError} onRetry={() => void load()}/>}{fetching ? <div className="loading-cards">Loading your inquiries...</div> : items.length ? <div className="inquiry-list">{items.map((item) => <article className="inquiry-card" key={item.id}><div className="inquiry-card-top"><Link href={`/property/${item.property.id}`} className="inquiry-property"><img src={item.property.images[0] || ""} alt=""/><div><span>{item.property.propertyType} · {item.property.locality}</span><strong>{item.property.title}</strong><small>{formatPrice(item.property.price, item.property.category)}</small></div></Link><span className={`status-pill status-${item.status}`}>{item.status === "new" ? "Submitted" : item.status === "contacted" ? "Under review" : item.status === "meeting_scheduled" ? "Meeting scheduled" : item.status === "closed_won" ? "Closed · Successful" : "Closed"}</span></div>{item.ownerResponse === "interested" ? (<div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "8px 12px", borderRadius: "8px", fontSize: "11.5px", margin: "8px 0" }}><CheckCircle2 size={15}/><span><strong>Owner is interested!</strong> Our concierge team is now coordinating your private viewing or call.</span></div>) : item.ownerResponse === "not_interested" ? (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", padding: "8px 12px", borderRadius: "8px", fontSize: "11.5px", margin: "8px 0" }}><span>The owner is currently not moving forward with this inquiry.</span><Link href="/search" className="text-link" style={{ fontSize: "11px" }}>Browse similar spaces <ArrowUpRight size={13}/></Link></div>) : null}{(item.tenantType || item.occupantsCount || item.moveInTimeline) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0 6px", fontSize: "11px" }}>{item.tenantType && <span style={{ background: "var(--brand-pale)", color: "var(--brand)", padding: "3px 9px", borderRadius: "100px", fontWeight: 700 }}>{item.tenantType}</span>}{item.occupantsCount && <span style={{ background: "var(--surface-soft)", color: "var(--ink)", padding: "3px 9px", borderRadius: "100px", fontWeight: 600 }}>{item.occupantsCount}</span>}{item.moveInTimeline && <span style={{ background: "var(--surface-soft)", color: "var(--muted)", padding: "3px 9px", borderRadius: "100px", fontWeight: 600 }}>Move-in: {item.moveInTimeline}</span>}</div>)}<div className="inquiry-progress">{inquirySteps.map((step, index) => <div key={step} className={index <= stepIndex(item.status) ? "done" : ""}><span className="progress-node">{index < stepIndex(item.status) ? <Check size={13}/> : index + 1}</span><span>{step}</span></div>)}</div>{item.meeting && <MeetingSyncCard meeting={item.meeting} label={item.meeting.mode === "call" ? "Your call" : "Your viewing"} busy={updatingLeadId === item.id} onAction={(next) => void updateMeeting(item.id, next)} />}<div className="inquiry-card-bottom"><span><LockKeyhole size={14}/> Both parties&apos; contact details remain private</span><small>Submitted {niceDate(item.createdAt)}</small></div></article>)}</div> : !loadError ? <EmptyState icon={MessageSquare} title="No inquiries yet" text="When you find a place that speaks to you, express interest and we&apos;ll take care of the introduction." href="/search" cta="Discover spaces"/> : null}</div></main>;
}

export function OwnerExperience() {
  const { user, loading, refreshUser, toast } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<"listings" | "interests" | "managed">("listings");
  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [interests, setInterests] = useState<AnonymousInterest[]>([]);
  const [managedRequests, setManagedRequests] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const isOwner = user?.roles.includes("owner");
  const load = useCallback(async () => {
    if (!isOwner) { setFetching(false); return; }
    setLoadError("");
    try {
      const [propertyData, interestData, managerData] = await Promise.all([
        apiFetch<{ items: OwnerListing[] }>("/api/owner/properties"),
        apiFetch<{ items: AnonymousInterest[] }>("/api/owner/leads"),
        apiFetch<{ items: any[] }>("/api/owner/manager-requests").catch(() => ({ items: [] })),
      ]);
      setListings(propertyData.items);
      setInterests(interestData.items);
      setManagedRequests(managerData.items || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't load your owner dashboard. Check connection and tap Retry.";
      setLoadError(msg);
      toast(msg, "error");
    }
    finally { setFetching(false); }
  }, [isOwner, toast]);
  useEffect(() => { void load(); }, [load]);

  // Website real-time updates: Poll every 30s while owner dashboard is open
  useEffect(() => {
    if (!isOwner) return;
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOwner, load]);

  const [updatingMeetingId, setUpdatingMeetingId] = useState<string | null>(null);

  async function updateOwnerMeeting(leadId: string, status: "confirmed" | "rescheduled" | "cancelled") {
    setUpdatingMeetingId(leadId);
    try {
      const data = await apiFetch<{ meeting: PublicMeeting }>(`/api/leads/${leadId}/meeting`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setInterests((prev) =>
        prev.map((item) =>
          item.id === leadId
            ? {
                ...item,
                meeting: data.meeting,
                status: status === "cancelled" && item.status === "meeting_scheduled" ? "contacted" : item.status,
              }
            : item
        )
      );
      toast(`Visit ${formatMeetingStatus(status).toLowerCase()}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update visit status", "error");
    } finally {
      setUpdatingMeetingId(null);
    }
  }

  async function respondToInquiry(id: string, response: "interested" | "not_interested") {
    if (busyActionId) return;
    setBusyActionId(id);
    try {
      await apiFetch(`/api/owner/leads/${id}/response`, {
        method: "PATCH",
        body: JSON.stringify({ response }),
      });
      setInterests((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, ownerResponse: response, status: response === "interested" ? "contacted" : "closed_lost" } : item
        )
      );
      toast(response === "interested" ? "Marked as Interested! Admin concierge team will connect you." : "Response noted: Not interested.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't submit response. Please tap to retry.", "error");
    } finally {
      setBusyActionId(null);
    }
  }
  async function upgrade() {
    if (upgrading) return;
    if (!user?.phone) {
      router.push(`/setup?next=${encodeURIComponent("/owner")}`);
      return;
    }
    setUpgrading(true);
    try { await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) }); await refreshUser(); toast("Owner tools are ready"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't activate owner tools", "error"); }
    finally { setUpgrading(false); }
  }
  async function changeStatus(id: string, status: "paused" | "live" | "sold" | "rented") {
    if (busyActionId) return;
    setBusyActionId(id);
    try { await apiFetch(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); toast("Listing updated"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't update listing", "error"); }
    finally { setBusyActionId(null); }
  }
  async function deleteListing(id: string, title: string) {
    if (busyActionId) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    setBusyActionId(id);
    try {
      await apiFetch(`/api/properties/${id}`, { method: "DELETE" });
      await load();
      toast("Listing deleted");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete listing", "error");
    } finally {
      setBusyActionId(null);
    }
  }
  async function resubmitListing(id: string) {
    if (busyActionId) return;
    setBusyActionId(id);
    try {
      await apiFetch(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify({ status: "pending_review" }) });
      await load();
      toast("Listing resubmitted for verification.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't resubmit listing", "error");
    } finally {
      setBusyActionId(null);
    }
  }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="A place for your properties." description="Log in to list a property, track its performance, and see anonymous interest from seekers." icon={KeyRound}/></div></main>;
  if (!loading && user && !isOwner) return <main className="member-page"><div className="container"><div className="upgrade-card"><span className="upgrade-icon"><KeyRound size={31}/></span><span className="eyebrow">FOR PROPERTY OWNERS</span><h1>Have a place to share?</h1><p>Activate your owner space to post a verified listing, see how it performs, and receive interest notifications — with everyone&apos;s privacy protected.</p><button onClick={() => void upgrade()} disabled={upgrading} className="btn btn-primary">{upgrading ? "Activating..." : "Become a property owner"} <ArrowRight size={18}/></button></div></div></main>;
  const live = listings.filter((item) => item.status === "live").length;
  const totalViews = listings.reduce((sum, item) => sum + item.views, 0);
  return <main className="member-page owner-page"><div className="container"><PageIntro eyebrow="YOUR OWNER SPACE" title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}.`} text="Manage your spaces and stay in the loop, all in one calm place." action={<Link href="/post-property" className="btn btn-primary"><Plus size={18}/> Post a property</Link>}/>{loadError && <LoadErrorBanner message={loadError} onRetry={() => void load()}/>}<div className="owner-stats"><div><span className="owner-stat-icon"><Home size={20}/></span><strong>{listings.length}</strong><small>Total listings</small></div><div><span className="owner-stat-icon"><BadgeCheck size={20}/></span><strong>{live}</strong><small>Live & verified</small></div><div><span className="owner-stat-icon"><Sparkles size={20}/></span><strong>{managedRequests.length}</strong><small>Managed requests</small></div><div><span className="owner-stat-icon"><Heart size={20}/></span><strong>{interests.length}</strong><small>Interested people</small></div></div><div className="owner-tabs"><button className={tab === "listings" ? "active" : ""} onClick={() => setTab("listings")}>My listings <span>{listings.length}</span></button><button className={tab === "managed" ? "active" : ""} onClick={() => setTab("managed")}>Managed requests <span>{managedRequests.length}</span></button><button className={tab === "interests" ? "active" : ""} onClick={() => setTab("interests")}>Interest notifications <span>{interests.length}</span></button></div>{fetching ? <div className="loading-cards">Loading your dashboard...</div> : tab === "listings" ? listings.length ? <div className="owner-listing-list">{listings.map((item) => <article className="owner-listing" key={item.id}><Link href={item.status === "live" ? `/property/${item.id}` : `/post-property?edit=${item.id}`} className="owner-listing-photo"><img src={item.images[0] || ""} alt=""/></Link><div className="owner-listing-info"><span className="owner-listing-type">{item.propertyType} · {item.locality}</span><h3>{item.title}</h3><strong>{formatPrice(item.price, item.category)}</strong><div className="owner-listing-metrics"><span><Eye size={15}/> {item.views} views</span><span><Heart size={15}/> {item.inquiryCount} interests</span></div></div><div className="owner-listing-actions"><span className={`status-pill status-${item.status}`}>{item.status.replaceAll("_", " ")}</span><div><Link href={`/post-property?edit=${item.id}`} className="btn btn-outline" style={{ fontSize: "11px", padding: "4px 10px", height: "auto" }}>{item.status === "draft" ? "Continue draft" : "Edit"}</Link>{item.status === "live" && <button disabled={busyActionId === item.id} onClick={() => void changeStatus(item.id, "paused")}>Pause</button>}{(item.status === "paused" || item.status === "rented") && item.verified && <button disabled={busyActionId === item.id} onClick={() => void changeStatus(item.id, "live")}>Go live</button>}{item.status === "live" && <button disabled={busyActionId === item.id} onClick={() => void changeStatus(item.id, "rented")}>Mark rented</button>}<button disabled={busyActionId === item.id} onClick={() => void deleteListing(item.id, item.title)} style={{ color: "#ef4444" }}>Delete</button></div></div>{(item.status === "rejected" || item.rejectionReason) && <div style={{ gridColumn: "1 / -1", width: "100%", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 14px", marginTop: "10px" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#b91c1c", fontWeight: 700, fontSize: "12.5px" }}><AlertTriangle size={16}/> Listing Not Approved by Moderation Team</div><span style={{ fontSize: "10px", background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>Action Required</span></div><div style={{ margin: "6px 0 10px", fontSize: "12px", color: "#7f1d1d", lineHeight: "1.5" }}><strong>Reason:</strong> {item.rejectionReason || "Listing details or KYC verification documents did not meet our verification guidelines."}</div><div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}><button disabled={busyActionId === item.id} onClick={() => void resubmitListing(item.id)} className="btn btn-primary" style={{ background: "#dc2626", borderColor: "#dc2626", fontSize: "11px", padding: "6px 14px", fontWeight: 600 }}>Resubmit for Review</button><Link href={`/post-property?edit=${item.id}`} className="btn btn-outline" style={{ fontSize: "11px", padding: "6px 12px" }}>Edit & Fix</Link></div></div>}</article>)}</div> : <EmptyState icon={Home} title="Your first listing starts here" text="Share a few details and photos. Our team will review your property before it goes live." href="/post-property" cta="Post a property"/> : tab === "managed" ? (
  managedRequests.length ? (
    <div className="owner-listing-list">
      {managedRequests.map((req) => (
        <article className="owner-listing" key={req.id}>
          <div className="owner-listing-photo" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: req.managedTier === "premium" ? "linear-gradient(135deg, #fefce8, #fef3c7)" : "linear-gradient(135deg, #f0fdf4, #dcfce7)", color: req.managedTier === "premium" ? "#b45309" : "#15803d" }}>
            <Sparkles size={34} />
          </div>
          <div className="owner-listing-info">
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
              <span className={`queue-badge-tier ${req.managedTier === "premium" ? "queue-tier-premium" : req.managedTier === "standard" ? "queue-tier-standard" : "queue-tier-none"}`}>
                {req.managedTier === "premium" ? "⭐ Premium Listing (₹999)" : req.managedTier === "standard" ? "Standard Listing (₹499)" : "Self-Listing"}
              </span>
              {req.isRecommended && (
                <span className="rec-flag" style={{ fontSize: "10px", background: "#fef08a", color: "#854d0e", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                  ⭐ Boosted
                </span>
              )}
            </div>
            <h3>{req.propertyTitle || `Property in ${req.locality || req.city || "Bengaluru"}`}</h3>
            <strong>Fee Paid: ₹{req.feeAmount}</strong>
            <div style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0" }}>
              📍 {req.locality ? `${req.locality}, ` : ""}{req.city || "Bengaluru"} · Ref: <span style={{ fontFamily: "monospace" }}>{req.transactionId || req.id.slice(0, 8)}</span>
            </div>
            <div style={{ background: "var(--surface-soft)", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", marginTop: "6px" }}>
              {req.assignedManagerName ? (
                <span>👤 <strong>Assigned Manager:</strong> {req.assignedManagerName} (Will coordinate your photos &amp; listing)</span>
              ) : (
                <span style={{ color: "#d97706" }}>⏳ <strong>Manager Assignment in Progress:</strong> Apna Aangan team is assigning a dedicated manager.</span>
              )}
            </div>
          </div>
          <div className="owner-listing-actions">
            <span className={`status-pill status-${req.requestStatus}`}>
              {req.requestStatus === "new" ? "New Request" : req.requestStatus === "assigned" ? "Manager Assigned" : req.requestStatus === "in_review" ? "In Review / Polishing" : req.requestStatus === "published" ? "Live on Site" : req.requestStatus}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>Submitted {niceDate(req.createdAt)}</small>
              {req.propertyId && (
                <Link href={`/property/${req.propertyId}`} className="btn btn-outline" style={{ fontSize: "11px", padding: "4px 10px" }}>
                  View Live Listing
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <EmptyState
      icon={Sparkles}
      title="No managed listing requests yet"
      text="Hire an Apna Aangan manager to handle your photos, specs, pricing, and tenant calls with zero hassle."
      href="/post-property"
      cta="Hire a Manager"
    />
  )
) : interests.length ? (
  <div className="owner-interest-list">
    <div className="owner-privacy-note">
      <LockKeyhole size={19}/>
      <p>Seeker privacy protected: Name, phone number, and email are strictly shielded. You receive only living profile criteria so you can decide if the tenant is a good fit.</p>
    </div>
    {interests.map((item) => {
      const title = item.propertyName || item.property?.title || "Your property";
      return (
        <article className="owner-interest" key={item.id} style={{ alignItems: "flex-start", gap: "16px", padding: "18px 20px" }}>
          <span className="interest-avatar"><Heart size={21}/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <strong>New Interest on {title}</strong>
              <small style={{ color: "var(--muted)", fontSize: "11px" }}>{niceDate(item.createdAt)}</small>
            </div>
            
            {/* The 4 fields received by the owner */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", margin: "12px 0 14px", background: "var(--surface-soft, #f7faf9)", padding: "10px 14px", borderRadius: "10px", fontSize: "12px" }}>
              <div>
                <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>People</span>
                <strong style={{ color: "var(--ink)" }}>{item.occupantsCount || "1"}</strong>
              </div>
              <div>
                <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Tenant Type</span>
                <strong style={{ color: "var(--ink)" }}>{item.tenantType || "Not specified"}</strong>
              </div>
              <div>
                <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Profession</span>
                <strong style={{ color: "var(--ink)" }}>{item.profession || "Not specified"}</strong>
              </div>
              <div>
                <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>Group</span>
                <strong style={{ color: "var(--ink)" }}>{item.groupComposition && item.groupComposition !== "N/A" ? item.groupComposition : "General"}</strong>
              </div>
            </div>

            {/* Status and Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div>
                {item.ownerResponse === "interested" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#059669", fontWeight: 700, fontSize: "12px", background: "#ecfdf5", padding: "4px 10px", borderRadius: "6px" }}>
                    <Check size={14}/> You replied: Interested (Admin connecting)
                  </span>
                ) : item.ownerResponse === "not_interested" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#6b7280", fontWeight: 700, fontSize: "12px", background: "#f3f4f6", padding: "4px 10px", borderRadius: "6px" }}>
                    You replied: Not interested
                  </span>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>Are you interested?</span>
                    <button
                      type="button"
                      disabled={busyActionId === item.id}
                      onClick={() => void respondToInquiry(item.id, "interested")}
                      className="btn btn-primary"
                      style={{ fontSize: "11px", padding: "5px 12px", height: "auto" }}
                    >
                      <Check size={13}/> Interested
                    </button>
                    <button
                      type="button"
                      disabled={busyActionId === item.id}
                      onClick={() => void respondToInquiry(item.id, "not_interested")}
                      className="btn btn-outline"
                      style={{ fontSize: "11px", padding: "5px 12px", height: "auto" }}
                    >
                      <X size={13}/> Not interested
                    </button>
                  </div>
                )}
              </div>
              <Link href={`/property/${item.propertyId || item.property?.id}`} className="text-link" style={{ fontSize: "11px" }}>
                View listing <ChevronRight size={14}/>
              </Link>
            </div>

            {item.meeting && (
              <div style={{ marginTop: "12px" }}>
                <MeetingSyncCard
                  meeting={item.meeting}
                  label={item.meeting.mode === "call" ? "Scheduled call" : "Scheduled viewing"}
                  busy={updatingMeetingId === item.id}
                  onAction={(next) => void updateOwnerMeeting(item.id, next)}
                />
              </div>
            )}
          </div>
        </article>
      );
    })}
  </div>
) : <EmptyState icon={Heart} title="No interest notifications yet" text="When someone expresses interest in one of your properties, a private, anonymous update will appear here." href="/post-property" cta="Post another property"/>}</div></main>;
}

export function NotificationsExperience() {
  const { user, loading, toast, refreshNotifications, markAllNotificationsRead, markNotificationRead } = useApp();
  const [items, setItems] = useState<Notice[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const load = useCallback(async () => {
    if (!user) { setFetching(false); return; }
    setFetching(true);
    setLoadError("");
    try { const data = await apiFetch<{ items: Notice[] }>("/api/notifications"); setItems(data.items); }
    catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : "Network connection dropped while loading notifications. Tap Retry.");
    }
    finally { setFetching(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function readAll() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't mark notifications as read.", "error");
    } finally {
      setMarkingAll(false);
    }
  }
  async function markRead(id: string) {
    await markNotificationRead(id);
    setItems((old) => old.map((item) => item.id === id ? { ...item, isRead: true } : item));
  }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Your updates live here." description="Log in to see property updates and coordinated viewing notifications." icon={Bell}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="STAY IN THE LOOP" title="Notifications" text="The things worth knowing, without the noise." action={items.some((item) => !item.isRead) ? <button disabled={markingAll} onClick={() => void readAll()} className="btn btn-outline"><Check size={17}/> {markingAll ? "Updating..." : "Mark all as read"}</button> : undefined}/>{loadError && <LoadErrorBanner message={loadError} onRetry={() => void load()}/>}{fetching ? <div className="loading-cards">Loading updates...</div> : items.length ? <div className="notifications-list">{items.map((item) => <Link href={item.link || "/notifications"} key={item.id} onClick={() => void markRead(item.id)} className={`notification-row ${item.isRead ? "" : "unread"}`}><span className="notification-icon">{item.type === "meeting" ? <CalendarDays size={21}/> : item.type === "interest" ? <Heart size={21}/> : item.type === "listing" ? <Home size={21}/> : item.type === "manager_request" ? <Sparkles size={21}/> : <Bell size={21}/>}</span><div><strong>{item.message}</strong><small>{niceDate(item.createdAt)}</small></div>{!item.isRead && <span className="unread-dot"/>}<ChevronRight size={17}/></Link>)}</div> : !loadError ? <EmptyState icon={Bell} title="All quiet for now" text="We&apos;ll let you know when there&apos;s an update on your places or inquiries." href="/search" cta="Keep exploring"/> : null}</div></main>;
}

export function ProfileExperience() {
  const { user, loading, refreshUser, logout, theme, toggleTheme, toast } = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [activatingOwner, setActivatingOwner] = useState(false);
  const [removingSearchId, setRemovingSearchId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const saveLockRef = useRef(false);
  useEffect(() => { if (user) { setName(user.name || ""); setEmail(user.email || ""); setPhone(user.phone || ""); setCity(user.city || ""); apiFetch<{ items: SavedSearch[] }>("/api/saved-searches").then((data) => setSearches(data.items)).catch(() => null); } }, [user]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || saveLockRef.current) return;
    const cleanName = normalizeWhitespace(name);
    const cleanEmail = normalizeWhitespace(email).toLowerCase();
    const cleanCity = normalizeWhitespace(city);
    if (cleanName.length < 2) {
      toast("Please enter a valid full name (at least 2 characters).", "error");
      return;
    }
    if (cleanCity.length < 2) {
      toast("Please enter a valid city / location.", "error");
      return;
    }
    saveLockRef.current = true;
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: cleanName, city: cleanCity };
      if (cleanEmail) payload.email = cleanEmail;
      if (!user?.phone && normalizeWhitespace(phone)) {
        const phoneCheck = parseIndianPhone(phone);
        if (!phoneCheck.valid) {
          toast(phoneCheck.error, "error");
          return;
        }
        payload.phone = phoneCheck.e164;
      }
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
      await refreshUser();
      toast("Profile updated");
    }
    catch (error) { toast(error instanceof Error ? error.message : "Network connection dropped while saving profile. Please try again.", "error"); }
    finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }
  async function removeSearch(id: string) {
    if (removingSearchId) return;
    setRemovingSearchId(id);
    try { await apiFetch(`/api/saved-searches/${id}`, { method: "DELETE" }); setSearches((old) => old.filter((item) => item.id !== id)); toast("Saved search removed"); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't remove search", "error"); }
    finally { setRemovingSearchId(null); }
  }
  async function deleteAccount() {
    if (deletingAccount || saveLockRef.current) return;
    saveLockRef.current = true;
    setDeletingAccount(true);
    try { await apiFetch("/api/profile", { method: "DELETE", body: JSON.stringify({ confirmation }) }); await refreshUser(); router.push("/"); toast("Account and personal data deleted"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't delete account", "error"); }
    finally {
      saveLockRef.current = false;
      setDeletingAccount(false);
    }
  }
  async function activateOwnerTools() {
    if (activatingOwner || saveLockRef.current) return;
    if (!user?.phone || !user?.consentAt) {
      router.push(`/setup?next=${encodeURIComponent("/post-property")}`);
      return;
    }
    saveLockRef.current = true;
    setActivatingOwner(true);
    try {
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) });
      await refreshUser();
      toast("Owner tools activated");
      router.push("/post-property");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't activate owner tools", "error");
    } finally {
      saveLockRef.current = false;
      setActivatingOwner(false);
    }
  }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="A home for your account." description="Log in to manage your profile, saved searches, privacy settings, and more." icon={UserRound}/></div></main>;
  return <main className="member-page profile-page"><div className="container"><PageIntro eyebrow="YOUR ACCOUNT" title="Your space, your way." text="Make yourself at home. Everything about your experience lives here."/><div className="profile-layout"><aside className="profile-sidebar"><div className="profile-avatar">{user?.name?.charAt(0).toUpperCase() || <UserRound size={25}/>}</div><strong>{user?.name || "Your profile"}</strong><span>{user?.phone || user?.email || "Apnaangaan member"}</span>{user?.roles.includes("admin") ? (
    <span className="status-pill" style={{ background: "var(--foreground)", color: "var(--background)", marginTop: "6px", display: "inline-flex", gap: "4px", alignItems: "center" }}><ShieldCheck size={13}/> Platform Admin</span>
  ) : user?.roles.includes("owner") ? (
    <span className="status-pill" style={{ background: "var(--accent-tint)", color: "var(--accent)", marginTop: "6px", display: "inline-flex", gap: "4px", alignItems: "center" }}><KeyRound size={13}/> Property Owner</span>
  ) : (
    <span className="status-pill" style={{ background: "var(--surface-muted)", color: "var(--foreground)", marginTop: "6px", display: "inline-flex", gap: "4px", alignItems: "center" }}><Home size={13}/> Home Seeker</span>
  )}<div className="profile-side-links">
  {user?.roles.includes("admin") ? (
    <>
      <Link href="/admin"><ShieldCheck size={17}/> Admin Workspace <ChevronRight size={15}/></Link>
      <Link href="/notifications"><Bell size={17}/> Notifications <ChevronRight size={15}/></Link>
      <Link href="/search"><Search size={17}/> Search properties <ChevronRight size={15}/></Link>
    </>
  ) : user?.roles.includes("owner") ? (
    <>
      <Link href="/owner"><KeyRound size={17}/> Owner dashboard <ChevronRight size={15}/></Link>
      <Link href="/post-property"><Plus size={17}/> Post a property <ChevronRight size={15}/></Link>
      <Link href="/notifications"><Bell size={17}/> Notifications <ChevronRight size={15}/></Link>
      <Link href="/search"><Search size={17}/> Explore properties <ChevronRight size={15}/></Link>
    </>
  ) : (
    <>
      <Link href="/saved"><Heart size={17}/> Saved spaces <ChevronRight size={15}/></Link>
      <Link href="/inquiries"><MessageSquare size={17}/> My inquiries <ChevronRight size={15}/></Link>
      <Link href="/notifications"><Bell size={17}/> Notifications <ChevronRight size={15}/></Link>
    </>
  )}
</div></aside><div className="profile-main"><section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><UserRound size={19}/></span><div><h2>Personal details</h2><p>Just enough to make your experience yours.</p></div></div><form onSubmit={(event) => void save(event)}><div className="profile-form-row"><label><span>Full name</span><input value={name} minLength={2} onChange={(e) => setName(e.target.value)} required/></label><label><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label></div><div className="profile-form-row"><label className="profile-phone"><span>Mobile number</span><input value={user?.phone || phone} disabled={!!user?.phone} maxLength={14} inputMode="numeric" pattern="[6-9][0-9]{9}" onKeyDown={(e) => { if (!user?.phone && !/[0-9+]/.test(e.key) && !["Backspace", "Tab", "Enter", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); } }} onPaste={(e) => { if (!user?.phone) { e.preventDefault(); setPhone(extractIndianPhoneDigits(e.clipboardData.getData("text"))); } }} onChange={(e) => setPhone(extractIndianPhoneDigits(e.target.value))} placeholder="9876543210"/><small>{user?.phone ? "Verified contact number" : "10-digit Indian mobile (+91 accepted)"}</small></label><label><span>City / Location</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Jaipur, Bengaluru, Mumbai" required/><small>Your primary city / location</small></label></div><button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save changes"} <ArrowRight size={16}/></button></form></section>{!user?.roles.includes("owner") && !user?.roles.includes("admin") && <section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><KeyRound size={19}/></span><div><h2>List a property</h2><p>Own a home or space you want to share?</p></div></div><p style={{ color: "var(--muted)", fontSize: "0.95rem", marginBottom: "1rem" }}>Activate your owner tools to post verified listings, track property views, and receive anonymous inquiries.</p><button type="button" disabled={activatingOwner} onClick={() => void activateOwnerTools()} className="btn btn-primary" style={{ display: "inline-flex", width: "auto" }}><Plus size={16}/> {activatingOwner ? "Activating..." : "Become an Owner & List Space"}</button></section>}<section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><Search size={19}/></span><div><h2>Saved searches</h2><p>Pick up right where you left off.</p></div></div>{searches.length ? <div className="saved-search-list">{searches.map((item) => <div key={item.id}><Link href={`/search?${new URLSearchParams(item.query)}`}><Search size={16}/><span>{item.label}<small>Saved {niceDate(item.createdAt)}</small></span><ArrowUpRight size={15}/></Link><button disabled={removingSearchId === item.id} onClick={() => void removeSearch(item.id)} aria-label={`Remove ${item.label}`}><Trash2 size={16}/></button></div>)}</div> : <p className="profile-empty-line">No searches saved yet. <Link href="/search">Explore properties <ArrowUpRight size={14}/></Link></p>}</section><section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><Settings2 size={19}/></span><div><h2>Preferences & privacy</h2><p>Thoughtful settings for a better experience.</p></div></div><button className="setting-row" onClick={toggleTheme}><span><Moon size={19}/> Dark mode <small>A softer look for evening browsing</small></span><span className={`toggle-switch ${theme === "dark" ? "on" : ""}`}><span/></span></button><Link href="/privacy" className="setting-row"><span><ShieldCheck size={19}/> Privacy & your data <small>Learn how we protect your information</small></span><ChevronRight size={17}/></Link><button className="setting-row" onClick={() => void logout()}><span><ArrowRight size={19}/> Log out <small>Sign out of this device</small></span><ChevronRight size={17}/></button></section><button className="delete-account-button" onClick={() => setDeleteOpen(true)}><Trash2 size={17}/> Delete my account & data</button></div></div></div>{deleteOpen && <div className="modal-backdrop" onClick={() => setDeleteOpen(false)}><div className="delete-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setDeleteOpen(false)} aria-label="Close"><X size={20}/></button><span className="delete-modal-icon"><Trash2 size={26}/></span><h2>Delete your account?</h2><p>This permanently removes your profile, saved homes, inquiries and listings. This cannot be undone.</p><label>Type DELETE to confirm<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="DELETE"/></label><button className="btn btn-danger btn-full" disabled={deletingAccount || confirmation !== "DELETE"} onClick={() => void deleteAccount()}>{deletingAccount ? "Deleting..." : "Delete account permanently"}</button><button className="modal-secondary" disabled={deletingAccount} onClick={() => setDeleteOpen(false)}>Keep my account</button></div></div>}</main>;
}
