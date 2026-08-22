import pandas as pd
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score


# --------------------------------------------------
# 1. Load dataset
# --------------------------------------------------

data = pd.read_csv("loan_data.csv")


# API Contract inputs
X = data[
    [
        "person_income",
        "credit_score",
        "person_emp_exp"
    ]
].values


# Output
y = data["loan_status"].values


# --------------------------------------------------
# 2. Train-test split
# --------------------------------------------------

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


# --------------------------------------------------
# 3. Convert data to PyTorch tensors
# --------------------------------------------------

X_train = torch.tensor(X_train, dtype=torch.float32)
X_test = torch.tensor(X_test, dtype=torch.float32)

y_train = torch.tensor(y_train, dtype=torch.float32)
y_test = torch.tensor(y_test, dtype=torch.float32)


# --------------------------------------------------
# 4. Calculate normalization values
# --------------------------------------------------

mean = X_train.mean(dim=0)
std = X_train.std(dim=0)

# Avoid division by zero
std[std == 0] = 1


# --------------------------------------------------
# 5. Create Neural Network
# --------------------------------------------------

class LoanModel(nn.Module):

    def __init__(self):
        super().__init__()

        self.network = nn.Sequential(
            nn.Linear(3, 8),
            nn.ReLU(),
            nn.Linear(8, 4),
            nn.ReLU(),
            nn.Linear(4, 1)
        )

    def forward(self, x):

        # Normalize input
        x = (x - mean) / std

        return self.network(x)


model = LoanModel()


# --------------------------------------------------
# 6. Handle class imbalance
# --------------------------------------------------

positive_count = (y_train == 1).sum()
negative_count = (y_train == 0).sum()

pos_weight = negative_count / positive_count

loss_function = nn.BCEWithLogitsLoss(
    pos_weight=pos_weight
)

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.001
)


# --------------------------------------------------
# 7. Train model
# --------------------------------------------------

print("Training PyTorch model...")

for epoch in range(100):

    model.train()

    optimizer.zero_grad()

    output = model(X_train).squeeze()

    loss = loss_function(output, y_train)

    loss.backward()

    optimizer.step()

    if (epoch + 1) % 10 == 0:
        print(
            f"Epoch {epoch + 1}/100 - "
            f"Loss: {loss.item():.4f}"
        )


# --------------------------------------------------
# 8. Evaluate model
# --------------------------------------------------

model.eval()

with torch.no_grad():

    logits = model(X_test).squeeze()

    probabilities = torch.sigmoid(logits)

    predictions = (
        probabilities >= 0.5
    ).int()


y_pred = predictions.numpy()
y_true = y_test.numpy()


accuracy = accuracy_score(y_true, y_pred)

precision = precision_score(
    y_true,
    y_pred,
    zero_division=0
)

recall = recall_score(
    y_true,
    y_pred,
    zero_division=0
)

f1 = f1_score(
    y_true,
    y_pred,
    zero_division=0
)


# --------------------------------------------------
# 9. Display results
# --------------------------------------------------

print("\n===== PYTORCH MODEL RESULTS =====")

print(f"Accuracy :  {accuracy:.4f}")
print(f"Precision:  {precision:.4f}")
print(f"Recall   :  {recall:.4f}")
print(f"F1 Score :  {f1:.4f}")


# --------------------------------------------------
# 10. Test API example
# --------------------------------------------------

sample = torch.tensor(
    [[25000, 700, 3]],
    dtype=torch.float32
)

with torch.no_grad():

    sample_probability = torch.sigmoid(
        model(sample)
    ).item()

if sample_probability >= 0.5:
    decision = "approved"
else:
    decision = "rejected"


print("\nSample Input:")
print("[25000, 700, 3]")

print("Approval Probability:", sample_probability)

print("Sample Prediction:", decision)