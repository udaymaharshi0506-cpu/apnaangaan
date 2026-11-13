"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Home,
  KeyRound,
  Loader2,
  LockKeyhole,
  Navigation,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Mail,
  MapPin,
} from "lucide-react";
import { apiFetch, useApp, type SessionUser } from "@/components/providers";
import { loadGoogleMapsScript, getPlaceSuggestions, reverseGeocode } from "@/lib/google-maps";
import { extractIndianPhoneDigits, normalizeWhitespace, parseIndianPhone } from "@/lib/input-validation";

// ─────────────────────────────────────────────────────────────
// LoginExperience
// Simple direct email login for registered users.
// Takes users straight to the home page without asking details again.
// ─────────────────────────────────────────────────────────────
export function LoginExperience({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const { refreshUser, toast } = useApp();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const submitLockRef = useRef(false);
  const [error, setError] = useState("");

  const destination =
    next.startsWith("/") && !next.startsWith("//") && next !== "/setup" && next !== "/login" ? next : "/";

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (busy || submitLockRef.current) return;
    setError("");
    const cleanEmail = normalizeWhitespace(email).toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    submitLockRef.current = true;
    setBusy(true);
    try {
      const data = await apiFetch<{ user: SessionUser; message?: string }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email: cleanEmail }),
        }
      );
      await refreshUser();
      const firstName = data.user?.name ? ` ${data.user.name.split(" ")[0]}` : "";
      toast(`Welcome back${firstName}!`);
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't log you in. Please check your connection and try again."
      );
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        {/* ── Left: form ─────────────────────────────── */}
        <div className="auth-form-side">
          <Link href="/" className="auth-back">
            <ArrowLeft size={16} /> Back to exploring
          </Link>

          <div className="auth-form-inner">
            <span className="auth-symbol">
              <KeyRound size={26} />
            </span>

            <span className="eyebrow">
              <span className="eyebrow-line" /> WELCOME BACK
            </span>

            <h1>
              Log in to<br />
              <em>your account.</em>
            </h1>

            <p>
              Enter your registered Gmail or email address to log in. We will take you straight to your account.
            </p>

            <form onSubmit={(e) => void handleLogin(e)}>
              <label className="form-label" htmlFor="login-email">GMAIL / EMAIL ADDRESS</label>
              <div className="auth-input-wrap">
                <Mail className="auth-input-icon" size={18} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email (e.g. name@gmail.com)"
                  required
                  autoComplete="email"
                  aria-label="Email address"
                  className="form-input"
                />
              </div>
              <button
                id="login-submit-btn"
                className="btn btn-primary btn-full"
                disabled={busy || !email.trim() || !email.includes("@")}
              >
                {busy ? "Logging in…" : "Log in"}{" "}
                <ArrowRight size={18} />
              </button>
            </form>

            {error && (
              <div className="form-error" role="alert" style={{ marginTop: "14px" }}>
                <span>{error}</span>
                {error.toLowerCase().includes("no account") && (
                  <div style={{ marginTop: "8px" }}>
                    <Link href={`/signup${destination !== "/" ? `?next=${encodeURIComponent(destination)}` : ""}`} className="btn btn-secondary btn-full" style={{ fontSize: "13px", padding: "8px 12px" }}>
                      Create your free account →
                    </Link>
                  </div>
                )}
              </div>
            )}

            <p className="auth-agreement">
              By continuing, you agree to our{" "}
              <Link href="/privacy">Privacy Policy</Link>. Your details are always private and protected.
            </p>
            <p className="auth-agreement">
              New here?{" "}
              <Link href={`/signup${destination !== "/" ? `?next=${encodeURIComponent(destination)}` : ""}`} className="auth-switch-link">
                Create your free account →
              </Link>
            </p>
          </div>
        </div>

        {/* ── Right: visual ──────────────────────────── */}
        <div className="auth-image-side">
          <img
            src="https://images.pexels.com/photos/7214171/pexels-photo-7214171.jpeg?auto=compress&cs=tinysrgb&w=1400"
            alt="Inviting modern living room"
          />
          <div className="auth-image-shade" />
          <div className="auth-image-copy">
            <span>
              <Sparkles size={16} /> A MORE THOUGHTFUL WAY HOME
            </span>
            <h2>
              Good things<br />
              happen when you<br />
              <em>feel at home.</em>
            </h2>
            <p>
              Verified places. Real peace of mind.<br />
              Everything else, we&apos;ll handle together.
            </p>
          </div>
          <div className="auth-image-pill">
            <ShieldCheck size={19} /> Private by design
          </div>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// SetupExperience
