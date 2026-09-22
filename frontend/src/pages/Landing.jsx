import { useState } from "react";
import { IconCheck, IconSpark } from "../components/icons.jsx";
import RadialGlowButton from "../components/RadialGlowButton.jsx";
import "./Landing.css";

const TRUST = [
  "Privacy Preserving",
  "Verifiable AI",
  "Zero-Knowledge Proof",
  "Secure Verification"
];

export default function Landing({ onGetStarted }) {
  const [logoState, setLogoState] = useState("loading");
  const [isTransitioning, setIsTransitioning] = useState(false);

  function handleGetStarted() {
    if (isTransitioning) return;

    setIsTransitioning(true);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const transitionDuration = prefersReducedMotion ? 80 : 1950;

    window.setTimeout(onGetStarted, transitionDuration);
  }

  return (
    <div className="landing">
      {isTransitioning && (
        <div
          className="lnd-intro"
          role="status"
          aria-label="Opening AI verification"
        >
          <div className="lnd-intro-logo-wrap">
            <img
              className="lnd-intro-logo"
              src="/images/veriscore-logo.png"
              alt="Veriscore"
            />
          </div>
        </div>
      )}

      {/* ---------- one continuous full-screen hero ---------- */}
      {/* header overlays the hero: logo top-left only */}
      <header className="lnd-header">
        <a className="brand" href="#top" aria-label="Veriscore home">
          <span
            className={`brand-logo ${
              logoState === "error" ? "fallback-only" : ""
            }`}
          >
            {logoState !== "error" && (
              <img
                className="brand-img"
                src="/images/veriscore-logo.png"
                alt="Veriscore"
                onLoad={() => setLogoState("loaded")}
                onError={() => setLogoState("error")}
              />
            )}
            {logoState !== "loaded" && (
              <span className="brand-fallback" aria-hidden="true">
                <svg
                  className="brand-fallback-icon"
                  viewBox="0 0 64 64"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinejoin="round"
                >
                  <path d="M32 12l16 8v12c0 12-7 19-16 22-9-3-16-10-16-22V20l16-8z" />
                </svg>
                <span className="brand-fallback-text">Veriscore</span>
              </span>
            )}
          </span>
        </a>
      </header>

      {/* ---------- hero content ---------- */}
      <main className="lnd-hero" id="top">
        <div className="lnd-hero-copy-wrap">
          <div className="lnd-copy">
            <span className="lnd-eyebrow">
              <IconSpark width={14} height={14} className="icon" />
              Zero-Knowledge AI Verification
            </span>

            <p className="lnd-tagline">Private AI. Proven Trust.</p>

            <h1>
              <span className="hero-line hero-line-white">
                Verify AI Decisions.
              </span>
              <span className="hero-line hero-line-blue">
                Without Revealing
              </span>
              <span className="hero-line hero-line-blue">
                Private Data.
              </span>
            </h1>

            <p className="lnd-sub">
              Generate cryptographic proofs for AI decisions while keeping
              sensitive model inputs private.
            </p>

            <div className="lnd-cta-row">
              <RadialGlowButton onClick={handleGetStarted}>
                Try AI Verification
                <span className="lnd-btn-arrow" aria-hidden="true">
                  →
                </span>
              </RadialGlowButton>
            </div>

            <div className="lnd-trust">
              {TRUST.map((t) => (
                <span className="trust-item" key={t}>
                  <span className="tick" aria-hidden="true">
                    <IconCheck width={11} height={11} />
                  </span>
                  {t}
                </span>
              ))}
            </div>

            <p className="lnd-microline">
              Privacy-preserving AI verification powered by Zero-Knowledge Proofs
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}