# -*- coding: utf-8 -*-
"""
run_pipeline.py — Complete Model Pipeline (End-to-End)
======================================================

WHY THIS FILE EXISTS
--------------------
Before this file, you had separate scripts for each step:
  preprocess.py → train.py / mlp_model.py → export_mlp_onnx.py → (nothing for verify) → (nothing for exports/)

The problem: you had to run them in order, manually, and they each loaded
the data independently (so if you changed something in one, the others
wouldn't know). This file runs EVERYTHING in one shot, in the right order,
with consistent data flowing through each step.

Think of it like a factory assembly line vs. separate workshops — the
assembly line guarantees every piece fits together because they all come
from the same conveyor belt.

WHAT IT PRODUCES
----------------
After running this, you'll have:
  model-pipeline/
  ├── exports/
  │   ├── model.onnx           ← The ONNX model (for Member B / ezkl)
  │   ├── input.json            ← Sample calibration input (for ezkl)
  │   └── normalization.json    ← Mean/std stats (for the predict API)
  ├── loan_mlp.onnx             ← Same ONNX, also kept here for local use
  └── ACCURACY_REPORT.md        ← Auto-generated accuracy documentation

USAGE
-----
  cd model-pipeline
  python run_pipeline.py
"""

import json
import os
import sys
import time
from datetime import datetime

import numpy as np
import onnxruntime as ort
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split


# ================================================================
# CONFIGURATION
# ================================================================
# Putting constants at the top is a habit worth building — when
# someone else (or future-you) needs to tweak something, they
# don't have to hunt through 300 lines of code.

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(HERE, "loan_data.csv")
EXPORTS_DIR = os.path.join(HERE, "exports")

# Model hyperparameters
FEATURES = ["person_income", "credit_score", "person_emp_exp"]
TARGET = "loan_status"
TEST_SIZE = 0.20
RANDOM_STATE = 42
HIDDEN_LAYERS = [8, 4]       # 3 → 8 → 4 → 1
LEARNING_RATE = 0.001
EPOCHS = 100
DECISION_THRESHOLD = 0.5

# Sample input matching the API contract: [income, credit_score, years_employed]
API_SAMPLE_INPUT = [25000.0, 700.0, 3.0]


def print_banner(title):
    """Print a visible section header so you can scan the output easily."""
    width = 60
    print()
    print("=" * width)
    print(f"  {title}")
    print("=" * width)


# ================================================================
# STEP 1: LOAD AND SPLIT DATA
# ================================================================
#
# WHY we split BEFORE anything else:
#   The test set must NEVER influence training — not the model
#   weights, not the normalization stats, nothing. This is called
#   "data leakage" and it's one of the most common ML mistakes.
#   By splitting first, we guarantee the test set stays untouched.
#
# WHY stratify=y:
#   If 78% of loans are approved, a random split might give you
#   85% approved in train and 60% in test — the test set wouldn't
#   represent reality. stratify keeps the ratio the same in both.

print_banner("STEP 1: Load & Split Data")

data = pd.read_csv(DATASET_PATH)

X = data[FEATURES].values       # shape: (45001, 3)
y = data[TARGET].values          # shape: (45001,)

X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=TEST_SIZE,
    random_state=RANDOM_STATE,
    stratify=y,
)

print(f"Dataset:   {len(data):,} records")
print(f"Features:  {FEATURES}")
print(f"Train set: {len(X_train):,} records")
print(f"Test set:  {len(X_test):,} records")
print(f"Approval rate: {y.mean():.1%}")


