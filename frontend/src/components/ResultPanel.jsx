import { useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconChip,
  IconShield,
  IconChevronDown,
  IconCube,
  IconDoc,
  IconAlert
} from "./icons.jsx";
import { fetchReceiptJson, getReceiptPdfUrl } from "../services/api.js";
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

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [receiptError, setReceiptError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const receiptOptions = {
    decision: result.decision,
    probability: result.probability,
    modelVersion: result.modelVersion
  };

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    setReceiptError(null);
    try {
      const pdfUrl = getReceiptPdfUrl(result.proofId, receiptOptions);
      const res = await fetch(pdfUrl);
      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.error || `HTTP ${res.status}: Failed to generate PDF`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `veriscore-decision-receipt-${result.proofId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setReceiptError(err.message || "Failed to download PDF receipt.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadJson() {
    setDownloadingJson(true);
    setReceiptError(null);
    try {
      const res = await fetchReceiptJson(result.proofId, receiptOptions);
      if (!res.ok || !res.body.receipt) {
        throw new Error(res.body.error || `HTTP ${res.status}: Failed to generate JSON receipt`);
      }
      const jsonBlob = new Blob([JSON.stringify(res.body.receipt, null, 2)], {
        type: "application/json"
      });
      const blobUrl = window.URL.createObjectURL(jsonBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `veriscore-decision-receipt-${result.proofId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setReceiptError(err.message || "Failed to download JSON receipt.");
    } finally {
      setDownloadingJson(false);
    }
  }

  async function handleTogglePreview() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (!previewData) {
      try {
        const res = await fetchReceiptJson(result.proofId, receiptOptions);
        if (res.ok && res.body.receipt) {
          setPreviewData(res.body.receipt);
        }
      } catch {}
    }
    setShowPreview(true);
  }

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

        {/* Verifiable Decision Receipt Download Card */}
        <div className={`receipt-card${verified ? "" : " unverified"}`}>
          <div className="receipt-card-head">
            <span className="receipt-card-title">
              <IconDoc width={14} height={14} />
              Verifiable AI Decision Receipt
            </span>
            <span className={`receipt-badge-mini${verified ? "" : " unverified"}`}>
              {verified ? "Verified ✓" : "Unverified ✖"}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-2)", lineHeight: 1.4 }}>
            {verified
              ? "Download an official cryptographic receipt certifying model execution, decision verdict, and ZK verification proof."
              : "Cryptographic proof was not verified. The receipt will indicate UNVERIFIED status in compliance with zero-knowledge verification rules."}
          </p>

          <div className="receipt-actions">
            <button
              type="button"
              className="btn-receipt-primary"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              <IconDoc width={14} height={14} />
              {downloadingPdf ? "Generating PDF…" : "Download Decision Receipt (PDF)"}
            </button>

            <button
              type="button"
              className="btn-receipt-secondary"
              onClick={handleDownloadJson}
              disabled={downloadingJson}
            >
              {downloadingJson ? "Exporting…" : "JSON Receipt"}
            </button>

            <button
              type="button"
              className="btn-receipt-secondary"
              onClick={handleTogglePreview}
              style={{ fontSize: "11.5px" }}
            >
              {showPreview ? "Hide Preview ▲" : "Preview ▼"}
            </button>
          </div>

          {receiptError && (
            <div style={{ color: "#f87171", fontSize: "11.5px" }}>
              {receiptError}
            </div>
          )}

          {showPreview && previewData && (
            <div
              style={{
                marginTop: "4px",
                padding: "10px 12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "11px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontFamily: "var(--font-mono)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Receipt ID:</span>
                <span style={{ color: "#38bdf8", fontWeight: 600 }}>{previewData.receiptId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Decision / Probability:</span>
                <span style={{ color: verified ? "#34d399" : "#f87171", fontWeight: 700 }}>
                  {previewData.decision} ({previewData.probabilityPercent})
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Verification Status:</span>
                <span style={{ color: verified ? "#34d399" : "#f87171", fontWeight: 700 }}>
                  {previewData.verificationStatus}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Engine & Curve:</span>
                <span style={{ color: "var(--text-2)" }}>{previewData.cryptographicDetails.provingEngine} • {previewData.cryptographicDetails.curve}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>ZK Input Protection:</span>
                <span style={{ color: "#10b981" }}>Private (Withheld)</span>
              </div>
              <div style={{ wordBreak: "break-all", fontSize: "10px", color: "var(--faint)", marginTop: "2px" }}>
                SHA256 Digest: {previewData.receiptDigest}
              </div>
            </div>
          )}
        </div>

        <details className="result-details" style={{ marginTop: "10px" }}>
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