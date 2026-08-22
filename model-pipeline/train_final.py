import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

import joblib


# ============================================================
# 1. LOAD DATASET
# ============================================================

data = pd.read_csv("loan_data.csv")

print("Dataset loaded successfully!")
print("Total records:", len(data))


# ============================================================
# 2. SELECT FEATURES
# ============================================================

# Numeric features
numeric_features = [
    "person_age",
    "person_income",
    "person_emp_exp",
    "loan_amnt",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score"
]


# Categorical features
categorical_features = [
    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
    "previous_loan_defaults_on_file"
]


# All input features
features = numeric_features + categorical_features

X = data[features]

# Target
y = data["loan_status"]


print("\nInput features:")
for feature in features:
    print("-", feature)


# ============================================================
# 3. TRAIN / TEST SPLIT
# ============================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


print("\nTraining records:", len(X_train))
print("Testing records :", len(X_test))


# ============================================================
# 4. PREPROCESSING
# ============================================================

# Numeric preprocessing
numeric_transformer = Pipeline(
    steps=[
        ("scaler", StandardScaler())
    ]
)


# Categorical preprocessing
categorical_transformer = Pipeline(
    steps=[
        (
            "onehot",
            OneHotEncoder(
                handle_unknown="ignore",
                sparse_output=False
            )
        )
    ]
)


# Combine both preprocessing methods
preprocessor = ColumnTransformer(
    transformers=[
        (
            "numeric",
            numeric_transformer,
            numeric_features
        ),
        (
            "categorical",
            categorical_transformer,
            categorical_features
        )
    ]
)


# ============================================================
# 5. CREATE MODEL
# ============================================================

model = LogisticRegression(
    max_iter=1000,
    random_state=42
)


# ============================================================
# 6. CREATE COMPLETE PIPELINE
# ============================================================

pipeline = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        ("model", model)
    ]
)


# ============================================================
# 7. TRAIN MODEL
# ============================================================

print("\nTraining final model...")

pipeline.fit(X_train, y_train)

print("Training completed!")


# ============================================================
# 8. PREDICTION
# ============================================================

y_pred = pipeline.predict(X_test)


# ============================================================
# 9. MODEL EVALUATION
# ============================================================

accuracy = accuracy_score(
    y_test,
    y_pred
)

precision = precision_score(
    y_test,
    y_pred,
    zero_division=0
)

recall = recall_score(
    y_test,
    y_pred,
    zero_division=0
)

f1 = f1_score(
    y_test,
    y_pred,
    zero_division=0
)


print("\n================================")
print("       FINAL MODEL RESULTS")
print("================================")

print(f"Accuracy :  {accuracy:.4f}")
print(f"Precision:  {precision:.4f}")
print(f"Recall   :  {recall:.4f}")
print(f"F1 Score :  {f1:.4f}")


# ============================================================
# 10. CONFUSION MATRIX
# ============================================================

print("\nConfusion Matrix:")

print(
    confusion_matrix(
        y_test,
        y_pred
    )
)


# ============================================================
# 11. TEST API-LIKE INPUT
# ============================================================

sample_input = pd.DataFrame(
    [
        {
            "person_age": 25,
            "person_income": 25000,
            "person_emp_exp": 3,
            "loan_amnt": 10000,
            "loan_int_rate": 10.5,
            "loan_percent_income": 0.40,
            "cb_person_cred_hist_length": 5,
            "credit_score": 700,
            "person_gender": "male",
            "person_education": "Bachelor",
            "person_home_ownership": "RENT",
            "loan_intent": "PERSONAL",
            "previous_loan_defaults_on_file": "No"
        }
    ]
)


prediction = pipeline.predict(
    sample_input
)[0]


probability = pipeline.predict_proba(
    sample_input
)[0][1]


if prediction == 1:
    decision = "approved"
else:
    decision = "rejected"


print("\n================================")
print("       SAMPLE PREDICTION")
print("================================")

print("Decision:", decision)
print("Approval probability:", round(probability, 4))


# ============================================================
# 12. SAVE MODEL
# ============================================================

joblib.dump(
    pipeline,
    "loan_model.pkl"
)

print("\nModel saved as: loan_model.pkl")