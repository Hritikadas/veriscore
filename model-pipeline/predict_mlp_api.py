"""
predict_mlp_api.py — Node.js ↔ ONNX Bridge (3-Feature MLP)
============================================================

WHAT THIS IS
------------
This script is called BY Node.js (Member C's backend), not by you
directly. When the Express server receives a POST /api/predict
request, it spawns this Python script, passes the input as a
command-line argument, and reads the JSON output from stdout.

The flow looks like this:

  User → React Frontend → Express Backend → [this script] → ONNX model
                                          ← JSON response ←

WHY A SEPARATE SCRIPT (not a Flask/FastAPI server):
  For a student project, a subprocess call is simpler than running
  two servers. Member C just does:
    const { execSync } = require('child_process');
    const result = JSON.parse(execSync(`python predict_mlp_api.py '${JSON.stringify(input)}'`));

  No CORS, no port conflicts, no process management. For production
  you'd use a proper API server, but for a demo this is perfect.

HOW IT MATCHES THE API CONTRACT
--------------------------------
  Input:  {"input": [25000, 700, 3]}        ← from API contract
  Output: {"output": "approved", "modelVersion": "v1"}  ← from API contract

  Internally we also return extra fields (probability, raw prediction)
  that the frontend can optionally display.

USAGE
-----
  # Direct test:
  python predict_mlp_api.py "[25000, 700, 3]"

  # From Node.js:
  const result = execSync('python predict_mlp_api.py \'[25000, 700, 3]\'');

  # With JSON object input:
  python predict_mlp_api.py "{\"input\": [25000, 700, 3]}"
"""

import json
import os
import sys

import numpy as np
import onnxruntime as ort


# ================================================================
# CONFIGURATION
# ================================================================

HERE = os.path.dirname(os.path.abspath(__file__))

# Try multiple model locations (flexibility)
MODEL_CANDIDATES = [
    os.path.join(HERE, "loan_mlp.onnx"),
    os.path.join(HERE, "exports", "model.onnx"),
]

DECISION_THRESHOLD = 0.5


# ================================================================
# 1. LOAD THE ONNX MODEL
# ================================================================
#
# WHY we load at script start (module level):
#   Model loading is the slowest part (~100-500ms). Since this
#   script is called once per request and then exits, we can't
#   avoid loading every time. But if you later switch to a
#   long-running server (FastAPI), moving this to module level
#   means the model loads once at startup, not per-request.

session = None
model_path = None

for candidate in MODEL_CANDIDATES:
    if os.path.exists(candidate):
        model_path = candidate
        break

if model_path is None:
    print(json.dumps({
        "success": False,
        "error": "No ONNX model found",
        "details": "Run 'python run_pipeline.py' first to generate the model.",
        "searched": MODEL_CANDIDATES,
    }))
    sys.exit(1)

try:
    session = ort.InferenceSession(model_path)
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": "Failed to load ONNX model",
        "details": str(e),
    }))
    sys.exit(1)


# ================================================================
# 2. PARSE INPUT FROM COMMAND LINE
# ================================================================
#
# We accept two formats:
#   Format A: [25000, 700, 3]               ← bare array
#   Format B: {"input": [25000, 700, 3]}    ← API contract format
#
# WHY both: Format B matches the API contract exactly. Format A
# is convenient for quick testing in the terminal.

if len(sys.argv) < 2:
    print(json.dumps({
        "success": False,
        "error": "No input provided",
        "usage": 'python predict_mlp_api.py "[25000, 700, 3]"',
    }))
    sys.exit(1)

try:
    raw_input = json.loads(sys.argv[1])
except json.JSONDecodeError as e:
    print(json.dumps({
        "success": False,
        "error": "Invalid JSON input",
        "details": str(e),
        "received": sys.argv[1],
    }))
    sys.exit(1)

# Handle both formats
if isinstance(raw_input, dict) and "input" in raw_input:
    input_array = raw_input["input"]
elif isinstance(raw_input, list):
    input_array = raw_input
else:
    print(json.dumps({
        "success": False,
        "error": "Unrecognized input format",
        "expected": '[25000, 700, 3] or {"input": [25000, 700, 3]}',
        "received": str(raw_input),
    }))
    sys.exit(1)


# ================================================================
# 3. VALIDATE INPUT
# ================================================================
#
# WHY we validate:
#   Garbage in, garbage out. If someone passes ["hello", true, -1],
#   the model will either crash or produce nonsense. Better to
#   catch it here with a clear error message than let ONNX Runtime
#   throw a cryptic C++ error.

if len(input_array) != 3:
    print(json.dumps({
        "success": False,
        "error": f"Expected 3 input values [income, credit_score, years_employed], got {len(input_array)}",
        "received": input_array,
    }))
    sys.exit(1)

try:
    input_values = [float(v) for v in input_array]
except (ValueError, TypeError) as e:
    print(json.dumps({
        "success": False,
        "error": "All input values must be numbers",
        "details": str(e),
        "received": input_array,
    }))
    sys.exit(1)


# ================================================================
# 4. RUN THE MODEL
# ================================================================
#
# The ONNX model already has normalization baked in (remember
# register_buffer from the training script?), so we feed raw
# values directly — no external scaler needed.
#
# The model outputs a single LOGIT (raw score, can be any real
# number). We apply sigmoid to get a probability (0 to 1), then
# compare against the threshold to make a decision.

try:
    onnx_input = {
        "input": np.array([input_values], dtype=np.float32)
    }

    outputs = session.run(None, onnx_input)
    logit = float(outputs[0][0][0])

    # sigmoid(logit) = probability
    probability = 1.0 / (1.0 + np.exp(-logit))

    if probability >= DECISION_THRESHOLD:
        decision = "approved"
        prediction = 1
    else:
        decision = "rejected"
        prediction = 0

except Exception as e:
    print(json.dumps({
        "success": False,
        "error": "Model inference failed",
        "details": str(e),
    }))
    sys.exit(1)


# ================================================================
# 5. OUTPUT RESULT
# ================================================================
#
# The primary fields match the API contract:
#   "output": "approved" or "rejected"
#   "modelVersion": "v1"
#
# We also include extra fields that the frontend can use:
#   "probability": 0.0 to 1.0 (for progress bars, confidence display)
#   "prediction": 0 or 1 (raw class label)
#   "success": true (so Node.js knows parsing worked)
#
# WHY json.dumps with no extra whitespace:
#   Node.js reads this from stdout. Extra whitespace doesn't
#   matter for JSON.parse(), but keeping it compact means less
#   data over the pipe and cleaner logs.

result = {
    "success": True,
    "output": decision,
    "modelVersion": "v1",
    "prediction": prediction,
    "probability": round(probability, 4),
    "model": os.path.basename(model_path),
}

print(json.dumps(result))
