import pandas as pd
import joblib

from skl2onnx import to_onnx
from skl2onnx.common.data_types import FloatTensorType, StringTensorType


# Load trained model
model = joblib.load("loan_model.pkl")


# Sample input
sample_input = pd.DataFrame([
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
])


# Convert numeric columns to float32
numeric_columns = [
    "person_age",
    "person_income",
    "person_emp_exp",
    "loan_amnt",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score"
]

for column in numeric_columns:
    sample_input[column] = sample_input[column].astype("float32")


# Categorical columns
categorical_columns = [
    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
    "previous_loan_defaults_on_file"
]


# Define ONNX input types explicitly
initial_types = []

for column in numeric_columns:
    initial_types.append(
        (column, FloatTensorType([None, 1]))
    )

for column in categorical_columns:
    initial_types.append(
        (column, StringTensorType([None, 1]))
    )


# Convert complete pipeline to ONNX
onnx_model = to_onnx(
    model,
    initial_types=initial_types,
    target_opset=17
)


# Save ONNX model
with open("loan_model.onnx", "wb") as file:
    file.write(onnx_model.SerializeToString())


print("===================================")
print("ONNX EXPORT COMPLETED!")
print("===================================")
print("Saved as: loan_model.onnx")
print("Numeric inputs: float32")
print("Categorical inputs: string")