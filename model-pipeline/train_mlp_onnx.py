"""
Retrain the Veriscore loan-approval MLP and export to ONNX.

Label semantics fix
-------------------
The raw CSV column `loan_status` in this credit-risk dataset means
"loan default / high risk" (class 1 = the borrower defaulted). e.g. in the
data, class 1 has *lower* income, *higher* loan interest rate and *higher*
loan-percent-of-income, while credit_score / years_employed barely differ
between classes.

Earlier training fed `loan_status` directly into the MLP and then labeled the
output "approved" when prediction == 1. That is a label-sense inversion: the
model was really estimating P(default) but the demo displayed it as
P(approval). That, plus the near-zero separation of credit_score and
years_employed in this dataset, made the output collapse to a near-constant
logit (~0.1-0.23) -> flat 53-56% "approval" probabilities for any input.

This script trains the SAME small, EZKL-friendly architecture
(3 -> 8 -> 4 -> 1) on the *reinterpreted* target

    target = 1 - loan_status     (1 = approved / low risk)

so a single sigmoid now directly reads as P(approval) and the existing
predict_mlp.py threshold logic (>= 0.5 -> approved) becomes correct.

Normalization (z-score of the training set) is baked into the ONNX graph as
model buffers, matching how the EZKL circuit proves the full pipeline.

Outputs (repo-relative):
    models/loan_model/model.onnx        <- the file the whole pipeline proves
    model-pipeline/loan_mlp.onnx        <- mirror copy for the model pipeline
    model-pipeline/normalization.json   <- mean/std for reference
    models/loan_model/input.json        <- sample calibration input for ezkl
"""
import json
import os

import numpy as np
import torch
import torch.nn as nn

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
CSV_PATH = os.path.join(HERE, "loan_data.csv")
OUT_ONNX_MODEL = os.path.join(REPO, "models", "loan_model", "model.onnx")
OUT_ONNX_MIRROR = os.path.join(HERE, "loan_mlp.onnx")
OUT_NORM = os.path.join(HERE, "normalization.json")
OUT_INPUT_JSON = os.path.join(REPO, "models", "loan_model", "input.json")

FEATURES = ["person_income", "credit_score", "person_emp_exp"]

# EZKL constraint: keep the architecture identical (3->8->4->1) so the circuit
# stays small and provable. Do NOT grow the network.
HIDDEN = [8, 4]


def load_dataset():
    df = np.genfromtxt(CSV_PATH, delimiter=",", names=True)
    n = len(df)
    X = np.column_stack([df[f].astype(float) for f in FEATURES])
    y = df["loan_status"].astype(float)
    # Reinterpret: class 1 = default/risk -> target 1 = approved/low-risk.
    y_approval = 1.0 - y
    return X, y_approval


