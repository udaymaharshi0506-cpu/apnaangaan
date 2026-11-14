"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Building2, ChevronDown, MapPin, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";

export type LocationItem = {
  name: string;
  count?: number;
  type?: "city" | "locality" | "pin";
  raw?: string;
};

export function LocationSuggest({
  value,
  onChange,
  onSubmit,
  placeholder = "Search city, locality, or pin code...",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LocationItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<Array<{ name: string; count: number }>>([
    { name: "Jaipur", count: 12 },
    { name: "Bengaluru", count: 4 },
    { name: "Mumbai", count: 2 },
    { name: "Gurugram", count: 1 },
    { name: "Pune", count: 1 },
    { name: "Hyderabad", count: 1 },
  ]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(value)}`)
        .then((response) => response.json())
        .then((data) => {
          setSuggestions(data.suggestions || []);
          if (Array.isArray(data.items)) setItems(data.items);
          if (Array.isArray(data.availableCities) && data.availableCities.length > 0) {
            setAvailableCities(data.availableCities);
          }
        })
        .catch(() => {
          setSuggestions([]);
          setItems([]);
        });
    }, 160);
    return () => clearTimeout(timer);
  }, [value]);

  function selectAndSubmit(selected: string) {
    onChange(selected);
    setOpen(false);
    if (onSubmit) onSubmit(selected);
  }

  return (
    <div className={`location-suggest ${className}`}>
      <MapPin className="suggest-pin" size={20} strokeWidth={1.8} />
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 200);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            selectAndSubmit(value);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Search location"
      />
      {value && (
        <button
          type="button"
          className="suggest-clear"
          onClick={() => {
            onChange("");
            setOpen(true);
          }}
          aria-label="Clear location"
        >
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="suggest-dropdown" role="listbox">
          {value.trim().length > 0 ? (
            <>
              {/* Custom search option allowing ANY typed location */}
              <button
                type="button"
                className="suggest-item suggest-custom-match"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectAndSubmit(value)}
              >
                <span className="suggest-location-icon">
                  <Search size={15} />
                </span>
                <span className="suggest-name">
                  Search in <strong>&ldquo;{value.trim()}&rdquo;</strong>
                </span>
                <span className="suggest-custom-badge">Search</span>
                <ArrowRight size={14} className="suggest-arrow" />
              </button>

              {items.length > 0 ? (
                <>
                  <span className="suggest-heading">MATCHING LOCATIONS ({items.length})</span>
                  {items.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectAndSubmit(item.name)}
                    >
                      <span className="suggest-location-icon">
                        {item.type === "city" ? <Building2 size={15} /> : <MapPin size={15} />}
                      </span>
                      <span className="suggest-name">{item.name}</span>
                      {typeof item.count === "number" && item.count > 0 && (
                        <span className="suggest-count-pill">
                          {item.count} {item.count === 1 ? "flat" : "flats"}
                        </span>
                      )}
                      <ArrowRight size={14} className="suggest-arrow" />
                    </button>
                  ))}
                </>
              ) : suggestions.length > 0 ? (
                <>
                  <span className="suggest-heading">SUGGESTED LOCATIONS</span>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectAndSubmit(suggestion)}
                    >
                      <span className="suggest-location-icon">
                        <MapPin size={15} />
                      </span>
                      <span className="suggest-name">{suggestion}</span>
                      <ArrowRight size={14} className="suggest-arrow" />
                    </button>
                  ))}
                </>
              ) : (
                <div className="suggest-empty-tip">
                  No active listings matching &ldquo;{value.trim()}&rdquo;. Press Enter or click above to search.
                </div>
              )}
            </>
          ) : (
            <>
              {availableCities.length > 0 && (
                <>
                  <span className="suggest-heading">CITIES WITH LIVE FLATS</span>
                  {availableCities.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className="suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectAndSubmit(c.name)}
                    >
                      <span className="suggest-location-icon">
                        <MapPin size={15} />
                      </span>
                      <span className="suggest-name">{c.name}</span>
                      {c.count > 0 && (
                        <span className="suggest-count-pill">
                          {c.count} {c.count === 1 ? "flat" : "flats"}
                        </span>
                      )}
                      <ArrowRight size={14} className="suggest-arrow" />
                    </button>
                  ))}
                </>
              )}

              <div className="suggest-quick-chips">
                <span className="suggest-subheading">POPULAR CITIES</span>
                <div className="suggest-chips-row">
                  {["Jaipur", "Bengaluru", "Mumbai", "Gurugram", "Pune", "Hyderabad"].map((city) => (
                    <button
                      key={city}
                      type="button"
                      className="suggest-chip"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectAndSubmit(city)}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function HeroSearch() {
  const router = useRouter();
  const [bhk, setBhk] = useState<string>("");
  const [location, setLocation] = useState("");

  function submit(event?: FormEvent) {
    if (event) event.preventDefault();
    const query = new URLSearchParams();
    const clean = location.trim();
    if (clean) query.set("location", clean);
    if (bhk) query.set("bhk", bhk);
    router.push(`/search${query.toString() ? `?${query.toString()}` : ""}`);
  }

  return (
    <div className="hero-search-panel">
      <div className="hero-search-tabs">
        <button type="button" className={!bhk ? "active" : ""} onClick={() => setBhk("")}>
          Rent a home
        </button>
        <button type="button" className={bhk === "1" ? "active" : ""} onClick={() => setBhk("1")}>
          1 BHK
        </button>
        <button type="button" className={bhk === "2" ? "active" : ""} onClick={() => setBhk("2")}>
          2 BHK
        </button>
        <button type="button" className={bhk === "3" ? "active" : ""} onClick={() => setBhk("3")}>
          3 BHK
        </button>
      </div>
      <form className="hero-search-form" onSubmit={submit}>
        <LocationSuggest
          value={location}
          onChange={setLocation}
          onSubmit={() => submit()}
          placeholder="Search city, locality, or pin code..."
          className="hero-location"
        />
        <button type="submit" className="hero-search-button">
          <Search size={19} />
          <span>Search rentals</span>
        </button>
      </form>
      <div className="hero-quick-filters">
        <span>Popular:</span>
        <button type="button" onClick={() => router.push(`/search?verified=true`)}>
          <Sparkles size={13} /> Verified rentals
        </button>
        <button type="button" onClick={() => router.push(`/search?furnishing=Fully+furnished`)}>
          Fully furnished
        </button>
        <button type="button" onClick={() => router.push(`/search?propertyType=Villa`)}>
          Independent villas
        </button>
        <button type="button" className="quick-all" onClick={() => router.push(`/search`)}>
          All filters <SlidersHorizontal size={13} />
        </button>
      </div>
    </div>
  );
}
