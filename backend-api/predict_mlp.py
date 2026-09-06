import sys
import json
import os
import math
import numpy as np
import onnxruntime as ort


# ============================================
# MODEL PATH (process-safe, relative to repo)
# ============================================
# This is the SAME ONNX file Member B's proving service points at
# (models/loan_model/model.onnx), so the predicted output matches
# exactly what the zero-knowledge circuit computes.
#
# backend-api/predict_mlp.py  ->  ../models/loan_model/model.onnx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "..",
    "models",
    "loan_model",
    "model.onnx"
)


# ============================================
# LOAD ONNX MODEL
# ============================================

try:
    session = ort.InferenceSession(MODEL_PATH)

except Exception as error:
    print(json.dumps({
        "success": False,
        "error": "Could not load ONNX model",
        "details": str(error)
    }))
    sys.exit(1)


# ============================================
# READ INPUT FROM NODE.JS
# input is a JSON array: [income, credit_score, years_employed]
# e.g. "[25000.0, 700.0, 3.0]"
# ============================================

if len(sys.argv) < 2:

    print(json.dumps({
        "success": False,
        "error": "No input data received"
    }))

    sys.exit(1)


try:

    input_data = json.loads(sys.argv[1])

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Invalid JSON input",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# VALIDATE INPUT SHAPE
# ============================================

if not isinstance(input_data, list) or len(input_data) != 3:

    print(json.dumps({
        "success": False,
        "error": "Expected exactly 3 numeric features: "
                 "[income, credit_score, years_employed]"
    }))

    sys.exit(1)


# ============================================
# PREPARE ONNX INPUT
# shape: (1, 3) float32
# ============================================

try:

    onnx_input = np.array(
        [input_data],
        dtype=np.float32
    )

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Input features must be numeric",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# RUN MODEL  (output is a single logit)
# ============================================

try:

    outputs = session.run(None, {"input": onnx_input})

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "ONNX prediction failed",
        "details": str(error)
    }))

    sys.exit(1)


try:

    logit = float(np.asarray(outputs[0]).flatten()[0])

    # Convert logit -> probability -> 0/1 decision (threshold 0.5)
    probability = 1.0 / (1.0 + math.exp(-logit))

    prediction = 1 if probability >= 0.5 else 0

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Could not read prediction",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# DECISION
# ============================================

if prediction == 1:
    decision = "approved"
else:
    decision = "rejected"


# ============================================
# FINAL RESULT
# ============================================

result = {
    "success": True,
    "prediction": prediction,
    "decision": decision,
    "probability": round(probability, 4),
    "model": "loan_model.onnx",
    "modelVersion": "v1"
}


# ============================================
# SEND JSON TO NODE.JS
# ============================================

print(
    json.dumps(result)
)