# ================================================================
# STEP 2: COMPUTE NORMALIZATION STATS
# ================================================================
#
# WHY we normalize:
#   Income is ~10,000–200,000. Credit score is ~300–850. Years
#   employed is ~0–50. Without normalization, the income feature
#   dominates everything (bigger numbers = bigger gradients).
#   Normalization puts all features on the same scale.
#
# WHY we compute stats from TRAINING data only:
#   Same reason as the split — the test set must be invisible.
#   We compute mean/std from training data, then apply those
#   same numbers to the test data. This simulates production,
#   where you won't have future data to compute stats from.
#
# WHY we bake it INTO the model (register_buffer):
#   In production, the model needs to normalize its own inputs.
#   If normalization lives outside the model (like a separate
#   scaler), you have to ship two things and hope they stay in
#   sync. By baking mean/std into the model as buffers, the ONNX
#   file contains everything — one artifact, no coordination.

print_banner("STEP 2: Compute Normalization Stats")

X_train_t = torch.tensor(X_train, dtype=torch.float32)
X_test_t = torch.tensor(X_test, dtype=torch.float32)
y_train_t = torch.tensor(y_train, dtype=torch.float32)
y_test_t = torch.tensor(y_test, dtype=torch.float32)

mean = X_train_t.mean(dim=0)
std = X_train_t.std(dim=0)
std[std == 0] = 1  # Avoid division by zero (constant features)

print(f"Feature means: {mean.tolist()}")
print(f"Feature stds:  {std.tolist()}")


# ================================================================
# STEP 3: DEFINE THE MODEL
# ================================================================
#
# WHY this architecture (3 → 8 → 4 → 1):
#   - 3 inputs (our API contract features)
#   - 8 neurons in first hidden layer — enough capacity to learn
#     non-linear boundaries, but small enough for fast ZK proving
#   - 4 neurons in second layer — tapering down forces the model
#     to compress its representation
#   - 1 output (logit for approved/rejected)
#   - Total params: (3*8+8) + (8*4+4) + (4*1+1) = 32+36+5 = 73
#     That's TINY — exactly what ezkl needs. Bigger models =
#     exponentially slower proof generation.
#
# WHY ReLU (not sigmoid/tanh):
#   ReLU is just max(0, x) — it maps to a simple comparison gate
#   in a ZK circuit. Sigmoid/tanh involve exp() which is much
#   harder to represent in arithmetic circuits. ezkl supports
#   ReLU natively; other activations need approximation.
#
# WHY register_buffer for mean/std:
#   Regular Python variables in forward() work during training,
#   but when you export to ONNX, the exporter traces the
#   computation graph — it follows tensors, not Python variables.
#   register_buffer makes mean/std part of the model's state,
#   so they get captured in the ONNX graph automatically.

print_banner("STEP 3: Define Model Architecture")


class LoanMLP(nn.Module):

    def __init__(self, feature_mean, feature_std):
        super().__init__()

        self.register_buffer("mean", feature_mean)
        self.register_buffer("std", feature_std)

        self.network = nn.Sequential(
            nn.Linear(3, 8),
            nn.ReLU(),
            nn.Linear(8, 4),
            nn.ReLU(),
            nn.Linear(4, 1),
        )

    def forward(self, x):
        # Normalize inside the model — the ONNX graph will include this
        x = (x - self.mean) / self.std
        return self.network(x)


model = LoanMLP(mean, std)

total_params = sum(p.numel() for p in model.parameters())
print("Architecture: 3 -> 8 -> 4 -> 1")
print(f"Total parameters: {total_params}")
print(f"Activation: ReLU (ZK-friendly)")


# ================================================================
# STEP 4: HANDLE CLASS IMBALANCE
# ================================================================
#
# WHY pos_weight:
#   If 78% of loans are approved (class 1), a dumb model that
#   always says "approved" gets 78% accuracy — but it's useless
#   because it never catches the 22% that should be rejected.
#
#   pos_weight tells the loss function: "when the model gets a
#   rejected loan wrong, penalize it MORE." Specifically, we
#   set pos_weight = count_rejected / count_approved, so
#   misclassifying the minority class costs proportionally more.
#
# WHY BCEWithLogitsLoss (not BCELoss):
#   BCEWithLogitsLoss = sigmoid + binary cross-entropy in one step.
#   It's numerically more stable because it uses the log-sum-exp
#   trick internally, avoiding the log(0) problem that can happen
#   if you apply sigmoid first and get exactly 0 or 1.

