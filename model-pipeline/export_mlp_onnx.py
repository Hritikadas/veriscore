"""
Train the PyTorch MLP loan model and export to ONNX + ezkl input.json.

This script:
1. Loads the same dataset and 3 features used in mlp_model.py
2. Trains the same MLP architecture (3 → 8 → 4 → 1)
3. Exports the trained model to ONNX format (single tensor input)
4. Creates an input.json in the format ezkl expects: {"input_data": [[...]]}

Output files (in this directory):
  - loan_mlp.onnx   → the ONNX model for ezkl
  - input.json       → sample calibration input for ezkl
  - normalization.json → saved mean/std so the API can normalize inputs

Usage:
  cd model-pipeline
  python export_mlp_onnx.py
"""
import json
import os

import pandas as pd
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------
# 1. Load dataset — same as mlp_model.py
# --------------------------------------------------
data = pd.read_csv(os.path.join(HERE, "loan_data.csv"))

X = data[["person_income", "credit_score", "person_emp_exp"]].values
y = data["loan_status"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)

X_train_t = torch.tensor(X_train, dtype=torch.float32)
X_test_t = torch.tensor(X_test, dtype=torch.float32)
y_train_t = torch.tensor(y_train, dtype=torch.float32)
y_test_t = torch.tensor(y_test, dtype=torch.float32)

# --------------------------------------------------
# 2. Compute normalization stats from training data
# --------------------------------------------------
mean = X_train_t.mean(dim=0)
std = X_train_t.std(dim=0)
std[std == 0] = 1  # avoid division by zero


# --------------------------------------------------
# 3. Define model — same architecture as mlp_model.py
#    but we bake mean/std as *buffer* constants so they
#    travel inside the ONNX graph (no external state).
# --------------------------------------------------
class LoanMLP(nn.Module):
    def __init__(self, mean, std):
        super().__init__()
        # register_buffer makes these part of the model state
        # (they'll be exported into the ONNX file)
        self.register_buffer("mean", mean)
        self.register_buffer("std", std)
        self.network = nn.Sequential(
            nn.Linear(3, 8),
            nn.ReLU(),
            nn.Linear(8, 4),
            nn.ReLU(),
            nn.Linear(4, 1),
        )

    def forward(self, x):
        x = (x - self.mean) / self.std
        return self.network(x)


model = LoanMLP(mean, std)

# --------------------------------------------------
# 4. Train — same as mlp_model.py
# --------------------------------------------------
positive_count = (y_train_t == 1).sum()
negative_count = (y_train_t == 0).sum()
pos_weight = negative_count / positive_count

loss_fn = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

print("Training PyTorch MLP (100 epochs)...")
for epoch in range(100):
    model.train()
    optimizer.zero_grad()
    output = model(X_train_t).squeeze()
    loss = loss_fn(output, y_train_t)
    loss.backward()
    optimizer.step()
    if (epoch + 1) % 25 == 0:
        print(f"  Epoch {epoch+1}/100 — Loss: {loss.item():.4f}")

# --------------------------------------------------
# 5. Quick accuracy check
# --------------------------------------------------
model.eval()
with torch.no_grad():
    logits = model(X_test_t).squeeze()
    preds = (torch.sigmoid(logits) >= 0.5).int()
    accuracy = (preds == y_test_t.int()).float().mean().item()

print(f"\nTest accuracy: {accuracy:.4f}")

# --------------------------------------------------
# 6. Export to ONNX
# --------------------------------------------------
sample_input = torch.tensor([[25000.0, 700.0, 3.0]])
onnx_path = os.path.join(HERE, "loan_mlp.onnx")

torch.onnx.export(
    model,
    sample_input,
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    opset_version=17,
)
print(f"\nONNX model saved: {onnx_path}")

# --------------------------------------------------
# 7. Create input.json for ezkl calibration
#    Format: {"input_data": [[val1, val2, val3]]}
# --------------------------------------------------
input_json = {"input_data": [sample_input.tolist()[0]]}
input_path = os.path.join(HERE, "input.json")
with open(input_path, "w") as f:
    json.dump(input_json, f, indent=2)
print(f"ezkl input saved: {input_path}")

# --------------------------------------------------
# 8. Save normalization stats (for reference)
# --------------------------------------------------
norm_path = os.path.join(HERE, "normalization.json")
with open(norm_path, "w") as f:
    json.dump({"mean": mean.tolist(), "std": std.tolist()}, f, indent=2)
print(f"Normalization stats saved: {norm_path}")

print("\n✅ Done! Next: point zk-proving-service at loan_mlp.onnx")
