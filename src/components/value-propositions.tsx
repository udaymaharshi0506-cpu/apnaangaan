"use client";

import { useState, useEffect, useRef, memo, useMemo } from "react";
import { Clock, TrendingDown, Shield, PhoneOff, CheckCircle2, BadgeCheck, X, Phone, UserCheck, KeyRound } from "lucide-react";

/* ─────────── 1. Flexible Stay Duration Switcher ─────────── */
const durations = [
  {
    months: 6,
    label: "6 Months",
    tagline: "Short-term flexibility",
    description: "Great for professionals on project work, students, or those testing a new area before committing long-term.",
    benefits: ["Zero long-term lock-in", "Ideal for career transitions", "Renew or relocate freely"],
    color: "#e8f1ed",
    accent: "#164f4c",
  },
  {
    months: 9,
    label: "9 Months",
    tagline: "Balanced & popular",
    description: "The sweet spot. Long enough to settle in, short enough to stay agile. Most home seekers prefer this tier.",
    benefits: ["Maximum price stability", "Popular with families", "Academic/fiscal year aligned"],
    color: "#fdf4e8",
    accent: "#b87333",
  },
  {
    months: 12,
    label: "12 Months",
    tagline: "Full-year commitment",
    description: "Settle in completely. Owners prefer annual agreements and you get the best negotiation terms with zero disruption.",
    benefits: ["Highest rental stability", "Priority owner preference", "Predictable yearly budget"],
    color: "#f0edfb",
    accent: "#6c4fc7",
  },
];

