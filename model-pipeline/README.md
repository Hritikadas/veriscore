# Member A — Model Pipeline

**Your job:** pick a use case, train a small model, and get it into a format the ZK proving service can consume.

## Why this matters (in the architecture)
This is the "Model Preparation & Quantization" layer from the original design. ezkl handles the actual fixed-point quantization for you internally, so your real job is: **build a real, working ML model and export it correctly.**

## Recommended use case for a beginner team
Pick something with a **small, tabular/simple model** — this keeps proving time low and lets the whole pipeline actually finish.

Good choices:
- Loan/credit approval classifier (tabular data, logistic regression or small MLP)
- Handwritten digit classifier (MNIST, small CNN) — classic but proofs are slower
- Simple health-risk score predictor

Avoid for v1: large CNNs, transformers, anything with >1M parameters — proving time explodes (this is literally KPI #2 in the original spec: 10,000x–100,000x overhead).

## Tasks
1. **Dataset**: find/clean a small public dataset (Kaggle, UCI ML repo) matching your use case.
2. **Train**: build a small model in PyTorch (keep it under ~50k parameters for v1).
3. **Evaluate**: record baseline accuracy — you'll need this to measure accuracy loss later.
4. **Export to ONNX**:
   ```python
   import torch
   torch.onnx.export(model, sample_input, "model.onnx",
                      input_names=["input"], output_names=["output"])
   ```
5. **Sanity check** the ONNX export with `onnxruntime` — confirm outputs match the PyTorch model.
6. **Hand off**: place `model.onnx` + a sample input file (`input.json`) in `model-pipeline/exports/` for Member B.
7. **Document accuracy loss**: after Member B runs it through ezkl's quantization, compare quantized vs original accuracy — target <1–2% drop. Write this up in `model-pipeline/ACCURACY_REPORT.md`.

## Deliverables checklist
- [ ] `train.py` — training script
- [ ] `evaluate.py` — accuracy evaluation
- [ ] `export_onnx.py` — ONNX export + validation
- [ ] `exports/model.onnx` + `exports/input.json`
- [ ] `ACCURACY_REPORT.md`

## Handoff contract with Member B
Member B needs from you: a valid `.onnx` file + one example input in JSON array format matching the model's input shape. Agree on the exact input shape together before Week 3.
