"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, TrendingDown, Shield, PhoneOff, CheckCircle2, ArrowRight, IndianRupee, Percent, Phone, X, BadgeCheck } from "lucide-react";

/* ─────────── 1. Flexible Stay Duration Switcher ─────────── */
const durations = [
  {
    months: 6,
    label: "6 Months",
    tagline: "Short-term flexibility",
    description: "Great for professionals on project-based work, students, or those exploring a new city before committing.",
    benefits: ["No long-term lock-in", "Ideal for transitions", "Renew or move freely"],
    color: "#e8f1ed",
    accent: "#164f4c",
  },
  {
    months: 9,
    label: "9 Months",
    tagline: "Balanced & popular",
    description: "The sweet spot. Long enough to settle in, short enough to stay flexible. Most home seekers prefer this.",
    benefits: ["Best value & stability", "Popular with families", "Academic year aligned"],
    color: "#fdf4e8",
    accent: "#b87333",
  },
  {
    months: 12,
    label: "12 Months",
    tagline: "Full-year commitment",
    description: "Settle in properly. Owners love the certainty and you get the most stable, uninterrupted living experience.",
    benefits: ["Maximum stability", "Preferred by owners", "Best negotiation power"],
    color: "#f0edfb",
    accent: "#6c4fc7",
  },
];

export function FlexibleStayWidget() {
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
        <p>Rent for 6, 9, or 12 months — no rigid annual lock-ins, no pressure.</p>
      </div>

      <div className="vp-duration-pills">
        {durations.map((dur, i) => (
          <button
            key={dur.months}
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
          <div>
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
}

/* ─────────── 2. Brokerage Comparison Widget ─────────── */
function AnimatedBar({ value, max, color, animate }: { value: number; max: number; color: string; animate: boolean }) {
  const pct = (value / max) * 100;
  return (
    <div className="vp-bar-track">
      <div
        className="vp-bar-fill"
        style={{
          width: animate ? `${pct}%` : "0%",
          background: color,
          transition: "width 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}

export function BrokerageWidget() {
  const [rent, setRent] = useState(20000);
  const [animate, setAnimate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setAnimate(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const traditional = rent; // 1 month full brokerage
  const seekerFee = Math.round(rent * 0.5);
  const ownerFee = Math.round(rent * 0.15);
  const totalApna = seekerFee + ownerFee;
  const saving = traditional - seekerFee;

  return (
    <div className="vp-widget" ref={ref}>
      <div className="vp-widget-head">
        <span className="vp-eyebrow">
          <TrendingDown size={13} />
          FAIR BROKERAGE
        </span>
        <h3>Pay less. Get <em>more.</em></h3>
        <p>See exactly how much you save with Apna Aangan's transparent, shared fee model.</p>
      </div>

      <div className="vp-rent-slider-row">
        <label className="vp-slider-label">Monthly Rent: <strong>₹{rent.toLocaleString("en-IN")}</strong></label>
        <input
          type="range"
          min={5000}
          max={80000}
          step={1000}
          value={rent}
          onChange={(e) => setRent(Number(e.target.value))}
          className="vp-slider"
        />
        <div className="vp-slider-range"><span>₹5K</span><span>₹80K</span></div>
      </div>

      <div className="vp-compare-grid">
        <div className="vp-compare-col vp-compare-bad">
          <div className="vp-compare-label">
            <X size={14} />
            Traditional
          </div>
          <div className="vp-compare-amount">₹{traditional.toLocaleString("en-IN")}</div>
          <div className="vp-compare-sub">1 month rent from seeker</div>
          <AnimatedBar value={traditional} max={traditional} color="#dc2626" animate={animate} />
          <div className="vp-compare-breakdown">
            <span>Seeker pays 100%</span>
            <span>Owner pays 0%</span>
          </div>
        </div>

        <div className="vp-compare-col vp-compare-good">
          <div className="vp-compare-label">
            <BadgeCheck size={14} />
            Apna Aangan
          </div>
          <div className="vp-compare-amount" style={{ color: "var(--brand-deep)" }}>₹{seekerFee.toLocaleString("en-IN")}</div>
          <div className="vp-compare-sub">50% from seeker only</div>
          <AnimatedBar value={seekerFee} max={traditional} color="var(--brand)" animate={animate} />
          <div className="vp-compare-breakdown">
            <span style={{ color: "var(--brand)" }}>Seeker: 50% · ₹{seekerFee.toLocaleString("en-IN")}</span>
            <span style={{ color: "var(--brand)" }}>Owner: 15% · ₹{ownerFee.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      <div className="vp-saving-banner">
        <span className="vp-saving-icon">🎉</span>
        <div>
          <strong>You save ₹{saving.toLocaleString("en-IN")}</strong>
          <span> on brokerage vs traditional agents</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────── 3. Privacy Shield Widget ─────────── */
const spamCalls = [
  { name: "Unknown Broker", num: "+91 98XX XXXXX", blocked: true },
  { name: "Lead Reseller", num: "+91 70XX XXXXX", blocked: true },
  { name: "Random Agent", num: "+91 63XX XXXXX", blocked: true },
];

export function PrivacyShieldWidget() {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let i = 0;
        const t = setInterval(() => {
          i++;
          setStep(i);
          if (i >= spamCalls.length + 1) clearInterval(t);
        }, 600);
        obs.disconnect();
      }
    }, { threshold: 0.4 });
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
        <p>Your number is never shared with brokers, agents, or anyone else. We handle the connection — privately.</p>
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
              style={{ transitionDelay: `${i * 0.1}s` }}
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
            <Shield size={28} />
          </div>
          <div className="vp-shield-line" />
        </div>

        <div className="vp-shield-right">
          <div className="vp-shield-title" style={{ color: "var(--brand)" }}>
            <BadgeCheck size={15} />
            Only verified reach you
          </div>
          <div className={`vp-verified-inquiry ${step >= spamCalls.length ? "vp-verified-show" : ""}`}>
            <div className="vp-inquiry-header">
              <span className="vp-inquiry-badge">
                <BadgeCheck size={14} /> Verified Inquiry
              </span>
            </div>
            <div className="vp-inquiry-body">
              <strong>Apna Aangan Team</strong>
              <span>A verified home seeker is interested in your property. No contact exchange needed — we handle it.</span>
            </div>
            <div className="vp-inquiry-footer">
              <CheckCircle2 size={12} /> Identity verified · No spam
            </div>
          </div>
          <p className="vp-shield-note">Your number stays private. Forever.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Combined Section ─────────── */
export function ValuePropositions() {
  return (
    <section className="vp-section section-pad">
      <div className="container">
        <div className="vp-section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> WHY APNA AANGAN</span>
          <h2>Built differently. <em>For you.</em></h2>
          <p>Three things that set us apart from every other rental platform.</p>
        </div>
        <div className="vp-grid">
          <FlexibleStayWidget />
          <BrokerageWidget />
          <PrivacyShieldWidget />
        </div>
      </div>
    </section>
  );
}

