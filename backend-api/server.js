const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawn } = require("child_process");
const { buildReceiptObject, generateReceiptPdf } = require("./receiptGenerator");

const app = express();

// Allow override via environment variables (no hardcoded absolute paths).
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const PYTHON = process.env.PYTHON || "python";
// Helper to ensure PROVER_SERVICE_URL is always a valid absolute URL
function normalizeUrl(url) {
    if (!url) return "http://127.0.0.1:8000";
    let u = url.trim();
    if (!u.startsWith("http://") && !u.startsWith("https://")) {
        if (u.includes(".") && !u.startsWith("127.0.0.1") && !u.startsWith("localhost")) {
            u = `https://${u}`;
        } else {
            u = `http://${u}`;
        }
    }
    if (u.startsWith("http://") && u.includes(".onrender.com")) {
        u = u.replace("http://", "https://");
    }
    return u.replace(/\/+$/, "");
}

// Member B's FastAPI proving service (only needed by /api/verify, /api/prove, /api/models).
const PROVER_SERVICE_URL = normalizeUrl(process.env.PROVER_SERVICE_URL);
console.log(`[backend] Configured PROVER_SERVICE_URL: ${PROVER_SERVICE_URL}`);

// Maximum annual income in INR: ₹1,00,00,000 (1 crore)
const MAX_ANNUAL_INCOME = 10000000;

// Middleware
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Helpers (paths are all repo-relative, never machine-specific)
// ---------------------------------------------------------------------------

const repoRoot = path.join(__dirname, "..");

const MODEL_PREDICT_SCRIPT = path.join(__dirname, "predict_mlp.py");
const LEGACY_PREDICT_SCRIPT = path.join(
    repoRoot,
    "model-pipeline",
    "predict_api.py"
);
const PROVE_SCRIPT = path.join(__dirname, "call_prover.py");

/**
 * Spawn a Python script with a single JSON argument.
 * Resolves with { code, stdout, stderr }. Rejects if Python itself
 * could not be launched (e.g. "python" not on PATH).
 */
function runPython(scriptPath, jsonArg) {
    return new Promise((resolve, reject) => {
        const child = spawn(PYTHON, [scriptPath, jsonArg]);

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => (stdout += data.toString()));
        child.stderr.on("data", (data) => (stderr += data.toString()));

        child.on("error", (err) =>
            reject(new Error(`Could not start Python: ${err.message}`))
        );

        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

/** Parse the JSON that the Python script printed to stdout. */
function parsePythonJson(stdout) {
    try {
        return JSON.parse(stdout.trim());
    } catch (err) {
        return null;
    }
}

/**
 * Validate a 3-feature numeric input: [income, credit_score, years_employed].
 * Accepts either { input: [..] } or { input_data: [[..]] } (ezkl style).
 * Returns the flat array, or null if invalid.
 */
function normalizeNumericInput(body) {
    let values = null;

    if (Array.isArray(body.input)) {
        values = body.input;
    } else if (
        Array.isArray(body.input_data) &&
        Array.isArray(body.input_data[0])
    ) {
        values = body.input_data[0];
    }

    if (
        !values ||
        values.length !== 3 ||
        !values.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
        return null;
    }

    return values;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "Veriscore Backend API is running",
        status: "success"
    });
});

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "healthy",
        service: "Veriscore Backend API"
    });
});

/**
 * MLaaS-style model registry (Phase 6). Forwarded to Member B's ZK proving
 * service; additive - nothing else changed, proofs/predict still work exactly
 * as before.
 */