print_banner("STEP 4: Configure Training")

positive_count = (y_train_t == 1).sum()
negative_count = (y_train_t == 0).sum()
pos_weight = negative_count / positive_count

loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

print(f"Approved in training set:  {positive_count.item():,}")
print(f"Rejected in training set:  {negative_count.item():,}")
print(f"pos_weight: {pos_weight.item():.4f}")
print(f"Optimizer: Adam (lr={LEARNING_RATE})")
print(f"Epochs: {EPOCHS}")


# ================================================================
# STEP 5: TRAIN THE MODEL
# ================================================================
#
# WHY 100 epochs is enough:
#   Our model is tiny (73 params) and the dataset is large (45k).
#   The loss typically converges by epoch 50-70. Training longer
#   risks overfitting (memorizing noise in the data).
#
# WHAT'S HAPPENING each epoch:
#   1. Forward pass: compute predictions for ALL training data
#   2. Compute loss: how wrong were we?
#   3. Backward pass: compute gradients (how to adjust each weight)
#   4. Optimizer step: actually adjust the weights

print_banner("STEP 5: Train Model")

train_start = time.time()

for epoch in range(EPOCHS):
    model.train()
    optimizer.zero_grad()

    output = model(X_train_t).squeeze()
    loss = loss_fn(output, y_train_t)
    loss.backward()
    optimizer.step()

    if (epoch + 1) % 25 == 0:
        print(f"  Epoch {epoch + 1:3d}/{EPOCHS} - Loss: {loss.item():.4f}")

train_time = time.time() - train_start
print(f"\nTraining completed in {train_time:.1f}s")


# ================================================================
# STEP 6: EVALUATE THE MODEL (PyTorch)
# ================================================================
#
# WHY we need more than just accuracy:
#   Accuracy = "what % did we get right overall"
#   Precision = "of all the loans we approved, how many deserved it?"
#   Recall = "of all the loans that deserved approval, how many did we catch?"
#   F1 = harmonic mean of precision and recall (balances both)
#
#   With imbalanced data, accuracy alone is misleading. A model
#   that always says "approved" gets 78% accuracy but 0% recall
#   on rejected loans — it's useless for catching risk.
#
# WHY threshold=0.5:
#   The model outputs a logit (raw score). sigmoid(logit) gives
#   a probability 0-1. We say "approved" if probability >= 0.5.
#   In production you might tune this (e.g., 0.6 to be more
#   conservative), but 0.5 is the standard starting point.

print_banner("STEP 6: Evaluate Model (PyTorch)")

model.eval()

with torch.no_grad():
    logits = model(X_test_t).squeeze()
    probabilities = torch.sigmoid(logits)
    predictions = (probabilities >= DECISION_THRESHOLD).int()

y_pred_pt = predictions.numpy()
y_true = y_test_t.int().numpy()

pt_accuracy = accuracy_score(y_true, y_pred_pt)
pt_precision = precision_score(y_true, y_pred_pt, zero_division=0)
pt_recall = recall_score(y_true, y_pred_pt, zero_division=0)
pt_f1 = f1_score(y_true, y_pred_pt, zero_division=0)
pt_cm = confusion_matrix(y_true, y_pred_pt)

print(f"Accuracy :  {pt_accuracy:.4f}")
print(f"Precision:  {pt_precision:.4f}")
print(f"Recall   :  {pt_recall:.4f}")
print(f"F1 Score :  {pt_f1:.4f}")
print(f"\nConfusion Matrix:")
print(f"  TN={pt_cm[0][0]:5d}  FP={pt_cm[0][1]:5d}")
print(f"  FN={pt_cm[1][0]:5d}  TP={pt_cm[1][1]:5d}")

