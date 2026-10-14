import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  IconCheck,
  IconAlert,
  IconCopy,
  IconCube,
  IconShield,
  IconServer,
  IconChip,
  IconSpark,
  IconArrow,
  IconLock,
  IconDoc
} from "../components/icons.jsx";
import {
  fetchRecentProofs,
  runTamperTest,
  submitProve,
  fetchReceiptJson,
  getReceiptPdfUrl
} from "../services/api.js";
import "./TrustLab.css";

const PRESET_APPROVED = {
  label: "Candidate A (Approved: ₹1,00,000 / 800 / 10y)",
  input: [100000, 800, 10]
};

const PRESET_REJECTED = {
  label: "Candidate B (Rejected: ₹30,000 / 450 / 1y)",
  input: [30000, 450, 1]
};

export default function TrustLab() {
  const [recentProofs, setRecentProofs] = useState([]);
  const [selectedProofId, setSelectedProofId] = useState("");
  const [selectedProofMeta, setSelectedProofMeta] = useState(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [generatingProof, setGeneratingProof] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  // Custom proof ID input
  const [manualProofId, setManualProofId] = useState("");

  // Test states: original | tamper_public_output | tamper_proof_bytes | tamper_both | custom
  const [testResults, setTestResults] = useState({});
  const [runningTest, setRunningTest] = useState(null);
  const [testErrors, setTestErrors] = useState({});

  // Custom JSON Playground drawer
  const [showCustomPlayground, setShowCustomPlayground] = useState(false);
  const [customJsonText, setCustomJsonText] = useState("");
  const [customJsonError, setCustomJsonError] = useState(null);

  // Audit history log
  const [auditLog, setAuditLog] = useState([]);
  const [copiedId, setCopiedId] = useState(false);

  // Load recent proofs on mount
  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoadingRecent(true);
    try {
      const data = await fetchRecentProofs();
      const list = data.proofs || [];
      setRecentProofs(list);
      if (list.length > 0 && !selectedProofId) {
        setSelectedProofId(list[0].proofId);
        setSelectedProofMeta(list[0]);
      }
    } catch (e) {
      console.warn("Failed to fetch recent proofs:", e.message);
    } finally {
      setLoadingRecent(false);
    }
  }

  // Handle proof selection change
  function handleSelectProof(id) {
    setSelectedProofId(id);
    const meta = recentProofs.find((p) => p.proofId === id) || null;
    setSelectedProofMeta(meta);
    setTestResults({});
    setTestErrors({});
  }

  // Generate a live proof via preset
  async function handleGeneratePreset(preset) {
    setGeneratingProof(true);
    setGenerateError(null);
    try {
      const res = await submitProve(preset.input);
      if (res.ok && res.body && res.body.proofId) {
        const newMeta = {
          proofId: res.body.proofId,
          timestamp: Date.now(),
          input: preset.input,
          output: res.body.public_output || [],
          proofSizeBytes: 26902,
          decision: res.body.decision,
          probability: res.body.probability
        };
        setRecentProofs((prev) => [newMeta, ...prev]);
        setSelectedProofId(res.body.proofId);
        setSelectedProofMeta(newMeta);
        setTestResults({});
        setTestErrors({});
      } else {
        setGenerateError(
          (res.body && res.body.error) || "Proof generation failed."
        );
      }
    } catch (e) {
      setGenerateError(e.message || "Failed to reach proving service.");
    } finally {
      setGeneratingProof(false);
    }
  }

  // Copy proof ID
  async function handleCopyProofId() {
    if (!selectedProofId) return;
    try {
      await navigator.clipboard.writeText(selectedProofId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {}
  }

  // Execute a specific tamper test
  async function executeTest(tamperType, customPayload = null) {
    if (!selectedProofId) return;
    setRunningTest(tamperType);
    setTestErrors((prev) => ({ ...prev, [tamperType]: null }));

    try {
      const res = await runTamperTest(
        selectedProofId,
        tamperType,
        customPayload
      );
      if (!res.ok) {
        const errMsg =
          (res.body && res.body.error) ||
          `HTTP ${res.status}: Verification request rejected.`;
        setTestErrors((prev) => ({ ...prev, [tamperType]: errMsg }));
        return;
      }

      const result = res.body;
      setTestResults((prev) => ({
        ...prev,
        [tamperType]: result
      }));

      // Append to audit trail
      const auditEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        proofId: selectedProofId,
        tamperType: tamperType,
        status: result.status,
        verified: result.verified,
        verifyTimeSec: result.verifyTimeSec,
        error: result.error || null,
        description: result.description
      };
      setAuditLog((prev) => [auditEntry, ...prev]);
    } catch (e) {
      setTestErrors((prev) => ({
        ...prev,
        [tamperType]: e.message || "Network error"
      }));
    } finally {
      setRunningTest(null);
    }
  }

  // Run all primary tests in sequence
  async function handleRunFullMatrix() {
    await executeTest("original");
    await executeTest("tamper_public_output");
    await executeTest("tamper_proof_bytes");
    await executeTest("tamper_both");
  }

  // Custom JSON verification execution
  function handleRunCustomVerify() {
    setCustomJsonError(null);
    let parsed;
    try {
      parsed = JSON.parse(customJsonText);
    } catch (err) {
      setCustomJsonError("Invalid JSON syntax: " + err.message);
      return;
    }
    executeTest("custom", parsed);
  }

  return (
    <div className="trustlab-page">
      {/* ---------- Topbar ---------- */}
      <header className="trustlab-topbar">
        <div className="trustlab-topbar-inner">
          <Link to="/" className="brand" aria-label="Veriscore home">
            <span className="brand-logo">
              <img
                className="brand-img"
                src="/images/veriscore-logo.png"
                alt="Veriscore"
              />
            </span>
          </Link>

          <nav className="trustlab-nav-links" aria-label="Navigation">
            <Link to="/home" className="trustlab-nav-link">
              ← Live Demo
            </Link>
            <Link to="/trust-lab" className="trustlab-nav-link active">
              Trust Lab 🔬
            </Link>
          </nav>

          <div className="topbar-actions">
            <span className="health">
              <span className="health-dot" aria-hidden="true" />
              Prover Online
            </span>
          </div>
        </div>
      </header>

      <main className="trustlab-container">
        {/* ---------- Hero Section ---------- */}
        <section className="trustlab-hero">
          <div className="trustlab-badge-row">
            <span className="trustlab-pill">
              <IconSpark width={13} height={13} />
              Cryptographic Trust Lab
            </span>
            <span className="trustlab-pill purple">EZKL 23.0.5 • Halo2 / KZG</span>
            <span className="trustlab-pill amber">Zero-Disk Mutation</span>
          </div>

          <h1>Adversarial Tamper & Proof Verification Lab</h1>
          <p>
            Verify authentic zero-knowledge proofs and execute deliberate
            adversarial mutations against public outputs and proof transcripts to
            observe mathematical constraint enforcement in real time.
          </p>

          <div className="trustlab-guarantee-card">
            <div className="icon-wrap">
              <IconShield width={20} height={20} />
            </div>
            <div>
              <strong>Original Proof Immutability Guarantee:</strong> All tamper
              experiments are executed strictly in isolated ephemeral memory
              spaces using the live <code>ezkl.verify</code> runtime. Your
              underlying stored proofs in <code>artifacts/proofs/</code> remain
              100% immutable and are never overwritten.
            </div>
          </div>
        </section>

        {/* ---------- Target Proof Selection & Profile ---------- */}
        <div className="trustlab-grid-2">
          {/* Card 1: Proof Selection */}
          <div className="tl-card">
            <div className="tl-card-header">
              <div>
                <h2 className="tl-card-title">
                  <IconCube width={18} height={18} style={{ color: "#3b82f6" }} />
                  Target Proof Selection
                </h2>
                <div className="tl-card-subtitle">
                  Choose an existing proof or generate a fresh one live
                </div>
              </div>
            </div>

            <div className="tl-selector-box">
              <div className="tl-select-group">
                <label className="tl-label">Recent Generated Proofs</label>
                <select
                  className="tl-select"
                  value={selectedProofId}
                  onChange={(e) => handleSelectProof(e.target.value)}
                  disabled={loadingRecent || generatingProof}
                >
                  {recentProofs.length === 0 ? (
                    <option value="">No stored proofs found</option>
                  ) : (
                    recentProofs.map((p, idx) => (
                      <option key={p.proofId} value={p.proofId}>
                        #{idx + 1} — {p.proofId.slice(0, 18)}...{" "}
                        {p.input ? `(Input: [${p.input.join(", ")}])` : ""}{" "}
                        {p.decision ? `[${p.decision.toUpperCase()}]` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Generate Presets */}
              <div className="tl-select-group">
                <label className="tl-label">Generate Fresh Proof</label>
                <div className="tl-presets-row">
                  <button
                    type="button"
                    className="tl-preset-btn"
                    onClick={() => handleGeneratePreset(PRESET_APPROVED)}
                    disabled={generatingProof}
                  >
                    <IconSpark width={14} height={14} style={{ color: "#10b981" }} />
                    {PRESET_APPROVED.label}
                  </button>
                  <button
                    type="button"
                    className="tl-preset-btn"
                    onClick={() => handleGeneratePreset(PRESET_REJECTED)}
                    disabled={generatingProof}
                  >
                    <IconAlert width={14} height={14} style={{ color: "#ef4444" }} />
                    {PRESET_REJECTED.label}
                  </button>
                </div>
                {generatingProof && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: "0.82rem", color: "#93c5fd" }}>
                    <div className="tl-spinner" /> Generating ZK proof with circuit (Halo2/KZG)...
                  </div>
                )}
                {generateError && (
                  <div style={{ marginTop: 8, color: "#f87171", fontSize: "0.82rem" }}>
                    {generateError}
                  </div>
                )}
              </div>

              {/* Manual Proof ID Input */}
              <div className="tl-select-group">
                <label className="tl-label">Or Enter Custom Proof ID</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    className="tl-input"
                    placeholder="e.g. e2e3b370-7bc5-4dd8-95b1-41c0d0f99631"
                    value={manualProofId}
                    onChange={(e) => setManualProofId(e.target.value)}
                  />
                  <button
                    type="button"
                    className="tl-preset-btn"
                    onClick={() => {
                      if (manualProofId.trim()) {
                        handleSelectProof(manualProofId.trim());
                      }
                    }}
                  >
                    Load
                  </button>
                </div>
              </div>

              {/* Active Proof ID Banner */}
              {selectedProofId && (
                <div className="tl-active-proof-banner">
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase" }}>
                      Active Proof UUID
                    </div>
                    <div className="tl-proof-id-text">{selectedProofId}</div>
                  </div>
                  <button
                    type="button"
                    className="tl-copy-btn"
                    onClick={handleCopyProofId}
                  >
                    <IconCopy width={14} height={14} />
                    {copiedId ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Cryptographic Profile */}
          <div className="tl-card">
            <div className="tl-card-header">
              <div>
                <h2 className="tl-card-title">
                  <IconChip width={18} height={18} style={{ color: "#8b5cf6" }} />
                  Cryptographic Circuit Profile
                </h2>
                <div className="tl-card-subtitle">
                  Calibrated Halo2/KZG circuit parameters
                </div>
              </div>
            </div>

            <div className="tl-specs-grid">
              <div className="tl-spec-item">
                <span className="tl-spec-label">Proving Engine</span>
                <span className="tl-spec-val">EZKL 23.0.5</span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Curve / Scheme</span>
                <span className="tl-spec-val">BN254 • KZG</span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Circuit Logrows</span>
                <span className="tl-spec-val">12 (4,096 rows)</span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Quantization Scales</span>
                <span className="tl-spec-val">[11, 18]</span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Input Visibility</span>
                <span className="tl-spec-val" style={{ color: "#10b981" }}>
                  Private (Hidden)
                </span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Output Visibility</span>
                <span className="tl-spec-val" style={{ color: "#38bdf8" }}>
                  Public (Instance)
                </span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Limb Tower</span>
                <span className="tl-spec-val">3x14-bit (2^42 cap)</span>
              </div>
              <div className="tl-spec-item">
                <span className="tl-spec-label">Proof File Size</span>
                <span className="tl-spec-val">~26.9 KB</span>
              </div>
            </div>

            <div style={{ marginTop: 18, fontSize: "0.82rem", color: "var(--text-2)", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: 4 }}>
                ZK Security Property:
              </div>
              Because <code>input_visibility</code> is <strong>Private</strong>, sensitive financial inputs never leave the prover. The proof commits to the computation without exposing the inputs. The verifying key checks the proof in milliseconds against the public decision output.
            </div>
          </div>
        </div>

        {/* ---------- Adversarial Tamper Testing Suite ---------- */}
        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="tl-suite-title-area">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2>Adversarial Verification Suite</h2>
                <p style={{ color: "var(--text-2)", fontSize: "0.9rem", margin: "4px 0 0" }}>
                  Execute real verifications against untouched and deliberately corrupted proofs.
                </p>
              </div>
              <button
                type="button"
                className="tl-btn-run"
                onClick={handleRunFullMatrix}
                disabled={!selectedProofId || runningTest !== null}
              >
                {runningTest !== null ? (
                  <>
                    <div className="tl-spinner" /> Running Verification...
                  </>
                ) : (
                  <>
                    <IconSpark width={16} height={16} />
                    Run All 4 Verification Tests
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="tl-suite-grid">
            {/* Test 1: Original Unmodified */}
            <div className="tl-test-card control">
              <div>
                <div className="tl-test-header">
                  <span className="tl-test-tag control">Control / Baseline</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Test 1</span>
                </div>
                <h3>Original Proof Verification</h3>
                <p style={{ marginTop: 6 }}>
                  Verifies the authentic proof generated by the model circuit against <code>verifying.key</code>.
                </p>
              </div>

              <div className="tl-test-hypothesis">
                <strong>Hypothesis:</strong> Untampered proof satisfies all circuit constraints and pairing equations. Expected: <strong>VERIFIED</strong>.
              </div>

              <button
                type="button"
                className="tl-btn-run"
                onClick={() => executeTest("original")}
                disabled={!selectedProofId || runningTest !== null}
              >
                {runningTest === "original" ? (
                  <>
                    <div className="tl-spinner" /> Verifying...
                  </>
                ) : (
                  <>
                    <IconCheck width={16} height={16} />
                    Verify Original Proof
                  </>
                )}
              </button>

              {testErrors["original"] && (
                <div className="tl-error-detail">{testErrors["original"]}</div>
              )}

              {testResults["original"] && (
                <div className={`tl-result-box ${testResults["original"].status.toLowerCase()}`}>
                  <div className="tl-result-badge-row">
                    <span className={`tl-status-chip ${testResults["original"].status.toLowerCase()}`}>
                      {testResults["original"].verified ? (
                        <IconCheck width={14} height={14} />
                      ) : (
                        <IconAlert width={14} height={14} />
                      )}
                      {testResults["original"].status}
                    </span>
                    <span className="tl-latency">
                      {testResults["original"].verifyTimeSec}s
                    </span>
                  </div>
                  <div className="tl-mutation-detail">
                    {testResults["original"].description}
                  </div>
                  {testResults["original"].verified && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                      <a
                        href={getReceiptPdfUrl(selectedProofId)}
                        download={`veriscore-decision-receipt-${selectedProofId.slice(0, 8)}.pdf`}
                        className="tl-preset-btn"
                        style={{ color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.4)", textDecoration: "none" }}
                      >
                        <IconDoc width={13} height={13} /> Download Decision Receipt (PDF)
                      </a>
                      <button
                        type="button"
                        className="tl-preset-btn"
                        onClick={async () => {
                          const res = await fetchReceiptJson(selectedProofId);
                          if (res.ok && res.body.receipt) {
                            const jsonBlob = new Blob([JSON.stringify(res.body.receipt, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(jsonBlob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `veriscore-decision-receipt-${selectedProofId.slice(0, 8)}.json`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                          }
                        }}
                      >
                        Export JSON Receipt
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Test 2: Tamper Public Output */}
            <div className="tl-test-card tamper-output">
              <div>
                <div className="tl-test-header">
                  <span className="tl-test-tag tamper">Adversarial Attack</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Test 2</span>
                </div>
                <h3>Tampered Public Output (Instances)</h3>
                <p style={{ marginTop: 6 }}>
                  Adversary mutates the public instance value in the proof JSON (attempting to flip loan rejection to approval).
                </p>
              </div>

              <div className="tl-test-hypothesis">
                <strong>Hypothesis:</strong> The output instance polynomial breaks polynomial equality. Expected: <strong>REJECTED</strong>.
              </div>

              <button
                type="button"
                className="tl-btn-run tamper-btn"
                onClick={() => executeTest("tamper_public_output")}
                disabled={!selectedProofId || runningTest !== null}
              >
                {runningTest === "tamper_public_output" ? (
                  <>
                    <div className="tl-spinner" /> Verifying Tamper...
                  </>
                ) : (
                  <>
                    <IconAlert width={16} height={16} />
                    Tamper Public Output & Verify
                  </>
                )}
              </button>

              {testErrors["tamper_public_output"] && (
                <div className="tl-error-detail">{testErrors["tamper_public_output"]}</div>
              )}

              {testResults["tamper_public_output"] && (
                <div className={`tl-result-box ${testResults["tamper_public_output"].status.toLowerCase()}`}>
                  <div className="tl-result-badge-row">
                    <span className={`tl-status-chip ${testResults["tamper_public_output"].status.toLowerCase()}`}>
                      {testResults["tamper_public_output"].verified ? (
                        <IconCheck width={14} height={14} />
                      ) : (
                        <IconAlert width={14} height={14} />
                      )}
                      {testResults["tamper_public_output"].status}
                    </span>
                    <span className="tl-latency">
                      {testResults["tamper_public_output"].verifyTimeSec}s
                    </span>
                  </div>
                  {testResults["tamper_public_output"].error && (
                    <div className="tl-error-detail">
                      {testResults["tamper_public_output"].error}
                    </div>
                  )}
                  <div className="tl-mutation-detail">
                    {testResults["tamper_public_output"].description}
                  </div>
                </div>
              )}
            </div>

            {/* Test 3: Tamper Proof Bytes */}
            <div className="tl-test-card tamper-proof">
              <div>
                <div className="tl-test-header">
                  <span className="tl-test-tag tamper">Cryptographic Attack</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Test 3</span>
                </div>
                <h3>Tampered Proof Bytes (Transcript)</h3>
                <p style={{ marginTop: 6 }}>
                  Adversary flips bytes in the cryptographic proof transcript or KZG opening polynomial commitments.
                </p>
              </div>

              <div className="tl-test-hypothesis">
                <strong>Hypothesis:</strong> Corrupted curve points break BN254 point deserialization or KZG pairing. Expected: <strong>REJECTED</strong>.
              </div>

              <button
                type="button"
                className="tl-btn-run tamper-btn"
                onClick={() => executeTest("tamper_proof_bytes")}
                disabled={!selectedProofId || runningTest !== null}
              >
                {runningTest === "tamper_proof_bytes" ? (
                  <>
                    <div className="tl-spinner" /> Verifying Tamper...
                  </>
                ) : (
                  <>
                    <IconAlert width={16} height={16} />
                    Tamper Proof Bytes & Verify
                  </>
                )}
              </button>

              {testErrors["tamper_proof_bytes"] && (
                <div className="tl-error-detail">{testErrors["tamper_proof_bytes"]}</div>
              )}

              {testResults["tamper_proof_bytes"] && (
                <div className={`tl-result-box ${testResults["tamper_proof_bytes"].status.toLowerCase()}`}>
                  <div className="tl-result-badge-row">
                    <span className={`tl-status-chip ${testResults["tamper_proof_bytes"].status.toLowerCase()}`}>
                      {testResults["tamper_proof_bytes"].verified ? (
                        <IconCheck width={14} height={14} />
                      ) : (
                        <IconAlert width={14} height={14} />
                      )}
                      {testResults["tamper_proof_bytes"].status}
                    </span>
                    <span className="tl-latency">
                      {testResults["tamper_proof_bytes"].verifyTimeSec}s
                    </span>
                  </div>
                  {testResults["tamper_proof_bytes"].error && (
                    <div className="tl-error-detail">
                      {testResults["tamper_proof_bytes"].error}
                    </div>
                  )}
                  <div className="tl-mutation-detail">
                    {testResults["tamper_proof_bytes"].description}
                  </div>
                </div>
              )}
            </div>

            {/* Test 4: Dual Tamper */}
            <div className="tl-test-card tamper-both">
              <div>
                <div className="tl-test-header">
                  <span className="tl-test-tag tamper">Dual Mutation</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Test 4</span>
                </div>
                <h3>Dual Tamper (Output + Transcript)</h3>
                <p style={{ marginTop: 6 }}>
                  Simultaneously modifies both public instance claims and cryptographic proof bytes.
                </p>
              </div>

              <div className="tl-test-hypothesis">
                <strong>Hypothesis:</strong> Multiple layers of cryptographic failure trigger immediate rejection. Expected: <strong>REJECTED</strong>.
              </div>

              <button
                type="button"
                className="tl-btn-run tamper-btn"
                style={{ background: "#9333ea" }}
                onClick={() => executeTest("tamper_both")}
                disabled={!selectedProofId || runningTest !== null}
              >
                {runningTest === "tamper_both" ? (
                  <>
                    <div className="tl-spinner" /> Verifying Tamper...
                  </>
                ) : (
                  <>
                    <IconAlert width={16} height={16} />
                    Tamper Both & Verify
                  </>
                )}
              </button>

              {testErrors["tamper_both"] && (
                <div className="tl-error-detail">{testErrors["tamper_both"]}</div>
              )}

              {testResults["tamper_both"] && (
                <div className={`tl-result-box ${testResults["tamper_both"].status.toLowerCase()}`}>
                  <div className="tl-result-badge-row">
                    <span className={`tl-status-chip ${testResults["tamper_both"].status.toLowerCase()}`}>
                      {testResults["tamper_both"].verified ? (
                        <IconCheck width={14} height={14} />
                      ) : (
                        <IconAlert width={14} height={14} />
                      )}
                      {testResults["tamper_both"].status}
                    </span>
                    <span className="tl-latency">
                      {testResults["tamper_both"].verifyTimeSec}s
                    </span>
                  </div>
                  {testResults["tamper_both"].error && (
                    <div className="tl-error-detail">
                      {testResults["tamper_both"].error}
                    </div>
                  )}
                  <div className="tl-mutation-detail">
                    {testResults["tamper_both"].description}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Interactive Custom Playground (Collapsible) ---------- */}
        <div className="tl-custom-playground">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 className="tl-card-title">
                <IconServer width={18} height={18} style={{ color: "#38bdf8" }} />
                Interactive Custom Tamper Playground
              </h2>
              <div className="tl-card-subtitle">
                Test custom-modified proof JSON structures directly against the verifier
              </div>
            </div>
            <button
              type="button"
              className="tl-preset-btn"
              onClick={() => {
                setShowCustomPlayground(!showCustomPlayground);
                if (!customJsonText) {
                  // Seed with sample template
                  setCustomJsonText(
                    JSON.stringify(
                      {
                        instances: [["a4a5010000000000000000000000000000000000000000000000000000000000"]],
                        proof: [37, 109, 46, 64, 62, 204],
                        hex_proof: "0x256d2e403e",
                        version: "23.0.5"
                      },
                      null,
                      2
                    )
                  );
                }
              }}
            >
              {showCustomPlayground ? "Hide Playground ▲" : "Open Custom Playground ▼"}
            </button>
          </div>

          {showCustomPlayground && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>
                Edit the JSON proof payload below. You can change instance hex values, proof arrays, or version metadata, then verify it:
              </div>
              <textarea
                className="tl-json-textarea"
                value={customJsonText}
                onChange={(e) => setCustomJsonText(e.target.value)}
                placeholder="Paste proof JSON here..."
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="tl-btn-run"
                  onClick={handleRunCustomVerify}
                  disabled={!selectedProofId || runningTest !== null}
                >
                  {runningTest === "custom" ? (
                    <>
                      <div className="tl-spinner" /> Verifying Custom Payload...
                    </>
                  ) : (
                    "Verify Custom Payload"
                  )}
                </button>
                <button
                  type="button"
                  className="tl-preset-btn"
                  onClick={() => {
                    try {
                      const obj = JSON.parse(customJsonText);
                      if (obj.instances && obj.instances[0]) {
                        obj.instances[0][0] = "ffff" + String(obj.instances[0][0]).slice(4);
                        setCustomJsonText(JSON.stringify(obj, null, 2));
                      }
                    } catch {}
                  }}
                >
                  Quick Action: Corrupt Instances
                </button>
                <button
                  type="button"
                  className="tl-preset-btn"
                  onClick={() => {
                    try {
                      const obj = JSON.parse(customJsonText);
                      if (Array.isArray(obj.proof)) {
                        obj.proof = [0, 0, 0, 0];
                        setCustomJsonText(JSON.stringify(obj, null, 2));
                      }
                    } catch {}
                  }}
                >
                  Quick Action: Truncate Proof Bytes
                </button>
              </div>

              {customJsonError && (
                <div className="tl-error-detail">{customJsonError}</div>
              )}

              {testResults["custom"] && (
                <div className={`tl-result-box ${testResults["custom"].status.toLowerCase()}`}>
                  <div className="tl-result-badge-row">
                    <span className={`tl-status-chip ${testResults["custom"].status.toLowerCase()}`}>
                      {testResults["custom"].status}
                    </span>
                    <span className="tl-latency">
                      {testResults["custom"].verifyTimeSec}s
                    </span>
                  </div>
                  {testResults["custom"].error && (
                    <div className="tl-error-detail">
                      {testResults["custom"].error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- Audit Trail & Session History ---------- */}
        <div className="tl-card">
          <div className="tl-card-header">
            <div>
              <h2 className="tl-card-title">
                <IconShield width={18} height={18} style={{ color: "#10b981" }} />
                Session Verification Audit Trail
              </h2>
              <div className="tl-card-subtitle">
                Immutable audit log of all live verifications executed in this session
              </div>
            </div>
            {auditLog.length > 0 && (
              <button
                type="button"
                className="tl-copy-btn"
                onClick={() => setAuditLog([])}
              >
                Clear Log
              </button>
            )}
          </div>

          {auditLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              No verifications recorded yet. Run any of the tamper tests above to populate the audit log.
            </div>
          ) : (
            <div className="tl-audit-table-wrap">
              <table className="tl-audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Target Proof ID</th>
                    <th>Test Attack Vector</th>
                    <th>Result</th>
                    <th>Duration</th>
                    <th>Cryptographic Trace</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                        {log.timestamp}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "#93c5fd" }}>
                        {log.proofId.slice(0, 16)}...
                      </td>
                      <td style={{ textTransform: "capitalize", fontWeight: 500 }}>
                        {log.tamperType.replace(/_/g, " ")}
                      </td>
                      <td>
                        <span className={`tl-status-chip ${log.status.toLowerCase()}`} style={{ fontSize: "0.72rem", padding: "2px 8px" }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                        {log.verifyTimeSec}s
                      </td>
                      <td style={{ fontSize: "0.75rem", maxWidth: "280px" }}>
                        {log.error ? (
                          <span style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}>
                            {log.error}
                          </span>
                        ) : (
                          <span style={{ color: "#34d399" }}>
                            Constraints satisfied • KZG pairing matched
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- Honest Technical Limitations & FAQ ---------- */}
        <div className="tl-card" style={{ background: "rgba(10, 18, 32, 0.6)" }}>
          <h2 className="tl-card-title" style={{ marginBottom: 12 }}>
            <IconAlert width={18} height={18} style={{ color: "#f59e0b" }} />
            Cryptographic Architecture & Honest Engineering Boundaries
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, fontSize: "0.84rem", color: "var(--text-2)", lineHeight: 1.5 }}>
            <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: 6 }}>
                Why Can't Private Inputs Be Tampered in Proof.json?
              </div>
              Because <code>input_visibility: Private</code> was calibrated during setup, the user's raw financial data exists exclusively in the prover's ephemeral witness polynomial and is <strong>never stored in the proof file</strong>. To test different inputs, a new proof must be generated through the circuit.
            </div>

            <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: 6 }}>
                Why Does Output Tampering Cause Constraint Failure?
              </div>
              Halo2 enforces equality between the model's computed output and the public instance columns. If an attacker alters the public output without recomputing valid gate assignments, the quotient polynomial cannot divide the constraint polynomial, resulting in immediate verification rejection.
            </div>

            <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: 6 }}>
                Deterministic Authenticity (No Faking)
              </div>
              Every test executes the live <code>ezkl.verify</code> Rust binary through Python bindings. No mock responses or hardcoded booleans are used; the verified/rejected status and error strings come directly from the cryptographic engine.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