async function forwardZk(req, res, method, path, body) {
    let response;
    try {
        response = await fetch(`${PROVER_SERVICE_URL}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (err) {
        console.error("Proving service unreachable:", err.message);
        return res.status(503).json({
            success: false,
            error: "Proving service is not running (uvicorn api_server:app --port 8000)"
        });
    }
    if (response.status === 404) {
        return res.status(404).json({ success: false, error: "Not found" });
    }
    const data = await response.json().catch(() => null);
    return response.ok
        ? res.status(response.status).json(data)
        : res.status(502).json({ success: false, error: "Proving service error", detail: data });
}

app.get("/api/models", (req, res) => {
    forwardZk(req, res, "GET", "/api/models", null);
});

app.get("/api/models/:id", (req, res) => {
    forwardZk(req, res, "GET", `/api/models/${encodeURIComponent(req.params.id)}`, null);
});

app.post("/api/models/:id/infer", (req, res) => {
    const body = req.body && Array.isArray(req.body.input)
        ? { input: req.body.input }
        : null;
    if (!body || body.input.length !== 3) {
        return res.status(400).json({
            success: false,
            error: "Expected { input: [income, credit_score, years_employed] }"
        });
    }
    if (body.input[0] < 0 || body.input[0] > MAX_ANNUAL_INCOME) {
        return res.status(400).json({
            success: false,
            error: "Annual income must be between 0 and ₹1,00,00,000 (1 crore INR)"
        });
    }
    forwardZk(req, res, "POST", `/api/models/${encodeURIComponent(req.params.id)}/infer`, body);
});

/**
 * POST /api/predict
 *
 * Two accepted input shapes:
 *   1) Legacy (13 loan fields - kept for backwards compatibility):
 *      { "input": { person_age, person_income, ... } }
 *   2) New ZK-compatible (3 numeric features):
 *      { "input": [25000.0, 700.0, 3.0] }
 *
 * Response depends on which model was used.
 */
app.post("/api/predict", async (req, res) => {
    const input = req.body.input;

    // Reject missing/null/falsy input (covers null, undefined, "", 0, false).
    // This guard must run before any object field access so that invalid
    // input returns HTTP 400 instead of crashing the server.
    if (!input) {
        return res.status(400).json({
            success: false,
            error: "Input data is required"
        });
    }

    // ---- New path: 3 numeric features -> PyTorch MLP (ONNX) -----------------
    if (Array.isArray(input)) {
        const values = normalizeNumericInput({ input });
        if (!values) {
            return res.status(400).json({
                success: false,
                error:
                    "Expected exactly 3 numeric features: " +
                    "[income, credit_score, years_employed]"
            });
        }
        if (values[0] < 0 || values[0] > MAX_ANNUAL_INCOME) {
            return res.status(400).json({
                success: false,
                error: "Annual income must be between 0 and ₹1,00,00,000 (1 crore INR)"
            });
        }

        let result = null;

        // Try HTTP to ZK/Prover microservice first if available
        try {
            const resp = await fetch(`${PROVER_SERVICE_URL}/api/models/loan-v1/infer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: values })
            });
            if (resp.ok) {
                const data = await resp.json();
                result = {
                    success: true,
                    modelVersion: data.version || "v1",
                    prediction: data.approved ? 1 : 0,
                    decision: data.approved ? "approved" : "rejected",
                    probability: data.probability
                };
            }
        } catch (e) {
            // Fallback to local python script if HTTP service is unreachable
        }

        if (!result) {
            try {
                const proc = await runPython(
                    MODEL_PREDICT_SCRIPT,
                    JSON.stringify(values)
                );
                result = parsePythonJson(proc.stdout);

                if (proc.code !== 0 || !result || result.success !== true) {
                    console.error("MLP prediction failed:", proc.stderr);
                    return res.status(500).json({
                        success: false,
                        error: "Model prediction failed"
                    });
                }
            } catch (err) {
                console.error("MLP prediction error:", err.message);
                return res.status(500).json({
                    success: false,
                    error: "Model prediction failed"
                });
            }
        }

        return res.json({
            success: true,
            modelVersion: result.modelVersion || "v1",
            prediction: result.prediction,
            decision: result.decision,
            probability: result.probability
        });
    }

    // ---- Legacy path: 13 loan fields -> predict_api.py ----------------------
    const requiredFields = [
        "person_age",
        "person_income",
        "person_emp_exp",
        "loan_amnt",
        "loan_int_rate",
        "loan_percent_income",
        "cb_person_cred_hist_length",
        "credit_score",
        "person_gender",
        "person_education",
        "person_home_ownership",
        "loan_intent",
        "previous_loan_defaults_on_file"
    ];

    const missingFields = requiredFields.filter(
        (field) => input[field] === undefined
    );

    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields",
            missingFields: missingFields
        });
    }

    let output;
    let errorOutput = "";

    try {
        const proc = await runPython(
            LEGACY_PREDICT_SCRIPT,
            JSON.stringify(input)
        );
        output = proc.stdout;
        errorOutput = proc.stderr;

        if (proc.code !== 0) {
            console.error("Python Error:", errorOutput);
            return res.status(500).json({
                success: false,
                error: "Model prediction failed"
            });
        }
    } catch (err) {
        console.error("Python Error:", err.message);
        return res.status(500).json({
            success: false,
            error: "Model prediction failed"
        });
    }

    const predictionResult = parsePythonJson(output);
    if (!predictionResult) {
        console.error("Invalid Python response:", output);
        return res.status(500).json({
            success: false,
            error: "Invalid prediction response"
        });
    }

    return res.json({
        success: true,
        modelVersion: "v1",
        prediction: predictionResult
    });
});

