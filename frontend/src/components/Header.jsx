import { useState } from "react";

export default function Header() {
  const [logoState, setLogoState] = useState("loading");

  return (
    <header className="topbar">
      <div className="topbar-inner">
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

        <nav className="nav" aria-label="Sections">
          <a className="nav-link" href="#verify">
            AI Verification
          </a>
          <a className="nav-link" href="#privacy">
            Privacy
          </a>
          <a className="nav-link" href="#zk">
            ZK Proof
          </a>
          <a className="nav-link" href="#onchain">
            On-Chain
          </a>
        </nav>

        <div className="topbar-actions">
          <span className="health">
            <span className="health-dot" aria-hidden="true" />
            System Operational
          </span>
        </div>
      </div>
    </header>
  );
}