"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
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

// ─────────────────────────────────────────────────────────────
// LoginExperience
// Phone OTP login flow. Transparently creates accounts for
// first-time users (backend upserts on verify). Links to the
// /signup page for users who prefer the signup-oriented flow.
// ─────────────────────────────────────────────────────────────
export function LoginExperience({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const { refreshUser, toast } = useApp();

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const destination =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch<{ message: string; code?: string }>(
        "/api/auth/otp/request",
        {
          method: "POST",
          body: JSON.stringify({ email: cleanEmail }),
        }
      );
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const data = await apiFetch<{ user: SessionUser }>(
        "/api/auth/otp/verify",
        {
          method: "POST",
          body: JSON.stringify({ email: cleanEmail, code }),
        }
      );
      await refreshUser();
      router.push(
        data.user.needsOnboarding
          ? `/setup?next=${encodeURIComponent(destination)}`
          : destination
      );
      router.refresh();
      toast("Welcome to Aangan!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't verify your code."
      );
    } finally {
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
              {step === "email" ? (
                <>
                  Log in to<br />
                  <em>your account.</em>
                </>
              ) : (
                <>
                  Just one more<br />
                  <em>little step.</em>
                </>
              )}
            </h1>

            <p>
              {step === "email"
                ? "Enter your Gmail or email address to log in. We'll send a quick verification code — no passwords needed."
                : `Enter the 6-digit code sent to ${email}. It keeps your account safe and simple.`}
            </p>

            {/* ── Email form ──────────────────────────── */}
            {step === "email" ? (
              <form onSubmit={(e) => void requestCode(e)}>
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
                  id="login-send-code-btn"
                  className="btn btn-primary btn-full"
                  disabled={busy || !email.trim() || !email.includes("@")}
                >
                  {busy ? "Sending code…" : "Continue with email"}{" "}
                  <ArrowRight size={18} />
                </button>
              </form>
            ) : (
              /* ── OTP form ──────────────────────────── */
              <form onSubmit={(e) => void verifyCode(e)}>
                <label className="form-label" htmlFor="login-otp-input">6-DIGIT VERIFICATION CODE</label>
                <div className="auth-input-wrap">
                  <input
                    id="login-otp-input"
                    className="otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="• • • • • •"
                    autoFocus
                    required
                    aria-label="6-digit verification code"
                  />
                </div>
                <button
                  id="login-verify-btn"
                  className="btn btn-primary btn-full"
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Verifying…" : "Verify & continue"}{" "}
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                >
                  Use a different email address
                </button>
              </form>
            )}

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <p className="auth-agreement">
              By continuing, you agree to our{" "}
              <Link href="/privacy">Privacy Policy</Link>. Your number is never
              shared with another user.
            </p>
            <p className="auth-agreement">
              New here?{" "}
              <Link href="/signup" className="auth-switch-link">
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
              Everything else, we'll handle together.
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
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [detectMessage, setDetectMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
    if (user?.phone && !phone) setPhone(user.phone.replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10));
    if ((user?.location || user?.city) && !location) setLocation(user.location || user.city || "");
  }, [user]);

  // Strict numeric-only digits (0-9)
  const cleanDigits = phone.replace(/\D/g, "").slice(0, 10);
  const isPhoneValid = /^[6-9]\d{9}$/.test(cleanDigits);
  const isNameValid = name.trim().length >= 2;
  const isLocationValid = location.trim().length >= 2;
  const isFormValid = isNameValid && isPhoneValid && isLocationValid && consent;

  // Searchable location suggestions
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

    const timer = setTimeout(() => {
      fetch(`/api/locations?q=${encodeURIComponent(term)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            setLocationSuggestions(data.suggestions);
          } else {
            setLocationSuggestions(
              fallbackCities.filter((c) => c.toLowerCase().includes(term.toLowerCase()))
            );
          }
        })
        .catch(() => {
          setLocationSuggestions(
            fallbackCities.filter((c) => c.toLowerCase().includes(term.toLowerCase()))
          );
        });
    }, 150);

    return () => clearTimeout(timer);
  }, [location]);

  // Geolocation auto-detection
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
          const res = await fetch(`/api/locations/reverse?lat=${latitude}&lon=${longitude}`);
          if (res.ok) {
            const data = await res.json();
            if (data.location) {
              setLocation(data.location);
              setLocationTouched(true);
              setShowLocationSuggestions(false);
              setDetectMessage({ text: `Detected: ${data.location}`, isError: false });
              setDetectingLocation(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Reverse geocode server lookup failed:", err);
        }

        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (res.ok) {
            const data = await res.json();
            const locality = data.locality || data.principalSubdivision;
            const city = data.city || data.principalSubdivision;
            const detected = [locality, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
            if (detected) {
              setLocation(detected);
              setLocationTouched(true);
              setShowLocationSuggestions(false);
              setDetectMessage({ text: `Detected: ${detected}`, isError: false });
              setDetectingLocation(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Client reverse geocode failed:", err);
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
    setError("");

    if (!isNameValid) {
      setError("Please enter your full name.");
      return;
    }

    if (!isPhoneValid) {
      setError("Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
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

    setBusy(true);
    try {
      await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          phone: `+91${cleanDigits}`,
          role,
          location: location.trim(),
          city: location.trim(),
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
      toast("You're all set. Welcome to Aangan!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save your profile."
      );
    } finally {
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
                const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 10);
                setPhone(pasted);
                setPhoneTouched(true);
              }}
              onInput={(e) => {
                const target = e.currentTarget;
                const stripped = target.value.replace(/\D/g, "").slice(0, 10);
                if (target.value !== stripped) {
                  target.value = stripped;
                }
                setPhone(stripped);
                setPhoneTouched(true);
              }}
              onChange={(e) => {
                const stripped = e.target.value.replace(/\D/g, "").slice(0, 10);
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
              <span>Find, rent, or buy a space</span>
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

          {/* 4. Compulsory Location Field (right below Role selection) */}
          <label className="form-label" htmlFor="setup-location" style={{ marginTop: "20px" }}>
            TARGET LOCATION / CITY <span style={{ color: "#dc2626" }}>*</span>
          </label>
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
                  setTimeout(() => setShowLocationSuggestions(false), 200);
                }}
                required
                minLength={2}
                placeholder="e.g. Bengaluru, Mumbai, Pune, Delhi NCR"
                autoComplete="address-level2"
              />
              <button
                type="button"
                id="detect-location-btn"
                className="detect-location-btn"
                onClick={() => void handleDetectLocation()}
                disabled={detectingLocation}
                title="Detect my current location automatically"
              >
                {detectingLocation ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <Navigation size={14} />
                    <span>Detect location</span>
                  </>
                )}
              </button>
            </div>

            {showLocationSuggestions && locationSuggestions.length > 0 && (
              <div className="setup-location-suggestions">
                <span
                  style={{
                    display: "block",
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "1px",
                    color: "var(--muted)",
                    padding: "6px 10px",
                  }}
                >
                  SUGGESTED CITIES &amp; AREAS
                </span>
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

          {detectMessage && (
            <div className={`detect-status-note ${detectMessage.isError ? "error" : "success"}`}>
              {detectMessage.isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
              <span>{detectMessage.text}</span>
            </div>
          )}

          {locationTouched && !isLocationValid ? (
            <div className="field-feedback error" style={{ marginTop: "4px" }}>
              <AlertCircle size={14} />
              <span>Please enter or select a valid city or location (at least 2 characters).</span>
            </div>
          ) : (
            <small style={{ display: "block", color: "var(--muted)", fontSize: "11px", marginBottom: "16px" }}>
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
              I agree to Aangan collecting and using my details to help with my
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
            <slide.Icon size={18} /> The Aangan way
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
