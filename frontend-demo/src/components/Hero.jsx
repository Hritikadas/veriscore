import {
  IconCheck,
  IconSpark,
  IconLock,
  IconCube,
  IconShield,
  IconArrowDown,
  IconChip
} from "./icons.jsx";

const TRUST = ["AI Verified", "Privacy Preserving", "ZK Proof", "Blockchain Ready"];

function FlowNode({ icon, label, sub, tone }) {
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

function FlowArrow() {
  return (
    <span className="flow-arrow" aria-hidden="true">
      <IconArrowDown width={14} height={14} />
    </span>
  );
}

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
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

        <div className="hero-visual" role="img" aria-label="Private input flows through an AI model into a zero-knowledge proof that anyone can verify.">
          <div className="hero-flow">
            <div className="hero-flow-head">
              <span>How it works</span>
              <span className="mini-live">
                <IconCheck width={11} height={11} />
                input never leaves
              </span>
            </div>

            <FlowNode
              tone="n-node"
              icon={<IconLock width={15} height={15} />}
              label="Private Input"
              sub="income · credit · employment"
            />
            <FlowArrow />
            <FlowNode
              tone="m-node"
              icon={<IconChip width={15} height={15} />}
              label="AI Model"
              sub="ONNX · loan-v1"
            />
            <FlowArrow />
            <FlowNode
              tone="z-node"
              icon={<IconCube width={15} height={15} />}
              label="ZK Proof"
              sub="ezkl 23.0.5"
            />
            <FlowArrow />
            <FlowNode
              tone="p-node"
              icon={<IconShield width={15} height={15} />}
              label="Verifier"
              sub="anyone · key-check"
            />
            <FlowArrow />
            <FlowNode
              tone="p-node"
              icon={<IconCheck width={15} height={15} />}
              label="Verified"
              sub="true"
            />
          </div>
        </div>
      </div>
    </header>
  );
}