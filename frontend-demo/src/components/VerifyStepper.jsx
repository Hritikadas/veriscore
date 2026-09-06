import { useEffect, useState } from "react";
import {
  IconCheck,
  IconAlert,
  IconScan,
  IconChip,
  IconCube,
  IconShield,
  IconArrow
} from "./icons.jsx";

const STEPS = [
  {
    title: "Input Validated",
    desc: "Validating & prepping inputs",
    icon: IconScan
  },
  {
    title: "AI Model Executed",
    desc: "Running model in circuit",
    icon: IconChip
  },
  {
    title: "ZK Proof Generated",
    desc: "ezkl 23.0.5 proof produced",
    icon: IconCube
  },
  {
    title: "Proof Verified",
    desc: "Checked against verifying key",
    icon: IconShield
  }
];

export default function VerifyStepper({ phase }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (phase === "run") {
      setStage(0);
      const t1 = setTimeout(() => setStage(1), 500);
      const t2 = setTimeout(() => setStage(2), 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (phase === "success") {
      setStage(4);
    }
  }, [phase]);

  const status = (i) => {
    if (phase === "success") return "done";
    if (i < stage) return "done";
    if (i === stage) return phase === "error" ? "error" : "active";
    return "pending";
  };

  let progress = 0;
  if (phase === "success") progress = 100;
  else if (phase === "error") progress = (Math.min(stage, 3) / 4) * 100;
  else progress = (Math.min(stage, 3) + (stage < 3 ? 0.5 : 0)) / 4 * 100;

  return (
    <div className="stepper" role="status" aria-live="polite">
      <div className="stepper-head">
        <span className="stepper-label">
          {phase === "error"
            ? "Verification failed"
            : phase === "success"
              ? "Verification complete"
              : "Verification pipeline"}
        </span>
      </div>

      <div className="stepper-bar">
        <div
          className={`stepper-bar-fill${phase === "error" ? " error" : ""}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="steps">
        {STEPS.map((s, i) => {
          const st = status(i);
          const Icon = st === "done" ? IconCheck : st === "error" ? IconAlert : s.icon;
          return (
            <span key={s.title} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && (
                <span className="step-arrow" aria-hidden="true">
                  <IconArrow width={13} height={13} />
                </span>
              )}
              <span className={`step-cell ${st}`}>
                <span className="step-dot" aria-hidden="true">
                  <Icon width={14} height={14} strokeWidth={2.2} />
                </span>
                <span className="step-text">
                  <span className="step-title">{s.title}</span>
                  <span className="step-desc">{s.desc}</span>
                  {st !== "pending" && (
                    <span className="step-desc step-state">
                      {st === "done"
                        ? "Complete"
                        : st === "active"
                          ? "Working…"
                          : "Failed"}
                    </span>
                  )}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}