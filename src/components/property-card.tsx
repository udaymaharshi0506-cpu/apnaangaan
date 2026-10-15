"use client";

import Link from "next/link";
import { Bath, BedDouble, Heart, MapPin, Maximize2, ArrowUpRight, BadgeCheck } from "lucide-react";
import { useApp } from "@/components/providers";
import { formatPrice } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

export function PropertyCard({ property, compact = false }: { property: PublicProperty; compact?: boolean }) {
  const { savedIds, toggleFavorite } = useApp();
  const saved = savedIds.has(property.id);
  return <article className={`property-card ${compact ? "property-card-compact" : ""}`}>
    <Link href={`/property/${property.id}`} className="property-card-link" aria-label={`View ${property.title}`}>
      <div className="property-image-wrap"><img src={property.images[0] || ""} alt={property.title} loading="lazy" className="property-image"/>
        {property.verified && <span className="verified-badge"><BadgeCheck size={14} fill="currentColor" stroke="var(--surface)" strokeWidth={2.4}/> Verified</span>}
        <span className="image-count"><Maximize2 size={13}/> {property.images.length} photos</span>
      </div>
      <div className="property-card-body">
        <div className="property-card-topline"><span className="property-type">{property.propertyType} · {property.category === "buy_home" ? "For sale" : property.category === "rent_pg" ? "PG & Co-living" : "For rent"}</span><ArrowUpRight size={17} className="card-arrow"/></div>
        <div className="property-price">{formatPrice(property.price, property.category)}</div>
        <h3>{property.title}</h3>
        <p className="property-location"><MapPin size={15} strokeWidth={1.9}/>{property.locality}, {property.city}</p>
        <div className="property-specs"><span><BedDouble size={17} strokeWidth={1.7}/>{property.bhkOrRoomType}</span><span><Maximize2 size={16} strokeWidth={1.7}/>{property.areaSqft.toLocaleString("en-IN")} sqft</span><span><Bath size={16} strokeWidth={1.7}/>{property.bathrooms} bath</span></div>
      </div>
    </Link>
    <button className={`save-button ${saved ? "saved" : ""}`} onClick={() => void toggleFavorite(property.id)} aria-label={saved ? `Remove ${property.title} from saved` : `Save ${property.title}`}><Heart size={20} fill={saved ? "currentColor" : "none"} strokeWidth={2}/></button>
  </article>;
}
