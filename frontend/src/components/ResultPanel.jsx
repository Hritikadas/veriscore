import {
  IconCheck,
  IconCopy,
  IconChip,
  IconShield,
  IconChevronDown,
  IconCube
} from "./icons.jsx";
import useCountUp from "./useCountUp.js";

export default function ResultPanel({ result, copied, onCopy }) {
  const approved = result.decision === "approved";
  const verified = result.verified === true;
  const success = result.success === true;

  const probability = result.probability * 100;
  const animated = useCountUp(probability, {
    delay: approved ? 320 : 100,
    duration: approved ? 900 : 600
  });

  return (
    <section
      className={`result-panel${approved ? "" : " rejected"}`}
      aria-live="polite"
    >
      <div className="result-inner">
        <div className="result-head">
          <span className="result-badge">
            <IconShield width={12} height={12} />
            {verified ? "Verified AI Decision" : "Decision Result"}
          </span>
        </div>

        <div className="result-main">
          <span className={`result-mark ${approved ? "success" : "error"}`}>
            {approved ? (
              <svg className="check-anim" viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l7.5 7.5L37 19" />
              </svg>
            ) : (
              <svg className="x-anim" viewBox="0 0 52 52" aria-hidden="true">
                <path d="M17 17l18 18M35 17L17 35" />
              </svg>
            )}
          </span>
          <span className="result-verdict">
            <span className="verdict-label">
              {approved ? "APPROVED" : "REJECTED"}
            </span>
            <span className="result-prob">
              Probability&nbsp;<strong>{animated.toFixed(2)}%</strong>
            </span>
          </span>
        </div>

        <div className="result-meta">
          <div className="meta-chip">
            <IconChip width={18} height={18} />
            <span>
              <span className="meta-chip-label">ZK Proof</span>
              <span className={`meta-chip-value ${success ? "ok" : "bad"}`}>
                {success ? "Generated ✓" : "Failed"}
              </span>
            </span>
          </div>
          <div className="meta-chip">
            <IconShield width={18} height={18} />
            <span>
              <span className="meta-chip-label">Cryptographic Verification</span>
              <span className={`meta-chip-value ${verified ? "ok" : "bad"}`}>
                {verified ? "Verified ✓" : "Not verified"}
              </span>
            </span>
          </div>
        </div>

        <div className="proof-block">
          <div className="proof-block-label">Proof ID</div>
          <div className="proof-row">
            <code className="proof-code" aria-label="Proof ID">
              {result.proofId}
            </code>
            <button
              type="button"
              className={`copy-btn${copied ? " copied" : ""}`}
              onClick={onCopy}
              aria-live="polite"
            >
              <IconCopy width={14} height={14} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <details className="result-details">
          <summary>
            <IconCube width={14} height={14} />
            View full proof response
            <IconChevronDown className="chev" />
          </summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      </div>
    </section>
  );
}