# Test the API sample input
sample_tensor = torch.tensor([API_SAMPLE_INPUT])
with torch.no_grad():
    sample_prob = torch.sigmoid(model(sample_tensor)).item()
sample_decision = "approved" if sample_prob >= DECISION_THRESHOLD else "rejected"

print(f"\nAPI Sample Input: {API_SAMPLE_INPUT}")
print(f"Probability: {sample_prob:.4f}")
print(f"Decision: {sample_decision}")


# ================================================================
# STEP 7: EXPORT TO ONNX
# ================================================================
#
# WHY ONNX:
#   ONNX (Open Neural Network Exchange) is a universal model
#   format. PyTorch is great for training, but ezkl doesn't read
#   .pt files — it reads .onnx. ONNX describes the model as a
#   graph of mathematical operations (Add, MatMul, Relu, etc.)
#   that any runtime can execute.
#
# HOW torch.onnx.export works:
#   It's called "tracing" — PyTorch runs your model once with
#   the sample input, records every operation that happens, and
#   writes that recording as an ONNX graph. This means:
#   - Your forward() must be deterministic (no random stuff)
#   - Python control flow (if/else on input values) won't be
#     captured correctly (but we don't have any, so we're fine)
#
# WHY opset_version=17:
#   ONNX has versioned "opsets" (operator sets). Newer opsets
#   support more operations. 17 is well-supported by both
#   onnxruntime and ezkl. Don't use bleeding-edge opsets —
#   ezkl may not support them yet.
#
# WHY dynamic_axes:
#   Without this, the ONNX model is hardcoded to batch_size=1.
#   With dynamic_axes, it can handle any batch size. This is
#   important for ezkl calibration which may pass multiple inputs.

print_banner("STEP 7: Export to ONNX")

onnx_local_path = os.path.join(HERE, "loan_mlp.onnx")

torch.onnx.export(
    model,
    sample_tensor,
    onnx_local_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch_size"},
        "output": {0: "batch_size"},
    },
    opset_version=17,
)

onnx_size_kb = os.path.getsize(onnx_local_path) / 1024
print(f"ONNX model saved: {onnx_local_path}")
print(f"ONNX model size: {onnx_size_kb:.1f} KB")


# ================================================================
# STEP 8: VERIFY ONNX MATCHES PYTORCH (Golden Test)
# ================================================================
#
# WHY this step:
#   "Trust but verify." The ONNX export could silently produce
#   wrong results if an operator mapping is broken. We run the
#   same inputs through both PyTorch and ONNX Runtime and check
#   that the outputs match within a tiny tolerance.
#
#   We test multiple inputs, not just one, because some bugs only
#   show up at certain input ranges (e.g., negative values,
#   very large numbers, edge cases).
#
# WHAT tolerance means:
#   Floating-point math isn't exact — (0.1 + 0.2) != 0.3 in
#   most languages. ONNX Runtime may use slightly different
#   operation order than PyTorch, causing tiny differences
#   (like 0.7234 vs 0.7233). We allow differences up to 1e-5
#   (0.00001), which is way below any meaningful threshold.

print_banner("STEP 8: Verify ONNX Output (Golden Test)")

ort_session = ort.InferenceSession(onnx_local_path)

# Test with multiple inputs to catch edge cases
test_inputs = [
    [25000.0, 700.0, 3.0],      # API contract sample
    [120000.0, 800.0, 10.0],    # High income, high credit
    [15000.0, 450.0, 0.0],      # Low income, low credit
    [50000.0, 650.0, 5.0],      # Middle of the road
    [200000.0, 350.0, 1.0],     # High income, terrible credit
]

all_match = True
max_diff = 0.0

print(f"{'Input':<30} {'PyTorch':>10} {'ONNX':>10} {'Diff':>12} {'Match':>6}")
print("-" * 72)

