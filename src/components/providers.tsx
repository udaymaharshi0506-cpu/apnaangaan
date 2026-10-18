"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X } from "lucide-react";

export type SessionUser = { id: string; phone: string | null; email: string | null; name: string | null; role: string; roles: Array<"customer" | "owner" | "admin">; consentAt: string | null; needsOnboarding: boolean };

export async function apiFetch<T = Record<string, unknown>>(url: string, options: RequestInit = {}, retry = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    if (retry) {
      await new Promise((r) => setTimeout(r, 250));
      return apiFetch<T>(url, options, false);
    }
    throw new Error("Connection failed. Please check your network and try again.");
  }

  if (response.status === 401 && retry && !url.includes("/auth/") && !url.includes("/admin/login") && !url.includes("/admin/2fa")) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" }).catch(() => null);
    if (refreshed?.ok) return apiFetch<T>(url, options, false);
  }

  if ([502, 503, 504].includes(response.status) && retry) {
    await new Promise((r) => setTimeout(r, 300));
    return apiFetch<T>(url, options, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

type AppContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
  savedIds: Set<string>;
  toggleFavorite: (id: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
  toast: (message: string, kind?: "success" | "info" | "error") => void;
};

const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider is missing");
  return context;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ message: string; kind: "success" | "info" | "error" } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const toast = useCallback((message: string, kind: "success" | "info" | "error" = "success") => {
    setNotice({ message, kind });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: SessionUser | null }>("/api/auth/me");
      setUser(data.user);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshUser(); }, [refreshUser]);

  useEffect(() => {
    const stored = localStorage.getItem("aangan-theme");
    if (stored === "dark") { setTheme("dark"); document.documentElement.dataset.theme = "dark"; }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("aangan-theme", next);
      return next;
    });
  }, []);

  const refreshFavorites = useCallback(async () => {
    if (!user) { setSavedIds(new Set()); return; }
    try {
      const data = await apiFetch<{ items: Array<{ id: string }> }>("/api/favorites");
      setSavedIds(new Set(data.items.map((item) => item.id)));
    } catch { setSavedIds(new Set()); }
  }, [user]);
  useEffect(() => { void refreshFavorites(); }, [refreshFavorites]);

  const toggleFavorite = useCallback(async (id: string) => {
    if (!user) { router.push(`/login?next=${encodeURIComponent(pathname || "/")}`); return; }
    const isSaved = savedIds.has(id);
    setSavedIds((old) => { const next = new Set(old); isSaved ? next.delete(id) : next.add(id); return next; });
    try {
      await apiFetch(`/api/favorites/${id}`, { method: isSaved ? "DELETE" : "POST" });
      toast(isSaved ? "Removed from saved homes" : "Added to your saved homes");
    } catch (error) {
      setSavedIds((old) => { const next = new Set(old); isSaved ? next.add(id) : next.delete(id); return next; });
      toast(error instanceof Error ? error.message : "Couldn't update saved homes", "error");
    }
  }, [user, savedIds, router, pathname, toast]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setSavedIds(new Set());
    router.push("/");
    router.refresh();
    toast("You've been signed out", "info");
  }, [router, toast]);

  const value = useMemo(() => ({ user, loading, refreshUser, logout, theme, toggleTheme, savedIds, toggleFavorite, refreshFavorites, toast }), [user, loading, refreshUser, logout, theme, toggleTheme, savedIds, toggleFavorite, refreshFavorites, toast]);
  return <AppContext.Provider value={value}>{children}{notice && <div className={`app-toast ${notice.kind}`} role="status">{notice.kind === "success" ? <CheckCircle2 size={19} /> : <Info size={19} />}<span>{notice.message}</span><button aria-label="Dismiss" onClick={() => setNotice(null)}><X size={17} /></button></div>}</AppContext.Provider>;
}
