import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import DemoForm from "./components/DemoForm.jsx";
import StatusPanel from "./components/StatusPanel.jsx";
import PrivacySection from "./components/PrivacySection.jsx";
import PipelineFlow from "./components/PipelineFlow.jsx";
import ClientVerifyPanel from "./components/ClientVerifyPanel.jsx";
import BlockchainPanel from "./components/BlockchainPanel.jsx";
import RegistryPanel from "./components/RegistryPanel.jsx";
import { IconAlert } from "./components/icons.jsx";
import { ThemeProvider } from "./theme.jsx";

const API_URL = window.__RUNTIME_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || "";

const MSG_SERVICE_DOWN =
  "Verification service unavailable. Confirm the backend (port 5000) and ZK proving service (port 8000) are running, then try again.";

// Hard capacity of the calibrated EZKL circuit: the ONNX model's first
// feature (annual income) is quantized with scales [11,18] into a 2x14-bit
// limb tower (base 16384, n=2). Any value above perFeatureMaxCalibrated
// cannot be decomposed and EZKL witness generation throws a genuine
// "decomposition error". This is a property of the existing circuit (see
// prover_service.py model_info() -> supportedRange), NOT a service bug.
const CIRCUIT_MAX_FEATURE = 131071;

function friendlyApiError(body, status, prediction) {
  const raw = String((body && body.error) || `Request failed (${status})`);
  const m = raw.toLowerCase();

  // 503 = a service is genuinely unreachable (connection refused/failed).
  if (status === 503 || /conn|refused|unreachable|prover is not running/.test(m)) {
    return "Backend API or ZK proving service is unreachable. Confirm the backend (port 5000) and ZK proving service (port 8000) are running, then try again.";
  }

  // 400 = input shape / value rejected before any proving happened.
  if (status === 400 || /invalid|input|feature/.test(m)) {
    return "Please enter valid financial inputs.";
  }

  // 502 = the backend reached the proving pipeline but ZK proof generation or
  // verification itself failed (e.g. the calibrated EZKL circuit rejected the
  // input as out of range). Surface the real cause instead of hiding it.
  if (status === 502) {
    const detail = String((body && body.detail) || "");
    if (/decomposition|too large to be represented|synthesis error/.test(detail + m)) {
      return (
        "ZK proof generation could not run: annual income exceeds the calibrated circuit's " +
        `maximum of ${CIRCUIT_MAX_FEATURE.toLocaleString("en-US")} USD/year ` +
        "(2x14-bit EZKL limb capacity). Enter an income at or below this limit."
      );
    }
    if (/proving service returned an error|proof generation|not available|prover/.test(m)) {
      return "ZK proof generation failed on the proving service." + (detail ? ` (${detail})` : "");
    }
    return "ZK proof generation failed on the backend." + (raw ? ` (${raw})` : "");
  }

  if (/verif/.test(m) && /fail/.test(m)) {
    return "Cryptographic verification failed.";
  }

  if (status >= 500) {
    return "Backend error" + (raw ? `: ${raw}` : "");
  }
  return raw;
}

function buildError(error) {
  // Preserve the real cause (e.g. fetch failure -> connection refused) instead
  // of returning a generic message.
  const msg = error && error.message ? error.message : MSG_SERVICE_DOWN;
  return /failed to fetch|networkerror|connect|refused|unreachable/i.test(msg)
    ? MSG_SERVICE_DOWN
    : msg;
}

