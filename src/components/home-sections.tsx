"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";
import { PropertyCard } from "@/components/property-card";
import type { PublicProperty } from "@/lib/serializers";

const tabs = [
  { label: "All spaces", value: "all" },
  { label: "For sale", value: "buy_home" },
  { label: "For rent", value: "rent_home" },
  { label: "PG & co-living", value: "rent_pg" },
  { label: "Commercial", value: "rent_commercial" },
];

export function FeaturedListings({ properties }: { properties: PublicProperty[] }) {
  const [tab, setTab] = useState("all");
  const filtered = tab === "all" ? properties : properties.filter((item) => item.category === tab);
  const displayed = filtered.slice(0, 6);
  return <section className="featured-section section-pad"><div className="container">
    <div className="section-heading-row"><div><span className="eyebrow"><span className="eyebrow-line"/> HANDPICKED FOR YOU</span><h2>Homes worth a <em>closer look.</em></h2><p>Good places, good details, and the confidence to explore.</p></div><Link href="/search" className="text-link desktop-only">Explore all spaces <ArrowUpRight size={17}/></Link></div>
    <div className="featured-filter-row">{tabs.map((item) => <button key={item.value} className={`filter-tab ${tab === item.value ? "active" : ""}`} onClick={() => setTab(item.value)}>{item.label}</button>)}</div>
    {displayed.length > 0 ? (
      <div className="property-grid">{displayed.map((property) => <PropertyCard key={property.id} property={property}/>)}</div>
    ) : (
      <div className="empty-results" style={{ padding: "3rem 1.5rem", margin: "1.5rem 0" }}>
        <h3>No spaces listed yet</h3>
        <p>This marketplace is clean and ready for real spaces. Be the first owner to list a property.</p>
        <Link href="/post-property" className="btn btn-primary">List your property <ArrowRight size={17}/></Link>
      </div>
    )}
    <Link href={tab === "all" ? "/search" : `/search?category=${tab}`} className="mobile-explore-link">Explore more spaces <ArrowRight size={17}/></Link>
  </div></section>;
}

export function RecentlyViewed({ properties }: { properties: PublicProperty[] }) {
  const [recent, setRecent] = useState<PublicProperty[]>([]);
  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem("aangan-recent") || "[]");
      setRecent(ids.map((id) => properties.find((property) => property.id === id)).filter((item): item is PublicProperty => !!item).slice(0, 3));
    } catch { setRecent([]); }
  }, [properties]);
  if (!recent.length) return null;
  return <section className="recent-section section-pad"><div className="container"><div className="section-heading-row"><div><span className="eyebrow"><Clock3 size={15}/> PICK UP WHERE YOU LEFT OFF</span><h2>Recently viewed</h2></div><Link href="/search" className="text-link">Keep exploring <ArrowUpRight size={17}/></Link></div><div className="property-grid">{recent.map((property) => <PropertyCard key={property.id} property={property} compact/>)}</div></div></section>;
}
