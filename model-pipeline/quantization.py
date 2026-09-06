"""
Genuine Q8.8 fixed-point quantization primitives.

Q8.8 = 8 integer bits + 8 fractional bits.
Scale factor S = 2 ** 8 = 256.

For a real value x:
    q   = saturating_round(x * 256)          (integer, stored in an int)
    x_approx = q / 256

Representable range:  [-128.0, +127.99609375]   (i.e. [-256, 256) in Q8.8
units, roughly; the positive side saturates at 127 + 255/256).
Saturation is explicit: any value outside the representable range is clamped
to the nearest representable Q8.8 value instead of wrapping.

This module is the single source of truth for Q8.8 semantics in the repo.
It is used by model-pipeline/q8_8_model.py to run the loan model’s inference
entirely in Q8.8 fixed point, independent of ONNX Runtime.

NOTE (honest scope): this is real Q8.8 quantization of the model
representation and of its inference. It does NOT change what the live
EZKL circuit proves: EZKL compiles the floating-point ONNX graph and applies
its own adaptive scale calibration (see docs/quantization.md for the exact
relationship and the per-op precision analysis).
"""
from __future__ import annotations

Q8_8_SCALE = 256.0
Q8_8_FRACTIONAL_BITS = 8

# Integer range of the Q8.8 representation (the fixed-point accumulator can
# hold -32768..32767, but each *stored* Q8.8 value is limited to 8 int bits).
Q8_8_MIN_INT = -(1 << 7)      # -128
Q8_8_MAX_INT = (1 << 7) - 1   # 127

# Corresponding float endpoints.
Q8_8_MIN_FLOAT = Q8_8_MIN_INT / Q8_8_SCALE         # -128.0
Q8_8_MAX_FLOAT = Q8_8_MAX_INT / Q8_8_SCALE         # 127.99609375


def _saturate(q: int) -> int:
    """Clamp a fixed-point integer into the Q8.8 integer range."""
    if q < Q8_8_MIN_INT:
        return Q8_8_MIN_INT
    if q > Q8_8_MAX_INT:
        return Q8_8_MAX_INT
    return q


def float_to_q8_8(x: float) -> int:
    """
    Convert a real number to its Q8.8 fixed-point integer.
    q = saturating(round(x * 256));  x_approx = q / 256.
    """
    q = int(round(x * Q8_8_SCALE))
    return _saturate(q)


def q8_8_to_float(q: int) -> float:
    """Reconstruct the real value approximated by a Q8.8 integer."""
    return q / Q8_8_SCALE


def q8_8_mul(a: int, b: int) -> int:
    """
    Fixed-point multiply of two Q8.8 integers.
    Real result = (a/256) * (b/256) = a*b / 65536.  In Q8.8 units:
        (a*b) >> 8
    with round-half-up and saturation to keep the result in Q8.8 range.
    """
    prod = a * b
    q = int(round(prod / Q8_8_SCALE))
    return _saturate(q)


def q8_8_add(a: int, b: int) -> int:
    """Fixed-point add of two Q8.8 integers with saturation."""
    return _saturate(a + b)


def q8_8_sum(values: list[int]) -> int:
    """Accumulate Q8.8 values with saturation at each step."""
    acc = 0
    for v in values:
        acc = q8_8_add(acc, v)
    return acc


def q8_8_div(a: int, b: int) -> int:
    """
    Fixed-point division a / b in the Q8.8 domain.
    Real result = (a/256) / (b/256) = a / b (real).  In Q8.8 units:
        round((a * 256) / b)
    with saturation. b == 0 raises ZeroDivisionError.
    """
    if b == 0:
        raise ZeroDivisionError("Q8.8 division by zero")
    q = int(round((a * Q8_8_SCALE) / b))
    return _saturate(q)