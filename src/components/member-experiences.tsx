"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, BadgeCheck, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Eye, Heart, Home, KeyRound, LockKeyhole, MapPin, MessageSquare, Moon, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";
import { PropertyCard } from "@/components/property-card";
import { formatPrice } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

type PublicMeeting = { id: string; scheduledAt: string; mode: "call" | "site_visit"; status: string } | null;
type Inquiry = { id: string; status: string; preferredContactTime: string | null; createdAt: string; property: PublicProperty; meeting: PublicMeeting };
type OwnerListing = PublicProperty & { status: string; views: number; inquiryCount: number };
type AnonymousInterest = { id: string; status: string; createdAt: string; property: { id: string; title: string; image: string | null }; message: string; meeting: PublicMeeting };
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
function niceDate(date: string) { return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

export function SavedExperience() {
  const { user, loading, refreshFavorites } = useApp();
  const [items, setItems] = useState<PublicProperty[]>([]);
  const [fetching, setFetching] = useState(true);
  const load = useCallback(async () => {
    if (!user) { setFetching(false); return; }
    try { const data = await apiFetch<{ items: PublicProperty[] }>("/api/favorites"); setItems(data.items); }
    catch { setItems([]); }
    finally { setFetching(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Your favourites live here." description="Sign in to keep a little collection of places that feel like they could be yours." icon={Heart}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="YOUR SHORTLIST" title="Saved spaces, just for you." text="The places that made you pause. Come back to them whenever you're ready." action={<Link href="/search" className="btn btn-outline"><Search size={17}/> Find more spaces</Link>}/>{fetching ? <div className="loading-cards">Loading your saved spaces...</div> : items.length ? <div className="property-grid">{items.map((property) => <PropertyCard key={property.id} property={property}/>)}</div> : <EmptyState icon={Heart} title="Nothing saved just yet" text="See a place you love? Tap the heart and you'll find it here whenever you need it." href="/search" cta="Explore homes"/>}<button className="sr-only" onClick={() => { void load(); void refreshFavorites(); }}>Refresh saved</button></div></main>;
}

const inquirySteps = ["Submitted", "Under review", "Meeting scheduled", "Closed"];
function stepIndex(status: string) { return status === "new" ? 0 : status === "contacted" ? 1 : status === "meeting_scheduled" ? 2 : 3; }
export function InquiriesExperience() {
  const { user, loading } = useApp();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [fetching, setFetching] = useState(true);
  useEffect(() => {
    if (!user) { setFetching(false); return; }
    apiFetch<{ items: Inquiry[] }>("/api/customer/leads").then((data) => setItems(data.items)).catch(() => setItems([])).finally(() => setFetching(false));
  }, [user]);
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Stay in the loop." description="Sign in to track your property interests and upcoming viewings." icon={MessageSquare}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="YOUR PROPERTY JOURNEY" title="My inquiries" text="Everything is in one place. Our team coordinates each next step, privately." action={<Link href="/search" className="btn btn-outline">Explore more <ArrowUpRight size={17}/></Link>}/>{fetching ? <div className="loading-cards">Loading your inquiries...</div> : items.length ? <div className="inquiry-list">{items.map((item) => <article className="inquiry-card" key={item.id}><div className="inquiry-card-top"><Link href={`/property/${item.property.id}`} className="inquiry-property"><img src={item.property.images[0] || ""} alt=""/><div><span>{item.property.propertyType} · {item.property.locality}</span><strong>{item.property.title}</strong><small>{formatPrice(item.property.price, item.property.category)}</small></div></Link><span className={`status-pill status-${item.status}`}>{item.status === "new" ? "Submitted" : item.status === "contacted" ? "Under review" : item.status === "meeting_scheduled" ? "Meeting scheduled" : item.status === "closed_won" ? "Closed · Successful" : "Closed"}</span></div><div className="inquiry-progress">{inquirySteps.map((step, index) => <div key={step} className={index <= stepIndex(item.status) ? "done" : ""}><span className="progress-node">{index < stepIndex(item.status) ? <Check size={13}/> : index + 1}</span><span>{step}</span></div>)}</div>{item.meeting && <div className="inquiry-meeting"><CalendarDays size={19}/><div><strong>{item.meeting.mode === "call" ? "Your call" : "Your viewing"} · {item.meeting.status}</strong><span>{new Date(item.meeting.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></div></div>}<div className="inquiry-card-bottom"><span><LockKeyhole size={14}/> Both parties&apos; contact details remain private</span><small>Submitted {niceDate(item.createdAt)}</small></div></article>)}</div> : <EmptyState icon={MessageSquare} title="No inquiries yet" text="When you find a place that speaks to you, express interest and we&apos;ll take care of the introduction." href="/search" cta="Discover spaces"/>}</div></main>;
}

export function OwnerExperience() {
  const { user, loading, refreshUser, toast } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<"listings" | "interests">("listings");
  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [interests, setInterests] = useState<AnonymousInterest[]>([]);
  const [fetching, setFetching] = useState(true);
  const isOwner = user?.roles.includes("owner");
  const load = useCallback(async () => {
    if (!isOwner) { setFetching(false); return; }
    try {
      const [propertyData, interestData] = await Promise.all([apiFetch<{ items: OwnerListing[] }>("/api/owner/properties"), apiFetch<{ items: AnonymousInterest[] }>("/api/owner/leads")]);
      setListings(propertyData.items); setInterests(interestData.items);
    } catch { toast("Couldn't load your owner dashboard", "error"); }
    finally { setFetching(false); }
  }, [isOwner, toast]);
  useEffect(() => { void load(); }, [load]);
  async function upgrade() {
    try { await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) }); await refreshUser(); toast("Owner tools are ready"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't activate owner tools", "error"); }
  }
  async function changeStatus(id: string, status: "paused" | "live" | "sold" | "rented") {
    try { await apiFetch(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); toast("Listing updated"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't update listing", "error"); }
  }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="A place for your properties." description="Log in to list a property, track its performance, and see anonymous interest from seekers." icon={KeyRound}/></div></main>;
  if (!loading && user && !isOwner) return <main className="member-page"><div className="container"><div className="upgrade-card"><span className="upgrade-icon"><KeyRound size={31}/></span><span className="eyebrow">FOR PROPERTY OWNERS</span><h1>Have a place to share?</h1><p>Activate your owner space to post a verified listing, see how it performs, and receive interest notifications — with everyone&apos;s privacy protected.</p><button onClick={() => void upgrade()} className="btn btn-primary">Become a property owner <ArrowRight size={18}/></button></div></div></main>;
  const live = listings.filter((item) => item.status === "live").length;
  const totalViews = listings.reduce((sum, item) => sum + item.views, 0);
  return <main className="member-page owner-page"><div className="container"><PageIntro eyebrow="YOUR OWNER SPACE" title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}.`} text="Manage your spaces and stay in the loop, all in one calm place." action={<Link href="/post-property" className="btn btn-primary"><Plus size={18}/> Post a property</Link>}/><div className="owner-stats"><div><span className="owner-stat-icon"><Home size={20}/></span><strong>{listings.length}</strong><small>Total listings</small></div><div><span className="owner-stat-icon"><BadgeCheck size={20}/></span><strong>{live}</strong><small>Live & verified</small></div><div><span className="owner-stat-icon"><Eye size={20}/></span><strong>{totalViews}</strong><small>Property views</small></div><div><span className="owner-stat-icon"><Heart size={20}/></span><strong>{interests.length}</strong><small>Interested people</small></div></div><div className="owner-tabs"><button className={tab === "listings" ? "active" : ""} onClick={() => setTab("listings")}>My listings <span>{listings.length}</span></button><button className={tab === "interests" ? "active" : ""} onClick={() => setTab("interests")}>Interest notifications <span>{interests.length}</span></button></div>{fetching ? <div className="loading-cards">Loading your dashboard...</div> : tab === "listings" ? listings.length ? <div className="owner-listing-list">{listings.map((item) => <article className="owner-listing" key={item.id}><Link href={item.status === "live" ? `/property/${item.id}` : "#"} className="owner-listing-photo"><img src={item.images[0] || ""} alt=""/></Link><div className="owner-listing-info"><span className="owner-listing-type">{item.propertyType} · {item.locality}</span><h3>{item.title}</h3><strong>{formatPrice(item.price, item.category)}</strong><div className="owner-listing-metrics"><span><Eye size={15}/> {item.views} views</span><span><Heart size={15}/> {item.inquiryCount} interests</span></div></div><div className="owner-listing-actions"><span className={`status-pill status-${item.status}`}>{item.status.replaceAll("_", " ")}</span><div>{item.status === "live" && <button onClick={() => void changeStatus(item.id, "paused")}>Pause</button>}{item.status === "paused" && item.verified && <button onClick={() => void changeStatus(item.id, "live")}>Go live</button>}{item.status === "live" && <button onClick={() => void changeStatus(item.id, item.category === "buy_home" ? "sold" : "rented")}>Mark {item.category === "buy_home" ? "sold" : "rented"}</button>}</div></div></article>)}</div> : <EmptyState icon={Home} title="Your first listing starts here" text="Share a few details and photos. Our team will review your property before it goes live." href="/post-property" cta="Post a property"/> : interests.length ? <div className="owner-interest-list"><div className="owner-privacy-note"><LockKeyhole size={19}/><p>Interest is anonymous. We coordinate each inquiry without sharing anyone&apos;s personal details.</p></div>{interests.map((item) => <article className="owner-interest" key={item.id}><span className="interest-avatar"><Heart size={21}/></span><div><strong>{item.message}</strong><span>Our team is handling the introduction. {item.meeting ? `A ${item.meeting.mode === "call" ? "call" : "visit"} is ${item.meeting.status}.` : "We&apos;ll keep you updated on next steps."}</span><small>{niceDate(item.createdAt)} · {item.status.replaceAll("_", " ")}</small></div><Link href={`/property/${item.property.id}`} aria-label="View property"><ChevronRight size={19}/></Link></article>)}</div> : <EmptyState icon={Heart} title="No interest notifications yet" text="When someone expresses interest in one of your properties, a private, anonymous update will appear here." href="/post-property" cta="Post another property"/>}</div></main>;
}

export function NotificationsExperience() {
  const { user, loading, toast } = useApp();
  const [items, setItems] = useState<Notice[]>([]);
  const [fetching, setFetching] = useState(true);
  const load = useCallback(async () => {
    if (!user) { setFetching(false); return; }
    try { const data = await apiFetch<{ items: Notice[] }>("/api/notifications"); setItems(data.items); }
    catch { setItems([]); }
    finally { setFetching(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function readAll() { try { await apiFetch("/api/notifications/read-all", { method: "PATCH" }); await load(); toast("All caught up!"); } catch { toast("Couldn't update notifications", "error"); } }
  async function markRead(id: string) { await apiFetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => null); setItems((old) => old.map((item) => item.id === id ? { ...item, isRead: true } : item)); }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="Your updates live here." description="Log in to see property updates and coordinated viewing notifications." icon={Bell}/></div></main>;
  return <main className="member-page"><div className="container"><PageIntro eyebrow="STAY IN THE LOOP" title="Notifications" text="The things worth knowing, without the noise." action={items.some((item) => !item.isRead) ? <button onClick={() => void readAll()} className="btn btn-outline"><Check size={17}/> Mark all as read</button> : undefined}/>{fetching ? <div className="loading-cards">Loading updates...</div> : items.length ? <div className="notifications-list">{items.map((item) => <Link href={item.link || "/notifications"} key={item.id} onClick={() => void markRead(item.id)} className={`notification-row ${item.isRead ? "" : "unread"}`}><span className="notification-icon">{item.type === "meeting" ? <CalendarDays size={21}/> : item.type === "interest" ? <Heart size={21}/> : item.type === "listing" ? <Home size={21}/> : <Bell size={21}/>}</span><div><strong>{item.message}</strong><small>{niceDate(item.createdAt)}</small></div>{!item.isRead && <span className="unread-dot"/>}<ChevronRight size={17}/></Link>)}</div> : <EmptyState icon={Bell} title="All quiet for now" text="We&apos;ll let you know when there&apos;s an update on your places or inquiries." href="/search" cta="Keep exploring"/>}</div></main>;
}

export function ProfileExperience() {
  const { user, loading, refreshUser, logout, theme, toggleTheme, toast } = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { if (user) { setName(user.name || ""); setEmail(user.email || ""); apiFetch<{ items: SavedSearch[] }>("/api/saved-searches").then((data) => setSearches(data.items)).catch(() => null); } }, [user]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ name, email }) }); await refreshUser(); toast("Profile updated"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't save profile", "error"); }
    finally { setSaving(false); }
  }
  async function removeSearch(id: string) {
    try { await apiFetch(`/api/saved-searches/${id}`, { method: "DELETE" }); setSearches((old) => old.filter((item) => item.id !== id)); toast("Saved search removed"); }
    catch { toast("Couldn't remove search", "error"); }
  }
  async function deleteAccount() {
    try { await apiFetch("/api/profile", { method: "DELETE", body: JSON.stringify({ confirmation }) }); await refreshUser(); router.push("/"); toast("Account and personal data deleted"); }
    catch (error) { toast(error instanceof Error ? error.message : "Couldn't delete account", "error"); }
  }
  if (!loading && !user) return <main className="member-page"><div className="container"><AccountGate title="A home for your account." description="Log in to manage your profile, saved searches, privacy settings, and more." icon={UserRound}/></div></main>;
  return <main className="member-page profile-page"><div className="container"><PageIntro eyebrow="YOUR ACCOUNT" title="Your space, your way." text="Make yourself at home. Everything about your experience lives here."/><div className="profile-layout"><aside className="profile-sidebar"><div className="profile-avatar">{user?.name?.charAt(0).toUpperCase() || <UserRound size={25}/>}</div><strong>{user?.name || "Your profile"}</strong><span>{user?.phone || user?.email || "Aangan member"}</span>{user?.roles.includes("admin") ? (
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
</div></aside><div className="profile-main"><section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><UserRound size={19}/></span><div><h2>Personal details</h2><p>Just enough to make your experience yours.</p></div></div><form onSubmit={(event) => void save(event)}><div className="profile-form-row"><label><span>Full name</span><input value={name} minLength={2} onChange={(e) => setName(e.target.value)} required/></label><label><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label></div><label className="profile-phone"><span>Mobile number</span><input value={user?.phone || ""} disabled/><small>Verified with a one-time code</small></label><button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save changes"} <ArrowRight size={16}/></button></form></section>{!user?.roles.includes("owner") && !user?.roles.includes("admin") && <section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><KeyRound size={19}/></span><div><h2>List a property</h2><p>Own a home or space you want to share?</p></div></div><p style={{ color: "var(--muted)", fontSize: "0.95rem", marginBottom: "1rem" }}>Activate your owner tools to post verified listings, track property views, and receive anonymous inquiries.</p><Link href="/post-property" className="btn btn-primary" style={{ display: "inline-flex", width: "auto" }}><Plus size={16}/> Become an Owner & List Space</Link></section>}<section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><Search size={19}/></span><div><h2>Saved searches</h2><p>Pick up right where you left off.</p></div></div>{searches.length ? <div className="saved-search-list">{searches.map((item) => <div key={item.id}><Link href={`/search?${new URLSearchParams(item.query)}`}><Search size={16}/><span>{item.label}<small>Saved {niceDate(item.createdAt)}</small></span><ArrowUpRight size={15}/></Link><button onClick={() => void removeSearch(item.id)} aria-label={`Remove ${item.label}`}><Trash2 size={16}/></button></div>)}</div> : <p className="profile-empty-line">No searches saved yet. <Link href="/search">Explore properties <ArrowUpRight size={14}/></Link></p>}</section><section className="profile-card"><div className="profile-card-heading"><span className="profile-heading-icon"><Settings2 size={19}/></span><div><h2>Preferences & privacy</h2><p>Thoughtful settings for a better experience.</p></div></div><button className="setting-row" onClick={toggleTheme}><span><Moon size={19}/> Dark mode <small>A softer look for evening browsing</small></span><span className={`toggle-switch ${theme === "dark" ? "on" : ""}`}><span/></span></button><Link href="/privacy" className="setting-row"><span><ShieldCheck size={19}/> Privacy & your data <small>Learn how we protect your information</small></span><ChevronRight size={17}/></Link><button className="setting-row" onClick={() => void logout()}><span><ArrowRight size={19}/> Log out <small>Sign out of this device</small></span><ChevronRight size={17}/></button></section><button className="delete-account-button" onClick={() => setDeleteOpen(true)}><Trash2 size={17}/> Delete my account & data</button></div></div></div>{deleteOpen && <div className="modal-backdrop" onClick={() => setDeleteOpen(false)}><div className="delete-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setDeleteOpen(false)} aria-label="Close"><X size={20}/></button><span className="delete-modal-icon"><Trash2 size={26}/></span><h2>Delete your account?</h2><p>This permanently removes your profile, saved homes, inquiries and listings. This cannot be undone.</p><label>Type DELETE to confirm<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="DELETE"/></label><button className="btn btn-danger btn-full" disabled={confirmation !== "DELETE"} onClick={() => void deleteAccount()}>Delete account permanently</button><button className="modal-secondary" onClick={() => setDeleteOpen(false)}>Keep my account</button></div></div>}</main>;
}