export const FlexibleStayWidget = memo(function FlexibleStayWidget() {
  const [active, setActive] = useState(1);
  const d = durations[active];

  return (
    <div className="vp-widget">
      <div className="vp-widget-head">
        <span className="vp-eyebrow">
          <Clock size={13} />
          FLEXIBLE STAYS
        </span>
        <h3>Choose your timeline, <em>on your terms.</em></h3>
        <p>Rent for 6, 9, or 12 months — no rigid lock-ins, no unnecessary pressure.</p>
      </div>

      <div className="vp-duration-pills">
        {durations.map((dur, i) => (
          <button
            key={dur.months}
            type="button"
            className={`vp-pill ${active === i ? "vp-pill-active" : ""}`}
            onClick={() => setActive(i)}
            style={active === i ? { background: dur.accent, borderColor: dur.accent, color: "#fff" } : {}}
          >
            {dur.label}
          </button>
        ))}
      </div>

      <div className="vp-duration-panel" style={{ background: d.color, borderColor: `${d.accent}22` }}>
        <div className="vp-duration-top">
          <div className="vp-duration-months" style={{ color: d.accent }}>
            <span className="vp-months-num">{d.months}</span>
            <span className="vp-months-label">months</span>
          </div>
          <div className="vp-duration-info">
            <strong className="vp-duration-tagline" style={{ color: d.accent }}>{d.tagline}</strong>
            <p className="vp-duration-desc">{d.description}</p>
          </div>
        </div>
        <div className="vp-duration-benefits">
          {d.benefits.map((b) => (
            <span key={b} className="vp-benefit-chip" style={{ background: `${d.accent}18`, color: d.accent }}>
              <CheckCircle2 size={12} />
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});

/* ─────────── 2. Brokerage Comparison Widget ─────────── */
function AnimatedBar({ value, max, color, animate }: { value: number; max: number; color: string; animate: boolean }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="vp-bar-track">
      <div
        className="vp-bar-fill"
        style={{
          width: animate ? `${pct}%` : "0%",
          background: color,
          transform: "translateZ(0)",
          transition: "width 0.85s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}

export const BrokerageWidget = memo(function BrokerageWidget() {
  const [role, setRole] = useState<"seeker" | "owner">("seeker");
  const [rent, setRent] = useState(25000);
  const [animate, setAnimate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fallback = setTimeout(() => setAnimate(true), 400);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setAnimate(true);
      return () => clearTimeout(fallback);
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setAnimate(true);
        clearTimeout(fallback);
        obs.disconnect();
      }
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => {
      clearTimeout(fallback);
      obs.disconnect();
    };
  }, []);

  // Strict calculations
  const traditional = rent; // Traditional brokers demand 1 full month's rent (100%)
  const seekerFee = useMemo(() => Math.round(rent * 0.50), [rent]); // 50% for Home Seeker
  const ownerFee = useMemo(() => Math.round(rent * 0.15), [rent]); // 15% for Property Owner

  const activeFee = role === "seeker" ? seekerFee : ownerFee;
  const activeSaving = traditional - activeFee;
  const activePctSaved = role === "seeker" ? "50%" : "85%";

  return (
    <div className="vp-widget" ref={ref}>
      <div className="vp-widget-head">
        <span className="vp-eyebrow">
          <TrendingDown size={13} />
          FAIR &amp; TRANSPARENT BROKERAGE
        </span>
        <h3>Pay less. Get <em>more.</em></h3>
        <p>Transparent fee model: 50% from Home Seeker · 15% from Property Owner. Zero hidden charges.</p>
      </div>

      {/* Role Switcher Pill */}
      <div className="vp-role-toggle" role="tablist" aria-label="Choose user role">
        <button
          type="button"
          role="tab"
          aria-selected={role === "seeker"}
          className={`vp-role-btn ${role === "seeker" ? "vp-role-active active" : ""}`}
          onClick={() => setRole("seeker")}
        >
          <UserCheck size={14} />
          <span>Home Seeker</span>
          <span className="vp-role-pct">50% fee</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === "owner"}
          className={`vp-role-btn ${role === "owner" ? "vp-role-active active" : ""}`}
          onClick={() => setRole("owner")}
        >
          <KeyRound size={14} />
          <span>Property Owner</span>
          <span className="vp-role-pct">15% fee</span>
        </button>
      </div>

      {/* Live Rent Slider Row */}
      <div className="vp-rent-slider-row">
        <div className="vp-slider-label">
          <span>Monthly Flat Rent</span>
          <strong className="vp-slider-amount">₹{rent.toLocaleString("en-IN")}/mo</strong>
        </div>
        <input
          type="range"
          min={5000}
          max={80000}
          step={1000}
          value={rent}
          onChange={(e) => setRent(Number(e.target.value))}
          className="vp-slider"
          aria-label="Monthly Rent Slider"
        />
        <div className="vp-slider-range">
          <span>₹5,000</span>
          <span>₹40,000</span>
          <span>₹80,000</span>
        </div>
        <div className="vp-preset-chips" aria-label="Quick rent presets">
          {[15000, 25000, 35000, 50000].map((val) => (
            <button
              key={val}
              type="button"
              className={`vp-preset-chip ${rent === val ? "active" : ""}`}
              onClick={() => setRent(val)}
            >
              ₹{(val / 1000)}k
            </button>
          ))}
        </div>
      </div>

      {/* Side-by-Side Comparison Box */}
      <div className="vp-compare-grid">
        {/* Traditional Brokerage Box */}
        <div className="vp-compare-col vp-compare-bad">
          <div className="vp-compare-label">
            <X size={14} />
            Traditional Broker (100%)
          </div>
          <div className="vp-compare-amount">₹{traditional.toLocaleString("en-IN")}</div>
          <div className="vp-compare-sub">
            {role === "seeker" ? "Demands 1 full month rent (100%)" : "Demands 1 full month from owner"}
          </div>
          <AnimatedBar value={traditional} max={traditional} color="#dc2626" animate={animate} />
          <div className="vp-compare-breakdown">
            <span>You pay: 100% full month rent</span>
            <span>Zero privacy protection</span>
          </div>
        </div>

        {/* Apna Aangan Box */}
        <div className="vp-compare-col vp-compare-good">
          <div className="vp-compare-label">
            <BadgeCheck size={14} />
            Apna Aangan ({role === "seeker" ? "Seeker 50%" : "Owner 15%"})
          </div>
          <div className="vp-compare-amount" style={{ color: "var(--brand-deep)" }}>
            ₹{activeFee.toLocaleString("en-IN")}
          </div>
          <div className="vp-compare-sub">
            {role === "seeker" ? "50% brokerage (zero advance cuts)" : "Only 15% nominal fee on lease closure"}
          </div>
          <AnimatedBar value={activeFee} max={traditional} color="var(--brand)" animate={animate} />
          <div className="vp-compare-breakdown">
            <span style={{ color: "var(--brand)" }}>
              {role === "seeker"
                ? `Seeker pays: 50% · ₹${seekerFee.toLocaleString("en-IN")}`
                : `Owner pays: strictly 15% · ₹${ownerFee.toLocaleString("en-IN")}`}
            </span>
            <span style={{ color: "var(--brand)" }}>Verified deal · Zero spam calls</span>
          </div>
        </div>
      </div>

      {/* Live Savings Highlight Banner */}
      <div className="vp-saving-banner">
        <span className="vp-saving-icon">🎉</span>
        <div className="vp-saving-copy">
          <strong>You save ₹{activeSaving.toLocaleString("en-IN")} ({activePctSaved} saved)</strong>
          <span> as a {role === "seeker" ? "Home Seeker" : "Property Owner"} vs typical 1-month brokerage</span>
        </div>
      </div>

      {/* Transparent Model Footer */}
      <div className="vp-breakdown-footer">
        <span className="vp-model-pill">Seeker: 50% (₹{seekerFee.toLocaleString("en-IN")})</span>
        <span className="vp-model-pill">Owner: 15% (₹{ownerFee.toLocaleString("en-IN")})</span>
      </div>
    </div>
  );
});

/* ─────────── 3. Privacy Shield Widget ─────────── */
const spamCalls = [
  { name: "Unknown Broker", num: "+91 98XX XXXXX", blocked: true },
  { name: "Lead Reseller", num: "+91 70XX XXXXX", blocked: true },
  { name: "Random Agent", num: "+91 63XX XXXXX", blocked: true },
];

export const PrivacyShieldWidget = memo(function PrivacyShieldWidget() {
  const [step, setStep] = useState(3);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let hasRun = false;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !hasRun) {
        hasRun = true;
        setStep(0);
        let i = 0;
        const t = setInterval(() => {
          i++;
          setStep(i);
          if (i >= spamCalls.length) clearInterval(t);
        }, 500);
        obs.disconnect();
      }
    }, { threshold: 0.05 });

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="vp-widget" ref={ref}>
      <div className="vp-widget-head">
        <span className="vp-eyebrow">
          <Shield size={13} />
          PRIVACY FIRST
        </span>
        <h3>Zero spam calls. <em>Always.</em></h3>
        <p>Your direct contact is never published or handed to brokers. We coordinate visits privately.</p>
      </div>

      <div className="vp-shield-visual">
        <div className="vp-shield-left">
          <div className="vp-shield-title">
            <PhoneOff size={15} />
            Calls blocked automatically
          </div>
          {spamCalls.map((c, i) => (
            <div
              key={c.name}
              className={`vp-spam-call ${step > i ? "vp-spam-blocked" : ""}`}
            >
              <div className="vp-spam-avatar">
                <Phone size={13} />
              </div>
              <div className="vp-spam-info">
                <strong>{c.name}</strong>
                <span>{c.num}</span>
              </div>
              <div className="vp-spam-status">
                {step > i ? <><X size={12} /> Blocked</> : <><Phone size={12} /> Calling</>}
              </div>
            </div>
          ))}
        </div>

        <div className="vp-shield-divider">
          <div className="vp-shield-icon-wrap">
            <Shield size={24} />
          </div>
          <div className="vp-shield-line" />
        </div>

        <div className="vp-shield-right">
          <div className="vp-shield-title" style={{ color: "var(--brand)" }}>
            <BadgeCheck size={15} />
            Only verified inquiries reach you
          </div>
          <div className={`vp-verified-inquiry ${step >= spamCalls.length ? "vp-verified-show" : ""}`}>
            <div className="vp-inquiry-header">
              <span className="vp-inquiry-badge">
                <BadgeCheck size={14} /> Verified Seeker Inquiry
              </span>
            </div>
            <div className="vp-inquiry-body">
              <strong>Apna Aangan Concierge</strong>
              <span>A verified family is requesting a weekend viewing. No number exchange required.</span>
            </div>
            <div className="vp-inquiry-footer">
              <CheckCircle2 size={12} /> ID Verified · Zero Lead Reselling
            </div>
          </div>
          <p className="vp-shield-note">Your personal number stays private. Forever.</p>
        </div>
      </div>
    </div>
  );
});

/* ─────────── Combined Section ─────────── */
export const ValuePropositions = memo(function ValuePropositions() {
  return (
    <section className="vp-section section-pad">
      <div className="container">
        <div className="vp-section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> WHY APNA AANGAN</span>
          <h2>Built differently. <em>For you.</em></h2>
          <p>Three core promises that set us apart from every traditional rental platform.</p>
        </div>
        <div className="vp-grid">
          <FlexibleStayWidget />
          <BrokerageWidget />
          <PrivacyShieldWidget />
        </div>
      </div>
    </section>
  );
});
