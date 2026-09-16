"""
The real, reusable ZK proving service.

Exposes exactly two functions matching docs/API_CONTRACT.md:

    generate_proof(input_data) -> dict with proofId, proof, publicSignals, output
    verify_proof(proof_id)     -> bool

Everyone else on the team should only ever call these two functions —
never call raw ezkl functions from outside this file.

Plus an MLaaS-style model registry (Phase 6), still the single source of
truth for the registered model:

    model_info()               -> dict: registry entry for the model
    infer_model(input_data)    -> dict: float (ONNX) inference result
"""
import json
import math
import os
import time
import uuid

import numpy as np

# Windows fix: ezkl's lazy_static EZKL_REPO_PATH reads the $HOME env var and
# panics with `Err value: NotPresent` when it is unset (src/execute.rs). Set a
# sensible default before the first ezkl call so the same code runs on Windows
# and Linux.
os.environ.setdefault("HOME", os.path.expanduser("~"))

import ezkl  # noqa: E402

# --- Configuration: update these once Member A's real model is ready ---
HERE = os.path.dirname(__file__)
MODEL_DIR = os.path.join(HERE, "..", "models", "loan_model")
MODEL_PATH = os.path.join(MODEL_DIR, "model.onnx")
CALIBRATION_INPUT_PATH = (
    os.path.join(HERE, "configs", "calibration_data.json")
    if os.path.exists(os.path.join(HERE, "configs", "calibration_data.json"))
    else os.path.join(HERE, "calibration_data.json")
)

ARTIFACTS_DIR = os.path.join(HERE, "..", "artifacts")
SETTINGS_PATH = os.path.join(ARTIFACTS_DIR, "settings.json")
COMPILED_MODEL_PATH = os.path.join(ARTIFACTS_DIR, "model.compiled")
SRS_PATH = os.path.join(ARTIFACTS_DIR, "kzg.srs")
PK_PATH = os.path.join(ARTIFACTS_DIR, "proving.key")
VK_PATH = os.path.join(ARTIFACTS_DIR, "verifying.key")

# Proofs are persisted here ({proofId}/proof.json + meta.json) so a proof
# created by one process can be verified by another (e.g. call_prover.py => the
# FastAPI service) as long as they share this repo. Close enough to a real
# proof store for the demo.
PROOFS_DIR = os.path.join(ARTIFACTS_DIR, "proofs")

# Calibrate the circuit to a small size: setup ~0.6s, prove ~1.2s, verifier
# runs instantly. If this model ever grows, bump this instead of the defaults.
MAX_LOGROWS = 12

# Phase 1 Q8.8 quantized fallback (fixed-point ONNX, decision-consistent with
# the float model for the demo inputs - see docs/quantization.md).
Q8_MODEL_PATH = os.path.join(HERE, "..", "model-pipeline", "loan_model_q8.onnx")

# Phase 4/5 on-chain verifier generated from THIS pipeline's proving key.
ONCHAIN_VERIFIER_PATH = os.path.join(HERE, "..", "blockchain-verifier", "Verifier.sol")

MODEL_ID = "loan-v1"

# In-memory store of proofs generated this session: {proofId: {...}}
_PROOF_STORE = {}

os.makedirs(ARTIFACTS_DIR, exist_ok=True)
os.makedirs(PROOFS_DIR, exist_ok=True)


