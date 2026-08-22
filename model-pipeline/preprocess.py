import pandas as pd
from sklearn.model_selection import train_test_split

# Load the loan dataset
data = pd.read_csv("loan_data.csv")

# Select the 3 inputs defined in our API contract
X = data[
    [
        "person_income",
        "credit_score",
        "person_emp_exp"
    ]
]

# Select the prediction/output
y = data["loan_status"]

# Split data into 80% training and 20% testing
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

# Display basic information
print("Total records:", len(data))
print("Training records:", len(X_train))
print("Testing records:", len(X_test))

print("\nInput features:")
print(X.columns.tolist())

print("\nFirst 5 training records:")
print(X_train.head())

print("\nFirst 5 target values:")
print(y_train.head())