/**
 * POST /api/prove
 *
 * Single orchestration endpoint for Member D:
 *   1. Predict with the 3-feature PyTorch MLP (readable outcome)
 *   2. Generate a ZK proof via Member B's proving service (call_prover.py or HTTP API,
 *      which proves AND verifies in one go)
 *
 * Body: { "input": [25000.0, 700.0, 3.0] }   or
 *       { "input_data": [[25000.0, 700.0, 3.0]] }
 *
 * Response: { success, prediction, decision, probability,
 *             proof, public_output, verified, proofId }
 */
app.post("/api/prove", async (req, res) => {
    const values = normalizeNumericInput(req.body);

    if (!values) {
        return res.status(400).json({
            success: false,
            error:
                "Expected exactly 3 numeric features: " +
                "[income, credit_score, years_employed]"
        });
    }
    if (values[0] < 0 || values[0] > MAX_ANNUAL_INCOME) {
        return res.status(400).json({
            success: false,
            error: "Annual income must be between 0 and ₹1,00,00,000 (1 crore INR)"
        });
    }

    // Step 1: Prediction
    let predictor = null;
    let proverInferErr = null;

    try {
        console.log(`[backend] Requesting prediction from ${PROVER_SERVICE_URL}/api/models/loan-v1/infer ...`);
        const inferResp = await fetch(`${PROVER_SERVICE_URL}/api/models/loan-v1/infer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: values })
        });
        if (inferResp.ok) {
            const data = await inferResp.json();
            predictor = {
                success: true,
                modelVersion: data.version || "v1",
                prediction: data.approved ? 1 : 0,
                decision: data.approved ? "approved" : "rejected",
                probability: data.probability
            };
        } else {
            const errText = await inferResp.text().catch(() => "");
            proverInferErr = `HTTP ${inferResp.status} ${errText}`;
            console.error(`[backend] Prover infer returned error: ${proverInferErr}`);
        }
    } catch (e) {
        proverInferErr = e.message;
        console.error(`[backend] Prover infer connection failed: ${e.message}`);
        // Fallback to local python script
    }

    if (!predictor) {
        try {
            console.log("[backend] Falling back to local python prediction script...");
            const proc = await runPython(
                MODEL_PREDICT_SCRIPT,
                JSON.stringify(values)
            );
            predictor = parsePythonJson(proc.stdout);

            if (proc.code !== 0 || !predictor || predictor.success !== true) {
                console.error("Local python prediction failed:", proc.stderr || proc.stdout);
                return res.status(500).json({
                    success: false,
                    error: `Prediction step failed. Prover service error: ${proverInferErr || "none"}. Local python error: ${proc.stderr || "non-zero exit"}`
                });
            }
        } catch (err) {
            console.error("Local python execution error:", err.message);
            return res.status(500).json({
                success: false,
                error: `Prediction step failed. Prover service unreachable (${proverInferErr || err.message}) and local python unavailable.`
            });
        }
    }

    // Step 2: ZK proof generation + verification
    let prover = null;

    // Try HTTP proving service endpoint first
    try {
        console.log(`[backend] Requesting ZK proof from ${PROVER_SERVICE_URL}/generate-proof ...`);
        const proveResp = await fetch(`${PROVER_SERVICE_URL}/generate-proof`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: values })
        });

        if (proveResp.ok) {
            const genData = await proveResp.json();
            const proofId = genData.proofId;

            // Verify the generated proof
            let verified = false;
            console.log(`[backend] Verifying ZK proof ${proofId} with ${PROVER_SERVICE_URL}/verify-proof ...`);
            const verifyResp = await fetch(`${PROVER_SERVICE_URL}/verify-proof`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proofId })
            });
            if (verifyResp.ok) {
                const verifyData = await verifyResp.json();
                verified = Boolean(verifyData.verified);
            }

            prover = {
                success: true,
                proof: genData.proof,
                public_output: genData.publicSignals,
                verified: verified,
                proofId: proofId
            };
        } else {
            const errText = await proveResp.text().catch(() => "");
            console.error(`[backend] Prover generate-proof returned HTTP ${proveResp.status}: ${errText}`);
        }
    } catch (e) {
        console.error(`[backend] Prover generate-proof failed: ${e.message}`);
        // Fallback to local python script
    }

    if (!prover) {
        try {
            const proc = await runPython(PROVE_SCRIPT, JSON.stringify(values));

            if (proc.code !== 0) {
                console.error("Proving step failed:", proc.stderr);
                return res.status(502).json({
                    success: false,
                    error:
                        "ZK proof generation is not available right now. " +
                        "Check that Member B's proving service is set up " +
                        "(see backend-api/README.md).",
                    prediction: predictor
                });
            }

            prover = parsePythonJson(proc.stdout);
            if (!prover || prover.success !== true) {
                console.error("Proving step returned an error:", proc.stdout);
                return res.status(502).json({
                    success: false,
                    error:
                        "ZK proof generation is not available right now. " +
                        "Check that Member B's proving service is set up " +
                        "(see backend-api/README.md).",
                    prediction: predictor
                });
            }
        } catch (err) {
            console.error("Proving step error:", err.message);
            return res.status(502).json({
                success: false,
                error:
                    "ZK proof generation is not available right now. " +
                    "Check that Member B's proving service is set up " +
                    "(see backend-api/README.md).",
                prediction: predictor
            });
        }
    }

    return res.json({
        success: true,
        modelVersion: predictor.modelVersion || "v1",
        prediction: predictor.prediction,
        decision: predictor.decision,
        probability: predictor.probability,
        proof: prover.proof,
        public_output: prover.public_output,
        verified: prover.verified,
        proofId: prover.proofId
    });
});

/**
 * POST /api/verify
 *
 * Verifies a previously generated proof via Member B's FastAPI service.
 * Body: { "proofId": "..." }
 *
 * Note: standalone verification requires Member B's api_server.py to be
 * running (uvicorn). If it is not reachable we return a clear 503 instead
 * of guessing.
 */
app.post("/api/verify", async (req, res) => {
    const proofId = req.body && req.body.proofId;

    if (!proofId || typeof proofId !== "string") {
        return res.status(400).json({
            success: false,
            error: "proofId is required"
        });
    }

    let response;
    try {
        response = await fetch(`${PROVER_SERVICE_URL}/verify-proof`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proofId })
        });
    } catch (err) {
        console.error("Proving service unreachable:", err.message);
        return res.status(503).json({
            success: false,
            error:
                "Proving service is not running. " +
                "Start Member B's service: uvicorn app.api_server:app --port 8000"
        });
    }

    if (response.status === 404) {
        return res.status(404).json({
            success: false,
            error: "Unknown proofId"
        });
    }

    if (!response.ok) {
        return res.status(502).json({
            success: false,
            error: "Proving service returned an error"
        });
    }

    const body = await response.json();
    return res.json({
        success: true,
        verified: body.verified,
        status: body.status || (body.verified ? "VERIFIED" : "REJECTED"),
        error: body.error || null,
        proofId: body.proofId || proofId,
        verifyTimeSec: body.verifyTimeSec
    });
});

/**
 * POST /api/trust-lab/verify
 *
 * Runs an authentic cryptographic verification in Trust Lab with optional
 * deliberate tampering. Original proofs on disk are NEVER overwritten.
 * Body: { proofId: string, tamperType?: string, customPayload?: object }
 */
app.post("/api/trust-lab/verify", async (req, res) => {
    const { proofId, tamperType = "original", customPayload } = req.body || {};

    if (!proofId || typeof proofId !== "string" || !proofId.trim()) {
        return res.status(400).json({
            success: false,
            error: "proofId is required and must be a non-empty string"
        });
    }

    const validTamperTypes = ["original", "tamper_public_output", "tamper_proof_bytes", "tamper_both", "custom"];
    if (!validTamperTypes.includes(tamperType)) {
        return res.status(400).json({
            success: false,
            error: `Invalid tamperType '${tamperType}'. Allowed values: ${validTamperTypes.join(", ")}`
        });
    }

    if (tamperType === "custom" && (!customPayload || typeof customPayload !== "object")) {
        return res.status(400).json({
            success: false,
            error: "customPayload object is required when tamperType is 'custom'"
        });
    }

    let response;
    try {
        response = await fetch(`${PROVER_SERVICE_URL}/verify-tamper`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proofId: proofId.trim(), tamperType, customPayload })
        });
    } catch (err) {
        console.error("[backend] Proving service unreachable for Trust Lab:", err.message);
        return res.status(503).json({
            success: false,
            error: "Proving service is not running. Start Member B's service: uvicorn api_server:app --port 8000"
        });
    }

    if (response.status === 404) {
        return res.status(404).json({
            success: false,
            error: `Unknown proofId: ${proofId}`
        });
    }

    if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
            success: false,
            error: errDetail.detail || "Proving service returned an error during tamper verification"
        });
    }

    const result = await response.json();
    return res.json(result);
});

/**
 * GET /api/trust-lab/recent-proofs
 *
 * Lists recent proofs generated by the pipeline for Trust Lab inspection.
 */
app.get("/api/trust-lab/recent-proofs", async (req, res) => {
    let response;
    try {
        response = await fetch(`${PROVER_SERVICE_URL}/api/trust-lab/recent-proofs`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });
        if (response.ok) {
            const data = await response.json();
            return res.json({ success: true, proofs: data.proofs || [] });
        }
    } catch (e) {
        // Fallback to local filesystem inspect
    }

    // Local filesystem fallback
    try {
        const fs = require("fs");
        const proofsDir = path.join(repoRoot, "artifacts", "proofs");
        if (!fs.existsSync(proofsDir)) {
            return res.json({ success: true, proofs: [] });
        }
        const entries = [];
        const dirs = fs.readdirSync(proofsDir);
        for (const pid of dirs) {
            const pfile = path.join(proofsDir, pid, "proof.json");
            const mfile = path.join(proofsDir, pid, "meta.json");
            if (fs.existsSync(pfile)) {
                let meta = {};
                try {
                    if (fs.existsSync(mfile)) meta = JSON.parse(fs.readFileSync(mfile, "utf8"));
                } catch {}
                const stat = fs.statSync(pfile);
                entries.push({
                    proofId: pid,
                    timestamp: stat.mtimeMs,
                    input: meta.input,
                    output: meta.output,
                    proofSizeBytes: meta.proofSizeBytes || stat.size,
                    generationTimeSec: meta.generationTimeSec
                });
            }
        }
        entries.sort((a, b) => b.timestamp - a.timestamp);
        return res.json({ success: true, proofs: entries.slice(0, 20) });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Helper to fetch stored proof info and live verify it against the proving service.
 * Never trusts unverified claims; verifies live before issuing a receipt.
 */
async function getVerifiedReceiptData(proofId, clientData = {}) {
    const fs = require("fs");
    let proofData = null;
    let metaData = {};

    // 1. Fetch proof artifact from prover microservice or disk
    try {
        const resp = await fetch(`${PROVER_SERVICE_URL}/proof/${proofId}`);
        if (resp.ok) {
            proofData = await resp.json();
        }
    } catch (e) {}

    const proofFile = path.join(repoRoot, "artifacts", "proofs", proofId, "proof.json");
    const metaFile = path.join(repoRoot, "artifacts", "proofs", proofId, "meta.json");

    if (!proofData && fs.existsSync(proofFile)) {
        try {
            proofData = JSON.parse(fs.readFileSync(proofFile, "utf8"));
        } catch (e) {}
    }

    if (fs.existsSync(metaFile)) {
        try {
            metaData = JSON.parse(fs.readFileSync(metaFile, "utf8"));
        } catch (e) {}
    }

    if (!proofData && !fs.existsSync(proofFile)) {
        return null;
    }

    // 2. Cryptographic live verification: never issue a VERIFIED receipt without prover confirmation
    let isVerified = false;
    let verificationError = null;
    try {
        const vResp = await fetch(`${PROVER_SERVICE_URL}/verify-proof`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proofId })
        });
        if (vResp.ok) {
            const vResult = await vResp.json();
            isVerified = vResult.verified === true;
            if (!isVerified) {
                verificationError = vResult.error || "Cryptographic constraint check rejected the proof";
            }
        } else {
            verificationError = "Proving service returned verification failure";
        }
    } catch (err) {
        verificationError = `Proving service verification unreachable: ${err.message}`;
    }

    // 3. Resolve decision & probability safely without exposing raw inputs
    let decision = clientData.decision || metaData.decision || (proofData && proofData.decision);
    let probability = clientData.probability !== undefined
        ? clientData.probability
        : (metaData.probability !== undefined ? metaData.probability : (proofData && proofData.probability));

    if (!decision || probability === undefined) {
        // Fallback to rawOutput if neither client nor metaData provided it
        const rawOutput = (proofData && proofData.output) || metaData.output || [];
        const rawVal = Array.isArray(rawOutput) && rawOutput.length > 0 ? parseFloat(rawOutput[0]) : null;
        if (rawVal !== null && !isNaN(rawVal)) {
            probability = probability !== undefined ? probability : rawVal;
            decision = decision || (rawVal >= 0.5 ? "APPROVED" : "REJECTED");
        } else {
            decision = decision || "REJECTED";
            probability = probability !== undefined ? probability : 0.0;
        }
    }

    const publicSignals = (proofData && (proofData.publicSignals || proofData.instances)) || [];
    const proofSizeBytes = (proofData && proofData.proofSizeBytes) || metaData.proofSizeBytes || 26902;

    return buildReceiptObject({
        proofId,
        decision,
        probability,
        modelVersion: clientData.modelVersion || "1.0.0",
        verified: isVerified,
        publicOutput: publicSignals,
        proofSizeBytes,
        verificationError
    });
}

/**
 * GET /api/receipt/:proofId
 * Query: ?format=pdf | json (default: json)
 * Returns a cryptographically grounded, privacy-preserving AI decision receipt.
 */
app.get("/api/receipt/:proofId", async (req, res) => {
    const proofId = req.params.proofId;
    if (!proofId || typeof proofId !== "string" || !proofId.trim()) {
        return res.status(400).json({ success: false, error: "proofId is required" });
    }

    const receipt = await getVerifiedReceiptData(proofId.trim(), {
        decision: req.query.decision,
        probability: req.query.probability ? parseFloat(req.query.probability) : undefined,
        modelVersion: req.query.modelVersion
    });

    if (!receipt) {
        return res.status(404).json({ success: false, error: `Unknown proofId: ${proofId}` });
    }

    if (req.query.format === "pdf" || req.headers.accept?.includes("application/pdf")) {
        try {
            const pdfBuffer = await generateReceiptPdf(receipt);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="veriscore-decision-receipt-${proofId.slice(0, 8)}.pdf"`);
            return res.send(pdfBuffer);
        } catch (err) {
            console.error("[backend] PDF receipt generation error:", err);
            return res.status(500).json({ success: false, error: "Failed to generate PDF receipt" });
        }
    }

    return res.json({ success: true, receipt });
});

