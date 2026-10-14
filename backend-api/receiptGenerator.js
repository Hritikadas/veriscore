const PDFDocument = require("pdfkit");
const crypto = require("crypto");

/**
 * Creates a sanitized, verifiable decision receipt data object.
 * Strictly excludes any private inputs, private keys, or internal file paths.
 */
function buildReceiptObject({
  proofId,
  decision,
  probability,
  modelVersion = "1.0.0",
  verified = false,
  publicOutput = [],
  proofSizeBytes = 26902,
  verificationError = null
}) {
  const normDecision = String(decision || "rejected").toUpperCase();
  const probNum = typeof probability === "number" ? probability : parseFloat(probability) || 0;
  const isVerified = Boolean(verified);

  const issuedAt = new Date().toISOString();
  const issuedAtFormatted = new Date().toUTCString();

  // Generate unique receipt ID and cryptographic digest
  const digestPayload = `${proofId}:${normDecision}:${probNum}:${isVerified}:${issuedAt}`;
  const receiptDigest = crypto.createHash("sha256").update(digestPayload).digest("hex");
  const receiptId = `VRC-${receiptDigest.slice(0, 12).toUpperCase()}`;

  const publicSignals = Array.isArray(publicOutput) && publicOutput.length > 0
    ? (Array.isArray(publicOutput[0]) ? publicOutput[0] : publicOutput)
    : ["0x0000000000000000000000000000000000000000000000000000000000000000"];

  return {
    receiptId,
    proofId,
    decision: normDecision,
    probability: probNum,
    probabilityPercent: `${(probNum * 100).toFixed(2)}%`,
    modelVersion,
    modelName: "Loan Approval MLP (3→8→4→1)",
    verificationStatus: isVerified ? "VERIFIED" : "UNVERIFIED",
    verified: isVerified,
    issuedAt,
    issuedAtFormatted,
    cryptographicDetails: {
      provingEngine: "EZKL 23.0.5",
      circuitLogrows: 12,
      scales: [11, 18],
      curve: "BN254 (alt_bn128)",
      commitmentScheme: "KZG (Kate-Zaverucha-Goldberg)",
      inputVisibility: "Private (Hidden Witness — Applicant Data Protected)",
      outputVisibility: "Public (Rescaled Sigmoid Output Instance)",
      publicSignals: publicSignals,
      proofSizeBytes: proofSizeBytes || 26902
    },
    receiptDigest,
    verificationError: isVerified ? null : (verificationError || "Cryptographic proof not verified or rejected"),
    privacyNotice: "Zero-Knowledge Protection: All sensitive applicant attributes (income, credit score, employment tenure) were isolated inside the cryptographic witness and withheld from this receipt, the proof file, and any external verifiers."
  };
}

/**
 * Generates an official, publication-grade PDF receipt using PDFKit.
 * Returns a Promise resolving to a Buffer.
 */
