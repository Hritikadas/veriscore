"""
Probe: at which EZKL stage does the Q8.8 fixed-point graph fail, and why?
Reports each stage's return value/exception so the limitation can be
documented precisely in docs/quantization.md.
"""
from __future__ import annotations

import json
import os
import tempfile

import ezkl

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "loan_model_q8.onnx")


def attempt():
    d = tempfile.mkdtemp(prefix="q8probe_")
    input_path = os.path.join(d, "input.json")
    settings_path = os.path.join(d, "settings.json")
    compiled = os.path.join(d, "compiled.onnx")
    witness = os.path.join(d, "witness.json")
    with open(input_path, "w") as f:
        json.dump({"input_data": [[25000.0, 700.0, 3.0]]}, f)

    results = []

    def log(stage, fn):
        try:
            r = fn()
            results.append({"stage": stage, "ok": bool(r), "return": str(r)})
        except Exception as e:  # noqa: BLE001
            results.append({"stage": stage, "ok": False, "error": type(e).__name__,
                            "detail": str(e)[:400]})

    log("gen_settings", lambda: ezkl.gen_settings(MODEL, settings_path, py_run_args=ezkl.PyRunArgs()))
    log("calibrate_settings", lambda: ezkl.calibrate_settings(input_path, MODEL, settings_path,
                                                              max_logrows=20))
    log("compile_circuit", lambda: ezkl.compile_circuit(MODEL, compiled, settings_path))
    log("gen_witness", lambda: ezkl.gen_witness(input_path, compiled, witness)
        if os.path.exists(compiled) else False)
    return results


if __name__ == "__main__":
    res = attempt()
    for r in res:
        print(json.dumps(r))