/**
 * POST /api/receipt
 * Body: { proofId, decision?, probability?, modelVersion?, format? }
 * Verifies the proof live and returns either JSON receipt or PDF attachment.
 */
app.post("/api/receipt", async (req, res) => {
    const { proofId, decision, probability, modelVersion, format = "json" } = req.body || {};

    if (!proofId || typeof proofId !== "string" || !proofId.trim()) {
        return res.status(400).json({ success: false, error: "proofId is required" });
    }

    const receipt = await getVerifiedReceiptData(proofId.trim(), {
        decision,
        probability,
        modelVersion
    });

    if (!receipt) {
        return res.status(404).json({ success: false, error: `Unknown proofId: ${proofId}` });
    }

    if (format === "pdf") {
        try {
            const pdfBuffer = await generateReceiptPdf(receipt);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="veriscore-decision-receipt-${proofId.slice(0, 8)}.pdf"`);
            return res.send(pdfBuffer);
        } catch (err) {
            console.error("[backend] PDF receipt generation error:", err);
            return res.status(500).json({ success: false, error: "Failed to generate PDF receipt" });
        }
    }

    return res.json({ success: true, receipt });
});

// Centralized error handler (must come AFTER all routes).
// Prevents Express's default HTML error page (which leaks filesystem
// paths / stack traces) from reaching the client, especially for
// malformed JSON bodies rejected by express.json().
app.use((err, req, res, next) => {
    // Log the real cause server-side only; never echo it to the client.
    console.error("Request error:", err.message || err);

    // body-parser marks malformed JSON with type "entity.parse.failed"
    // (and also a SyntaxError with status 400 from express.json()).
    const isBadJson =
        err.type === "entity.parse.failed" ||
        (err instanceof SyntaxError && err.status === 400);

    if (isBadJson) {
        return res.status(400).json({
            success: false,
            error: "Invalid JSON request body"
        });
    }

    // Generic fallback for any other unexpected error: no internals leaked.
    return res.status(500).json({
        success: false,
        error: "Internal server error"
    });
});

// Start server
app.listen(PORT, HOST, () => {
    console.log("=================================");
    console.log("VERISCORE BACKEND API");
    console.log("=================================");
    console.log(`Server running on http://${HOST}:${PORT}`);
console.log(`Health:       GET  http://localhost:${PORT}/api/health`);
console.log(`Models:       GET  http://localhost:${PORT}/api/models`);
console.log(`Model detail: GET  http://localhost:${PORT}/api/models/loan-v1`);
console.log(`Model infer:  POST http://localhost:${PORT}/api/models/loan-v1/infer`);
console.log(`Predict:      POST http://localhost:${PORT}/api/predict`);
console.log(`Prove:        POST http://localhost:${PORT}/api/prove`);
console.log(`Verify:       POST http://localhost:${PORT}/api/verify`);
    console.log("=================================");
});