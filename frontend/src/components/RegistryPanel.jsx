import { IconChip, IconShield, IconLink, IconCheck, IconAlert } from "./icons.jsx";
import useReveal from "./useReveal.js";

function Row({ label, children }) {
  return (
    <div className="info-row">
      <span className="infocol-label">{label}</span>
      <span className="infocol-value">{children}</span>
    </div>
  );
}

export default function RegistryPanel({ registry }) {
  const ref = useReveal();
  if (!registry) return null;

  const zk = registry.zk || {};
  const features = (registry.input && registry.input.features) || [];
  const q8 = zk.quantizedQ8_8Fallback || {};
  const onChain = zk.onChainVerifier || {};
  const setup = zk.setupStatus || {};

  return (
    <section className="section reveal" ref={ref} id="registry">
      <div className="reg-head">
        <div className="section-head">
          <span className="eyebrow">Technical Dashboard</span>
          <h2>Model Registry</h2>
          <p>
            Live view of the model served by the ZK proving service (
            <code>/api/models</code>).
          </p>
        </div>
        <span className="live-badge">
          <span className="live-dot" />
          Active
        </span>
      </div>

      <div className="info-grid">
        <Row label="Model">
          <span className="tag tag-blue">{registry.id}</span> {registry.name}
        </Row>

        <div className="info-2col">
          <div>
            <span className="infocol-label">Version</span>
            <span className="infocol-value" style={{ display: "block" }}>
              {registry.version}
            </span>
          </div>
          <div>
            <span className="infocol-label">Status</span>
            <span className="live-badge" style={{ marginTop: 2 }}>
              <span className="live-dot" />
              Active
            </span>
          </div>
        </div>

        <div className="info-2col">
          <div>
            <span className="infocol-label">Features</span>
            <div className="tag-list" style={{ marginTop: 2 }}>
              {features.map((f) => (
                <span className="tag" key={f}>
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="infocol-label">Output Semantics</span>
            <div className="tag-list" style={{ marginTop: 6 }}>
              <span className="tag tag-blue">logit → sigmoid P(default)</span>
              <span className="tag tag-blue">approved if ≥ 0.5</span>
            </div>
          </div>
        </div>

        <div className="info-2col">
          <div>
            <span className="infocol-label">ZK Backend</span>
            <span className="infocol-value" style={{ display: "block" }}>
              {zk.backend} {zk.ezklVersion}
            </span>
            <p className="info-note">
              {zk.curve} · {zk.scheme}
            </p>
          </div>
          <div>
            <span className="infocol-label">Circuit</span>
            <span className="infocol-value" style={{ display: "block" }}>
              logrows {zk.logrows} · scales {(zk.scales || []).join("/")}
            </span>
            <p className="info-note">
              {registry.input && registry.input.normalization}
            </p>
          </div>
        </div>

        <div className="info-2col">
          <div>
            <span className="infocol-label">Display</span>
            <div className="infocol-value">
              <span className="tag-list" style={{ marginTop: 2 }}>
                <span className="tag tag-green">input {zk.inputVisibility}</span>
                <span className="tag tag-blue">output {zk.outputVisibility}</span>
              </span>
            </div>
          </div>
          <div>
            <span className="infocol-label">Setup Status</span>
            <div className="tag-list" style={{ marginTop: 2 }}>
              <span className={`tag ${setup.ready === true ? "tag-green" : "tag-red"}`}>
                {setup.ready === true ? "ready" : "pending"}
              </span>
              {setup.srs && <span className="tag">SRS</span>}
              {setup.provingKey && <span className="tag">PK</span>}
              {setup.verifyingKey && <span className="tag">VK</span>}
            </div>
          </div>
        </div>

        <div className="info-row">
          <span className="infocol-label">GPU-Accelerated MSM</span>
          <span>
            {zk.gpuAcceleratedMsms ? (
              <span className="tag tag-green">Available</span>
            ) : (
              <span className="tag tag-red">
                <IconAlert width={12} height={12} /> Not available
              </span>
            )}
            <p className="info-note">
              {zk.gpuReason || "No CUDA GPU/toolkit on host; ezkl wheels expose no GPU API."}
            </p>
          </span>
        </div>

        <div className="info-2col">
          <div>
            <span className="infocol-label">Q8.8 Quantized Fallback</span>
            <span className="infocol-value" style={{ display: "block" }}>
              {q8.available ? (
                <span className="tag tag-green">Available</span>
              ) : (
                <span className="tag tag-red">Unavailable</span>
              )}
            </span>
            <p className="info-note">
              {q8.available
                ? "Decision-consistent for demo inputs; not ZK-provable in EZKL (2×14-bit limbs)."
                : (q8.note || "")}
            </p>
          </div>
          <div>
            <span className="infocol-label">On-Chain Verifier</span>
            <span className="infocol-value" style={{ display: "block" }}>
              {onChain.available ? (
                <span className="tag tag-green">
                  <IconLink width={12} height={12} /> Available
                </span>
              ) : (
                <span className="tag tag-red">Unavailable</span>
              )}
            </span>
            <p className="info-note">
              {onChain.available
                ? "Solidity Verifier — verified client-side + on a local chain."
                : (onChain.note || "")}
            </p>
          </div>
        </div>

        <Row label="Endpoints">
          <div className="tag-list">
            {registry.endpoints &&
              Object.entries(registry.endpoints).map(([k, v]) => (
                <span className="tag" key={k}>
                  {v}
                </span>
              ))}
          </div>
        </Row>
      </div>
    </section>
  );
}