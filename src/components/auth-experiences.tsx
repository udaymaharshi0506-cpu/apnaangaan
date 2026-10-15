"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Home,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Mail,
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
                <label className="form-label">GMAIL / EMAIL ADDRESS</label>
                <div style={{ position: "relative", marginBottom: "16px" }}>
                  <Mail
                    size={18}
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted)",
                      pointerEvents: "none",
                    }}
                  />
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
                    style={{ paddingLeft: "42px" }}
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
                <label className="form-label">6-DIGIT VERIFICATION CODE</label>
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
// Onboarding step: collect name, optional email, and role.
// Shown after first-time OTP verify (needsOnboarding = true).
// ─────────────────────────────────────────────────────────────
export function SetupExperience({ next = "/" }: { next?: string }) {
  const { user, refreshUser, toast } = useApp();
  const router = useRouter();

  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState<"customer" | "owner">("customer");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!consent) {
      setError("Please agree to the privacy notice to continue.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name,
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
        <p>Just the essentials for a more personal, private experience.</p>

        <form onSubmit={(e) => void submit(e)}>
          <label className="form-label" htmlFor="setup-name">
            YOUR NAME
          </label>
          <input
            id="setup-name"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
            placeholder="What should we call you?"
          />

          <label className="form-label">I&apos;M HERE TO...</label>
          <div className="role-options">
            <button
              type="button"
              id="setup-role-customer"
              className={role === "customer" ? "selected" : ""}
              onClick={() => setRole("customer")}
            >
              <Home size={23} />
              <strong>Find a place</strong>
              <span>Buy, rent, or explore</span>
              <Check size={18} className="role-check" />
            </button>
            <button
              type="button"
              id="setup-role-owner"
              className={role === "owner" ? "selected" : ""}
              onClick={() => setRole("owner")}
            >
              <KeyRound size={23} />
              <strong>List a place</strong>
              <span>Share your property</span>
              <Check size={18} className="role-check" />
            </button>
          </div>

          <label className="consent-label">
            <input
              id="setup-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree to Aangan collecting and using my details to help with my
              property journey, as described in the{" "}
              <Link href="/privacy">Privacy Policy</Link>. I can delete my
              account at any time.
            </span>
          </label>

          {error && <div className="form-error">{error}</div>}

          <button
            id="setup-submit-btn"
            className="btn btn-primary btn-full"
            disabled={busy || !name.trim()}
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