for inp in test_inputs:
    # PyTorch prediction
    pt_input = torch.tensor([inp])
    with torch.no_grad():
        pt_out = model(pt_input).item()

    # ONNX Runtime prediction
    ort_input = {"input": np.array([inp], dtype=np.float32)}
    ort_out = ort_session.run(None, ort_input)[0][0][0]

    diff = abs(pt_out - ort_out)
    max_diff = max(max_diff, diff)
    match = diff < 1e-5

    if not match:
        all_match = False

    print(f"{str(inp):<30} {pt_out:>10.4f} {ort_out:>10.4f} {diff:>12.8f} {'PASS' if match else 'FAIL':>6}")

print(f"\nMax difference: {max_diff:.10f}")

if all_match:
    print("[PASS] ONNX export verified -- all outputs match PyTorch!")
else:
    print("[WARN] ONNX outputs differ from PyTorch beyond tolerance!")
    print("   This could indicate a problem with the export.")


# ================================================================
# STEP 9: COMPUTE ONNX ACCURACY ON FULL TEST SET
# ================================================================
#
# WHY we do this:
#   The golden test above checks individual outputs match. But
#   for the accuracy report, we need to know: does the ONNX model
#   produce the SAME classification decisions as PyTorch across
#   the entire test set? Even if individual logits differ by 1e-6,
#   a value right at the decision boundary (0.4999 vs 0.5001)
#   could flip a prediction. We need to measure this.

print_banner("STEP 9: ONNX Accuracy on Full Test Set")

ort_input_full = {"input": X_test.astype(np.float32)}
ort_logits = ort_session.run(None, ort_input_full)[0].squeeze()
ort_probs = 1.0 / (1.0 + np.exp(-ort_logits))   # sigmoid
ort_preds = (ort_probs >= DECISION_THRESHOLD).astype(int)

onnx_accuracy = accuracy_score(y_true, ort_preds)
onnx_precision = precision_score(y_true, ort_preds, zero_division=0)
onnx_recall = recall_score(y_true, ort_preds, zero_division=0)
onnx_f1 = f1_score(y_true, ort_preds, zero_division=0)
onnx_cm = confusion_matrix(y_true, ort_preds)

# How many predictions actually flipped between PyTorch and ONNX?
flipped = (y_pred_pt != ort_preds).sum()

print(f"ONNX Accuracy :  {onnx_accuracy:.4f}")
print(f"ONNX Precision:  {onnx_precision:.4f}")
print(f"ONNX Recall   :  {onnx_recall:.4f}")
print(f"ONNX F1 Score :  {onnx_f1:.4f}")
print(f"\nPredictions flipped (PyTorch -> ONNX): {flipped} / {len(y_true)}")
print(f"Accuracy drop: {abs(pt_accuracy - onnx_accuracy):.6f}")


# ================================================================
# STEP 10: CREATE EXPORTS DIRECTORY
# ================================================================
#
# WHY exports/:
#   Member B's README says: "place model.onnx + input.json in
#   model-pipeline/exports/ for Member B." This is the handoff
#   contract — a clean folder with exactly what they need,
#   nothing else. Think of it like a release artifact.

print_banner("STEP 10: Create Exports for Member B")

os.makedirs(EXPORTS_DIR, exist_ok=True)

# Copy ONNX model to exports/
import shutil
exports_onnx_path = os.path.join(EXPORTS_DIR, "model.onnx")
shutil.copy2(onnx_local_path, exports_onnx_path)
print("[OK] Copied model to: exports/model.onnx")

# Create input.json for ezkl calibration
# ezkl expects: {"input_data": [[val1, val2, val3]]}
input_json = {"input_data": [API_SAMPLE_INPUT]}
input_json_path = os.path.join(EXPORTS_DIR, "input.json")
with open(input_json_path, "w") as f:
    json.dump(input_json, f, indent=2)