def _run_setup_once_if_needed():
    """Steps 1-6 of the pipeline: only need to run once per model version."""
    if os.path.exists(PK_PATH) and os.path.exists(VK_PATH):
        return  # already set up

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"No model found at {MODEL_PATH}. "
            "Until Member A's real model is ready, point MODEL_PATH at "
            "toy_example/toy_model.onnx to keep developing."
        )
    if not os.path.exists(CALIBRATION_INPUT_PATH):
        raise FileNotFoundError(
            f"No calibration input found at {CALIBRATION_INPUT_PATH}."
        )

    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    # 1. Generate a fresh settings file for the current ONNX model.
    ezkl.gen_settings(MODEL_PATH, SETTINGS_PATH)

    # 2. Calibrate scales/lookup tables for good numeric precision at a small
    #    circuit size. (sync call in ezkl 23.x - do NOT await it)
    #    Scales are pinned: a per-feature input range up to ~131071 needs
    #    input/param scale <= 11/18 so every decomposed limb still fits in the
    #    2 x 14-bit table capacity, while param_scale 18 keeps the ZK output
    #    faithful to the float model for the app's demo inputs.
    ezkl.calibrate_settings(
        CALIBRATION_INPUT_PATH,
        MODEL_PATH,
        SETTINGS_PATH,
        "resources",
        scales=[11, 18],
        max_logrows=MAX_LOGROWS,
    )

    if not os.path.exists(SETTINGS_PATH):
        raise RuntimeError("gen_settings/calibrate_settings: no settings file")

    # 3. Make the user input PRIVATE so nothing sensitive leaves the prover.
    #    Known EZKL quirk: calibrating with input_visibility="Private"
    #    re-injects the private input's shape into model_instance_shapes, which
    #    then fails circuit synthesis with "enforce_equality dimension
    #    mismatch". We therefore calibrate while the input is public, then flip
    #    visibility and strip the (now-private) input shape, keeping only the
    #    output shape in model_instance_shapes.
    with open(SETTINGS_PATH) as f:
        settings = json.load(f)

    settings["run_args"]["input_visibility"] = "Private"
    settings["run_args"]["output_visibility"] = "Public"

    instance_shapes = settings.get("model_instance_shapes", [])
    if instance_shapes:
        # Last entry is the output's instance shape; the earlier entries are the
        # input's, which must not appear as public instances once private.
        settings["model_instance_shapes"] = [instance_shapes[-1]]

    with open(SETTINGS_PATH, "w") as f:
        json.dump(settings, f, indent=2)

    logrows = settings["run_args"]["logrows"]

    # 4. Compile the circuit.
    ezkl.compile_circuit(MODEL_PATH, COMPILED_MODEL_PATH, SETTINGS_PATH)
    if not os.path.exists(COMPILED_MODEL_PATH):
        raise RuntimeError("compile_circuit: no compiled model written")

    # 5. Generate a local test SRS (quick, works offline for small logrows).
    ezkl.gen_srs(SRS_PATH, logrows)
    if not os.path.exists(SRS_PATH):
        raise RuntimeError("gen_srs: no SRS file written")

    # 6. Run trusted setup - proving/verifying keypair.
    ezkl.setup(
        model=COMPILED_MODEL_PATH,
        vk_path=VK_PATH,
        pk_path=PK_PATH,
        srs_path=SRS_PATH,
    )
    if not (os.path.exists(PK_PATH) and os.path.exists(VK_PATH)):
        raise RuntimeError("setup: proving/verifying keys were not written")


