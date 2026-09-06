import {
  IconLock,
  IconChip,
  IconCube,
  IconShield,
  IconArrowDown,
  IconCheck
} from "./icons.jsx";

function Node({ icon, label, sub, tone }) {
  return (
    <div className={`flow-node ${tone}`}>
      <span className="node-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="node-label">{label}</span>
        <span className="node-sub">{sub}</span>
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <span className="flow-arrow" aria-hidden="true">
      <IconArrowDown width={14} height={14} />
    </span>
  );
}

const VISIBILITY = [
  ["Input", "Private"],
  ["Output", "Public"],
  ["Model params", "Fixed"]
];

export default function PrivacySection() {
  return (
    <section className="section reveal" id="privacy" aria-labelledby="privacy-title">
      <div className="section-head">
        <span className="eyebrow">Privacy</span>
        <h2 id="privacy-title">Your Data Stays Private</h2>
        <p>
          The proof verifies an AI decision without ever revealing the inputs
          behind it.
        </p>
      </div>

      <div className="privacy-grid">
        <div className="card card-pad">
          <Node
            tone="n-node"
            icon={<IconLock width={16} height={16} />}
            label="Private Input"
            sub="income • credit score • employment"
          />
          <Arrow />
          <Node
            tone="m-node"
            icon={<IconChip width={16} height={16} />}
            label="AI Model"
            sub="ONNX"
          />
          <Arrow />
          <Node
            tone="z-node"
            icon={<IconCube width={16} height={16} />}
            label="ZK Proof"
            sub="EZKL 23.0.5"
          />
          <Arrow />
          <Node
            tone="p-node"
            icon={<IconShield width={16} height={16} />}
            label="Public Verification"
            sub="anyone can verify"
          />
        </div>

        <div className="card card-pad privacy-statement">
          <span className="statement-ico">
            <IconShield width={26} height={26} />
          </span>
          <h3>Raw inputs never appear in the proof.</h3>
          <p>
            The verifier checks a cryptographic proof produced by the model —
            not the underlying financial data.
          </p>
          <ul className="privacy-list">
            {VISIBILITY.map(([label, value]) => (
              <li key={label}>
                {label}&nbsp;<code>{value}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="privacy-banner">
        <IconCheck width={16} height={16} />
        Only the decision and its proof become public — the private input never does.
      </div>
    </section>
  );
}