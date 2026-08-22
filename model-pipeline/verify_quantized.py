import pandas as pd
import onnxruntime as ort
import numpy as np


# ==========================================
# LOAD QUANTIZED ONNX MODEL
# ==========================================

session = ort.InferenceSession("loan_model_quantized.onnx")


# ==========================================
# TEST INPUT
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
# NUMERIC COLUMNS
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
# GET MODEL INPUT INFORMATION
# ==========================================

print("\n========================================")
print("QUANTIZED ONNX INPUT INFORMATION")
print("========================================")

for input_data in session.get_inputs():
    print(
        input_data.name,
        "| Type:",
        input_data.type,
        "| Shape:",
        input_data.shape
    )


# ==========================================
# PREPARE INPUT
# ==========================================

onnx_input = {}

for input_data in session.get_inputs():

    name = input_data.name

    if name not in sample_input.columns:
        continue

    value = sample_input[name].values

    # --------------------------------------
    # Numeric inputs
    # --------------------------------------

    if name in numeric_columns:

        value = value.astype(np.float32)

    # --------------------------------------
    # Categorical inputs
    # --------------------------------------

    else:

        value = value.astype(object)

    # --------------------------------------
    # FIX SHAPE
    # --------------------------------------
    # ONNX sometimes expects [1, 1]
    # instead of [1]

    expected_shape = input_data.shape

    if len(expected_shape) == 2:

        value = value.reshape(1, 1)

    onnx_input[name] = value


# ==========================================
# RUN QUANTIZED MODEL
# ==========================================

print("\nRunning quantized model...")

quantized_outputs = session.run(
    None,
    onnx_input
)


# ==========================================
# DISPLAY RESULTS
# ==========================================

print("\n========================================")
print("QUANTIZED ONNX MODEL RESULT")
print("========================================")

print("\nNumber of outputs:")

print(len(quantized_outputs))


for index, output in enumerate(quantized_outputs):

    print("\nOutput", index + 1, ":")

    print(output)


# ==========================================
# PREDICTION
# ==========================================

prediction_output = quantized_outputs[0]

print("\n========================================")
print("PREDICTION")
print("========================================")

print(prediction_output)


# ==========================================
# PROBABILITY
# ==========================================

if len(quantized_outputs) > 1:

    print("\n========================================")
    print("PROBABILITY")
    print("========================================")

    print(quantized_outputs[1])


# ==========================================
# COMPLETED
# ==========================================

print("\n========================================")
print("QUANTIZED ONNX VERIFICATION COMPLETED!")
print("========================================")