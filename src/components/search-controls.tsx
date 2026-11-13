"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, MapPin, Search, SlidersHorizontal, Sparkles } from "lucide-react";

export function LocationSuggest({ value, onChange, placeholder = "City, locality or landmark", className = "" }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(value)}`).then((response) => response.json()).then((data) => setSuggestions(data.suggestions || [])).catch(() => setSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [value]);
  return <div className={`location-suggest ${className}`}>
    <MapPin className="suggest-pin" size={21} strokeWidth={1.8}/>
    <input value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }} onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 160); }} placeholder={placeholder} autoComplete="off" aria-label="Search location"/>
    {value && <button type="button" className="suggest-clear" onClick={() => { onChange(""); setOpen(true); }} aria-label="Clear location">×</button>}
    {open && suggestions.length > 0 && <div className="suggest-dropdown"><span className="suggest-heading">SUGGESTED LOCATIONS</span>{suggestions.map((suggestion) => <button key={suggestion} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(suggestion); setOpen(false); }}><span className="suggest-location-icon"><MapPin size={16}/></span><span>{suggestion}</span><ArrowRight size={15} className="suggest-arrow"/></button>)}</div>}
  </div>;
}

export function HeroSearch() {
  const router = useRouter();
  const [bhk, setBhk] = useState<string>("");
  const [location, setLocation] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (location.trim()) query.set("q", location.split(",")[0].trim());
    if (bhk) query.set("bhk", bhk);
    router.push(`/search${query.toString() ? `?${query.toString()}` : ""}`);
  }

  return <div className="hero-search-panel">
    <div className="hero-search-tabs">
      <button className={!bhk ? "active" : ""} onClick={() => setBhk("")}>Rent a home</button>
      <button className={bhk === "1" ? "active" : ""} onClick={() => setBhk("1")}>1 BHK</button>
      <button className={bhk === "2" ? "active" : ""} onClick={() => setBhk("2")}>2 BHK</button>
      <button className={bhk === "3" ? "active" : ""} onClick={() => setBhk("3")}>3 BHK</button>
    </div>
    <form className="hero-search-form" onSubmit={submit}>
      <LocationSuggest value={location} onChange={setLocation} placeholder="Where in the city would you like to rent?" className="hero-location"/>
      <button type="submit" className="hero-search-button"><Search size={19}/><span>Search rentals</span></button>
    </form>
    <div className="hero-quick-filters">
      <span>Popular:</span>
      <button onClick={() => router.push(`/search?verified=true`)}><Sparkles size={13}/> Verified rentals</button>
      <button onClick={() => router.push(`/search?furnishing=Fully+furnished`)}>Fully furnished</button>
      <button onClick={() => router.push(`/search?propertyType=Villa`)}>Independent villas</button>
      <button className="quick-all" onClick={() => router.push(`/search`)}>All filters <SlidersHorizontal size={13}/></button>
    </div>
  </div>;
}
