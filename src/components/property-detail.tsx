"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bath, BedDouble, CalendarDays, CarFront, Check, ChevronLeft, ChevronRight, Clock3, Copy, Heart, Home, Image as ImageIcon, KeyRound, LockKeyhole, MapPin, Maximize2, ShieldCheck, Sparkles, Trees, UtensilsCrossed, WashingMachine, Wifi, X, Zap, Building2, Wind, Users, Briefcase, Calendar, Phone, CheckCircle2, AlertCircle, MessageSquareQuote, Compass, Layers, BadgeIndianRupee, type LucideIcon } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";
import { PropertyCard } from "@/components/property-card";
import { categoryLabel, formatPrice } from "@/lib/format";
import { detectContactInfo } from "@/lib/contact-filter";
import { extractIndianPhoneDigits, normalizeWhitespace, parseIndianPhone } from "@/lib/input-validation";
import type { PublicProperty } from "@/lib/serializers";

function getFormalNarrative(prop: PublicProperty): string {
  const raw = prop.description || "";
  const isAuto =
    raw.includes("Floor:") ||
    raw.includes("Landmark:") ||
    raw.includes("Facing:") ||
    raw.includes("yfiyig");

  if (isAuto || !raw.trim()) {
    const parts: string[] = [];
    parts.push(
      `This ${prop.bhkOrRoomType} ${prop.propertyType.toLowerCase()} offers ${prop.areaSqft.toLocaleString("en-IN")} sq ft of thoughtfully planned living space in ${[prop.locality, prop.city].filter(Boolean).join(", ")}.`
    );
    const specs: string[] = [];
    if (prop.floor) specs.push(`located on floor ${prop.floor}${prop.totalFloors ? ` of ${prop.totalFloors}` : ""}`);
    if (prop.facing) specs.push(`${prop.facing}-facing`);
    if (prop.furnishingStatus) specs.push(`offered ${prop.furnishingStatus.toLowerCase()}`);
    if (specs.length > 0) {
      parts.push(`The residence is ${specs.join(", ")}.`);
    }
    if (prop.landmark) {
      parts.push(`Key neighborhood landmark: ${prop.landmark}.`);
    }
    parts.push(
      prop.availabilityDate
        ? `Available for move-in from ${new Date(prop.availabilityDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
        : "Ready for immediate move-in."
    );
    return parts.join(" ");
  }

  return raw.trim();
}

const amenityIcons: Record<string, LucideIcon> = { "Covered Parking": CarFront, "Private Garden": Trees, "Park Nearby": Trees, "Security": ShieldCheck, "Power Backup": Zap, "Wi-Fi": Wifi, "Meals Included": UtensilsCrossed, "Laundry": WashingMachine, "Housekeeping": Sparkles, "Lift": Building2, "Balcony": Wind, "Water Supply": Home, "Modular Kitchen": Home, "Meeting Room": Building2 };

const occupantsOptions = ["1", "2", "3-4", "5+"];
const tenantTypeOptions = ["Family", "Working Professionals", "Bachelors", "Couple", "Students"];
const professionOptions = ["Job-Salaried", "Business-Self-Employed", "Student", "Freelancer-Remote", "Other"];
const moveInTimelineOptions = ["Immediately", "Within 15 Days", "Within 30 Days", "Exploring / Flexible"];
const contactOptions = ["Anytime is fine", "Morning (9 AM–12 PM)", "Afternoon (12–5 PM)", "Evening (5–8 PM)"];

export function PropertyDetail({ property, similar, isOwner = false, isAdmin = false }: { property: PublicProperty; similar: PublicProperty[]; isOwner?: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const { user, savedIds, toggleFavorite, toast } = useApp();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mobilePhotoIndex, setMobilePhotoIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  
  // Enhanced homeseeker inquiry state (No pre-selected defaults)
  const [interestOpen, setInterestOpen] = useState(false);
  const [interestStep, setInterestStep] = useState<1 | 2>(1);
  const [occupantsCount, setOccupantsCount] = useState<string>("");
  const [tenantType, setTenantType] = useState<string>("");
  const [profession, setProfession] = useState<string>("");
  const [moveInTimeline, setMoveInTimeline] = useState(moveInTimelineOptions[0]);
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [contactTime, setContactTime] = useState(contactOptions[0]);
  const [seekerNotes, setSeekerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitLockRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const notesViolation = detectContactInfo(seekerNotes);

  function getConsistencyError(): string | null {
    if (occupantsCount === "1" && tenantType === "Family") {
      return "A family cannot consist of 1 person. Please select 'Bachelors', 'Working Professionals', or 'Students', or increase occupant count.";
    }
    if (occupantsCount === "1" && tenantType === "Couple") {
      return "A couple consists of 2 people. Please select '2' occupants or choose another tenant type.";
    }
    if (tenantType === "Students" && (profession === "Job-Salaried" || profession === "Business-Self-Employed")) {
      return "Tenant type 'Students' is incompatible with salaried or business employment. Please select 'Student' profession or choose 'Working Professionals'.";
    }
    return null;
  }
  
  const saved = savedIds.has(property.id);
  useEffect(() => {
    try {
      const previous: string[] = JSON.parse(localStorage.getItem("aangan-recent") || "[]");
      localStorage.setItem("aangan-recent", JSON.stringify([property.id, ...previous.filter((id) => id !== property.id)].slice(0, 10)));
    } catch { /* Browser storage is optional. */ }
    void fetch(`/api/properties/${property.id}`, { cache: "no-store" }).catch(() => null);
  }, [property.id]);
  function openInterest() {
    if (isOwner) { router.push("/owner"); return; }
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/property/${property.id}`)}`); return; }
    if (user.needsOnboarding) { router.push(`/setup?next=${encodeURIComponent(`/property/${property.id}`)}`); return; }
    const rawDigits = (user.phone || "").replace(/\D/g, "");
    setConfirmedPhone(rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits);
    setPhoneError("");
    setInterestStep(1);
    // Explicitly reset choices so seeker must actively choose each option (no pre-selected defaults)
    setOccupantsCount("");
    setTenantType("");
    setProfession("");
    setSubmitError("");
    setSubmitted(false);
    setInterestOpen(true);
  }
  function handlePhoneChange(val: string) {
    const digits = extractIndianPhoneDigits(val);
    setConfirmedPhone(digits);
    setSubmitError("");
    if (digits.length === 0) {
      setPhoneError("Phone number is required");
    } else if (!/^[6-9]/.test(digits)) {
      setPhoneError("Indian numbers start with 6, 7, 8, or 9");
    } else if (digits.length < 10) {
      setPhoneError(`Enter 10 digits (${digits.length}/10)`);
    } else {
      setPhoneError("");
    }
  }
  async function submitInterest() {
    if (submitting || submitLockRef.current) return;
    setSubmitError("");
    const phoneCheck = parseIndianPhone(confirmedPhone);
    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error);
      toast(phoneCheck.error, "error");
      return;
    }
    const consistencyErr = getConsistencyError();
    if (consistencyErr) {
      setSubmitError(consistencyErr);
      toast(consistencyErr, "error");
      return;
    }
    if (notesViolation.blocked) {
      setSubmitError(notesViolation.reason);
      toast(notesViolation.reason, "error");
      return;
    }
    const cleanNotes = normalizeWhitespace(seekerNotes);
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const data = await apiFetch<{ duplicate?: boolean; message?: string }>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          propertyId: property.id,
          preferredContactTime: contactTime,
          occupantsCount,
          tenantType,
          profession,
          groupGender: "N/A",
          moveInTimeline,
          confirmedPhone: phoneCheck.e164,
          seekerNotes: cleanNotes || undefined,
        }),
      });
      setSubmitted(true);
      toast(data.duplicate ? (data.message || "You have already expressed interest in this property.") : "Your interest has been confirmed");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Network connection dropped. Please check your internet and tap Retry.";
      setSubmitError(msg);
      toast(msg, "error");
    }
    finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }
  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: property.title, url }); } catch { /* Cancelled by user. */ } }
    else { await navigator.clipboard.writeText(url); toast("Link copied to clipboard"); }
  }
  const photos = property.images && property.images.length > 0 ? property.images : ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg?auto=compress&cs=tinysrgb&w=1200"];
  return <main className="detail-page"><div className="container detail-container">
    <div className="breadcrumbs detail-breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/search">Homes for rent</Link><span>/</span><span>{property.title}</span></div>
    
    {/* Mobile swipeable image gallery with native overlay controls */}
    <div className="mobile-gallery-wrap">
      <div className="mobile-detail-nav">
        <button className="mobile-nav-btn" onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft size={22}/>
        </button>
        <div className="mobile-nav-actions">
          <button className="mobile-nav-btn" onClick={() => void share()} aria-label="Share property">
            <Copy size={17}/>
          </button>
          <button className={`mobile-nav-btn ${saved ? "is-saved" : ""}`} onClick={() => void toggleFavorite(property.id)} aria-label="Save property">
            <Heart size={18} fill={saved ? "currentColor" : "none"}/>
          </button>
        </div>
      </div>
      <div 
        className="mobile-gallery-scroller" 
        onScroll={(e) => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          if (idx !== mobilePhotoIndex && idx >= 0 && idx < photos.length) setMobilePhotoIndex(idx);
        }}
      >
        {photos.map((photo, index) => (
          <div key={index} className="mobile-gallery-slide" onClick={() => { setPhotoIndex(index); setGalleryOpen(true); }}>
            <div className="mobile-slide-bg" style={{ backgroundImage: `url(${photo})` }} />
            <img src={photo} alt={`${property.title} photo ${index + 1}`} loading={index === 0 ? "eager" : "lazy"}/>
          </div>
        ))}
      </div>
      <div className="mobile-gallery-badges">
        <button className="mobile-gallery-pill-btn" onClick={() => { setPhotoIndex(mobilePhotoIndex); setGalleryOpen(true); }} aria-label="View all photos">
          <ImageIcon size={14}/> {mobilePhotoIndex + 1} / {photos.length} · View all
        </button>
      </div>
    </div>

    <div className="detail-heading">
      <div>
        <div className="detail-tags">
          <span className="detail-category">{property.propertyType} · For rent</span>
          {property.verified && <span className="detail-verified"><BadgeCheck size={15} fill="currentColor" stroke="var(--surface)"/> Apnaangaan verified</span>}
          {isOwner && <span className="detail-verified" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}><KeyRound size={15}/> Your listing</span>}
          {isAdmin && <span className="detail-verified" style={{ background: "var(--surface-muted)" }}><ShieldCheck size={15}/> Admin view</span>}
        </div>
        <h1>{property.title}</h1>
        <p>
          <MapPin size={16}/>
          {[property.locality, property.city].filter(Boolean).join(", ")}
          {property.landmark ? (
            <>
              <span className="detail-dot">·</span> Landmark: <strong>{property.landmark}</strong>
            </>
          ) : null}
        </p>
      </div>
      <div className="detail-header-actions">
        <button onClick={() => void share()}><Copy size={17}/> Share</button>
        <button className={saved ? "is-saved" : ""} onClick={() => void toggleFavorite(property.id)}>
          <Heart size={18} fill={saved ? "currentColor" : "none"}/> {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
    
    {/* Desktop gallery grid */}
    <div className="detail-gallery desktop-gallery"><button className="gallery-main" onClick={() => { setPhotoIndex(0); setGalleryOpen(true); }} aria-label="Open photo gallery"><img src={photos[0]} alt={`${property.title} main photo`}/></button><div className="gallery-secondary">{[1,2].map((index) => <button key={index} onClick={() => { setPhotoIndex(index % photos.length); setGalleryOpen(true); }} aria-label={`Open photo ${index + 1}`}><img src={photos[index % photos.length]} alt={`${property.title} photo ${index + 1}`}/></button>)}</div><button className="gallery-view-all" onClick={() => setGalleryOpen(true)}><ImageIcon size={17}/> View all {photos.length} photos</button></div>
    <div className="detail-main-layout"><div className="detail-content">
      <section className="detail-overview detail-section">
        <div className="detail-price-row">
          <div>
            <span className="detail-small-label">MONTHLY RENT</span>
            <strong>{formatPrice(property.price, "rent_home")}</strong>
            <small>{property.priceType === "negotiable" ? "Price negotiable" : property.deposit ? `Deposit: ${formatPrice(property.deposit, "rent_home", { period: "total" })}` : "Available to rent"}</small>
          </div>
          {property.verified && <span className="overview-verified"><BadgeCheck size={18}/> Verified listing</span>}
        </div>
        
        {/* Core Specifications in Structured, Boxed Cards */}
        <div className="detail-spec-cards-grid">
          <div className="spec-card-box">
            <div className="spec-card-icon-wrap"><BedDouble size={20}/></div>
            <div className="spec-card-meta">
              <span className="spec-card-tag">Configuration</span>
              <strong className="spec-card-val">{property.bhkOrRoomType}</strong>
            </div>
          </div>
          <div className="spec-card-box">
            <div className="spec-card-icon-wrap"><Maximize2 size={20}/></div>
            <div className="spec-card-meta">
              <span className="spec-card-tag">Built-up Area</span>
              <strong className="spec-card-val">{property.areaSqft.toLocaleString("en-IN")} sq ft</strong>
            </div>
          </div>
          <div className="spec-card-box">
            <div className="spec-card-icon-wrap"><Bath size={20}/></div>
            <div className="spec-card-meta">
              <span className="spec-card-tag">Bathrooms</span>
              <strong className="spec-card-val">{property.bathrooms} {property.bathrooms === 1 ? "Bathroom" : "Bathrooms"}</strong>
            </div>
          </div>
          <div className="spec-card-box">
            <div className="spec-card-icon-wrap"><Home size={20}/></div>
            <div className="spec-card-meta">
              <span className="spec-card-tag">Furnishing</span>
              <strong className="spec-card-val">{property.furnishingStatus}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Structured Details in Formal Categorized Boxes */}
      <section className="detail-section">
        <div className="detail-section-title">
          <span className="eyebrow"><span className="eyebrow-line"/> THE DETAILS</span>
          <h2>Property Overview &amp; Specifications</h2>
        </div>

        {/* Polished Editorial Overview Card */}
        <div className="formal-narrative-card">
          <p>{getFormalNarrative(property)}</p>
        </div>

        {/* Structured Formal Information Boxes */}
        <div className="formal-boxes-container">
          {/* Box 1: Space & Architecture Specifications */}
          <div className="formal-detail-box">
            <div className="formal-box-header">
              <div className="formal-box-icon"><Building2 size={18}/></div>
              <div>
                <h3>Space &amp; Building Specifications</h3>
                <p>Architectural layout and physical specifications of this space</p>
              </div>
            </div>
            <div className="formal-box-grid">
              <div className="formal-tile">
                <span className="formal-tile-label">Property Type</span>
                <strong className="formal-tile-value">{property.propertyType}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Configuration</span>
                <strong className="formal-tile-value">{property.bhkOrRoomType}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Super Built-up Area</span>
                <strong className="formal-tile-value">{property.areaSqft.toLocaleString("en-IN")} sq ft</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Floor Level</span>
                <strong className="formal-tile-value">{property.floor ? `Floor ${property.floor}${property.totalFloors ? ` of ${property.totalFloors}` : ""}` : "Ground / Convenient floor"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Facing Direction</span>
                <strong className="formal-tile-value">{property.facing ? `${property.facing} Facing` : "East Facing"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Furnishing Status</span>
                <strong className="formal-tile-value">{property.furnishingStatus}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Bathrooms</span>
                <strong className="formal-tile-value">{property.bathrooms} {property.bathrooms === 1 ? "Bathroom" : "Bathrooms"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Property Age</span>
                <strong className="formal-tile-value">{property.propertyAge || "New / Ready to move"}</strong>
              </div>
            </div>
          </div>

          {/* Box 2: Financial & Pricing Terms */}
          <div className="formal-detail-box">
            <div className="formal-box-header">
              <div className="formal-box-icon"><BadgeIndianRupee size={18}/></div>
              <div>
                <h3>Financial &amp; Pricing Terms</h3>
                <p>Rent terms, security deposit, and lease conditions</p>
              </div>
            </div>
            <div className="formal-box-grid">
              <div className="formal-tile">
                <span className="formal-tile-label">Monthly Rent</span>
                <strong className="formal-tile-value">{formatPrice(property.price, "rent_home")}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Price Condition</span>
                <strong className="formal-tile-value">{property.priceType === "negotiable" ? "Negotiable" : "Fixed"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Security Deposit</span>
                <strong className="formal-tile-value">{property.deposit ? formatPrice(property.deposit, "rent_home", { period: "total" }) : "Standard 1–2 months"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Maintenance Charges</span>
                <strong className="formal-tile-value">{property.maintenanceStatus === "included" ? "Included in Rent" : property.maintenanceAmount ? formatPrice(property.maintenanceAmount, "rent_home") : "As per society rules"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Availability</span>
                <strong className="formal-tile-value">{property.availabilityDate ? new Date(property.availabilityDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Ready to move"}</strong>
              </div>
              <div className="formal-tile">
                <span className="formal-tile-label">Preferred Tenants</span>
                <strong className="formal-tile-value">{property.tenantPreference || "Open to all (Families / Professionals)"}</strong>
              </div>
              {property.noticePeriod && (
                <div className="formal-tile">
                  <span className="formal-tile-label">Notice Period</span>
                  <strong className="formal-tile-value">{property.noticePeriod}</strong>
                </div>
              )}
              {property.lockInPeriod && (
                <div className="formal-tile">
                  <span className="formal-tile-label">Lock-in Period</span>
                  <strong className="formal-tile-value">{property.lockInPeriod}</strong>
                </div>
              )}
              {property.reraNumber && (
                <div className="formal-tile">
                  <span className="formal-tile-label">RERA Registration</span>
                  <strong className="formal-tile-value">{property.reraNumber}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Box 3: Location & Landmark (ONLY Landmark, NO full address) */}
          <div className="formal-detail-box">
            <div className="formal-box-header">
              <div className="formal-box-icon"><MapPin size={18}/></div>
              <div>
                <h3>Location &amp; Landmark</h3>
                <p>Verified neighborhood landmark and locality vicinity</p>
              </div>
            </div>
            
            <div className="formal-landmark-card">
              <div className="formal-landmark-badge">
                <MapPin size={16}/>
                <span>NEAREST LANDMARK</span>
              </div>
              <strong className="formal-landmark-name">
                {property.landmark ? property.landmark : `Central landmark near ${property.locality || property.city}`}
              </strong>
              <p className="formal-landmark-sub">
                Situated in <strong>{[property.locality, property.city].filter(Boolean).join(", ")}</strong>{property.pinCode ? ` · PIN ${property.pinCode}` : ""}.
              </p>
              <div className="formal-landmark-privacy-pill">
                <LockKeyhole size={16}/>
                <span>Verified Landmark Only: Exact street address and unit number are kept confidential to protect resident privacy. Direct directions and building entry access are shared during viewing appointment coordination.</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="detail-section"><div className="detail-section-title"><span className="eyebrow"><span className="eyebrow-line"/> THOUGHTFUL EXTRAS</span><h2>Amenities &amp; essentials</h2></div><div className="amenities-grid">{property.amenities.map((amenity) => { const Icon = amenityIcons[amenity] || Check; return <div className="amenity-item" key={amenity}><span><Icon size={22} strokeWidth={1.65}/></span><strong>{amenity}</strong></div>; })}</div></section>
    </div><aside className="detail-sidebar">{isOwner ? <div className="detail-interest-card"><span className="side-eyebrow"><KeyRound size={15}/> Your Property Listing</span><h3>You are the owner of this space.</h3><p>Manage your listing, view prospective seeker inquiries, and check viewing schedules in your dashboard.</p><Link href="/owner" className="btn btn-primary btn-full">Manage in Owner Dashboard <ArrowRight size={18}/></Link><div className="interest-perks"><span><BadgeCheck size={17}/> Direct owner controls</span><span><ShieldCheck size={17}/> Private introductions</span></div></div> : isAdmin ? <div className="detail-interest-card"><span className="side-eyebrow"><ShieldCheck size={15}/> Admin Workspace</span><h3>Platform moderation view.</h3><p>Manage listing status, verification badges, and mediator contacts in the team portal.</p><Link href="/admin" className="btn btn-primary btn-full">Open Admin Portal <ArrowRight size={18}/></Link></div> : <div className="detail-interest-card"><span className="side-eyebrow"><Sparkles size={15}/> A better way to connect</span><h3>Could this be<br/>your next place?</h3><p>Let us know you’re interested. We’ll personally help arrange the next step.</p><button className="btn btn-primary btn-full" onClick={openInterest}>Express interest <ArrowRight size={18}/></button><div className="interest-safe"><LockKeyhole size={16}/><span>Your number is never shared with the owner.</span></div><div className="interest-divider"/><div className="interest-perks"><span><BadgeCheck size={17}/> Verified property details</span><span><Heart size={17}/> No spam or lead reselling</span><span><CalendarDays size={17}/> Viewings coordinated by our team</span></div></div>}<div className="side-help"><span className="side-help-icon"><ShieldCheck size={23}/></span><div><strong>Here to help you move.</strong><span>We handle the connection, so you can focus on finding your fit.</span></div></div></aside></div>
    {similar.length > 0 && <section className="similar-section"><div className="section-heading-row"><div><span className="eyebrow"><span className="eyebrow-line"/> KEEP EXPLORING</span><h2>You might also <em>love these.</em></h2><p>More rental spaces with something special.</p></div><Link href="/search" className="text-link desktop-only">View more rental spaces <ArrowUpRight size={17}/></Link></div><div className="property-grid">{similar.map((item) => <PropertyCard key={item.id} property={item}/>)}</div></section>}
  </div>
  <div className="detail-mobile-bar"><div><small>Monthly rent</small><strong>{formatPrice(property.price, "rent_home")}</strong></div>{isOwner ? <Link className="btn btn-primary" href="/owner">Manage listing <ArrowRight size={17}/></Link> : isAdmin ? <Link className="btn btn-primary" href="/admin">Admin Workspace <ArrowRight size={17}/></Link> : <button className="btn btn-primary" onClick={openInterest}>Express interest <ArrowRight size={17}/></button>}</div>
  {galleryOpen && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Property photos"><div className="lightbox-top"><span>{property.title} <small>· {photoIndex + 1} of {photos.length}</small></span><button onClick={() => setGalleryOpen(false)} aria-label="Close gallery"><X size={25}/></button></div><div className="lightbox-stage"><button onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} aria-label="Previous photo"><ChevronLeft size={26}/></button><img src={photos[photoIndex]} alt={`${property.title} photo ${photoIndex + 1}`}/><button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} aria-label="Next photo"><ChevronRight size={26}/></button></div><div className="lightbox-thumbs">{photos.map((photo, index) => <button key={index} className={index === photoIndex ? "active" : ""} onClick={() => setPhotoIndex(index)}><img src={photo} alt={`Thumbnail ${index + 1}`}/></button>)}</div></div>}
  {interestOpen && (
    <div className="modal-backdrop" onClick={() => setInterestOpen(false)}>
      <div className="interest-modal expanded" role="dialog" aria-modal="true" aria-label="Express interest" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setInterestOpen(false)} aria-label="Close"><X size={21}/></button>
        {submitted ? (
          <div className="interest-success">
            <span className="success-icon"><Check size={32}/></span>
            <span className="eyebrow">INTEREST CONFIRMED</span>
            <h2>We’ll take it from here.</h2>
            <p>Your interest and living preferences for <strong>{property.title}</strong> have been saved. Our team will coordinate next steps with the owner while keeping your identity private.</p>
            
            <div className="inquiry-summary-card">
              <div className="inquiry-summary-row">
                <span>Property</span>
                <strong>{property.title}</strong>
              </div>
              <div className="inquiry-summary-row">
                <span>Who is moving in</span>
                <strong>{tenantType} · {occupantsCount}</strong>
              </div>
              <div className="inquiry-summary-row">
                <span>Profession</span>
                <strong>{profession}</strong>
              </div>
              <div className="inquiry-summary-row">
                <span>Move-in Timeline</span>
                <strong>{moveInTimeline}</strong>
              </div>
              <div className="inquiry-summary-row">
                <span>Confirmed Contact</span>
                <strong style={{ color: "var(--brand)" }}>+91 {confirmedPhone}</strong>
              </div>
              <div className="inquiry-summary-row">
                <span>Preferred Call Time</span>
                <strong>{contactTime}</strong>
              </div>
            </div>

            <Link href="/inquiries" className="btn btn-primary btn-full">Track your inquiry <ArrowRight size={17}/></Link>
            <button className="modal-secondary" onClick={() => setInterestOpen(false)}>Keep exploring</button>
          </div>
        ) : (
          <>
            {/* Stepper Header */}
            <div className="inquiry-stepper">
              <span className="modal-badge"><LockKeyhole size={14}/> PRIVATE &amp; PERSONAL</span>
              <div className="inquiry-stepper-steps">
                <span className={`inquiry-step-pill ${interestStep === 1 ? "active" : "done"}`}>
                  <span className="inquiry-step-num">{interestStep > 1 ? "✓" : "1"}</span> Profile
                </span>
                <span className={`inquiry-step-pill ${interestStep === 2 ? "active" : ""}`}>
                  <span className="inquiry-step-num">2</span> Contact
                </span>
              </div>
            </div>

            {/* STEP 1: LIVING PROFILE & GROUP DETAILS */}
            {interestStep === 1 && (
              <div className="inquiry-step-content">
                <h2>Interested in<br/>{property.title}?</h2>
                <p className="modal-intro">Tell us a little about who is moving in so we can verify suitability with the owner.</p>

                {/* 1. How many people are going to live? */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Users size={16}/> How many people are going to live?
                  </span>
                  <div className="inquiry-chips-grid">
                    {occupantsOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        className={`inquiry-chip ${occupantsCount === opt ? "selected" : ""}`}
                        onClick={() => setOccupantsCount(opt)}
                      >
                        <span className="inquiry-chip-radio"/>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Tenant Type / Who are you? */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Home size={16}/> Who will be living here? (Tenant Type)
                  </span>
                  <div className="inquiry-chips-grid">
                    {tenantTypeOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        className={`inquiry-chip ${tenantType === opt ? "selected" : ""}`}
                        onClick={() => {
                          setTenantType(opt);
                        }}
                      >
                        <span className="inquiry-chip-radio"/>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Profession / Employment */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Briefcase size={16}/> Profession / Employment status
                  </span>
                  <div className="inquiry-chips-grid">
                    {professionOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        className={`inquiry-chip ${profession === opt ? "selected" : ""}`}
                        onClick={() => setProfession(opt)}
                      >
                        <span className="inquiry-chip-radio"/>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Consistency Warning / Block */}
                {getConsistencyError() && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "11px 14px", borderRadius: "8px", fontSize: "12px", marginTop: "14px", lineHeight: "1.45" }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }}/>
                    <span>{getConsistencyError()}</span>
                  </div>
                )}

                <div className="inquiry-nav-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    disabled={!occupantsCount || !tenantType || !profession || !!getConsistencyError()}
                    onClick={() => setInterestStep(2)}
                  >
                    Continue to Contact &amp; Schedule <ArrowRight size={17}/>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: TIMING, CONFIRMED PHONE & NOTES */}
            {interestStep === 2 && (
              <div className="inquiry-step-content">
                <h2>Timing &amp; Contact Details</h2>
                <p className="modal-intro">Confirm when you plan to move and your active contact number for private viewing coordination.</p>

                {/* 5. Move-in Timeline */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Calendar size={16}/> When are you looking to move in?
                  </span>
                  <div className="inquiry-chips-grid">
                    {moveInTimelineOptions.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        className={`inquiry-chip ${moveInTimeline === opt ? "selected" : ""}`}
                        onClick={() => setMoveInTimeline(opt)}
                      >
                        <span className="inquiry-chip-radio"/>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Confirmed Active Mobile Number */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Phone size={16}/> Confirmed Active Mobile Number <span style={{ color: "#dc2626" }}>*</span>
                  </span>
                  <p className="inquiry-question-sub">Our coordinator will call/WhatsApp this number to arrange viewings. Never shared with the owner.</p>
                  <div className={`inquiry-phone-box ${phoneError ? "has-error" : ""}`}>
                    <span className="inquiry-phone-prefix">🇮🇳 +91</span>
                    <input
                      type="tel"
                      className="inquiry-phone-input"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={confirmedPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                    />
                    {/^[6-9]\d{9}$/.test(confirmedPhone) && (
                      <span className="inquiry-phone-badge" title="Valid Indian Mobile Number">
                        <CheckCircle2 size={18}/>
                      </span>
                    )}
                  </div>
                  {phoneError ? (
                    <div className="inquiry-error-msg">
                      <AlertCircle size={13}/> {phoneError}
                    </div>
                  ) : /^[6-9]\d{9}$/.test(confirmedPhone) ? (
                    <div style={{ fontSize: "11px", color: "#059669", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Check size={13}/> Active 10-digit mobile confirmed
                    </div>
                  ) : null}
                </div>

                {/* 7. Preferred Contact Time */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <Clock3 size={16}/> Preferred contact time
                  </span>
                  <div className="contact-options">
                    {contactOptions.map((option) => (
                      <button
                        type="button"
                        key={option}
                        className={contactTime === option ? "active" : ""}
                        onClick={() => setContactTime(option)}
                      >
                        <span className="option-radio"/>
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 8. Special Notes or Requirements */}
                <div className="inquiry-question-block">
                  <span className="inquiry-question-label">
                    <MessageSquareQuote size={16}/> Specific preferences or questions (Optional)
                  </span>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={seekerNotes}
                    onChange={(e) => setSeekerNotes(e.target.value)}
                    placeholder="e.g. Need dedicated car parking, vegetarian family, have a small dog, looking for 11-month lease..."
                  />
                  {notesViolation.blocked && (
                    <small style={{ display: "block", color: "#b91c1c", fontWeight: 600, marginTop: "6px" }}>
                      {notesViolation.reason}
                    </small>
                  )}
                </div>

                {/* Consent line before submit */}
                <div style={{ display: "flex", alignItems: "center", gap: "9px", background: "var(--brand-pale, #edf7f4)", color: "var(--brand-deep, #144b44)", padding: "12px 14px", borderRadius: "10px", fontSize: "12px", lineHeight: "1.45", margin: "14px 0 18px", border: "1px solid rgba(30,112,102,0.18)" }}>
                  <ShieldCheck size={18} style={{ flexShrink: 0, color: "var(--brand, #1e7066)" }}/>
                  <span>Only these details are shared with the owner. Your name and contact stay private.</span>
                </div>

                {submitError && (
                  <div className="form-error" role="alert" style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <span>{submitError}</span>
                    <button type="button" className="btn btn-outline" style={{ fontSize: "12px", padding: "5px 10px", height: "auto" }} disabled={submitting} onClick={() => void submitInterest()}>
                      Retry
                    </button>
                  </div>
                )}

                <div className="inquiry-nav-row">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setInterestStep(1)}
                    disabled={submitting}
                  >
                    <ArrowLeft size={16}/> Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={submitting || !/^[6-9]\d{9}$/.test(confirmedPhone) || notesViolation.blocked}
                    onClick={() => void submitInterest()}
                  >
                    {submitting ? "Confirming..." : submitError ? "Retry submission" : "Confirm my interest"} <ArrowRight size={17}/>
                  </button>
                </div>
              </div>
            )}

            <p className="modal-privacy">
              <ShieldCheck size={15}/> Your contact details stay with Apnaangaan. They are never shared directly.
            </p>
          </>
        )}
      </div>
    </div>
  )}
  </main>;
}
