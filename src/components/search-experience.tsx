"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, LayoutGrid, ListFilter, Map, MapPin, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";
import { PropertyCard } from "@/components/property-card";
import { LocationSuggest } from "@/components/search-controls";
import { categoryLabel } from "@/lib/format";
import type { PublicProperty } from "@/lib/serializers";

type Result = { items: PublicProperty[]; total: number; page: number; pages: number; limit: number };
const rentalTypes = [
  { label: "All rentals", value: "" },
  { label: "Apartments", value: "Apartment" },
  { label: "Independent houses", value: "Independent house" },
  { label: "Villas", value: "Villa" },
  { label: "Studio apartments", value: "Studio apartment" },
  { label: "Builder floors", value: "Floor" },
];
const bhks = ["1", "2", "3", "4"];
const furnishingOptions = ["Unfurnished", "Semi-furnished", "Fully furnished"];

export function SearchExperience({ result, initialFilters }: { result: Result; initialFilters: Record<string, string> }) {
  const router = useRouter();
  const { user, toast } = useApp();
  const [query, setQuery] = useState(initialFilters.q || initialFilters.city || "");
  const [draft, setDraft] = useState<Record<string, string>>(initialFilters);
  const [mapView, setMapView] = useState(initialFilters.view === "map");
  const [filterOpen, setFilterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const filtersSignature = JSON.stringify(initialFilters);

  useEffect(() => {
    setDraft(initialFilters);
    setQuery(initialFilters.q || initialFilters.city || "");
    setMapView(initialFilters.view === "map");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersSignature]);

  const category = initialFilters.category || "";

  function navigate(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(initialFilters);
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    if (!("page" in changes) && !("view" in changes)) next.delete("page");
    router.push(`/search${next.toString() ? `?${next}` : ""}`);
  }
  function submitSearch(event: FormEvent) { event.preventDefault(); navigate({ q: query.split(",")[0].trim() || undefined, city: undefined }); }
  function applyFilters() {
    const values: Record<string, string | undefined> = {};
    for (const key of ["minPrice", "maxPrice", "bhk", "furnishing", "minArea", "maxArea", "verified"]) values[key] = draft[key] || undefined;
    navigate(values); setFilterOpen(false);
  }
  function resetAllFilters() {
    setQuery("");
    setDraft({});
    setMapView(false);
    setFilterOpen(false);
    router.push("/search");
  }
  async function saveSearch() {
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/search?${new URLSearchParams(initialFilters)}`)}`); return; }
    setSaving(true);
    try {
      const label = `${categoryLabel[category] || "All rental homes"}${query ? ` in ${query}` : ""}`;
      await apiFetch("/api/saved-searches", { method: "POST", body: JSON.stringify({ label, query: initialFilters }) });
      toast("Search saved to your profile");
    } catch (error) { toast(error instanceof Error ? error.message : "Couldn't save search", "error"); }
    finally { setSaving(false); }
  }
  const activeFilters = ["minPrice", "maxPrice", "bhk", "furnishing", "minArea", "maxArea", "verified"].filter((key) => !!initialFilters[key]).length;
  const hasAnyActiveFilter = Boolean(initialFilters.q || initialFilters.city || initialFilters.propertyType || initialFilters.sort || activeFilters > 0);
  const first = result.items[0];
  const lat = first?.latitude || 26.9124, lon = first?.longitude || 75.7873;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - .035}%2C${lat - .025}%2C${lon + .035}%2C${lat + .025}&layer=mapnik&marker=${lat}%2C${lon}`;

  const filters = <div className="filters-panel"><div className="filters-panel-header"><div><span className="eyebrow">REFINE YOUR SEARCH</span><h3>Filters</h3></div><button className="mobile-filter-close" onClick={() => setFilterOpen(false)} aria-label="Close filters"><X size={22}/></button></div>
    <div className="filter-group"><div className="filter-group-title">Monthly rent <span>₹</span></div><div className="filter-range"><label>MIN RENT<input type="number" min="0" value={draft.minPrice || ""} onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })} placeholder="No min"/></label><span>—</span><label>MAX RENT<input type="number" min="0" value={draft.maxPrice || ""} onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })} placeholder="No max"/></label></div><p className="filter-help">Monthly rent in ₹, e.g. 25000 to 65000</p></div>
    <div className="filter-group"><div className="filter-group-title">Bedrooms / room type</div><div className="filter-options">{bhks.map((value) => <button key={value} className={draft.bhk === value ? "selected" : ""} onClick={() => setDraft({ ...draft, bhk: draft.bhk === value ? "" : value })}>{value} BHK</button>)}</div></div>
    <div className="filter-group"><div className="filter-group-title">Furnishing</div><div className="filter-stack">{furnishingOptions.map((value) => <button key={value} onClick={() => setDraft({ ...draft, furnishing: draft.furnishing === value ? "" : value })} className={draft.furnishing === value ? "selected" : ""}><span className="filter-radio"/>{value}</button>)}</div></div>
    <div className="filter-group"><div className="filter-group-title">Area <span>sqft</span></div><div className="filter-range"><label>MIN AREA<input type="number" min="0" value={draft.minArea || ""} onChange={(e) => setDraft({ ...draft, minArea: e.target.value })} placeholder="Any"/></label><span>—</span><label>MAX AREA<input type="number" min="0" value={draft.maxArea || ""} onChange={(e) => setDraft({ ...draft, maxArea: e.target.value })} placeholder="Any"/></label></div></div>
    <div className="filter-group filter-verified"><span className="filter-verified-icon"><BadgeCheck size={20}/></span><div><strong>Verified only</strong><small>Reviewed by the Apnaangaan team</small></div><button className={`toggle-switch ${draft.verified === "true" ? "on" : ""}`} role="switch" aria-checked={draft.verified === "true"} onClick={() => setDraft({ ...draft, verified: draft.verified === "true" ? "" : "true" })}><span/></button></div>
    <div className="filter-actions"><button className="filter-reset" onClick={() => { setDraft((prev) => ({ ...prev, minPrice: "", maxPrice: "", bhk: "", furnishing: "", minArea: "", maxArea: "", verified: "" })); navigate({ minPrice: undefined, maxPrice: undefined, bhk: undefined, furnishing: undefined, minArea: undefined, maxArea: undefined, verified: undefined }); setFilterOpen(false); }}>Clear all</button><button className="btn btn-primary" onClick={applyFilters}>Show results <ArrowRight size={16}/></button></div>
  </div>;

  return <main className="search-page"><div className="container search-page-inner">
    <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Rental homes</span></div>
    <div className="search-page-top"><div><span className="eyebrow"><span className="eyebrow-line"/> FIND YOUR RENTAL</span><h1>Explore rental homes <em>made for you.</em></h1><p>Every great next chapter begins somewhere.</p></div><div className="search-top-ornament"><Sparkles size={26}/></div></div>
    <div className="search-main-bar"><form onSubmit={submitSearch}><LocationSuggest value={query} onChange={setQuery} placeholder="Search Jaipur locality (e.g. Mansarovar, Vaishali Nagar) or city"/><button className="btn btn-primary" type="submit"><Search size={18}/> Search</button></form><button className="search-save-button" onClick={() => void saveSearch()} disabled={saving}><Sparkles size={16}/>{saving ? "Saving..." : "Save this search"}</button></div>
    <div className="search-category-scroll">{rentalTypes.map((item) => <button key={item.value} className={(initialFilters.propertyType === item.value || (!initialFilters.propertyType && !item.value)) ? "active" : ""} onClick={() => navigate({ propertyType: item.value || undefined })}>{item.label}</button>)}</div>
    <div className="search-body"><aside className="desktop-filters">{filters}</aside><div className="search-results">
      <div className="results-toolbar"><div><strong>{result.total} {result.total === 1 ? "home" : "homes"} for rent</strong><span>Rental homes{initialFilters.q ? ` · ${initialFilters.q}` : initialFilters.city ? ` · ${initialFilters.city}` : ""}{initialFilters.propertyType ? ` · ${initialFilters.propertyType}` : ""}</span></div><div className="toolbar-actions"><button className="mobile-filter-button" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={17}/> Filters {activeFilters > 0 && <b>{activeFilters}</b>}</button><label className="sort-select">Sort by <select value={initialFilters.sort || "relevance"} onChange={(e) => navigate({ sort: e.target.value === "relevance" ? undefined : e.target.value })}><option value="relevance">Recommended</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select><ChevronDown size={14}/></label><div className="view-toggle"><button className={!mapView ? "active" : ""} onClick={() => { setMapView(false); navigate({ view: undefined }); }} aria-label="List view"><LayoutGrid size={17}/></button><button className={mapView ? "active" : ""} onClick={() => { setMapView(true); navigate({ view: "map" }); }} aria-label="Map view"><Map size={17}/></button></div></div></div>
      {result.items.length ? mapView ? <div className="map-results"><div className="map-list">{result.items.map((property) => <PropertyCard key={property.id} property={property} compact/>)}</div><div className="map-canvas"><iframe title="Properties map" src={mapUrl} loading="lazy"/><div className="map-overlay-note"><MapPin size={16}/> Viewing the {first?.locality} area</div></div></div> : <div className="search-grid">{result.items.map((property) => <PropertyCard key={property.id} property={property}/>)}</div> : <div className="empty-results"><div><ListFilter size={35}/></div><h3>No properties found</h3><p>{hasAnyActiveFilter ? "No properties match your active search or filter criteria. Reset filters to view all available rental homes." : "Try searching a Jaipur locality like Mansarovar, Vaishali Nagar, or Malviya Nagar."}</p><button className="btn btn-primary" onClick={resetAllFilters}>Reset Filters <ArrowRight size={17}/></button></div>}
      {result.pages > 1 && <div className="pagination"><button disabled={result.page <= 1} onClick={() => navigate({ page: String(result.page - 1) })}><ArrowLeft size={16}/> Previous</button><span>Page {result.page} of {result.pages}</span><button disabled={result.page >= result.pages} onClick={() => navigate({ page: String(result.page + 1) })}>Next <ArrowRight size={16}/></button></div>}
    </div></div>
    <div className="search-bottom-note"><BadgeCheck size={18}/><span>Every verified rental home has been reviewed by our team. Your details are never shared directly with an owner.</span><Link href="/privacy">Learn more <ArrowUpRight size={14}/></Link></div>
  </div>{filterOpen && <div className="filter-modal-backdrop" onClick={() => setFilterOpen(false)}><div className="filter-modal" onClick={(e) => e.stopPropagation()}>{filters}</div></div>}</main>;
}