function VerificationPage() {
  const [income, setIncome] = useState("");
  const [creditScore, setCreditScore] = useState("");
  const [yearsEmployed, setYearsEmployed] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | run | success | error
  const [error, setError] = useState(null);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/models`)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
      )
      .then((data) => {
        if (!cancelled) {
          setRegistry(data.models && data.models[0] ? data.models[0] : null);
        }
      })
      .catch((err) => {
        if (!cancelled) setRegistryError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (phase === "run") return;

    const raw = [income, creditScore, yearsEmployed];
    const nums = raw.map((v) => Number(v));
    const errors = {};

    if (String(income).trim() === "") {
      errors.income = "Annual income is required.";
    } else if (!Number.isFinite(nums[0]) || nums[0] <= 0) {
      errors.income = "Annual income must be a positive number.";
    } else if (nums[0] > CIRCUIT_MAX_FEATURE) {
      errors.income =
        `Annual income exceeds the proof circuit's maximum of ` +
        `${CIRCUIT_MAX_FEATURE.toLocaleString("en-US")} USD/year. ` +
        `Enter an income at or below this limit.`;
    }

    if (String(creditScore).trim() === "") {
      errors.creditScore = "Credit score is required.";
    } else if (
      !Number.isFinite(nums[1]) ||
      nums[1] < 0 ||
      nums[1] > 850
    ) {
      errors.creditScore = "Credit score must be between 0 and 850.";
    }

    if (String(yearsEmployed).trim() === "") {
      errors.yearsEmployed = "Years employed is required.";
    } else if (!Number.isFinite(nums[2]) || nums[2] < 0) {
      errors.yearsEmployed = "Years employed must be a valid non-negative number.";
    }

    if (Object.keys(errors).length > 0) {
      setResult(null);
      setError(null);
      setErrors(errors);
      setPhase("error");
      return;
    }

    setErrors({});
    setPhase("run");
    setError(null);
    setResult(null);
    setCopied(false);

    const input = nums;

    let res;
    try {
      res = await fetch(`${API_URL}/api/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input })
      });
    } catch (err) {
      setError(buildError(err));
      setPhase("error");
      return;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success !== true) {
      const prediction =
        body && body.prediction ? body.prediction : null;
      setError(friendlyApiError(body, res.status, prediction));
      setPhase("error");
      return;
    }

    setResult(body);
    setPhase("success");
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.proofId);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Header />
      <Hero />
      <div className="page">
        {/* ---------- AI Decision Verification (form | live status) ---------- */}
        <section
          className="section"
          id="verify"
          aria-labelledby="demo-title"
        >
          <div className="section-head">
            <span className="eyebrow">Live Demo</span>
            <h2 id="demo-title">AI Decision Verification</h2>
            <p>
              Verify a real AI decision without exposing the underlying input
              data.
            </p>
          </div>

          <div className="card demo-split">
            <DemoForm
              income={income}
              setIncome={setIncome}
              creditScore={creditScore}
              setCreditScore={setCreditScore}
              yearsEmployed={yearsEmployed}
              setYearsEmployed={setYearsEmployed}
              busy={phase === "run"}
              errors={errors}
              onClearError={(field) =>
                setErrors((prev) => {
                  if (!(field in prev)) return prev;
                  const next = { ...prev };
                  delete next[field];
                  return next;
                })
              }
              onSubmit={handleSubmit}
            />
            <StatusPanel
              phase={phase}
              error={error}
              result={result}
              copied={copied}
              onCopy={handleCopy}
            />
          </div>
        </section>

        {/* ---------- privacy ---------- */}
        <PrivacySection />

        {/* ---------- technical pipeline ---------- */}
        <PipelineFlow />

        {/* ---------- trustless + on-chain ---------- */}
        <ClientVerifyPanel />
        <BlockchainPanel />

        {/* ---------- model registry / technical dashboard ---------- */}
        {registryError && (
          <div className="error-panel" role="alert">
            <span className="icon">
              <IconAlert width={18} height={18} />
            </span>
            <div>Model registry unavailable. Does the backend expose /api/models?</div>
          </div>
        )}
        <RegistryPanel registry={registry} />

        {/* ---------- footer ---------- */}
        <footer className="footer">
          <span className="brand">
            <span className="logo">
              <svg
                viewBox="0 0 64 64"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M32 12l16 8v12c0 12-7 19-16 22-9-3-16-10-16-22V20l16-8z" />
              </svg>
            </span>
            Veriscore
          </span>
          <span className="stack">
            <span className="tag">EZKL 23.0.5</span>
            <span className="tag">bn254 • KZG</span>
            <span className="tag">Solidity Verifier</span>
            <span className="tag">Private Inputs</span>
          </span>
          <p className="footer-note">
            Veriscore local demo — every proof generated and verified live by
            the running pipeline.
          </p>
        </footer>
      </div>
    </>
  );
}

function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={<Landing onGetStarted={() => navigate("/home")} />}
      />
      <Route path="/home" element={<VerificationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;