// Onboarding step: collect name, phone number, and role.
// Shown after first-time verify or when phone/name is missing.
// ─────────────────────────────────────────────────────────────
export function SetupExperience({ next = "/" }: { next?: string }) {
  const { user, refreshUser, toast } = useApp();
  const router = useRouter();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(
    user?.phone ? user.phone.replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10) : ""
  );
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [role, setRole] = useState<"customer" | "owner">("customer");
  const [location, setLocation] = useState(user?.location || user?.city || "");
  const [locationTouched, setLocationTouched] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [isGoogleActive, setIsGoogleActive] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [detectMessage, setDetectMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const setupLockRef = useRef(false);
  const [error, setError] = useState("");

  // Dynamically initialize Google Maps Places API script
  useEffect(() => {
    void loadGoogleMapsScript();
  }, []);

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
    if (user?.phone && !phone) setPhone(extractIndianPhoneDigits(user.phone));
    if ((user?.location || user?.city) && !location) setLocation(user.location || user.city || "");
  }, [user]);

  // Strict numeric-only digits (0-9)
  const cleanDigits = extractIndianPhoneDigits(phone);
  const cleanName = normalizeWhitespace(name);
  const cleanLocation = normalizeWhitespace(location);
  const isPhoneValid = parseIndianPhone(cleanDigits).valid;
  const isNameValid = cleanName.length >= 2;
  const isLocationValid = cleanLocation.length >= 2;
  const isFormValid = isNameValid && isPhoneValid && isLocationValid && consent;

  // Searchable location suggestions using Google Places API with instant fallbacks
  useEffect(() => {
    const term = location.trim();
    const fallbackCities = [
      "Bengaluru, Karnataka",
      "Mumbai, Maharashtra",
      "Delhi NCR",
      "Pune, Maharashtra",
      "Hyderabad, Telangana",
      "Gurugram, Haryana",
      "Noida, Uttar Pradesh",
      "Chennai, Tamil Nadu",
      "Kolkata, West Bengal",
      "Ahmedabad, Gujarat",
      "Jaipur, Rajasthan",
      "Chandigarh",
    ];

    if (!term) {
      setLocationSuggestions(fallbackCities.slice(0, 6));
      setIsGoogleActive(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await getPlaceSuggestions(term);
        if (res.suggestions.length > 0) {
          setLocationSuggestions(res.suggestions);
          setIsGoogleActive(res.isGoogle);
        } else {
          setLocationSuggestions(
            fallbackCities.filter((c) => c.toLowerCase().includes(term.toLowerCase()))
          );
          setIsGoogleActive(false);
        }
      } catch {
        setLocationSuggestions(
          fallbackCities.filter((c) => c.toLowerCase().includes(term.toLowerCase()))
        );
        setIsGoogleActive(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [location]);

  // Geolocation auto-detection with Google Geocoder & server reverse fallback
  async function handleDetectLocation() {
    setDetectMessage(null);
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setDetectMessage({ text: "Geolocation is not supported by your browser.", isError: true });
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const result = await reverseGeocode(latitude, longitude);
          if (result && result.location) {
            setLocation(result.location);
            setLocationTouched(true);
            setShowLocationSuggestions(false);
            setDetectMessage({
              text: `Detected: ${result.location}${result.isGoogle ? " (via Google Maps)" : ""}`,
              isError: false,
            });
            setDetectingLocation(false);
            return;
          }
        } catch (err) {
          console.warn("Reverse geocode lookup error:", err);
        }

        setDetectMessage({ text: "Could not detect city automatically. Please enter it manually.", isError: true });
        setDetectingLocation(false);
      },
      (geoErr) => {
        let msg = "Could not detect location. Please enter manually.";
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          msg = "Location permission denied. Please enter your location manually.";
        } else if (geoErr.code === geoErr.TIMEOUT) {
          msg = "Location request timed out. Please enter your location manually.";
        }
        setDetectMessage({ text: msg, isError: true });
        setDetectingLocation(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || setupLockRef.current) return;
    setHasAttemptedSubmit(true);
    setError("");

    if (!isNameValid) {
      setError("Please enter your full name (at least 2 characters, whitespace alone is not valid).");
      return;
    }

    const parsedPhone = parseIndianPhone(phone);
    if (!parsedPhone.valid) {
      setError(parsedPhone.error);
      return;
    }

    if (!isLocationValid) {
      setError("Please enter or select your target City / Location.");
      return;
    }

    if (!consent) {
      setError("Please agree to the privacy notice to continue.");
      return;
    }

    setupLockRef.current = true;
    setBusy(true);
    try {
      await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          email: user?.email || undefined,
          name: cleanName,
          phone: parsedPhone.e164,
          role,
          location: cleanLocation,
          city: cleanLocation,
          addOwnerRole: role === "owner",
          consent: true,
        }),
      });
      await refreshUser();
      const destination =
        next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.push(
        role === "owner" && destination === "/" ? "/owner" : destination
      );
      router.refresh();
      toast("You're all set. Welcome to Apnaangaan!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network connection dropped while saving your profile. Please tap Let's get started to retry."
      );
    } finally {
      setupLockRef.current = false;
      setBusy(false);
    }
  }

  // Real-time phone feedback
  let phoneFeedback: { message: string; type: "error" | "success" | "hint" } | null = null;
  if (cleanDigits.length > 0) {
    if (!/^[6-9]/.test(cleanDigits)) {
      phoneFeedback = {
        message: "Indian mobile numbers must start with 6, 7, 8, or 9.",
        type: "error",
      };
    } else if (cleanDigits.length < 10) {
      phoneFeedback = {
        message: `Please enter a valid 10-digit mobile number (${cleanDigits.length}/10 digits).`,
        type: "error",
      };
    } else if (isPhoneValid) {
      phoneFeedback = {
        message: "Valid 10-digit mobile number",
        type: "success",
      };
    } else {
      phoneFeedback = {
        message: "Please enter a valid 10-digit mobile number.",
        type: "error",
      };
    }
  } else if (phoneTouched) {
    phoneFeedback = {
      message: "Please enter your 10-digit mobile number.",
      type: "error",
    };
  }

  return (
    <main className="setup-page">
      <div className="setup-card">
        <span className="step-count">STEP 02 OF 02 · MAKE IT YOURS</span>
        <span className="setup-icon">
          <Sparkles size={27} />
        </span>
        <h1>
          Let&apos;s get to know <em>you.</em>
        </h1>
        <p>Just the essentials for a personal, verified, and secure experience.</p>

        <form onSubmit={(e) => void submit(e)}>
          {/* 1. Name */}
          <label className="form-label" htmlFor="setup-name">
            YOUR NAME <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            id="setup-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
            placeholder="e.g. Rahul Sharma"
          />

          {/* 2. Phone Number with strict Indian format validation & real-time blocking */}
          <label className="form-label" htmlFor="setup-phone" style={{ marginTop: "18px" }}>
            PHONE NUMBER (NUMBERS ONLY) <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <div
            className={`phone-field ${
              phoneFeedback?.type === "error" ? "has-error" : isPhoneValid ? "is-valid" : ""
            }`}
            style={{ marginBottom: "6px" }}
          >
            <span>+91</span>
            <input
              id="setup-phone"
              type="tel"
              value={cleanDigits}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                if (
                  [
                    "Backspace",
                    "Tab",
                    "Enter",
                    "ArrowLeft",
                    "ArrowRight",
                    "Delete",
                    "Home",
                    "End",
                  ].includes(e.key)
                ) {
                  return;
                }
                if (!/^\d$/.test(e.key)) {
                  e.preventDefault();
                  return;
                }
                const target = e.currentTarget;
                const hasSelection =
                  target.selectionStart !== null &&
                  target.selectionEnd !== null &&
                  target.selectionStart !== target.selectionEnd;
                if (!hasSelection && target.value.replace(/\D/g, "").length >= 10) {
                  e.preventDefault();
                }
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = extractIndianPhoneDigits(e.clipboardData.getData("text"));
                setPhone(pasted);
                setPhoneTouched(true);
              }}
              onInput={(e) => {
                const target = e.currentTarget;
                const stripped = extractIndianPhoneDigits(target.value);
                if (target.value !== stripped) {
                  target.value = stripped;
                }
                setPhone(stripped);
                setPhoneTouched(true);
              }}
              onChange={(e) => {
                const stripped = extractIndianPhoneDigits(e.target.value);
                setPhone(stripped);
                setPhoneTouched(true);
              }}
              onBlur={() => setPhoneTouched(true)}
              required
              placeholder="9876543210"
              autoComplete="tel"
              maxLength={10}
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
            />
          </div>

          {phoneFeedback ? (
            <div className={`field-feedback ${phoneFeedback.type}`}>
              {phoneFeedback.type === "error" && <AlertCircle size={14} />}
              {phoneFeedback.type === "success" && <CheckCircle2 size={14} />}
              <span>{phoneFeedback.message}</span>
            </div>
          ) : (
            <small style={{ display: "block", color: "var(--muted)", fontSize: "11px", marginBottom: "16px" }}>
              Required for contact &amp; scheduling viewings. 10 digits starting with 6, 7, 8, or 9. Never shared publicly.
            </small>
          )}

          {/* 3. Role selection */}
          <label className="form-label" style={{ marginTop: "18px" }}>
            I&apos;M HERE AS... <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <div className="role-options">
            <button
              type="button"
              id="setup-role-customer"
              className={role === "customer" ? "selected" : ""}
              onClick={() => setRole("customer")}
            >
              <Home size={23} />
              <strong>Home Seeker</strong>
              <span>Find &amp; rent a verified home</span>
              <Check size={18} className="role-check" />
            </button>
            <button
              type="button"
              id="setup-role-owner"
              className={role === "owner" ? "selected" : ""}
              onClick={() => setRole("owner")}
            >
              <KeyRound size={23} />
              <strong>Owner / Rent</strong>
              <span>List &amp; manage your property</span>
              <Check size={18} className="role-check" />
            </button>
          </div>

          {/* 4. Compulsory Location Field (Clean header action row + full width input + quick chips) */}
          <div className="location-header-row">
            <label className="form-label" htmlFor="setup-location">
              TARGET LOCATION / CITY <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <button
              type="button"
              id="detect-location-btn"
              className="detect-location-btn-header"
              onClick={() => void handleDetectLocation()}
              disabled={detectingLocation}
              title="Detect my current location automatically"
            >
              {detectingLocation ? (
                <>
                  <Loader2 size={13} className="spin" />
                  <span>Detecting...</span>
                </>
              ) : (
                <>
                  <Navigation size={13} />
                  <span>Detect location</span>
                </>
              )}
            </button>
          </div>

          <div className="location-input-group">
            <div className="location-field-inner">
              <MapPin className="auth-input-icon" size={18} />
              <input
                id="setup-location"
                className="form-input"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setLocationTouched(true);
                  setShowLocationSuggestions(true);
                }}
                onFocus={() => setShowLocationSuggestions(true)}
                onBlur={() => {
                  setLocationTouched(true);
                  setTimeout(() => setShowLocationSuggestions(false), 220);
                }}
                required
                minLength={2}
                placeholder="e.g. Bengaluru, Mumbai, Pune, Delhi NCR"
                autoComplete="off"
              />
              {location && (
                <button
                  type="button"
                  className="clear-location-btn"
                  onClick={() => {
                    setLocation("");
                    setLocationTouched(false);
                  }}
                  aria-label="Clear location"
                >
                  ×
                </button>
              )}
            </div>

            {showLocationSuggestions && locationSuggestions.length > 0 && (
              <div className="setup-location-suggestions">
                <div className="suggestions-header">
                  <span>SUGGESTED CITIES &amp; AREAS</span>
                  {isGoogleActive && <span className="google-powered-tag">Google Maps</span>}
                </div>
                {locationSuggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setLocation(item);
                      setLocationTouched(true);
                      setShowLocationSuggestions(false);
                    }}
                  >
                    <MapPin size={14} />
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Select City Chips for 1-tap ease */}
          <div className="location-quick-chips">
            <span className="chips-label">Popular:</span>
            {["Bengaluru", "Mumbai", "Delhi NCR", "Pune", "Hyderabad", "Gurugram"].map((cityName) => (
              <button
                key={cityName}
                type="button"
                className={`location-chip ${location.toLowerCase().includes(cityName.toLowerCase()) ? "active" : ""}`}
                onClick={() => {
                  setLocation(cityName);
                  setLocationTouched(true);
                  setShowLocationSuggestions(false);
                }}
              >
                {cityName}
              </button>
            ))}
          </div>

          {detectMessage && (
            <div className={`detect-status-note ${detectMessage.isError ? "error" : "success"}`}>
              {detectMessage.isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
              <span>{detectMessage.text}</span>
            </div>
          )}

          {(hasAttemptedSubmit || (locationTouched && location.length > 0)) && !isLocationValid ? (
            <div className="field-feedback error" style={{ marginTop: "6px" }}>
              <AlertCircle size={14} />
              <span>Please enter or select a valid city or location (at least 2 characters).</span>
            </div>
          ) : (
            <small style={{ display: "block", color: "var(--muted)", fontSize: "11px", marginTop: "6px", marginBottom: "16px" }}>
              Required so we know which city or area you are looking for or listing a home in.
            </small>
          )}

          {/* 5. Consent */}
          <label className="consent-label" style={{ marginTop: "16px" }}>
            <input
              id="setup-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>
              I agree to Apnaangaan collecting and using my details to help with my
              property journey, as described in the{" "}
              <Link href="/privacy">Privacy Policy</Link>. I can delete my
              account at any time.
            </span>
          </label>

          {error && <div className="form-error">{error}</div>}

          {/* 6. Submit button */}
          <button
            id="setup-submit-btn"
            className="btn btn-primary btn-full"
            disabled={busy || !isFormValid}
          >
            {busy ? "Saving…" : "Let's get started"} <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// WelcomeExperience
// Three-slide onboarding carousel shown after setup.
// ─────────────────────────────────────────────────────────────
const welcomeSlides = [
  {
    eyebrow: "01 / DISCOVER",
    title: "Find the place that feels right.",
    text: "Explore beautifully presented homes, PGs, and workspaces with details you can actually trust.",
    image:
      "https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg?auto=compress&cs=tinysrgb&w=1200",
    Icon: Home,
  },
  {
    eyebrow: "02 / TRUST",
    title: "Every good move starts with trust.",
    text: "Our team reviews listings before they go live, so you can spend less time second-guessing and more time imagining what's next.",
    image:
      "https://images.pexels.com/photos/31737842/pexels-photo-31737842.jpeg?auto=compress&cs=tinysrgb&w=1200",
    Icon: BadgeCheck,
  },
  {
    eyebrow: "03 / PRIVACY",
    title: "Your details stay yours. Always.",
    text: "Interested in a place? We'll make the connection and arrange the visit. No shared numbers, no surprise calls.",
    image:
      "https://images.pexels.com/photos/7018401/pexels-photo-7018401.jpeg?auto=compress&cs=tinysrgb&w=1200",
    Icon: LockKeyhole,
  },
];

export function WelcomeExperience() {
  const [index, setIndex] = useState(0);
  const slide = welcomeSlides[index]!;
  const router = useRouter();

  function finish() {
    localStorage.setItem("aangan-onboarded", "true");
    router.push("/search");
  }

  return (
    <main className="welcome-page">
      <div className="welcome-inner">
        <div className="welcome-photo">
          <img src={slide.image} alt="Welcoming property space" />
          <span className="welcome-photo-badge">
            <slide.Icon size={18} /> The Apnaangaan way
          </span>
        </div>
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> {slide.eyebrow}
          </span>
          <h1>{slide.title}</h1>
          <p>{slide.text}</p>
          <div className="welcome-dots">
            {welcomeSlides.map((_, dot) => (
              <button
                key={dot}
                onClick={() => setIndex(dot)}
                className={dot === index ? "active" : ""}
                aria-label={`Go to step ${dot + 1}`}
              />
            ))}
          </div>
          <div className="welcome-actions">
            <button
              id="welcome-next-btn"
              className="btn btn-primary"
              onClick={() => (index < 2 ? setIndex(index + 1) : finish())}
            >
              {index < 2 ? "Next" : "Start exploring"}{" "}
              <ArrowRight size={18} />
            </button>
            <button onClick={finish} className="auth-text-button">
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
