"""
Compare original floating-point ONNX inference vs genuine Q8.8 inference
for the required test inputs. Reports absolute logit error, probability
difference, and decision consistency. Read-only, does not modify any model.
"""
from __future__ import annotations

import json
import math
import os

import numpy as np
import onnxruntime as ort

from q8_8_model import q8_8_predict_logit

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "..", "models", "loan_model", "model.onnx")

TESTS = [
    [25000.0, 700.0, 3.0],
    [50000.0, 750.0, 7.0],
    [80000.0, 800.0, 10.0],
    [15000.0, 450.0, 1.0],
]


def float_predict(x):
    s = ort.InferenceSession(MODEL_PATH)
    logit = float(s.run(None, {"input": np.array([x], dtype=np.float32)})[0].flatten()[0])
    prob = 1.0 / (1.0 + math.exp(-logit))
    decision = "approved" if prob >= 0.5 else "rejected"
    return logit, prob, decision


def main():
    rows = []
    for x in TESTS:
        f_logit, f_prob, f_dec = float_predict(x)
        q = q8_8_predict_logit(x)
        q_logit = q["logit"]
        q_prob = 1.0 / (1.0 + math.exp(-q_logit))
        q_dec = "approved" if q_prob >= 0.5 else "rejected"

        abs_err = abs(f_logit - q_logit)
        prob_diff = abs(f_prob - q_prob)
        rows.append(
            {
                "input": x,
                "float_logit": round(f_logit, 6),
                "q8_8_logit": round(q_logit, 6),
                "abs_logit_error": round(abs_err, 6),
                "float_probability": round(f_prob, 6),
                "q8_8_probability": round(q_prob, 6),
                "probability_diff": round(prob_diff, 6),
                "float_decision": f_dec,
                "q8_8_decision": q_dec,
                "decision_consistent": f_dec == q_dec,
            }
        )

    print(json.dumps(rows, indent=2))

    ok = all(r["decision_consistent"] for r in rows)
    print("\nDECISION CONSISTENCY:", "PASS" if ok else "FAIL")


if __name__ == "__main__":
    main()