def generate_proof(input_data: list) -> dict:
    """
    input_data: e.g. [25000, 700, 3]  (income, credit_score, years_employed)

    Returns a dict shaped like docs/API_CONTRACT.md expects:
        {
          "proofId": "...",
          "status": "done",
          "proof": {...},
          "publicSignals": [...],
          "output": [...]
        }
    """
    _run_setup_once_if_needed()

    proof_id = str(uuid.uuid4())
    work_dir = os.path.join(PROOFS_DIR, proof_id)
    os.makedirs(work_dir, exist_ok=True)

    input_path = os.path.join(work_dir, "input.json")
    witness_path = os.path.join(work_dir, "witness.json")
    proof_path = os.path.join(work_dir, "proof.json")

    with open(input_path, "w") as f:
        json.dump({"input_data": [input_data]}, f)

    gen_start = time.perf_counter()

    ezkl.gen_witness(input_path, COMPILED_MODEL_PATH, witness_path, srs_path=SRS_PATH)
    if not os.path.exists(witness_path):
        raise RuntimeError("gen_witness: no witness written")

    ezkl.prove(
        witness=witness_path,
        model=COMPILED_MODEL_PATH,
        pk_path=PK_PATH,
        proof_path=proof_path,
        srs_path=SRS_PATH,
    )
    if not os.path.exists(proof_path):
        raise RuntimeError("prove: no proof written")

    gen_time = time.perf_counter() - gen_start

    with open(proof_path) as f:
        proof_data = json.load(f)

    pretty = proof_data.get("pretty_public_inputs", {})
    rescaled_outputs = pretty.get("rescaled_outputs", [])
    output = rescaled_outputs[0] if rescaled_outputs else []

    result = {
        "proofId": proof_id,
        "status": "done",
        "proof": proof_data,
        "publicSignals": proof_data.get("instances", []),
        "output": output,
        "proofSizeBytes": os.path.getsize(proof_path),
        "generationTimeSec": round(gen_time, 3),
    }

    with open(os.path.join(work_dir, "meta.json"), "w") as f:
        json.dump(
            {
                "input": input_data,
                "proofPath": proof_path,
                "witnessPath": witness_path,
                "output": output,
                "generationTimeSec": round(gen_time, 3),
                "proofSizeBytes": os.path.getsize(proof_path),
            },
            f,
            indent=2,
        )

    _PROOF_STORE[proof_id] = {"proof_path": proof_path, "result": result}
    return result


def verify_proof(proof_id: str) -> bool:
    """Looks up a previously generated proof by ID and verifies it.

    Resolves against this session's in-memory store first, then the on-disk
    proof store, so proofs created by another process (e.g. call_prover.py) can
    also be verified as long as they share the repo's artifacts directory.
    """
    proof_path = None

    entry = _PROOF_STORE.get(proof_id)
    if entry is not None:
        proof_path = entry["proof_path"]
    else:
        candidate = os.path.join(PROOFS_DIR, proof_id, "proof.json")
        if os.path.exists(candidate):
            proof_path = candidate

    if not proof_path or not os.path.exists(proof_path):
        raise ValueError(f"Unknown proofId: {proof_id}")

    return ezkl.verify(
        proof_path=proof_path,
        settings_path=SETTINGS_PATH,
        vk_path=VK_PATH,
        srs_path=SRS_PATH,
    )


def get_proof(proof_id: str) -> dict | None:
    """Used by the /prove/:proofId polling endpoint.

    Also reads from the on-disk proof store so the FastAPI service can serve
    proofs any process created.
    """
    entry = _PROOF_STORE.get(proof_id)
    if entry is not None:
        return entry["result"]

    proof_path = os.path.join(PROOFS_DIR, proof_id, "proof.json")
    meta_path = os.path.join(PROOFS_DIR, proof_id, "meta.json")
    if not os.path.exists(proof_path) or not os.path.exists(meta_path):
        return None

    with open(proof_path) as f:
        proof_data = json.load(f)
    with open(meta_path) as f:
        meta = json.load(f)

    pretty = proof_data.get("pretty_public_inputs", {})
    rescaled_outputs = pretty.get("rescaled_outputs", [])
    output = rescaled_outputs[0] if rescaled_outputs else []

    return {
        "proofId": proof_id,
        "status": "done",
        "proof": proof_data,
        "publicSignals": proof_data.get("instances", []),
        "output": output,
        "proofSizeBytes": meta.get("proofSizeBytes"),
        "generationTimeSec": meta.get("generationTimeSec"),
    }


# ---------------------------------------------------------------------------
# MLaaS-style model registry (Phase 6)
# ---------------------------------------------------------------------------

