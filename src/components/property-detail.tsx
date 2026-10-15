"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bath, BedDouble, CalendarDays, CarFront, Check, ChevronLeft, ChevronRight, Clock3, Copy, Heart, Home, Image as ImageIcon, KeyRound, LockKeyhole, MapPin, Maximize2, ShieldCheck, Sparkles, Trees, UtensilsCrossed, WashingMachine, Wifi, X, Zap, Building2, Wind, CircleHelp, type LucideIcon } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";
import { PropertyCard } from "@/components/property-card";
import { categoryLabel, formatPrice } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

const amenityIcons: Record<string, LucideIcon> = { "Covered Parking": CarFront, "Private Garden": Trees, "Park Nearby": Trees, "Security": ShieldCheck, "Power Backup": Zap, "Wi-Fi": Wifi, "Meals Included": UtensilsCrossed, "Laundry": WashingMachine, "Housekeeping": Sparkles, "Lift": Building2, "Balcony": Wind, "Water Supply": Home, "Modular Kitchen": Home, "Meeting Room": Building2 };
const contactOptions = ["Anytime is fine", "Morning (9 AM–12 PM)", "Afternoon (12–5 PM)", "Evening (5–8 PM)"];

export function PropertyDetail({ property, similar, isOwner = false, isAdmin = false }: { property: PublicProperty; similar: PublicProperty[]; isOwner?: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const { user, savedIds, toggleFavorite, toast } = useApp();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mobilePhotoIndex, setMobilePhotoIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [contactTime, setContactTime] = useState(contactOptions[0]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    setInterestOpen(true);
  }
  async function submitInterest() {
    setSubmitting(true);
    try {
      await apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ propertyId: property.id, preferredContactTime: contactTime }) });
      setSubmitted(true);
      toast("Your interest has been sent");
    } catch (error) { toast(error instanceof Error ? error.message : "Couldn't send your interest", "error"); }
    finally { setSubmitting(false); }
  }
  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: property.title, url }); } catch { /* Cancelled by user. */ } }
    else { await navigator.clipboard.writeText(url); toast("Link copied to clipboard"); }
  }
  const photos = property.images && property.images.length > 0 ? property.images : ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg?auto=compress&cs=tinysrgb&w=1200"];
  const lat = property.latitude || 12.9352, lon = property.longitude || 77.6245;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - .009}%2C${lat - .006}%2C${lon + .009}%2C${lat + .006}&layer=mapnik&marker=${lat}%2C${lon}`;
  return <main className="detail-page"><div className="container detail-container">
    <div className="breadcrumbs detail-breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href={`/search?category=${property.category}`}>{categoryLabel[property.category]}</Link><span>/</span><span>{property.title}</span></div>
    
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

    <div className="detail-heading"><div><div className="detail-tags"><span className="detail-category">{property.propertyType} · {property.category === "buy_home" ? "For sale" : "For rent"}</span>{property.verified && <span className="detail-verified"><BadgeCheck size={15} fill="currentColor" stroke="var(--surface)"/> Aangan verified</span>}{isOwner && <span className="detail-verified" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}><KeyRound size={15}/> Your listing</span>}{isAdmin && <span className="detail-verified" style={{ background: "var(--surface-muted)" }}><ShieldCheck size={15}/> Admin view</span>}</div><h1>{property.title}</h1><p><MapPin size={16}/>{property.locality}, {property.city} <span className="detail-dot">·</span> {property.address}</p></div><div className="detail-header-actions"><button onClick={() => void share()}><Copy size={17}/> Share</button><button className={saved ? "is-saved" : ""} onClick={() => void toggleFavorite(property.id)}><Heart size={18} fill={saved ? "currentColor" : "none"}/> {saved ? "Saved" : "Save"}</button></div></div>
    
    {/* Desktop gallery grid */}
    <div className="detail-gallery desktop-gallery"><button className="gallery-main" onClick={() => { setPhotoIndex(0); setGalleryOpen(true); }} aria-label="Open photo gallery"><img src={photos[0]} alt={`${property.title} main photo`}/></button><div className="gallery-secondary">{[1,2].map((index) => <button key={index} onClick={() => { setPhotoIndex(index % photos.length); setGalleryOpen(true); }} aria-label={`Open photo ${index + 1}`}><img src={photos[index % photos.length]} alt={`${property.title} photo ${index + 1}`}/></button>)}</div><button className="gallery-view-all" onClick={() => setGalleryOpen(true)}><ImageIcon size={17}/> View all {photos.length} photos</button></div>
    <div className="detail-main-layout"><div className="detail-content">
      <section className="detail-overview detail-section"><div className="detail-price-row"><div><span className="detail-small-label">{property.category === "buy_home" ? "ASKING PRICE" : "MONTHLY RENT"}</span><strong>{formatPrice(property.price, property.category)}</strong><small>{property.priceType === "negotiable" ? "Price negotiable" : property.category === "buy_home" ? "All-inclusive asking price" : property.deposit ? `Deposit: ₹${property.deposit.toLocaleString("en-IN")}` : "Available to rent"}</small></div>{property.verified && <span className="overview-verified"><BadgeCheck size={18}/> Verified listing</span>}</div><div className="detail-spec-grid"><div className="spec-item"><BedDouble size={22}/><div><strong>{property.bhkOrRoomType}</strong><span>Bedrooms / type</span></div></div><div className="spec-item"><Maximize2 size={22}/><div><strong>{property.areaSqft.toLocaleString("en-IN")} sqft</strong><span>Built-up area</span></div></div><div className="spec-item"><Bath size={22}/><div><strong>{property.bathrooms}</strong><span>Bathrooms</span></div></div><div className="spec-item"><Home size={22}/><div><strong>{property.furnishingStatus}</strong><span>Furnishing</span></div></div></div></section>
      <section className="detail-section"><div className="detail-section-title"><span className="eyebrow"><span className="eyebrow-line"/> THE DETAILS</span><h2>A little more about this place</h2></div><p className="detail-description">{property.description}</p><div className="detail-facts"><div><span>Property type</span><strong>{property.propertyType}</strong></div><div><span>Furnishing</span><strong>{property.furnishingStatus}</strong></div><div><span>Availability</span><strong>{property.availabilityDate ? new Date(property.availabilityDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Ready to move"}</strong></div><div><span>Price</span><strong>{property.priceType === "negotiable" ? "Negotiable" : "Fixed"}</strong></div>{property.reraNumber && <div><span>RERA registration</span><strong>{property.reraNumber}</strong></div>}</div></section>
      <section className="detail-section"><div className="detail-section-title"><span className="eyebrow"><span className="eyebrow-line"/> THOUGHTFUL EXTRAS</span><h2>Amenities & essentials</h2></div><div className="amenities-grid">{property.amenities.map((amenity) => { const Icon = amenityIcons[amenity] || Check; return <div className="amenity-item" key={amenity}><span><Icon size={22} strokeWidth={1.65}/></span><strong>{amenity}</strong></div>; })}</div></section>
      <section className="detail-section detail-location-section"><div className="detail-section-title"><span className="eyebrow"><span className="eyebrow-line"/> AROUND THE CORNER</span><h2>Location & neighbourhood</h2></div><p className="location-address"><MapPin size={17}/>{property.address}, {property.locality}, {property.city}</p><div className="detail-map"><iframe title={`Map of ${property.locality}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer"/><div className="map-location-pill"><MapPin size={16}/>{property.locality}, {property.city}</div></div><p className="map-note"><CircleHelp size={15}/> Pin location is approximate. Our team will share visiting details when a viewing is arranged.</p></section>
    </div><aside className="detail-sidebar">{isOwner ? <div className="detail-interest-card"><span className="side-eyebrow"><KeyRound size={15}/> Your Property Listing</span><h3>You are the owner of this space.</h3><p>Manage your listing, view prospective seeker inquiries, and check viewing schedules in your dashboard.</p><Link href="/owner" className="btn btn-primary btn-full">Manage in Owner Dashboard <ArrowRight size={18}/></Link><div className="interest-perks"><span><BadgeCheck size={17}/> Direct owner controls</span><span><ShieldCheck size={17}/> Private introductions</span></div></div> : isAdmin ? <div className="detail-interest-card"><span className="side-eyebrow"><ShieldCheck size={15}/> Admin Workspace</span><h3>Platform moderation view.</h3><p>Manage listing status, verification badges, and mediator contacts in the team portal.</p><Link href="/admin" className="btn btn-primary btn-full">Open Admin Portal <ArrowRight size={18}/></Link></div> : <div className="detail-interest-card"><span className="side-eyebrow"><Sparkles size={15}/> A better way to connect</span><h3>Could this be<br/>your next place?</h3><p>Let us know you’re interested. We’ll personally help arrange the next step.</p><button className="btn btn-primary btn-full" onClick={openInterest}>Express interest <ArrowRight size={18}/></button><div className="interest-safe"><LockKeyhole size={16}/><span>Your number is never shared with the owner.</span></div><div className="interest-divider"/><div className="interest-perks"><span><BadgeCheck size={17}/> Verified property details</span><span><Heart size={17}/> No spam or lead reselling</span><span><CalendarDays size={17}/> Viewings coordinated by our team</span></div></div>}<div className="side-help"><span className="side-help-icon"><ShieldCheck size={23}/></span><div><strong>Here to help you move.</strong><span>We handle the connection, so you can focus on finding your fit.</span></div></div></aside></div>
    {similar.length > 0 && <section className="similar-section"><div className="section-heading-row"><div><span className="eyebrow"><span className="eyebrow-line"/> KEEP EXPLORING</span><h2>You might also <em>love these.</em></h2><p>More spaces with something special.</p></div><Link href={`/search?category=${property.category}`} className="text-link desktop-only">View similar spaces <ArrowUpRight size={17}/></Link></div><div className="property-grid">{similar.map((item) => <PropertyCard key={item.id} property={item}/>)}</div></section>}
  </div>
  <div className="detail-mobile-bar"><div><small>{property.category === "buy_home" ? "Asking price" : "Monthly rent"}</small><strong>{formatPrice(property.price, property.category)}</strong></div>{isOwner ? <Link className="btn btn-primary" href="/owner">Manage listing <ArrowRight size={17}/></Link> : isAdmin ? <Link className="btn btn-primary" href="/admin">Admin Workspace <ArrowRight size={17}/></Link> : <button className="btn btn-primary" onClick={openInterest}>Express interest <ArrowRight size={17}/></button>}</div>
  {galleryOpen && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Property photos"><div className="lightbox-top"><span>{property.title} <small>· {photoIndex + 1} of {photos.length}</small></span><button onClick={() => setGalleryOpen(false)} aria-label="Close gallery"><X size={25}/></button></div><div className="lightbox-stage"><button onClick={() => setPhotoIndex((photoIndex - 1 + photos.length) % photos.length)} aria-label="Previous photo"><ChevronLeft size={26}/></button><img src={photos[photoIndex]} alt={`${property.title} photo ${photoIndex + 1}`}/><button onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} aria-label="Next photo"><ChevronRight size={26}/></button></div><div className="lightbox-thumbs">{photos.map((photo, index) => <button key={index} className={index === photoIndex ? "active" : ""} onClick={() => setPhotoIndex(index)}><img src={photo} alt={`Thumbnail ${index + 1}`}/></button>)}</div></div>}
  {interestOpen && <div className="modal-backdrop" onClick={() => setInterestOpen(false)}><div className="interest-modal" role="dialog" aria-modal="true" aria-label="Express interest" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setInterestOpen(false)} aria-label="Close"><X size={21}/></button>{submitted ? <div className="interest-success"><span className="success-icon"><Check size={32}/></span><span className="eyebrow">INTEREST CONFIRMED</span><h2>We’ll take it from here.</h2><p>Your interest in <strong>{property.title}</strong> has been noted. Our team will reach out to arrange a viewing or call — without sharing your details with the owner.</p><Link href="/inquiries" className="btn btn-primary">Track your inquiry <ArrowRight size={17}/></Link><button className="modal-secondary" onClick={() => setInterestOpen(false)}>Keep exploring</button></div> : <><span className="modal-badge"><LockKeyhole size={16}/> PRIVATE & PERSONAL</span><h2>Interested in<br/>{property.title}?</h2><p className="modal-intro">Tell us when it’s easiest to reach you. Our team will coordinate everything from there.</p><span className="modal-label"><Clock3 size={16}/> Preferred contact time</span><div className="contact-options">{contactOptions.map((option) => <button key={option} className={contactTime === option ? "active" : ""} onClick={() => setContactTime(option)}><span className="option-radio"/>{option}</button>)}</div><button className="btn btn-primary btn-full" disabled={submitting} onClick={() => void submitInterest()}>{submitting ? "Sending..." : "Confirm my interest"} <ArrowRight size={17}/></button><p className="modal-privacy"><ShieldCheck size={15}/> Your contact details stay with Aangan. They are never shared directly.</p></>}</div></div>}
  </main>;
}
