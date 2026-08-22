import sys
import json
import os
import numpy as np
import onnxruntime as ort


# ============================================
# MODEL PATH
# ============================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "loan_model.onnx"
)


# ============================================
# LOAD ONNX MODEL
# ============================================

try:
    session = ort.InferenceSession(MODEL_PATH)

except Exception as error:
    print(json.dumps({
        "success": False,
        "error": "Could not load ONNX model",
        "details": str(error)
    }))
    sys.exit(1)


# ============================================
# READ INPUT FROM NODE.JS
# ============================================

if len(sys.argv) < 2:

    print(json.dumps({
        "success": False,
        "error": "No input data received"
    }))

    sys.exit(1)


try:

    input_data = json.loads(sys.argv[1])

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Invalid JSON input",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# REQUIRED FEATURES
# ============================================

required_features = [

    "person_age",
    "person_income",
    "person_emp_exp",
    "loan_amnt",
    "loan_int_rate",
    "loan_percent_income",
    "cb_person_cred_hist_length",
    "credit_score",

    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
    "previous_loan_defaults_on_file"
]


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


categorical_columns = [

    "person_gender",
    "person_education",
    "person_home_ownership",
    "loan_intent",
    "previous_loan_defaults_on_file"
]


# ============================================
# CHECK REQUIRED FEATURES
# ============================================

missing_features = []

for feature in required_features:

    if feature not in input_data:

        missing_features.append(feature)


if len(missing_features) > 0:

    print(json.dumps({
        "success": False,
        "error": "Missing required features",
        "missingFeatures": missing_features
    }))

    sys.exit(1)


# ============================================
# PREPARE ONNX INPUT
# ============================================

onnx_input = {}


try:

    model_inputs = session.get_inputs()

    for model_input in model_inputs:

        name = model_input.name

        value = input_data[name]


        # ----------------------------------------
        # NUMERIC INPUT
        # ----------------------------------------

        if name in numeric_columns:

            value = np.array(
                [float(value)],
                dtype=np.float32
            )


        # ----------------------------------------
        # CATEGORICAL INPUT
        # ----------------------------------------

        elif name in categorical_columns:

            value = np.array(
                [str(value)],
                dtype=np.str_
            )


        else:

            value = np.array(
                [value]
            )


        # ----------------------------------------
        # Fix input shape
        # ----------------------------------------

        if len(model_input.shape) == 2:

            value = value.reshape(1, 1)

        elif len(model_input.shape) == 1:

            value = value.reshape(1)


        onnx_input[name] = value


except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Failed to prepare ONNX input",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# RUN MODEL
# ============================================

try:

    outputs = session.run(
        None,
        onnx_input
    )

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "ONNX prediction failed",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# GET PREDICTION
# ============================================

try:

    prediction = int(
        np.asarray(outputs[0]).flatten()[0]
    )

except Exception as error:

    print(json.dumps({
        "success": False,
        "error": "Could not read prediction",
        "details": str(error)
    }))

    sys.exit(1)


# ============================================
# GET APPROVAL PROBABILITY
# ============================================

approval_probability = 0.0


if len(outputs) > 1:

    probability_output = outputs[1]

    try:

        probability_value = probability_output[0]


        # ONNX sklearn probability output
        # can be a dictionary

        if isinstance(probability_value, dict):

            if 1 in probability_value:

                approval_probability = float(
                    probability_value[1]
                )

            elif "1" in probability_value:

                approval_probability = float(
                    probability_value["1"]
                )


        else:

            probability_array = np.asarray(
                probability_output
            )

            if probability_array.ndim >= 2:

                approval_probability = float(
                    probability_array[0][1]
                )

    except Exception:

        approval_probability = 0.0


# ============================================
# DECISION
# ============================================

if prediction == 1:

    decision = "approved"

else:

    decision = "rejected"


# ============================================
# FINAL RESULT
# ============================================

result = {

    "success": True,

    "prediction": prediction,

    "decision": decision,

    "approvalProbability": round(
        approval_probability,
        4
    ),

    "model": "loan_model.onnx",

    "modelVersion": "v1"
}


# ============================================
# SEND JSON TO NODE.JS
# ============================================

print(
    json.dumps(result)
)