def _load_settings():
    """Best-effort read of the calibrated settings, or None if absent."""
    try:
        with open(SETTINGS_PATH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def model_info() -> dict:
    """Introspecive registry entry for the registered model (single source of
    truth for what the ZK service is actually running)."""
    settings = _load_settings()
    run_args = (settings or {}).get("run_args", {})
    input_vis = run_args.get("input_visibility", "n/a")
    output_vis = run_args.get("output_visibility", "n/a")
    logrows = run_args.get("logrows", "n/a")

    return {
        "id": MODEL_ID,
        "name": "Loan Approval MLP (3\u21928\u21924\u21921)",
        "version": "1.0.0",
        "family": "machine-learning",
        "framework": "onnx",
        "input": {
            "shape": "[1, 3]",
            "features": ["person_income", "credit_score", "person_emp_exp"],
            "dtype": "float32",
            "normalization": "z-score, baked into the ONNX graph",
            "supportedRange": {
                "perFeatureMaxCalibrated": 131071,
                "note": "calibrated max; inputs larger than ~131071 cannot be "
                        "decomposed into the 2x14-bit limb table (see docs).",
            },
        },
        "output": {
            "semantics": "logit \u2192 sigmoid = P(default); approved if >= 0.5",
        },
        "zk": {
            "backend": "ezkl",
            "ezklVersion": "23.0.5",
            "curve": "bn254",
            "scheme": "KZG",
            "logrows": logrows,
            "scales": [11, 18],
            "inputVisibility": input_vis,
            "outputVisibility": output_vis,
            "gpuAcceleratedMsms": False,
            "gpuReason": "no CUDA GPU/CUDA toolkit on host; ezkl wheels expose "
                         "no GPU API (docs/gpu-msm.md)",
            "quantizedQ8_8Fallback": {
                "available": os.path.exists(Q8_MODEL_PATH),
                "path": os.path.relpath(Q8_MODEL_PATH),
                "note": "decision-consistent for demo inputs; not provable in "
                        "EZKL (docs/quantization.md)",
            },
            "onChainVerifier": {
                "available": os.path.exists(ONCHAIN_VERIFIER_PATH),
                "path": os.path.relpath(ONCHAIN_VERIFIER_PATH),
                "note": "generated by ezkl.create_evm_verifier; verified "
                        "client-side + on a local chain (docs/client-verify.md, "
                        "docs/blockchain-evm.md)",
            },
            "setupStatus": {
                "ready": os.path.exists(PK_PATH) and os.path.exists(VK_PATH),
                "provingKey": os.path.exists(PK_PATH),
                "verifyingKey": os.path.exists(VK_PATH),
                "srs": os.path.exists(SRS_PATH),
            },
        },
        "endpoints": {
            "models": "GET  /api/models",
            "modelDetail": "GET  /api/models/{model_id}",
            "modelInfer": "POST /api/models/{model_id}/infer",
            "proof": "POST /generate-proof",
            "proofPoll": "GET  /proof/{proof_id}",
            "verify": "POST /verify-proof",
            "health": "GET  /health",
        },
    }


MODEL_SESSIONS = {}


def _session():
    """Lazily load one onnxruntime session for float inference."""
    import onnxruntime

    if MODEL_SESSIONS.get("float") is None:
        MODEL_SESSIONS["float"] = onnxruntime.InferenceSession(
            MODEL_PATH, providers=["CPUExecutionProvider"]
        )
    return MODEL_SESSIONS["float"]


def infer_model(input_data: list) -> dict:
    """Float (ONNX) inference for a [income, credit_score, years_employed]
    input - the *unquantized* reference the ZK circuit approximates."""
    if not isinstance(input_data, list) or len(input_data) != 3:
        raise ValueError("input must be exactly 3 numeric features")

    sess = _session()
    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]

    arr = np.asarray([input_data], dtype=np.float32)
    logit = float(sess.run([out.name], {inp.name: arr})[0][0][0])

    logit = max(min(logit, 700.0), -700.0)
    prob = 1.0 / (1.0 + math.exp(-logit))

    return {
        "modelId": MODEL_ID,
        "version": "1.0.0",
        "input": input_data,
        "logit": round(logit, 6),
        "probability": round(prob, 6),
        "approved": bool(prob >= 0.5),
        "runtime": "onnxruntime-cpu",
        "zkAvailable": True,
    }