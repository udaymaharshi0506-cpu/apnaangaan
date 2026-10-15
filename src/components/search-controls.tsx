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
  const [mode, setMode] = useState<"buy" | "rent">("buy");
  const [rentKind, setRentKind] = useState<"rent_home" | "rent_pg" | "rent_commercial">("rent_home");
  const [location, setLocation] = useState("");
  const [rentOpen, setRentOpen] = useState(false);
  const category = mode === "buy" ? "buy_home" : rentKind;
  function submit(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams({ category });
    if (location.trim()) query.set("q", location.split(",")[0].trim());
    router.push(`/search?${query.toString()}`);
  }
  return <div className="hero-search-panel">
    <div className="hero-search-tabs"><button className={mode === "buy" ? "active" : ""} onClick={() => setMode("buy")}>Buy a home</button><button className={mode === "rent" ? "active" : ""} onClick={() => setMode("rent")}>Rent a space</button></div>
    <form className="hero-search-form" onSubmit={submit}>
      {mode === "rent" && <div className="rent-kind-wrap"><button type="button" className="rent-kind-button" onClick={() => setRentOpen(!rentOpen)}>{rentKind === "rent_home" ? "Homes" : rentKind === "rent_pg" ? "PG" : "Commercial"}<ChevronDown size={16}/></button>{rentOpen && <div className="rent-kind-menu">{[["Homes", "rent_home"], ["PG & Co-living", "rent_pg"], ["Commercial", "rent_commercial"]].map(([label, value]) => <button type="button" key={value} onClick={() => { setRentKind(value as typeof rentKind); setRentOpen(false); }}>{label}</button>)}</div>}</div>}
      <LocationSuggest value={location} onChange={setLocation} placeholder="Where would you like to live?" className="hero-location"/>
      <button type="submit" className="hero-search-button"><Search size={19}/><span>Search homes</span></button>
    </form>
    <div className="hero-quick-filters"><span>Popular:</span><button onClick={() => router.push(`/search?category=${category}&verified=true`)}><Sparkles size={13}/> Verified homes</button><button onClick={() => router.push(`/search?category=${category}&bhk=2`)}>2 BHK</button><button onClick={() => router.push(`/search?category=${category}&bhk=3`)}>3 BHK</button><button className="quick-all" onClick={() => router.push(`/search?category=${category}`)}>All filters <SlidersHorizontal size={13}/></button></div>
  </div>;
}
