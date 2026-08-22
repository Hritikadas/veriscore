import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

# Load dataset
data = pd.read_csv("loan_data.csv")

# Input features - API Contract
X = data[
    [
        "person_income",
        "credit_score",
        "person_emp_exp"
    ]
]

# Target
y = data["loan_status"]

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

# Scale the input features
scaler = StandardScaler()

X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Create ML model
model = LogisticRegression(
    class_weight="balanced",
    random_state=42
)
# Train model
model.fit(X_train_scaled, y_train)

# Make predictions
y_pred = model.predict(X_test_scaled)

# Calculate accuracy
accuracy = accuracy_score(y_test, y_pred)

print("Model training completed!")
print("Test Accuracy:", accuracy)

# Test one sample
sample = [[25000, 700, 3]]
sample_scaled = scaler.transform(sample)

prediction = model.predict(sample_scaled)[0]

if prediction == 1:
    print("Sample Prediction: APPROVED")
else:
    print("Sample Prediction: REJECTED")