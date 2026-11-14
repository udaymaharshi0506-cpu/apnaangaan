"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Heart, Home, MapPin, Moon, Plus, Search, Sun, UserRound, ClipboardList, ArrowUpRight, ShieldCheck, ChevronDown, Check, CalendarDays, ArrowRight, Sparkles, ArrowUp, Building2, X } from "lucide-react";
import { useEffect, useState, useRef, Suspense, type ReactNode } from "react";
import { useApp } from "@/components/providers";
import { RouteProgress } from "@/components/route-progress";

function formatRelativeTime(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" aria-label="Apnaangaan home" className={`brand ${light ? "brand-light" : ""}`}>
    <span className="brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 34V18C5 9.7 11.7 3 20 3s15 6.7 15 15v16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M13 34V19a7 7 0 0 1 14 0v15" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><path d="M4 34h32" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"/><circle cx="20" cy="19" r="2.5" fill="var(--accent)"/></svg></span>
    <span className="brand-word">apnaangaan<span>.</span></span>
  </Link>;
}

const navLinks = [
  { label: "Rent a Home", href: "/search" },
  { label: "How It Works", href: "/privacy" },
];

function HeaderLocationPicker({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("Bengaluru");
  const [items, setItems] = useState<Array<{ name: string; count: number; type: string }>>([]);
  const [availableCities, setAvailableCities] = useState<Array<{ name: string; count: number }>>([
    { name: "Jaipur", count: 12 },
    { name: "Bengaluru", count: 4 },
    { name: "Mumbai", count: 2 },
    { name: "Gurugram", count: 1 },
    { name: "Pune", count: 1 },
    { name: "Hyderabad", count: 1 },
  ]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const loc = sp.get("location") || sp.get("city") || sp.get("q");
      if (loc) setSelectedLabel(loc);
    }
  }, [pathname]);

  useEffect(() => {
    let active = true;
    fetch(`/api/locations?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.items)) setItems(data.items);
        if (Array.isArray(data.availableCities) && data.availableCities.length > 0) {
          setAvailableCities(data.availableCities);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [open]);

  function handleSelect(loc: string) {
    const trimmed = loc.trim();
    if (trimmed) {
      setSelectedLabel(trimmed);
      setOpen(false);
      router.push(`/search?location=${encodeURIComponent(trimmed)}`);
    } else {
      setSelectedLabel("All Cities");
      setOpen(false);
      router.push("/search");
    }
  }

  return (
    <div className="header-location-wrap" ref={popoverRef}>
      <button
        type="button"
        className={`header-location ${open ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Choose location"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <MapPin size={16} />
        <span className="header-location-label">{selectedLabel}</span>
        <ChevronDown size={14} className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <>
          <div
            className="city-popover-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="city-popover" role="dialog" aria-label="Search rental location">
          <div className="city-popover-search">
            <Search size={15} className="city-popover-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSelect(query);
                }
              }}
              placeholder="Search city, locality, or pin code..."
              className="city-popover-input"
              autoComplete="off"
              aria-label="Search city, locality, or pin code"
            />
            {query && (
              <button
                type="button"
                className="city-popover-clear"
                onClick={() => setQuery("")}
                aria-label="Clear location input"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="city-popover-scroll">
            {query.trim().length > 0 ? (
              <>
                <button
                  type="button"
                  className="city-popover-action city-popover-custom"
                  onClick={() => handleSelect(query)}
                >
                  <Search size={14} />
                  <span>
                    Search in <strong>&ldquo;{query.trim()}&rdquo;</strong>
                  </span>
                  <ArrowRight size={13} className="ml-auto" />
                </button>

                {items.length > 0 ? (
                  <div className="city-popover-section">
                    <span className="popover-label">MATCHING LOCATIONS</span>
                    <div className="city-popover-list">
                      {items.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          className="city-popover-item"
                          onClick={() => handleSelect(item.name)}
                        >
                          <span className="city-popover-item-icon">
                            {item.type === "city" ? <Building2 size={14} /> : <MapPin size={14} />}
                          </span>
                          <span className="city-popover-item-name">{item.name}</span>
                          {item.count > 0 && (
                            <span className="city-popover-item-badge">
                              {item.count} {item.count === 1 ? "flat" : "flats"}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="city-popover-empty">
                    No active listings matching &ldquo;{query.trim()}&rdquo;. Press Enter or click above to search.
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="city-popover-action city-popover-all"
                  onClick={() => handleSelect("")}
                >
                  <Building2 size={14} />
                  <span>All Available Flats</span>
                  <ArrowRight size={13} className="ml-auto" />
                </button>

                <div className="city-popover-section">
                  <span className="popover-label">CITIES WITH LIVE HOMES</span>
                  <div className="city-popover-list">
                    {availableCities.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className="city-popover-item"
                        onClick={() => handleSelect(c.name)}
                      >
                        <span className="city-popover-item-icon">
                          <MapPin size={14} />
                        </span>
                        <span className="city-popover-item-name">{c.name}</span>
                        {c.count > 0 && (
                          <span className="city-popover-item-badge">
                            {c.count} {c.count === 1 ? "flat" : "flats"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="city-popover-section">
                  <span className="popover-label">POPULAR CITIES</span>
                  <div className="city-popover-chips">
                    {["Jaipur", "Bengaluru", "Mumbai", "Gurugram", "Pune", "Hyderabad"].map((pop) => (
                      <button
                        key={pop}
                        type="button"
                        className="city-popover-chip"
                        onClick={() => handleSelect(pop)}
                      >
                        {pop}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, theme, toggleTheme, unreadCount, recentNotifications, markAllNotificationsRead, markNotificationRead } = useApp();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const isAdmin = pathname.startsWith("/admin");
  const isPropertyDetail = pathname.startsWith("/property/");
  const isPostProperty = pathname.startsWith("/post-property");
  const isAuth = ["/login", "/signup", "/setup", "/welcome"].includes(pathname);
  const isFormOrAccountPage = isPostProperty || isAuth || pathname.startsWith("/profile");

  // Sticky header scroll listener & Back to top
  useEffect(() => {
    let ticking = false;
    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const y = window.scrollY;
          setIsScrolled(y > 20);
          setShowBackToTop(y > 380);
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close notifications popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [notificationsOpen]);

  // Prevent browser from restoring bottom scroll position on route changes or refreshes
  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Force instant scroll to top (0, 0) and close notifications on route change
  useEffect(() => {
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (typeof document !== "undefined") {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [pathname]);


  if (isAdmin) return <><Suspense fallback={null}><RouteProgress /></Suspense>{children}</>;

  const isUserAdmin = !!user && user.roles.includes("admin");
  const isUserOwner = !!user && !isUserAdmin && user.roles.includes("owner");
  const isUserCustomer = !!user && !isUserOwner && !isUserAdmin;

  const currentNavLinks = isUserAdmin ? [
    { label: "Admin Workspace", href: "/admin" },
    { label: "Rent a Home", href: "/search" },
  ] : isUserOwner ? [
    { label: "Owner Dashboard", href: "/owner" },
    { label: "Post a Rental", href: "/post-property" },
    { label: "Rent a Home", href: "/search" },
  ] : navLinks;

  const mobileTabs = [
    { label: "Home", href: "/", Icon: Home },
    { label: "Post", href: "/post-property", Icon: Plus },
    { label: "Search", href: "/search", Icon: Search },
    { label: "Updates", href: "/notifications", Icon: Bell },
    { label: "Profile", href: "/profile", Icon: UserRound },
  ];

  return <>
    <Suspense fallback={null}>
      <RouteProgress />
    </Suspense>
    <header className={`site-header ${isScrolled ? "scrolled" : ""}`}>
      <div className="nav-container">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {currentNavLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`nav-link ${pathname === link.href ? "active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <HeaderLocationPicker pathname={pathname} />
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>{theme === "light" ? <Moon size={19} strokeWidth={1.8}/> : <Sun size={19} strokeWidth={1.8}/>}</button>
          {isUserCustomer && <Link href="/saved" className="icon-button header-icon-link" aria-label="Saved homes" title="Saved homes"><Heart size={19} strokeWidth={1.8}/></Link>}
          {user && (
            <div className="header-notifications-wrap" ref={notifRef}>
              <button
                type="button"
                className={`icon-button bell-button ${notificationsOpen ? "active" : ""}`}
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
                aria-haspopup="dialog"
                aria-expanded={notificationsOpen}
                title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
              >
                <Bell size={19} strokeWidth={1.8} />
                {unreadCount > 0 && (
                  <span className="bell-badge" aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <>
                  <div
                    className="notifications-backdrop"
                    onClick={() => setNotificationsOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="notifications-popover" role="dialog" aria-label="Notifications preview">
                    <div className="notifications-popover-header">
                      <div className="popover-title-row">
                        <h4>Notifications</h4>
                        {unreadCount > 0 ? (
                          <span className="popover-unread-pill">{unreadCount} new</span>
                        ) : (
                          <span className="popover-all-read-pill">All caught up</span>
                        )}
                      </div>
                      <div className="popover-header-actions">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            className="mark-all-btn"
                            onClick={() => void markAllNotificationsRead()}
                            title="Mark all as read"
                          >
                            <Check size={13} strokeWidth={2.4} />
                            <span>Mark read</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="popover-close-btn"
                          onClick={() => setNotificationsOpen(false)}
                          aria-label="Close notifications panel"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                  <div className="notifications-popover-body">
                    {recentNotifications.length === 0 ? (
                      <div className="notifications-empty">
                        <Bell size={26} strokeWidth={1.5} className="empty-bell-icon" />
                        <p>No notifications yet</p>
                        <span>Updates on your inquiries, rental homes, and viewings will appear here.</span>
                      </div>
                    ) : (
                      <div className="notifications-items-list">
                        {recentNotifications.map((item) => {
                          const IconComp = item.type === "meeting" ? CalendarDays : item.type === "interest" ? Heart : item.type === "listing" ? Home : item.type === "manager_request" ? Sparkles : Bell;
                          return (
                            <Link
                              key={item.id}
                              href={item.link || "/notifications"}
                              className={`popover-notif-item ${item.isRead ? "read" : "unread"}`}
                              onClick={() => {
                                if (!item.isRead) void markNotificationRead(item.id);
                                setNotificationsOpen(false);
                              }}
                            >
                              <span className={`popover-notif-icon notif-type-${item.type}`}>
                                <IconComp size={15} />
                              </span>
                              <div className="popover-notif-content">
                                <p className="popover-notif-text">{item.message}</p>
                                <span className="popover-notif-time">{formatRelativeTime(item.createdAt)}</span>
                              </div>
                              {!item.isRead && <span className="popover-unread-dot" aria-label="Unread" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="notifications-popover-footer">
                    <Link
                      href="/notifications"
                      className="view-all-link"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      <span>View all updates</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </>
            )}
            </div>
          )}
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
    <div className="site-content page-transition-wrap" key={pathname}>{children}</div>
    {!isFormOrAccountPage && (
      <button
        type="button"
        className={`back-to-top ${showBackToTop ? "visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
        title="Scroll back to top"
      >
        <ArrowUp size={20} strokeWidth={2.4} />
      </button>
    )}
    {!isAuth && <footer className="site-footer"><div className="container footer-grid">
      <div className="footer-about"><Brand light/><p>A more thoughtful way to find your place. Real homes, verified details, and a team that puts your privacy first.</p><span className="footer-trust"><ShieldCheck size={16}/> Your home search, handled with care.</span></div>
      <div className="footer-col"><h4>Explore</h4><Link href="/search">All rental homes</Link><Link href="/search?bhk=1">1 BHK Rentals</Link><Link href="/search?bhk=2">2 BHK Rentals</Link><Link href="/search?bhk=3">3 BHK Rentals</Link><Link href="/search?q=Villa">Villas & Houses</Link></div>
      <div className="footer-col"><h4>For you</h4>{isUserOwner ? <><Link href="/owner">Owner dashboard</Link><Link href="/post-property">List a property</Link></> : isUserAdmin ? <><Link href="/admin">Admin Workspace</Link><Link href="/admin/leads">Lead Inbox</Link></> : <><Link href="/saved">Saved homes</Link><Link href="/inquiries">My inquiries</Link></>}<Link href="/profile">My profile</Link></div>
      <div className="footer-col"><h4>Apnaangaan</h4><Link href="/privacy">Privacy policy</Link><Link href="/welcome">How it works</Link><Link href="/admin">Team portal <ArrowUpRight size={13}/></Link><a href="mailto:hello@apnaangaan.in">Get in touch</a></div>
    </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Apnaangaan. Made for the place you call home.</span><span>Thoughtfully built for India <span className="footer-heart">♥</span></span></div></footer>}
    {!isPropertyDetail && !isAuth && (
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        {mobileTabs.map(({ label, href, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          const hasBadge = href === "/notifications" && unreadCount > 0;
          return (
            <Link
              key={label}
              href={href}
              className={`tab-item ${isActive ? "active" : ""}`}
              aria-label={label}
            >
              <span className="tab-icon-wrap">
                <Icon size={20} strokeWidth={1.75} />
                {hasBadge && (
                  <span className="tab-badge" aria-label={`${unreadCount} unread updates`}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="tab-label">{label}</span>
            </Link>
          );
        })}
      </nav>
    )}
  </>;
}