print("[OK] Created: exports/input.json")

# Save normalization stats (for the predict API to use)
norm_json = {"mean": mean.tolist(), "std": std.tolist()}
norm_json_path = os.path.join(EXPORTS_DIR, "normalization.json")
with open(norm_json_path, "w") as f:
    json.dump(norm_json, f, indent=2)
print("[OK] Created: exports/normalization.json")

# Also save input.json and normalization.json locally
local_input_path = os.path.join(HERE, "input.json")
with open(local_input_path, "w") as f:
    json.dump(input_json, f, indent=2)

local_norm_path = os.path.join(HERE, "normalization.json")
with open(local_norm_path, "w") as f:
    json.dump(norm_json, f, indent=2)

print(f"\nExports directory contents:")
for fname in os.listdir(EXPORTS_DIR):
    fpath = os.path.join(EXPORTS_DIR, fname)
    size_kb = os.path.getsize(fpath) / 1024
    print(f"  {fname:<25} {size_kb:.1f} KB")


# ================================================================
# STEP 11: GENERATE ACCURACY REPORT
# ================================================================
#
# WHY auto-generate it:
#   The README checklist requires ACCURACY_REPORT.md. Writing it
#   by hand means it goes stale the moment you retrain. By
#   generating it from the actual numbers, it's always accurate.
#   This is a small example of a bigger principle: anything that
#   CAN be automated SHOULD be — human-maintained docs drift.

print_banner("STEP 11: Generate Accuracy Report")

report_path = os.path.join(HERE, "ACCURACY_REPORT.md")
timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

