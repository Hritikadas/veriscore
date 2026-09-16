import { useState } from "react";
import { IconCheck, IconSpark } from "./icons.jsx";
import "./Landing.css";

const TRUST = [
  "Privacy Preserving",
  "Verifiable AI",
  "Zero-Knowledge Proof",
  "Secure Verification"
];

export default function Landing({ onGetStarted }) {
  const [logoState, setLogoState] = useState("loading");

  return (
    <div className="landing">
      {/* ---------- minimal header ---------- */}
      <header className="lnd-header">
        <div className="lnd-header-inner">
          <a className="brand" href="#top" aria-label="Veriscore home">
            <span
              className={`brand-logo ${
                logoState === "error" ? "fallback-only" : ""
              }`}
            >
              {logoState !== "error" && (
                <img
                  className="brand-img"
                  src="/veriscore-logo.png"
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
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <main className="lnd-hero" id="top">
        <div className="lnd-hero-copy-wrap">
          <div className="lnd-copy">
            <span className="lnd-eyebrow">
              <IconSpark width={14} height={14} className="icon" />
              Zero-Knowledge AI Verification
            </span>

            <p className="lnd-tagline">Private AI. Proven Trust.</p>

            <h1>
              Verify AI Decisions.
              <br />
              <span className="accent">
                Without Revealing
                <br />
                Private Data.
              </span>
            </h1>

            <p className="lnd-sub">
              Generate cryptographic proofs for AI decisions while keeping
              sensitive model inputs private.
            </p>

            <div className="lnd-cta-row">
              <button
                type="button"
                className="lnd-btn lnd-btn-lg"
                onClick={onGetStarted}
              >
                Get Started
                <span className="lnd-btn-arrow" aria-hidden="true">
                  →
                </span>
              </button>
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
          </div>
        </div>
      </main>
    </div>
  );
}