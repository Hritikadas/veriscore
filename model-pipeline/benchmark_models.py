import os
import time

import numpy as np
import onnxruntime as ort


# ==========================================
# MODEL FILES
# ==========================================

original_model_path = "loan_model.onnx"
quantized_model_path = "loan_model_quantized.onnx"


# ==========================================
# LOAD MODELS
# ==========================================

print("Loading models...")

original_session = ort.InferenceSession(original_model_path)
quantized_session = ort.InferenceSession(quantized_model_path)

print("Models loaded successfully!")


# ==========================================
# SAMPLE INPUT
# ==========================================

sample_data = {
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
# CREATE ONNX INPUT
# ==========================================

def prepare_input(session):

    onnx_input = {}

    for input_data in session.get_inputs():

        name = input_data.name

        if name not in sample_data:
            continue

        value = sample_data[name]

        # ----------------------------------
        # Numeric input
        # ----------------------------------

        if name in numeric_columns:

            value = np.array(
                [value],
                dtype=np.float32
            )

        # ----------------------------------
        # Categorical input
        # ----------------------------------

        else:

            value = np.array(
                [value],
                dtype=object
            )

        # ----------------------------------
        # Fix expected shape
        # ----------------------------------

        if len(input_data.shape) == 2:

            value = value.reshape(1, 1)

        onnx_input[name] = value

    return onnx_input


# ==========================================
# PREPARE INPUTS
# ==========================================

original_input = prepare_input(original_session)

quantized_input = prepare_input(quantized_session)


# ==========================================
# WARM UP
# ==========================================

print("\nWarming up models...")

for _ in range(10):

    original_session.run(
        None,
        original_input
    )

    quantized_session.run(
        None,
        quantized_input
    )


# ==========================================
# BENCHMARK SETTINGS
# ==========================================

number_of_runs = 100


# ==========================================
# ORIGINAL MODEL BENCHMARK
# ==========================================

print("\nTesting original ONNX model...")

start_time = time.perf_counter()

for _ in range(number_of_runs):

    original_outputs = original_session.run(
        None,
        original_input
    )

end_time = time.perf_counter()

original_total_time = end_time - start_time

original_average_time = (
    original_total_time / number_of_runs
) * 1000


# ==========================================
# QUANTIZED MODEL BENCHMARK
# ==========================================

print("Testing quantized ONNX model...")

start_time = time.perf_counter()

for _ in range(number_of_runs):

    quantized_outputs = quantized_session.run(
        None,
        quantized_input
    )

end_time = time.perf_counter()

quantized_total_time = end_time - start_time

quantized_average_time = (
    quantized_total_time / number_of_runs
) * 1000


# ==========================================
# GET PREDICTIONS
# ==========================================

original_prediction = original_outputs[0][0]

quantized_prediction = quantized_outputs[0][0]


# ==========================================
# GET PROBABILITY
# ==========================================

original_probability = None
quantized_probability = None


if len(original_outputs) > 1:

    original_probability_output = original_outputs[1]

    if isinstance(
        original_probability_output,
        list
    ):

        original_probability = float(
            original_probability_output[0][1]
        )

    else:

        original_probability = float(
            original_probability_output[0][1]
        )


if len(quantized_outputs) > 1:

    quantized_probability_output = quantized_outputs[1]

    if isinstance(
        quantized_probability_output,
        list
    ):

        quantized_probability = float(
            quantized_probability_output[0][1]
        )

    else:

        quantized_probability = float(
            quantized_probability_output[0][1]
        )


# ==========================================
# MODEL SIZES
# ==========================================

original_size = os.path.getsize(
    original_model_path
)

quantized_size = os.path.getsize(
    quantized_model_path
)


original_size_kb = original_size / 1024

quantized_size_kb = quantized_size / 1024


# ==========================================
# SIZE DIFFERENCE
# ==========================================

size_difference = (
    quantized_size_kb - original_size_kb
)


# ==========================================
# SPEED DIFFERENCE
# ==========================================

speed_difference = (
    original_average_time
    - quantized_average_time
)


# ==========================================
# CHECK PREDICTION
# ==========================================

prediction_same = (
    original_prediction
    == quantized_prediction
)


# ==========================================
# DISPLAY RESULTS
# ==========================================

print("\n")
print("==========================================")
print("       MODEL BENCHMARK RESULTS")
print("==========================================")


print("\nORIGINAL ONNX MODEL")
print("------------------------------------------")

print(
    "Prediction:",
    original_prediction
)

if original_probability is not None:

    print(
        "Approval Probability:",
        round(original_probability, 4)
    )

print(
    "Average Inference Time:",
    round(original_average_time, 4),
    "ms"
)

print(
    "Model Size:",
    round(original_size_kb, 2),
    "KB"
)


print("\nQUANTIZED ONNX MODEL")
print("------------------------------------------")

print(
    "Prediction:",
    quantized_prediction
)

if quantized_probability is not None:

    print(
        "Approval Probability:",
        round(quantized_probability, 4)
    )

print(
    "Average Inference Time:",
    round(quantized_average_time, 4),
    "ms"
)

print(
    "Model Size:",
    round(quantized_size_kb, 2),
    "KB"
)


# ==========================================
# COMPARISON
# ==========================================

print("\n")
print("==========================================")
print("             COMPARISON")
print("==========================================")


print(
    "\nPrediction Same:",
    prediction_same
)


if (
    original_probability is not None
    and quantized_probability is not None
):

    probability_difference = abs(
        original_probability
        - quantized_probability
    )

    print(
        "Probability Difference:",
        round(probability_difference, 6)
    )


print(
    "Inference Time Difference:",
    round(speed_difference, 4),
    "ms"
)


print(
    "Size Difference:",
    round(size_difference, 2),
    "KB"
)


# ==========================================
# FINAL DECISION
# ==========================================

print("\n")
print("==========================================")
print("             FINAL RESULT")
print("==========================================")


if prediction_same:

    print(
        "Prediction: SAME"
    )

else:

    print(
        "Prediction: DIFFERENT"
    )


if quantized_average_time < original_average_time:

    print(
        "Speed: Quantized model is FASTER"
    )

else:

    print(
        "Speed: Original model is FASTER"
    )


if quantized_size_kb < original_size_kb:

    print(
        "Size: Quantized model is SMALLER"
    )

else:

    print(
        "Size: Original model is SMALLER"
    )


print("\n==========================================")
print("Benchmark completed!")
print("==========================================")