report = f"""# Accuracy Report - VeriScore Loan Model

> Auto-generated by `run_pipeline.py` on {timestamp}

## Model Architecture

| Property | Value |
|---|---|
| Type | PyTorch MLP (Multi-Layer Perceptron) |
| Architecture | 3 -> 8 -> 4 -> 1 |
| Activation | ReLU |
| Total Parameters | {total_params} |
| Input Features | `{FEATURES}` |
| Output | Binary (0 = rejected, 1 = approved) |
| Normalization | Baked into model (register_buffer) |

## Dataset

| Property | Value |
|---|---|
| Source | `loan_data.csv` |
| Total Records | {len(data):,} |
| Training Set | {len(X_train):,} ({100 - TEST_SIZE*100:.0f}%) |
| Test Set | {len(X_test):,} ({TEST_SIZE*100:.0f}%) |
| Approval Rate | {y.mean():.1%} |
| Class Balance | pos_weight = {pos_weight.item():.4f} |

## Training

| Property | Value |
|---|---|
| Optimizer | Adam (lr={LEARNING_RATE}) |
| Loss Function | BCEWithLogitsLoss (weighted) |
| Epochs | {EPOCHS} |
| Final Loss | {loss.item():.4f} |
| Training Time | {train_time:.1f}s |

## PyTorch Model Metrics (Baseline)

| Metric | Value |
|---|---|
| **Accuracy** | **{pt_accuracy:.4f}** |
| Precision | {pt_precision:.4f} |
| Recall | {pt_recall:.4f} |
| F1 Score | {pt_f1:.4f} |

### Confusion Matrix (PyTorch)

|  | Predicted Rejected | Predicted Approved |
|---|---|---|
| **Actually Rejected** | {pt_cm[0][0]:,} (TN) | {pt_cm[0][1]:,} (FP) |
| **Actually Approved** | {pt_cm[1][0]:,} (FN) | {pt_cm[1][1]:,} (TP) |

## ONNX Model Metrics (After Export)

| Metric | Value |
|---|---|
| **Accuracy** | **{onnx_accuracy:.4f}** |
| Precision | {onnx_precision:.4f} |
| Recall | {onnx_recall:.4f} |
| F1 Score | {onnx_f1:.4f} |

### Confusion Matrix (ONNX)

|  | Predicted Rejected | Predicted Approved |
|---|---|---|
| **Actually Rejected** | {onnx_cm[0][0]:,} (TN) | {onnx_cm[0][1]:,} (FP) |
| **Actually Approved** | {onnx_cm[1][0]:,} (FN) | {onnx_cm[1][1]:,} (TP) |

## ONNX vs PyTorch Comparison

| Metric | PyTorch | ONNX | Difference |
|---|---|---|---|
| Accuracy | {pt_accuracy:.4f} | {onnx_accuracy:.4f} | {abs(pt_accuracy - onnx_accuracy):.6f} |
| Precision | {pt_precision:.4f} | {onnx_precision:.4f} | {abs(pt_precision - onnx_precision):.6f} |
| Recall | {pt_recall:.4f} | {onnx_recall:.4f} | {abs(pt_recall - onnx_recall):.6f} |
| F1 Score | {pt_f1:.4f} | {onnx_f1:.4f} | {abs(pt_f1 - onnx_f1):.6f} |

- **Predictions flipped during ONNX export:** {flipped} / {len(y_true):,}
- **Max logit difference (golden test):** {max_diff:.10f}
- **Target:** < 1-2% accuracy drop -> **{"PASSED" if abs(pt_accuracy - onnx_accuracy) < 0.02 else "FAILED"}**

## ONNX Model Details

| Property | Value |
|---|---|
| File | `exports/model.onnx` |
| Size | {onnx_size_kb:.1f} KB |
| Opset Version | 17 |
| Input Name | `input` |
| Output Name | `output` |
| Input Shape | `[batch_size, 3]` |
| Output Shape | `[batch_size, 1]` |

## Sample Prediction (API Contract Test)

| Property | Value |
|---|---|
| Input | `{API_SAMPLE_INPUT}` |
| Probability | {sample_prob:.4f} |
| Decision | `{sample_decision}` |

This matches the API contract: `POST /api/predict` with `{{"input": {API_SAMPLE_INPUT}}}` -> `{{"output": "{sample_decision}", "modelVersion": "v1"}}`

## Notes for Member B (ZK Proving)

- The ONNX model includes built-in normalization (mean/std baked in via `register_buffer`), so raw inputs like `[25000, 700, 3]` can be fed directly -- no external preprocessing needed.
- The model uses only ReLU activations, which are natively supported by ezkl.
- Expected ezkl calibration input format: `{{"input_data": {API_SAMPLE_INPUT}}}`
- If proof generation takes > 60s, that is normal for zkML -- document it in benchmarks.
"""

with open(report_path, "w", encoding="utf-8") as f:
    f.write(report)

print("[OK] Generated: ACCURACY_REPORT.md")


# ================================================================
# FINAL SUMMARY
# ================================================================

print_banner("PIPELINE COMPLETE -- SUMMARY")

onnx_status = "[PASS] Verified" if all_match else "[WARN] Differences found"
print(f"""
  Model:       PyTorch MLP (3 -> 8 -> 4 -> 1), {total_params} params
  Accuracy:    {pt_accuracy:.4f} (PyTorch) / {onnx_accuracy:.4f} (ONNX)
  ONNX Match:  {onnx_status}
  Accuracy Drop: {abs(pt_accuracy - onnx_accuracy):.6f}

  Files created:
    +-- loan_mlp.onnx              (local ONNX model)
    +-- input.json                 (ezkl calibration input)
    +-- normalization.json         (mean/std for API)
    +-- ACCURACY_REPORT.md         (documentation)
    +-- exports/
        +-- model.onnx             (for Member B)
        +-- input.json             (for Member B)
        +-- normalization.json     (for Member C's API)

  Next steps:
    1. Member B: point ezkl at exports/model.onnx + exports/input.json
    2. Member C: use predict_mlp_api.py to bridge Node.js -> ONNX
    3. Test: python predict_mlp_api.py "[25000, 700, 3]"
""")
