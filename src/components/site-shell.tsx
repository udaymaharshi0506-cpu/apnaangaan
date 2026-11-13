"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Heart, Home, MapPin, Moon, Plus, Search, Sun, UserRound, ClipboardList, ArrowUpRight, ShieldCheck, ChevronDown, Check, CalendarDays, ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useApp } from "@/components/providers";

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

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, theme, toggleTheme, unreadCount, recentNotifications, markAllNotificationsRead, markNotificationRead } = useApp();
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [city, setCity] = useState("Bengaluru");
  const isAdmin = pathname.startsWith("/admin");
  const isPropertyDetail = pathname.startsWith("/property/");
  const isAuth = ["/login", "/signup", "/setup", "/welcome"].includes(pathname);

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

  // Close notifications popover on route change
  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname]);


  if (isAdmin) return <>{children}</>;

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
    <div className="site-content">{children}</div>
    {!isAuth && <footer className="site-footer"><div className="container footer-grid">
      <div className="footer-about"><Brand light/><p>A more thoughtful way to find your place. Real homes, verified details, and a team that puts your privacy first.</p><span className="footer-trust"><ShieldCheck size={16}/> Your home search, handled with care.</span></div>
      <div className="footer-col"><h4>Explore</h4><Link href="/search">All rental homes</Link><Link href="/search?bhk=1">1 BHK Rentals</Link><Link href="/search?bhk=2">2 BHK Rentals</Link><Link href="/search?bhk=3">3 BHK Rentals</Link><Link href="/search?q=Villa">Villas & Houses</Link></div>
      <div className="footer-col"><h4>For you</h4>{isUserOwner ? <><Link href="/owner">Owner dashboard</Link><Link href="/post-property">List a property</Link></> : isUserAdmin ? <><Link href="/admin">Admin Workspace</Link><Link href="/admin/leads">Lead Inbox</Link></> : <><Link href="/saved">Saved homes</Link><Link href="/inquiries">My inquiries</Link></>}<Link href="/profile">My profile</Link></div>
      <div className="footer-col"><h4>Apnaangaan</h4><Link href="/privacy">Privacy policy</Link><Link href="/welcome">How it works</Link><Link href="/admin">Team portal <ArrowUpRight size={13}/></Link><a href="mailto:hello@apnaangaan.in">Get in touch</a></div>
    </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Apnaangaan. Made for the place you call home.</span><span>Thoughtfully built for India <span className="footer-heart">♥</span></span></div></footer>}
    {!isPropertyDetail && !isAuth && (
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        {mobileTabs.map(({ label, href, Icon }) => {
          const hasBadge = href === "/notifications" && unreadCount > 0;
          return (
            <Link key={label} href={href} className={`tab-item ${pathname === href ? "active" : ""}`}>
              <span className="tab-icon-wrap" style={{ position: "relative", display: "inline-flex" }}>
                <Icon size={21} strokeWidth={pathname === href ? 2.3 : 1.8}/>
                {hasBadge && <span className="tab-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    )}
  </>;
}
