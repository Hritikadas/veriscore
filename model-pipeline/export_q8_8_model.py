"""
Build a genuine Q8.8 fixed-point ONNX model (model-pipeline/loan_model_q8.onnx).

The graph computes the SAME trained parameters as models/loan_model/model.onnx
but the learned layers run entirely in Q8.8 fixed point:
    norm      = (x - mean) / std                          (float32 preprocessing)
    norm_q    = Clip(Round(norm * 256), -128, 127.996)    (Q8.8 input)
    Gemm      on Q8.8 integers (bias pre-scaled to 2**16)
    /256 + Round -> back to Q8.8
    ReLU + Clip(0, 127.996)
    output    = Q8.8 logit integer  (reconstruct: logit = out / 256)

All tensors are float32 values that are exactly integers in the Q8.8 domain,
so ONNX Runtime executes the fixed-point math deterministically; consumers
divide by 256 to reconstruct.

NOTE: onnxruntime supports this op set; EZKL 23.0.5 does NOT support the
Round/clip-based fixed-point ops, so this model is for Q8.8 inference /
evaluation only - the ZK circuit continues to prove the float ONNX graph
(see docs/quantization.md).
"""
from __future__ import annotations

import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_MODEL = os.path.join(HERE, "..", "models", "loan_model", "model.onnx")
OUT_MODEL = os.path.join(HERE, "loan_model_q8.onnx")


def _const(name, arr):
    return numpy_helper.from_array(np.asarray(arr, dtype=np.float32), name=name)


def main():
    src = onnx.load(SRC_MODEL)
    ini = {n.name: onnx.numpy_helper.to_array(n).astype(np.float32)
           for n in src.graph.initializer}

    mean = ini["mean"].flatten()
    std = ini["std"].flatten()
    W1, W2, W3 = (ini["network.0.weight"], ini["network.2.weight"],
                  ini["network.4.weight"])
    b1, b2, b3 = (ini["network.0.bias"], ini["network.2.bias"],
                  ini["network.4.bias"])

    from quantization import float_to_q8_8

    def q8(w):
        # Gemm B must be [K, N]; the pytorch weight is [out, in] = [N, K]
        return np.array([[float_to_q8_8(float(v)) for v in row] for row in w.T],
                        dtype=np.float32)

    def b16(b):
        return np.array([int(round(float(v) * 65536.0)) for v in b],
                        dtype=np.float32)

    CLIP_MAX = 127.99609375
    SCALE_INV = 0.00390625  # 1 / 256

    nodes = [
        helper.make_node("Sub", ["input", "mean"], ["d"]),
        helper.make_node("Div", ["d", "std"], ["norm"]),
        helper.make_node("Mul", ["norm", "two56"], ["nscaled"]),
        helper.make_node("Round", ["nscaled"], ["nround"]),
        helper.make_node("Clip", ["nround", "clipmin", "clipmax"], ["nq"]),

        helper.make_node("Gemm", ["nq", "W1q", "b1_16"], ["h1s"]),
        helper.make_node("Mul", ["h1s", "inv256"], ["h1sc"]),
        helper.make_node("Round", ["h1sc"], ["h1round"]),
        helper.make_node("Relu", ["h1round"], ["h1relu"]),
        helper.make_node("Clip", ["h1relu", "clamp0", "clampmax"], ["h1"]),

        helper.make_node("Gemm", ["h1", "W2q", "b2_16"], ["h2s"]),
        helper.make_node("Mul", ["h2s", "inv256"], ["h2sc"]),
        helper.make_node("Round", ["h2sc"], ["h2round"]),
        helper.make_node("Relu", ["h2round"], ["h2relu"]),
        helper.make_node("Clip", ["h2relu", "clamp0", "clampmax"], ["h2"]),

        helper.make_node("Gemm", ["h2", "W3q", "b3_16"], ["o3s"]),
        helper.make_node("Mul", ["o3s", "inv256"], ["o3sc"]),
        helper.make_node("Round", ["o3sc"], ["output"]),
    ]

    initializers = [
        _const("mean", mean),
        _const("std", std),
        _const("two56", np.float32(256.0)),
        _const("clipmin", np.float32(-128.0)),
        _const("clipmax", np.float32(CLIP_MAX)),
        _const("clamp0", np.float32(0.0)),
        _const("clampmax", np.float32(CLIP_MAX)),
        _const("inv256", np.float32(SCALE_INV)),
        _const("W1q", q8(W1)),
        _const("b1_16", b16(b1)),
        _const("W2q", q8(W2)),
        _const("b2_16", b16(b2)),
        _const("W3q", q8(W3)),
        _const("b3_16", b16(b3)),
    ]

    graph = helper.make_graph(
        nodes,
        "loan_mlp_q8_8",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, ["batch_size", 3])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 1])],
        initializer=initializers,
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 18)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, OUT_MODEL)
    print("wrote", OUT_MODEL, os.path.getsize(OUT_MODEL), "bytes")


if __name__ == "__main__":
    main()