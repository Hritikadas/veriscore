import pandas as pd
import joblib
import onnxruntime as ort
import numpy as np


# ==========================================
# 1. Load original trained model
# ==========================================

model = joblib.load("loan_model.pkl")


# ==========================================
# 2. Load ONNX model
# ==========================================

session = ort.InferenceSession("loan_model.onnx")


# ==========================================
# 3. Same test input
# ==========================================

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


# ==========================================
# 4. Numeric columns
# ==========================================

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


# ==========================================
# 5. Convert numeric values to float32
# ==========================================

for column in numeric_columns:
    sample_input[column] = sample_input[column].astype(np.float32)


# ==========================================
# 6. Original model prediction
# ==========================================

original_prediction = model.predict(sample_input)[0]

original_probability = model.predict_proba(
    sample_input
)[0][1]


# ==========================================
# 7. Get ONNX input names
# ==========================================

input_names = [
    input.name
    for input in session.get_inputs()
]


print("\n========================================")
print("           ONNX INPUT NAMES")
print("========================================")

print(input_names)


# ==========================================
# 8. Prepare ONNX input
# ==========================================

onnx_input = {}

for name in input_names:

    if name in sample_input.columns:

        value = sample_input[name].values

        # Numeric inputs
        if name in numeric_columns:

            value = value.astype(
                np.float32
            ).reshape(1, 1)

        # Categorical inputs
        else:

            value = value.astype(
                str
            ).reshape(1, 1)

        onnx_input[name] = value


# ==========================================
# 9. Run ONNX model
# ==========================================

onnx_outputs = session.run(
    None,
    onnx_input
)


# ==========================================
# 10. Display results
# ==========================================

print("\n========================================")
print("       ONNX MODEL VERIFICATION")
print("========================================")


print("\nOriginal Model Prediction:")
print(original_prediction)


print("\nOriginal Approval Probability:")
print(round(original_probability, 4))


print("\nONNX Outputs:")

for output in onnx_outputs:
    print(output)


# ==========================================
# 11. Verification completed
# ==========================================

print("\n========================================")
print("ONNX verification completed!")
print("========================================")