def main():
    X, y = load_dataset()
    assert X.shape[1] == 3, "model expects exactly 3 features"

    # Stratified 80/20 split, reproducible (same seed/semantics as before).
    rng = np.random.RandomState(42)
    cls0 = np.where(y == 0)[0]
    cls1 = np.where(y == 1)[0]
    rng.shuffle(cls0)
    rng.shuffle(cls1)
    te0 = int(0.20 * len(cls0))
    te1 = int(0.20 * len(cls1))
    test_idx = np.concatenate([cls0[:te0], cls1[:te1]])
    train_idx = np.concatenate([cls0[te0:], cls1[te1:]])
    X_tr, X_te = X[train_idx], X[test_idx]
    y_tr, y_te = y[train_idx], y[test_idx]

    X_tr_t = torch.tensor(X_tr, dtype=torch.float32)
    X_te_t = torch.tensor(X_te, dtype=torch.float32)
    y_tr_t = torch.tensor(y_tr, dtype=torch.float32)
    y_te_t = torch.tensor(y_te, dtype=torch.float32)

    mean = X_tr_t.mean(dim=0)
    std = X_tr_t.std(dim=0)
    std[std == 0] = 1  # avoid division by zero

    class LoanMLP(nn.Module):
        def __init__(self, mean, std):
            super().__init__()
            self.register_buffer("mean", mean)
            self.register_buffer("std", std)
            self.network = nn.Sequential(
                nn.Linear(3, HIDDEN[0]),
                nn.ReLU(),
                nn.Linear(HIDDEN[0], HIDDEN[1]),
                nn.ReLU(),
                nn.Linear(HIDDEN[1], 1),
            )

        def forward(self, x):
            x = (x - self.mean) / self.std
            return self.network(x)

    model = LoanMLP(mean, std)

    # Class imbalance for the approval target.
    # positive class = approved (= 1 - loan_status, the *majority* at ~78%),
    # negative class = rejected (= loan_status, the minority at ~22%).
    # pos_weight = neg/pos < 1 counterbalances the majority bias so the model
    # does not collapse to "always approve" and instead surfaces a genuine,
    # sensible rejection/approval spread. Full value comes from the data.
    pos = (y_tr_t == 1).sum()
    neg = y_tr_t.numel() - pos
    pos_weight = (neg / pos).clamp(min=0.01)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    torch.manual_seed(42)
    print(f"Training MLP on {X_tr.shape[0]} samples "
          f"(target = 1 - loan_status, i.e. approval={int(pos)} / reject={int(neg)}; "
          f"pos_weight={pos_weight:.3f})")
    for epoch in range(250):
        model.train()
        optimizer.zero_grad()
        logits = model(X_tr_t).squeeze()
        loss = loss_fn(logits, y_tr_t)
        loss.backward()
        optimizer.step()
        if (epoch + 1) % 50 == 0:
            print(f"  epoch {epoch+1}/250  loss={loss.item():.4f}")

    # Evaluate.
    model.eval()
    with torch.no_grad():
        logits_te = model(X_te_t).squeeze()
        probs_te = torch.sigmoid(logits_te)
        preds = (probs_te >= 0.5).int()
        acc = (preds == y_te_t.int()).float().mean().item()
    print(f"Test accuracy (approval/reject): {acc:.4f}")

    # Sanity table on representative inputs (model logits, before export).
    print("\nRepresentative inputs (PyTorch model logits):")
    sample_input = torch.tensor([[25000.0, 700.0, 3.0]])
    with torch.no_grad():
        for row in [[30000,450,1],[40000,500,2],[80000,750,8],[100000,800,10],
                    [25000,700,3],[15000,300,0],[120000,800,15],[50000,600,3]]:
            logit = model(torch.tensor([row], dtype=torch.float32)).item()
            print(f"  {row} -> logit={logit:+.4f}")

    # ---- Export to ONNX with normalization baked in. ----
    os.makedirs(os.path.dirname(OUT_ONNX_MODEL), exist_ok=True)
    torch.onnx.export(
        model,
        sample_input,
        OUT_ONNX_MODEL,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
        opset_version=17,
    )
    # Mirror copy (used by tests / model pipeline swaps).
    torch.onnx.export(
        model,
        sample_input,
        OUT_ONNX_MIRROR,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
        opset_version=17,
    )

    with open(OUT_NORM, "w") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f, indent=2)
    with open(OUT_INPUT_JSON, "w") as f:
        json.dump({"input_data": [sample_input.tolist()[0]]}, f, indent=2)

    # ---- PyTorch vs ONNX parity check ----
    import onnxruntime as ort

    sess = ort.InferenceSession(OUT_ONNX_MODEL, providers=["CPUExecutionProvider"])
    rows = [[30000,450,1],[40000,500,2],[80000,750,8],[100000,800,10],[25000,700,3],
            [15000,300,0],[120000,800,15],[50000,600,3],[131000,850,20]]
    print("\nPyTorch vs ONNX parity (max abs logit diff):")
    with torch.no_grad():
        maxdiff = 0.0
        for row in rows:
            pt = model(torch.tensor([row], dtype=torch.float32)).item()
            on = float(sess.run(None, {"input": np.array([row], dtype=np.float32)})[0][0][0])
            maxdiff = max(maxdiff, abs(pt - on))
            print(f"  {row}: pt={pt:+.4f} onnx={on:+.4f}")
    print(f"  max |pt - onnx| = {maxdiff:.6f}")

    print("ONNX exported ->", OUT_ONNX_MODEL)
    print("normalization ->", OUT_NORM)
    print("sample input  ->", OUT_INPUT_JSON)
    print("Done.")


if __name__ == "__main__":
    main()