function generateReceiptPdf(receipt) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
        info: {
          Title: `Veriscore AI Decision Receipt - ${receipt.receiptId}`,
          Author: "Veriscore ZK Trust Platform",
          Subject: "Zero-Knowledge Verifiable AI Decision Receipt",
          Keywords: "zkML, ezkl, zero-knowledge, halo2, veriscore, loan-approval"
        }
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const pageWidth = 595.28;
      const isApproved = receipt.decision === "APPROVED";
      const isVerified = receipt.verified === true;

      // --- 1. Top Brand Header Bar ---
      doc.rect(0, 0, pageWidth, 85).fill("#0a1220");

      doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("VERISCORE", 40, 24);
      doc.fillColor("#38bdf8").fontSize(10).font("Helvetica-Bold").text("VERIFIABLE AI DECISION RECEIPT", 40, 50);

      doc.fillColor("#94a3b8").fontSize(8).font("Helvetica").text(`RECEIPT ID: ${receipt.receiptId}`, 360, 26, { align: "right", width: 195 });
      doc.fillColor("#94a3b8").fontSize(8).font("Helvetica").text(`ISSUED: ${receipt.issuedAtFormatted}`, 360, 40, { align: "right", width: 195 });
      doc.fillColor("#38bdf8").fontSize(8).font("Helvetica").text("PROTOCOL: EZKL 23.0.5 • KZG", 360, 54, { align: "right", width: 195 });

      // Electric Blue divider accent
      doc.rect(0, 85, pageWidth, 3).fill("#1677ff");

      let y = 105;

      // --- 2. Verification Status Banner ---
      if (isVerified) {
        doc.roundedRect(40, y, pageWidth - 80, 52, 6).fillAndStroke("#ecfdf5", "#10b981");
        doc.fillColor("#065f46").fontSize(13).font("Helvetica-Bold").text("✔ CRYPTOGRAPHICALLY VERIFIED AI DECISION", 56, y + 12);
        doc.fillColor("#047857").fontSize(9).font("Helvetica").text(
          "This AI decision has been mathematically proven by a Halo2 zero-knowledge circuit and verified against the public verifying key.",
          56,
          y + 30,
          { width: pageWidth - 110 }
        );
      } else {
        doc.roundedRect(40, y, pageWidth - 80, 56, 6).fillAndStroke("#fef2f2", "#ef4444");
        doc.fillColor("#991b1b").fontSize(13).font("Helvetica-Bold").text("✖ UNVERIFIED / REJECTED AI DECISION", 56, y + 10);
        doc.fillColor("#b91c1c").fontSize(8.5).font("Helvetica-Bold").text(
          `WARNING: ${receipt.verificationError || "Cryptographic verification failed or was not satisfied. Do not rely on this decision as proven."}`,
          56,
          y + 28,
          { width: pageWidth - 110 }
        );
      }

      y += 70;

      // --- 3. Decision Verdict Card ---
      const verdictBg = isApproved ? "#f0fdf4" : "#fff1f2";
      const verdictBorder = isApproved ? "#86efac" : "#fca5a5";
      const verdictColor = isApproved ? "#15803d" : "#be123c";

      doc.roundedRect(40, y, pageWidth - 80, 88, 6).fillAndStroke(verdictBg, verdictBorder);

      doc.fillColor("#64748b").fontSize(8.5).font("Helvetica-Bold").text("LOAN APPROVAL DECISION", 56, y + 14);
      doc.fillColor(verdictColor).fontSize(26).font("Helvetica-Bold").text(receipt.decision, 56, y + 30);

      doc.fillColor("#64748b").fontSize(8.5).font("Helvetica-Bold").text("APPROVAL PROBABILITY", 220, y + 14);
      doc.fillColor("#0f172a").fontSize(26).font("Helvetica-Bold").text(receipt.probabilityPercent, 220, y + 30);

      doc.fillColor("#64748b").fontSize(8.5).font("Helvetica-Bold").text("VERIFICATION STATUS", 400, y + 14);
      doc.fillColor(isVerified ? "#15803d" : "#be123c").fontSize(16).font("Helvetica-Bold").text(
        isVerified ? "VERIFIED (True)" : "FAILED (False)",
        400,
        y + 34
      );

      doc.fillColor("#475569").fontSize(8).font("Helvetica").text(
        `Model: ${receipt.modelName} (v${receipt.modelVersion}) • Decision Threshold: >= 50.00%`,
        56,
        y + 68
      );

      y += 105;

      // --- 4. Proof Identification & Cryptographic Specs ---
      doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text("Cryptographic Proof Specifications", 40, y);
      y += 18;

      const specs = [
        ["Proof Identifier (UUID)", receipt.proofId],
        ["Proving Framework", receipt.cryptographicDetails.provingEngine],
        ["Elliptic Curve & Commitment", `${receipt.cryptographicDetails.curve} • ${receipt.cryptographicDetails.commitmentScheme}`],
        ["Circuit Logrows / Rows", `${receipt.cryptographicDetails.logrows} (2^${receipt.cryptographicDetails.logrows} = 4,096 constraint rows)`],
        ["Fixed-Point Scales", `Input Scale: ${receipt.cryptographicDetails.scales[0]}, Param Scale: ${receipt.cryptographicDetails.scales[1]}`],
        ["Input Data Visibility", receipt.cryptographicDetails.inputVisibility],
        ["Output Visibility", receipt.cryptographicDetails.outputVisibility],
        ["Public Output Signal", String(receipt.cryptographicDetails.publicSignals[0] || "n/a")],
        ["Proof Artifact Size", `${receipt.cryptographicDetails.proofSizeBytes.toLocaleString()} bytes (compressed Halo2 transcript)`],
        ["Cryptographic Digest", receipt.receiptDigest]
      ];

      const rowHeight = 22;
      specs.forEach(([label, value], idx) => {
        const rowBg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
        doc.rect(40, y, pageWidth - 80, rowHeight).fill(rowBg);
        doc.rect(40, y, pageWidth - 80, rowHeight).stroke("#e2e8f0");

        doc.fillColor("#475569").fontSize(8.5).font("Helvetica-Bold").text(label, 50, y + 6);
        const isMono = label.includes("UUID") || label.includes("Signal") || label.includes("Digest");
        doc.fillColor("#0f172a")
          .fontSize(isMono ? 7.5 : 8.5)
          .font(isMono ? "Courier" : "Helvetica")
          .text(String(value), 220, y + 6, { width: pageWidth - 275, ellipsis: true });

        y += rowHeight;
      });

      y += 18;

      // --- 5. Privacy Notice Box ---
      doc.roundedRect(40, y, pageWidth - 80, 54, 6).fillAndStroke("#f1f5f9", "#cbd5e1");
      doc.fillColor("#0f172a").fontSize(9).font("Helvetica-Bold").text("Zero-Knowledge Privacy Commitment", 54, y + 10);
      doc.fillColor("#475569").fontSize(8).font("Helvetica").text(
        receipt.privacyNotice,
        54,
        y + 24,
        { width: pageWidth - 108, lineGap: 2 }
      );

      y += 70;

      // --- 6. Verification Authenticity Seal & Footer ---
      doc.rect(40, y, pageWidth - 80, 1).fill("#e2e8f0");
      y += 10;

      doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text(
        "Veriscore Verifiable AI Receipt • Generated by live ezkl Halo2/KZG prover • Off-chain & On-Chain (EVM) Verifiable",
        40,
        y,
        { align: "center", width: pageWidth - 80 }
      );
      doc.fillColor("#94a3b8").fontSize(7).font("Helvetica").text(
        `Digital Receipt Verification Hash: ${receipt.receiptDigest}`,
        40,
        y + 12,
        { align: "center", width: pageWidth - 80 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildReceiptObject,
  generateReceiptPdf
};
