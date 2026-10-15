"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
  UserPlus,
  Mail,
} from "lucide-react";
import { apiFetch, useApp, type SessionUser } from "@/components/providers";

// ─────────────────────────────────────────────────────────
// SignupExperience
// Phone-OTP based registration. Creates a new account on
// first-time verify, then routes to /setup for profile
// completion. Existing users are transparently logged in.
// ─────────────────────────────────────────────────────────
export function SignupExperience({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const { refreshUser, toast } = useApp();

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const destination =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";

  // ── Step 1: request OTP ───────────────────────────────
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

  // ── Step 2: verify OTP, create/sign-in user ───────────
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
      // Always go to setup on signup so users fill in their profile
      router.push(
        `/setup?next=${encodeURIComponent(
          data.user.needsOnboarding ? destination : destination
        )}`
      );
      router.refresh();
      toast("Welcome to Aangan! Let's set up your profile.");
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
          <Link href="/login" className="auth-back">
            <ArrowLeft size={16} /> Already have an account? Log in
          </Link>

          <div className="auth-form-inner">
            <span className="auth-symbol">
              <UserPlus size={26} />
            </span>

            <span className="eyebrow">
              <span className="eyebrow-line" /> CREATE YOUR ACCOUNT
            </span>

            <h1>
              {step === "email" ? (
                <>
                  Your journey<br />
                  <em>begins here.</em>
                </>
              ) : (
                <>
                  One quick<br />
                  <em>verification.</em>
                </>
              )}
            </h1>

            <p>
              {step === "email"
                ? "Sign up with your Gmail or email address. We'll send a quick 6-digit verification code — no passwords, no spam."
                : `We sent a 6-digit code to ${email}. Enter it below to activate your account.`}
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
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email (e.g. name@gmail.com)"
                    required
                    autoComplete="email"
                    aria-label="Email address for signup"
                    id="signup-email"
                    className="form-input"
                    style={{ paddingLeft: "42px" }}
                  />
                </div>
                <button
                  id="signup-send-code-btn"
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
                  id="signup-otp-input"
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
                  id="signup-verify-btn"
                  className="btn btn-primary btn-full"
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Verifying…" : "Verify & create account"}{" "}
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
              By signing up, you agree to our{" "}
              <Link href="/privacy">Privacy Policy</Link>. Your number is never
              shared with any other user.
            </p>
          </div>
        </div>

        {/* ── Right: visual panel ─────────────────────── */}
        <div className="auth-image-side">
          <img
            src="https://images.pexels.com/photos/6899447/pexels-photo-6899447.jpeg?auto=compress&cs=tinysrgb&w=1400"
            alt="Bright modern living room"
          />
          <div className="auth-image-shade" />
          <div className="auth-image-copy">
            <span>
              <Sparkles size={16} /> EVERYTHING STARTS HERE
            </span>
            <h2>
              Find a space.<br />
              Make it<br />
              <em>yours.</em>
            </h2>
            <p>
              Verified listings. Zero spam calls.<br />
              Your privacy, always protected.
            </p>
          </div>

          {/* Floating trust badges */}
          <div className="auth-image-pill">
            <ShieldCheck size={19} /> Private by design
          </div>

          <div className="signup-trust-badges">
            <span className="signup-badge">
              <BadgeCheck size={15} /> Verified listings
            </span>
            <span className="signup-badge">
              <LockKeyhole size={15} /> No spam calls
            </span>
            <span className="signup-badge">
              <Check size={15} /> Free to join
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
