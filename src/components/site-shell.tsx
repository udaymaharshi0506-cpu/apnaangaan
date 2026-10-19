"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Heart, Home, MapPin, Moon, Plus, Search, Sun, UserRound, ClipboardList, ArrowUpRight, ShieldCheck, ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/components/providers";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" aria-label="Aangan home" className={`brand ${light ? "brand-light" : ""}`}>
    <span className="brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 34V18C5 9.7 11.7 3 20 3s15 6.7 15 15v16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M13 34V19a7 7 0 0 1 14 0v15" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M4 34h32" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><circle cx="20" cy="19" r="2.5" fill="var(--accent)"/></svg></span>
    <span className="brand-word">aangan<span>.</span></span>
  </Link>;
}

const navLinks = [
  { label: "Buy", href: "/search?category=buy_home" },
  { label: "Rent", href: "/search?category=rent_home" },
  { label: "PG & Co-living", href: "/search?category=rent_pg" },
  { label: "Commercial", href: "/search?category=rent_commercial" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, theme, toggleTheme } = useApp();
  const [locationOpen, setLocationOpen] = useState(false);
  const [city, setCity] = useState("Bengaluru");
  const isAdmin = pathname.startsWith("/admin");
  const isPropertyDetail = pathname.startsWith("/property/");
  const isAuth = ["/login", "/signup", "/setup", "/welcome"].includes(pathname);

  // Global Route Guard: prevent users who haven't completed onboarding from bypassing /setup
  useEffect(() => {
    if (!loading && user?.needsOnboarding) {
      const allowedPaths = ["/setup", "/login", "/signup", "/privacy"];
      if (!allowedPaths.includes(pathname)) {
        router.replace(`/setup?next=${encodeURIComponent(pathname)}`);
      }
    }
  }, [loading, user?.needsOnboarding, pathname, router]);

  if (isAdmin) return <>{children}</>;

  const isUserAdmin = !!user && user.roles.includes("admin");
  const isUserOwner = !!user && !isUserAdmin && user.roles.includes("owner");
  const isUserCustomer = !!user && !isUserOwner && !isUserAdmin;

  const currentNavLinks = isUserAdmin ? [
    { label: "Admin Workspace", href: "/admin" },
    { label: "Explore Spaces", href: "/search" },
  ] : isUserOwner ? [
    { label: "Owner Dashboard", href: "/owner" },
    { label: "Post a Property", href: "/post-property" },
    { label: "Explore Spaces", href: "/search" },
  ] : navLinks;

  const mobileTabs = isUserAdmin ? [
    { label: "Workspace", href: "/admin", Icon: ShieldCheck },
    { label: "Search", href: "/search", Icon: Search },
    { label: "Updates", href: "/notifications", Icon: Bell },
    { label: "Profile", href: "/profile", Icon: UserRound },
  ] : isUserOwner ? [
    { label: "Dashboard", href: "/owner", Icon: Home },
    { label: "Post", href: "/post-property", Icon: Plus },
    { label: "Search", href: "/search", Icon: Search },
    { label: "Updates", href: "/notifications", Icon: Bell },
    { label: "Profile", href: "/profile", Icon: UserRound },
  ] : [
    { label: "Home", href: "/", Icon: Home },
    { label: "Search", href: "/search", Icon: Search },
    { label: "Saved", href: "/saved", Icon: Heart },
    { label: "Inquiries", href: "/inquiries", Icon: ClipboardList },
    { label: "Profile", href: "/profile", Icon: UserRound },
  ];

  return <>
    <header className="site-header">
      <div className="nav-container">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">{currentNavLinks.map((link) => <Link key={link.label} href={link.href} className="nav-link">{link.label}</Link>)}</nav>
        <div className="header-actions">
          <div className="header-location-wrap">
            <button className="header-location" onClick={() => setLocationOpen(!locationOpen)} aria-label="Choose city"><MapPin size={16}/><span>{city}</span><ChevronDown size={14}/></button>
            {locationOpen && <div className="city-popover"><span className="popover-label">EXPLORE IN</span>{["Bengaluru", "Mumbai", "Pune", "Hyderabad", "Gurugram"].map((option) => <button key={option} onClick={() => { setCity(option); setLocationOpen(false); router.push(`/search?city=${encodeURIComponent(option)}`); }}><MapPin size={15}/>{option}</button>)}</div>}
          </div>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>{theme === "light" ? <Moon size={19} strokeWidth={1.8}/> : <Sun size={19} strokeWidth={1.8}/>}</button>
          {isUserCustomer && <Link href="/saved" className="icon-button header-icon-link" aria-label="Saved homes" title="Saved homes"><Heart size={19} strokeWidth={1.8}/></Link>}
          {user && <Link href="/notifications" className="icon-button header-icon-link" aria-label="Notifications"><Bell size={19} strokeWidth={1.8}/></Link>}
          <Link href={user ? "/profile" : "/login"} className="header-signin"><UserRound size={18} strokeWidth={1.8}/><span>{user ? user.name?.split(" ")[0] || "Profile" : "Log in"}</span></Link>
          {!user && <Link href="/signup" className="header-signup-link"><span>Sign up</span></Link>}
          {isUserAdmin ? (
            <Link href="/admin" className="header-list-button" style={{ background: "var(--foreground)", color: "var(--background)" }}><ShieldCheck size={18} strokeWidth={2.2}/><span>Workspace</span></Link>
          ) : isUserOwner ? (
            <Link href="/post-property" className="header-list-button"><Plus size={18} strokeWidth={2.2}/><span>Post property</span></Link>
          ) : !user ? (
            <Link href="/post-property" className="header-list-button"><Plus size={18} strokeWidth={2.2}/><span>List property</span></Link>
          ) : (
            <Link href="/inquiries" className="header-list-button" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}><ClipboardList size={18} strokeWidth={2}/><span>My Inquiries</span></Link>
          )}
        </div>
      </div>
    </header>
    <div className="site-content">{children}</div>
    {!isAuth && <footer className="site-footer"><div className="container footer-grid">
      <div className="footer-about"><Brand light/><p>A more thoughtful way to find your place. Real homes, verified details, and a team that puts your privacy first.</p><span className="footer-trust"><ShieldCheck size={16}/> Your home search, handled with care.</span></div>
      <div className="footer-col"><h4>Explore</h4><Link href="/search?category=buy_home">Homes for sale</Link><Link href="/search?category=rent_home">Homes for rent</Link><Link href="/search?category=rent_pg">PG & co-living</Link><Link href="/search?category=rent_commercial">Commercial</Link></div>
      <div className="footer-col"><h4>For you</h4>{isUserOwner ? <><Link href="/owner">Owner dashboard</Link><Link href="/post-property">List a property</Link></> : isUserAdmin ? <><Link href="/admin">Admin Workspace</Link><Link href="/admin/leads">Lead Inbox</Link></> : <><Link href="/saved">Saved homes</Link><Link href="/inquiries">My inquiries</Link></>}<Link href="/profile">My profile</Link></div>
      <div className="footer-col"><h4>Aangan</h4><Link href="/privacy">Privacy policy</Link><Link href="/welcome">How it works</Link><Link href="/admin">Team portal <ArrowUpRight size={13}/></Link><a href="mailto:hello@aangan.example">Get in touch</a></div>
    </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Aangan. Made for the place you call home.</span><span>Thoughtfully built for India <span className="footer-heart">♥</span></span></div></footer>}
    {!isPropertyDetail && !isAuth && (
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        {mobileTabs.map(({ label, href, Icon }) => <Link key={label} href={href} className={`tab-item ${pathname === href ? "active" : ""}`}><Icon size={21} strokeWidth={pathname === href ? 2.3 : 1.8}/><span>{label}</span></Link>)}
      </nav>
    )}
  </>;
}
