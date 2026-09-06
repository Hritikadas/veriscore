import {
  IconUser,
  IconChip,
  IconCube,
  IconDoc,
  IconShield,
  IconCheck,
  IconArrow
} from "./icons.jsx";
import useReveal from "./useReveal.js";

const NODES = [
  { label: "USER INPUT", tag: "private", icon: IconUser, tone: "n1" },
  { label: "AI MODEL", tag: "onnx", icon: IconChip, tone: "n2" },
  { label: "ZK PROVER", tag: "ezkl 23.0.5", icon: IconCube, tone: "n3" },
  { label: "PROOF", tag: "bn254 · KZG", icon: IconDoc, tone: "n4" },
  { label: "VERIFIER", tag: "key-check", icon: IconShield, tone: "n5" },
  { label: "VERIFIED", tag: "true", icon: IconCheck, tone: "n6" }
];

export default function PipelineFlow() {
  const ref = useReveal();

  return (
    <section className="reveal" ref={ref} id="zk">
      <div className="section-head">
        <span className="eyebrow">Pipeline</span>
        <h2>How Veriscore Verifies</h2>
        <p>
          One request flows through the proving pipeline: the model runs in a
          zero-knowledge circuit, a proof is emitted, and the verifier checks
          it — without seeing your input.
        </p>
      </div>

      <div className="pipe" aria-label="Veriscore verification pipeline">
        {NODES.map((n, i) => {
          const Icon = n.icon;
          return (
            <span key={n.label} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <span className="pipe-arrow" aria-hidden="true">
                  <IconArrow width={14} height={14} />
                </span>
              )}
              <span className={`pipe-node ${n.tone}`}>
                <span className="node-icon">
                  <Icon width={17} height={17} />
                </span>
                <span>
                  <span className="node-title">{n.label}</span>
                  <span className="node-tag">{n.tag}</span>
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </section>
  );
}