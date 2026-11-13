"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { Bath, BedDouble, Heart, MapPin, Maximize2, ArrowUpRight, BadgeCheck, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/components/providers";
import { formatPrice } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

export function PropertyCard({ property, compact = false }: { property: PublicProperty; compact?: boolean }) {
  const { savedIds, toggleFavorite } = useApp();
  const saved = savedIds.has(property.id);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isPopping, setIsPopping] = useState(false);

  const images = property.images && property.images.length > 0
    ? property.images
    : ["https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg?auto=compress&cs=tinysrgb&w=1200"];

  function handleSaveClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsPopping(true);
    setTimeout(() => setIsPopping(false), 400);
    void toggleFavorite(property.id);
  }

  function handlePrevPhoto(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setImgLoaded(false);
    setPhotoIndex((prev) => (prev - 1 + images.length) % images.length);
  }

  function handleNextPhoto(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setImgLoaded(false);
    setPhotoIndex((prev) => (prev + 1) % images.length);
  }

  function handleDotClick(e: MouseEvent, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    if (idx !== photoIndex) {
      setImgLoaded(false);
      setPhotoIndex(idx);
    }
  }

  return (
    <article className={`property-card ${compact ? "property-card-compact" : ""}`}>
      <Link href={`/property/${property.id}`} className="property-card-link" aria-label={`View ${property.title}`}>
        <div className="property-image-wrap skeleton">
          <img
            src={images[photoIndex]}
            alt={property.title}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`property-image ${imgLoaded ? "is-loaded" : "is-loading"}`}
          />

          {/* Badges */}
          <div className="card-badge-stack">
            {property.verified && (
              <span className="verified-badge">
                <BadgeCheck size={14} fill="currentColor" stroke="var(--surface)" strokeWidth={2.4} /> Verified
              </span>
            )}
            {property.isRecommended && (
              <span className="recommended-badge">
                <Sparkles size={11} fill="currentColor" /> Recommended
              </span>
            )}
          </div>

          <span className="image-count">
            <Maximize2 size={13} /> {images.length} photos
          </span>

          {/* Inline photo navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="card-nav-arrow card-nav-prev"
                onClick={handlePrevPhoto}
                aria-label="Previous photo"
              >
                <ChevronLeft size={16} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className="card-nav-arrow card-nav-next"
                onClick={handleNextPhoto}
                aria-label="Next photo"
              >
                <ChevronRight size={16} strokeWidth={2.4} />
              </button>

              {/* Dots Preview Indicator */}
              <div className="card-dots-wrap">
                {images.slice(0, 5).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`card-dot ${idx === photoIndex ? "active" : ""}`}
                    onClick={(e) => handleDotClick(e, idx)}
                    aria-label={`Photo ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="property-card-body">
          <div className="property-card-topline">
            <span className="property-type">{property.propertyType} · For rent</span>
            <ArrowUpRight size={17} className="card-arrow" />
          </div>
          <div className="property-price">{formatPrice(property.price, property.category)}</div>
          <h3>{property.title}</h3>
          <p className="property-location">
            <MapPin size={15} strokeWidth={1.9} />
            {property.locality}, {property.city}
          </p>
          <div className="property-specs">
            <span>
              <BedDouble size={17} strokeWidth={1.7} />
              {property.bhkOrRoomType}
            </span>
            <span>
              <Maximize2 size={16} strokeWidth={1.7} />
              {property.areaSqft.toLocaleString("en-IN")} sqft
            </span>
            <span>
              <Bath size={16} strokeWidth={1.7} />
              {property.bathrooms} bath
            </span>
          </div>
        </div>
      </Link>

      <button
        type="button"
        className={`save-button ${saved ? "saved" : ""} ${isPopping ? "pop" : ""}`}
        onClick={handleSaveClick}
        aria-label={saved ? `Remove ${property.title} from saved` : `Save ${property.title}`}
      >
        <Heart size={20} fill={saved ? "currentColor" : "none"} strokeWidth={2} />
      </button>
    </article>
  );
}
