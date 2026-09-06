"""
Q8.8 fixed-point reference implementation of the loan MLP.

The ONNX graph is:  norm = (x - mean) / std   ->   Gemm(3->8)+ReLU -> Gemm(8->4)+ReLU -> Gemm(4->1)

Quantization strategy (documented in docs/quantization.md):
  * Statistical normalization (Sub mean, Div std) is computed exactly in float32
    - this is the model's input preprocessing and has no learned parameters.
  * Everything else - the learned network - runs in genuine Q8.8 fixed point:
    weights and biases are quantized to Q8.8, the normalized input is quantized
    to Q8.8, every Gemm accumulate and ReLU happens on Q8.8 integers, and the
    output is a Q8.8 logit reconstructed as logit = q / 256.

Weights are read directly from models/loan_model/model.onnx so the Q8.8 model
represents the SAME trained parameters as the float model.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import onnx

from quantization import (
    float_to_q8_8,
    q8_8_add,
    q8_8_mul,
    q8_8_to_float,
    Q8_8_MAX_INT,
    Q8_8_MIN_INT,
)

HERE = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(HERE, "..", "models", "loan_model", "model.onnx")
NORM_PATH = os.path.join(HERE, "normalization.json")


def _load_params():
    model = onnx.load(MODEL_PATH)
    initializers = {}
    for init in model.graph.initializer:
        arr = onnx.numpy_helper.to_array(init)
        initializers[init.name] = arr.astype(np.float32)

    mean = initializers["mean"].flatten().tolist()
    std = initializers["std"].flatten().tolist()
    w1 = initializers["network.0.weight"]
    b1 = initializers["network.0.bias"]
    w2 = initializers["network.2.weight"]
    b2 = initializers["network.2.bias"]
    w3 = initializers["network.4.weight"]
    b3 = initializers["network.4.bias"]
    return mean, std, w1, b1, w2, b2, w3, b3


def _gemm_q8(q_in: list[int], w: np.ndarray, bias_2_16: list[int]) -> list[int]:
    """Q8.8 dense layer. Inputs/weights are Q8.8 integers (each x*256).

    Accumulator math: (a/256)*(b/256) summed over inputs gives result/2**16.
    The bias is pre-scaled to 2**16 units, then the sum is divided by 256 and
    rounded back into the Q8.8 domain (with saturation).
    """
    rows = w.shape[0]
    out = []
    for r in range(rows):
        acc = bias_2_16[r]
        for c in range(w.shape[1]):
            acc += q_in[c] * int(round(w[r, c] * 256.0))
        q = int(round(acc / 256.0))
        if q > Q8_8_MAX_INT:
            q = Q8_8_MAX_INT
        elif q < Q8_8_MIN_INT:
            q = Q8_8_MIN_INT
        out.append(q)
    return out


def q8_8_predict_logit(input_data: list[float]) -> dict:
    """Run Q8.8 fixed-point inference and return the quantized trace."""
    mean, std, w1, b1, w2, b2, w3, b3 = _load_params()

    # 1. Float32 statistical normalization (input preprocessing only).
    norm = [(x - m) / s for x, m, s in zip(input_data, mean, std)]

    # 2. Quantize the normalized input to Q8.8 (saturating).
    norm_q = [float_to_q8_8(n) for n in norm]

    # 3. Q8.8 dense layers. Biases are scaled to 2^16 to match the accum.
    b1_16 = [int(round(float(x) * 65536.0)) for x in b1]
    b2_16 = [int(round(float(x) * 65536.0)) for x in b2]
    b3_16 = [int(round(float(x) * 65536.0)) for x in b3]

    h1_pre = _gemm_q8(norm_q, w1, b1_16)
    h1 = [max(0, q) for q in h1_pre]                    # ReLU in Q8.8

    h2_pre = _gemm_q8(h1, w2, b2_16)
    h2 = [max(0, q) for q in h2_pre]                    # ReLU in Q8.8

    logit_q = _gemm_q8(h2, w3, b3_16)[0]                # Q8.8 output logit
    logit = q8_8_to_float(logit_q)                      # reconstruct

    return {
        "norm": norm,
        "norm_q8_8": norm_q,
        "h1_q8_8": h1,
        "h2_q8_8": h2,
        "logit_q8_8": logit_q,
        "logit": logit,
    }


def main():
    if len(sys.argv) < 2:
        print("usage: python q8_8_model.py '[25000.0, 700.0, 3.0]'")
        sys.exit(1)
    data = json.loads(sys.argv[1])
    result = q8_8_predict_logit(data)
    print(json.dumps(result))


if __name__ == "__main__":
    main()