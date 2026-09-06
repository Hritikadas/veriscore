import VerifyStepper from "./VerifyStepper.jsx";
import ResultPanel from "./ResultPanel.jsx";
import {
  IconAlert,
  IconShield
} from "./icons.jsx";

const SAMPLE = "[25000, 700, 3]";

export default function StatusPanel({
  phase,
  error,
  result,
  copied,
  onCopy
}) {
  return (
    <div className="pane pane-status" role="status" aria-live="polite" aria-atomic="false">
      <div className="status-eyebrow">
        <span>Live Verification</span>
        <span className="status-hint">
          {phase === "run"
            ? "proving…"
            : phase === "success"
              ? "complete"
              : phase === "error"
                ? "failed"
                : "idle"}
        </span>
      </div>

      {phase === "run" && <VerifyStepper phase="run" />}

      {phase === "error" && (
        <>
          <VerifyStepper phase="error" />
          <div className="error-panel" role="alert">
            <span className="icon">
              <IconAlert width={18} height={18} />
            </span>
            <div>
              <strong>Verification failed.</strong> {error}
            </div>
          </div>
        </>
      )}

      {phase === "success" && result && (
        <ResultPanel result={result} copied={copied} onCopy={onCopy} />
      )}

      {phase === "idle" && !result && (
        <div className="empty-status">
          <span className="empty-badge">
            <IconShield width={22} height={22} />
          </span>
          <span className="empty-title">Awaiting verification</span>
          <span className="empty-sub">
            Enter your inputs on the left and run the pipeline to generate and
            verify a zero-knowledge proof for an AI decision.
          </span>
          <code className="empty-sample">{SAMPLE}</code>
        </div>
      )}

      {phase === "idle" && result && (
        <ResultPanel result={result} copied={copied} onCopy={onCopy} />
      )}
    </div>
  );
}