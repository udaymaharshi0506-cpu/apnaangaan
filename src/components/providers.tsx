"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X } from "lucide-react";

export type SessionUser = { id: string; phone: string | null; email: string | null; name: string | null; city?: string | null; location?: string | null; role: string; roles: Array<"customer" | "owner" | "admin">; lastLogin?: string | null; createdAt?: string | null; consentAt: string | null; needsOnboarding: boolean };

export type NotificationItem = {
  id: string;
  userId: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export class ApiError extends Error {
  isNetworkError: boolean;
  status?: number;
  constructor(message: string, options: { isNetworkError?: boolean; status?: number } = {}) {
    super(message);
    this.name = "ApiError";
    this.isNetworkError = Boolean(options.isNetworkError);
    this.status = options.status;
  }
}

export function isNetworkDropError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}

export async function apiFetch<T = Record<string, unknown>>(url: string, options: RequestInit = {}, retry = true): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const isUpload = options.body instanceof FormData;
  const isSafeRetry = method === "GET" || method === "HEAD" || isUpload;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError(
      isUpload
        ? "You appear to be offline. Reconnect to upload your file and tap Retry."
        : "You appear to be offline. Check your internet connection and tap Retry — your form details are safe.",
      { isNetworkError: true }
    );
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = isUpload ? 45_000 : 25_000;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal || controller?.signal,
      credentials: "same-origin",
      headers: {
        ...(options.body && !isUpload ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    const timedOut = err instanceof Error && err.name === "AbortError";
    if (!timedOut && retry && isSafeRetry && (typeof navigator === "undefined" || navigator.onLine !== false)) {
      await new Promise((r) => setTimeout(r, 400));
      return apiFetch<T>(url, options, false);
    }
    throw new ApiError(
      timedOut
        ? isUpload
          ? "Upload timed out due to a slow or dropped connection. Please tap Retry."
          : "Request timed out due to a slow connection. Please tap Retry."
        : isUpload
        ? "Network connection dropped mid-upload. Please check your internet and tap Retry."
        : "Network connection interrupted. Please check your internet and tap Retry.",
      { isNetworkError: true }
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (response.status === 401 && retry && !url.includes("/auth/") && !url.includes("/admin/login") && !url.includes("/admin/2fa")) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" }).catch(() => null);
    if (refreshed?.ok) return apiFetch<T>(url, options, false);
  }

  if ([502, 503, 504].includes(response.status)) {
    if (retry && isSafeRetry) {
      await new Promise((r) => setTimeout(r, 400));
      return apiFetch<T>(url, options, false);
    }
    throw new ApiError(
      isUpload
        ? "Upload server temporarily unreachable. Please tap Retry."
        : "Server temporarily unreachable due to a network issue. Please tap Retry.",
      { isNetworkError: true, status: response.status }
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || "Something went wrong. Please try again.", {
      isNetworkError: false,
      status: response.status,
    });
  }
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
  unreadCount: number;
  recentNotifications: NotificationItem[];
  refreshNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider is missing");
  return context;
}

const AUTH_CHANNEL_NAME = "aangan-auth";
const LOGOUT_STORAGE_KEY = "aangan-logout-event";
const PROTECTED_PREFIXES = ["/admin", "/owner", "/post-property", "/saved", "/inquiries", "/notifications", "/profile", "/setup"] as const;

function isProtectedRoute(pathname: string | null | undefined): pathname is string {
  if (!pathname || pathname === "/admin/login") return false;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function clearClientAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.clear();
  } catch { /* ignore storage restrictions */ }
  try {
    // Preserve local listing drafts (aangan-property-draft-v2) so user data is never lost across sign-outs/glitches
    for (const key of ["aangan-recent", "aangan-onboarded"]) {
      localStorage.removeItem(key);
    }
  } catch { /* ignore storage restrictions */ }
  if (typeof document !== "undefined" && document.cookie) {
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0]?.trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    }
  }
}

