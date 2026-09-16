import { IconCheck, IconArrowDown, IconLock, IconChip, IconCube, IconShield } from "./icons.jsx";

function Step({ tone, icon, label, sub }) {
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

function Connector() {
  return (
    <span className="flow-arrow how-connector" aria-hidden="true">
      <IconArrowDown width={14} height={14} />
    </span>
  );
}

export default function HowItWorks() {
  return (
    <section className="section how-section" id="how" aria-labelledby="how-title">
      <div className="how-card">
        <div className="how-head">
          <span className="eyebrow">How It Works</span>
          <span className="mini-live">
            <IconCheck width={11} height={11} />
            INPUT NEVER LEAVES
          </span>
        </div>

        <div className="how-steps">
          <div className="how-step">
            <Step
              tone="n-node"
              icon={<IconLock width={15} height={15} />}
              label="Private Input"
              sub="income · credit · employment"
            />
          </div>
          <Connector />
          <div className="how-step">
            <Step
              tone="m-node"
              icon={<IconChip width={15} height={15} />}
              label="AI Model"
              sub="ONNX · loan-v1"
            />
          </div>
          <Connector />
          <div className="how-step">
            <Step
              tone="z-node"
              icon={<IconCube width={15} height={15} />}
              label="ZK Proof"
              sub="ezkl 23.0.5"
            />
          </div>
          <Connector />
          <div className="how-step">
            <Step
              tone="p-node"
              icon={<IconShield width={15} height={15} />}
              label="Verifier"
              sub="anyone · key-check"
            />
          </div>
          <Connector />
          <div className="how-step">
            <Step
              tone="p-node"
              icon={<IconCheck width={15} height={15} />}
              label="Verified"
              sub="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
}