import {
  IconServer,
  IconCube,
  IconShield,
  IconCheck,
  IconChip
} from "./icons.jsx";
import useReveal from "./useReveal.js";

const NODES = [
  { t: "SERVER", tag: "ezkl.verify", icon: IconServer, tone: "n1" },
  { t: "ZK PROOF", tag: "23.0.5 · bn254", icon: IconCube, tone: "n2" },
  { t: "CLIENT VERIFIER", tag: "Solidity", icon: IconShield, tone: "n3" },
  { t: "EVM", tag: "in-memory", icon: IconChip, tone: "n4" },
  { t: "VERIFIED", tag: "true", icon: IconCheck, tone: "n6" }
];

export default function ClientVerifyPanel() {
  const ref = useReveal();

  return (
    <section className="section reveal" ref={ref} id="trustless">
      <div className="section-head">
        <span className="eyebrow">Trustless</span>
        <h2>Trustless Verification</h2>
        <p>Verify the proof without trusting the prediction server.</p>
      </div>

      <div className="card arch-card">
        <div className="pipe" aria-label="Trustless verification pipeline">
          {NODES.map((n, i) => {
            const Icon = n.icon;
            return (
              <span key={n.t} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && (
                  <span className="pipe-arrow" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 12h15M13 6l6 6-6 6" />
                    </svg>
                  </span>
                )}
                <span className={`pipe-node ${n.tone}`}>
                  <span className="node-icon">
                    <Icon width={17} height={17} />
                  </span>
                  <span>
                    <span className="node-title">{n.t}</span>
                    <span className="node-tag">{n.tag}</span>
                  </span>
                </span>
              </span>
            );
          })}
        </div>

        <div className="mini-cards">
          <div className="mini-card">
            <h4>
              <IconServer width={15} height={15} /> Server-side Verification
            </h4>
            <p>
              <code>ezkl.verify</code> runs against the verifying key for every
              proof before it is returned.
            </p>
          </div>
          <div className="mini-card">
            <h4>
              <IconShield width={15} height={15} /> Client-side Verification
            </h4>
            <p>
              Version-matched Solidity verifier in an in-memory EVM —
              <code> CLIENT_SIDE_EVM_VERIFY = true</code>.
            </p>
          </div>
          <div className="mini-card">
            <h4>
              <IconChip width={15} height={15} /> Quantum Readiness
            </h4>
            <p>
              No GPU MSM on host; Q8.8 fallback is decision-consistent but not
              ZK-provable (2×14-bit limbs).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}