function broadcastLogoutEvent() {
  if (typeof window === "undefined") return;
  const stamp = String(Date.now());
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
      channel.postMessage({ type: "logout", at: stamp });
      channel.close();
    }
  } catch { /* ignore BroadcastChannel failures */ }
  try {
    localStorage.setItem(LOGOUT_STORAGE_KEY, stamp);
    localStorage.removeItem(LOGOUT_STORAGE_KEY);
  } catch { /* ignore localStorage failures */ }
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
    } catch (err) {
      // Only set user to null on explicit 401 unauthenticated response; preserve user on network drop/timeout
      if (
        err instanceof Error &&
        (err.message.includes("401") ||
          err.message.toLowerCase().includes("unauthorized") ||
          err.message.toLowerCase().includes("session expired"))
      ) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
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

  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);

  const refreshFavorites = useCallback(async () => {
    if (!user) { setSavedIds(new Set()); return; }
    try {
      const data = await apiFetch<{ items: Array<{ id: string }> }>("/api/favorites");
      setSavedIds(new Set(data.items.map((item) => item.id)));
    } catch { setSavedIds(new Set()); }
  }, [user]);
  useEffect(() => { void refreshFavorites(); }, [refreshFavorites]);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      setRecentNotifications([]);
      return;
    }
    try {
      const data = await apiFetch<{ items: NotificationItem[]; unread: number }>("/api/notifications?page=1");
      if (typeof data.unread === "number") {
        setUnreadCount(data.unread);
      }
      if (Array.isArray(data.items)) {
        setRecentNotifications(data.items.slice(0, 6));
      }
    } catch {
      // Maintain state on network blip
    }
  }, [user]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  // Real-time polling & window focus listeners to ensure notifications update automatically
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      // Pause polling when browser tab is hidden to save mobile data, battery, and server capacity
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshNotifications();
    }, 30000);

    const onFocus = () => {
      void refreshNotifications();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, refreshNotifications]);

  // Refresh count on page transitions
  useEffect(() => {
    if (user) {
      void refreshNotifications();
    }
  }, [pathname, user, refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" });
      setUnreadCount(0);
      setRecentNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      toast("All caught up!");
    } catch (error) {
      toast("Couldn't update notifications", "error");
    }
  }, [toast]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
      setUnreadCount((c) => Math.max(0, c - 1));
      setRecentNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    } catch {
      // Ignore
    }
  }, []);

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

  const resetSignedOutState = useCallback(() => {
    setUser(null);
    setSavedIds(new Set());
    setUnreadCount(0);
    setRecentNotifications([]);
    clearClientAuthStorage();
  }, []);

  const redirectAfterSignOut = useCallback((currentPath: string | null | undefined) => {
    const target = currentPath?.startsWith("/admin") ? "/admin/login" : `/login?next=${encodeURIComponent(currentPath || "/")}`;
    window.location.replace(target);
  }, []);

  // BroadcastChannel + localStorage cross-tab logout listener
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRemoteLogout = () => {
      resetSignedOutState();
      if (isProtectedRoute(pathname)) {
        redirectAfterSignOut(pathname);
      } else {
        router.refresh();
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        channel.onmessage = (event) => {
          if (event.data?.type === "logout") handleRemoteLogout();
        };
      }
    } catch { /* ignore */ }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_STORAGE_KEY && event.newValue) {
        handleRemoteLogout();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [pathname, redirectAfterSignOut, resetSignedOutState, router]);

  // Re-verify session on bfcache restore or tab visibility without reloading & destroying form state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePageShow = (event: PageTransitionEvent) => {
      if (isProtectedRoute(pathname)) {
        if (event.persisted) {
          // BFCache restored this protected view (e.g. Back button pressed after logout)
          // Immediately re-validate with server to prevent viewing stale/cached private data
          fetch("/api/auth/me", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : { user: null }))
            .then((data) => {
              if (!data?.user) {
                clearClientAuthStorage();
                const target = pathname.startsWith("/admin") ? "/admin/login" : `/login?next=${encodeURIComponent(pathname)}`;
                window.location.replace(target);
              } else {
                setUser(data.user);
                if (pathname.startsWith("/admin") && !data.user.roles?.includes("admin")) {
                  window.location.replace("/");
                }
              }
            })
            .catch(() => {
              window.location.replace(pathname.startsWith("/admin") ? "/admin/login" : "/login");
            });
        } else {
          void refreshUser();
        }
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isProtectedRoute(pathname)) {
        void refreshUser();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, refreshUser]);

  // Redirect away from protected routes if client session becomes invalid or lacks required role
  useEffect(() => {
    if (loading || !isProtectedRoute(pathname)) return;
    if (!user) {
      redirectAfterSignOut(pathname);
      return;
    }
    if (pathname.startsWith("/admin") && (!user.roles.includes("admin") || user.role !== "admin")) {
      window.location.replace("/");
      return;
    }
    if ((pathname.startsWith("/owner") || pathname.startsWith("/post-property")) && !user.roles.includes("owner") && !user.roles.includes("admin")) {
      window.location.replace("/profile");
    }
  }, [loading, pathname, redirectAfterSignOut, user]);

  const logout = useCallback(async () => {
    const wasAdmin = pathname?.startsWith("/admin");
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    resetSignedOutState();
    broadcastLogoutEvent();
    window.location.replace(wasAdmin ? "/admin/login" : "/");
  }, [pathname, resetSignedOutState]);

  const value = useMemo(() => ({
    user,
    loading,
    refreshUser,
    logout,
    theme,
    toggleTheme,
    savedIds,
    toggleFavorite,
    refreshFavorites,
    toast,
    unreadCount,
    recentNotifications,
    refreshNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  }), [
    user,
    loading,
    refreshUser,
    logout,
    theme,
    toggleTheme,
    savedIds,
    toggleFavorite,
    refreshFavorites,
    toast,
    unreadCount,
    recentNotifications,
    refreshNotifications,
    markAllNotificationsRead,
    markNotificationRead,
  ]);
  return (
    <AppContext.Provider value={value}>
      {children}
      {notice && (
        <div className={`app-toast ${notice.kind}`} role="status">
          {notice.kind === "success" ? <CheckCircle2 size={19} /> : <Info size={19} />}
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
          <span className="toast-progress-bar" key={notice.message} />
        </div>
      )}
    </AppContext.Provider>
  );
}
