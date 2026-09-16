import { useEffect, useRef } from "react";
import { IconCheck, IconSpark } from "./icons.jsx";

const TRUST = ["AI Verified", "Privacy Preserving", "ZK Proof", "Blockchain Ready"];

export default function Hero() {
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch((e) => console.warn("[hero-video] autoplay blocked:", e));
    }
  }, []);

  return (
    <header className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
        <video
          ref={videoRef}
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          onError={(e) => console.warn("[hero-video] source error:", e.currentTarget.error)}
        >
          <source src="/videos/veriscore-bg.mp4" type="video/mp4" />
        </video>
        <div className="hero-video-overlay" aria-hidden="true" />
        <div className="hero-grid" />
        <div className="hero-blob one" />
        <div className="hero-blob two" />
      </div>

      <div className="hero-inner">
        <div className="hero-copy">
          <span className="hero-badge">
            <IconSpark width={13} height={13} className="icon" />
            ZERO-KNOWLEDGE AI VERIFICATION
          </span>

          <h1>
            Verify AI Decisions. <span className="accent">Without Revealing Private Data.</span>
          </h1>

          <p className="hero-sub">
            Veriscore generates cryptographic proofs for AI decisions while
            keeping sensitive model inputs private.
          </p>

          <a className="hero-cta btn-primary" href="#verify">
            Verify Loan Decision
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>

          <div className="trust-row">
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
    </header>
  );
}