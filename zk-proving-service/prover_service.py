"""
The real, reusable ZK proving service.

Exposes exactly two functions matching docs/API_CONTRACT.md:

    generate_proof(input_data) -> dict with proofId, proof, publicSignals, output
    verify_proof(proof_id)     -> bool

Everyone else on the team should only ever call these two functions —
never call raw ezkl functions from outside this file.
"""
import asyncio
import json
import os
import uuid
import ezkl

# --- Configuration: update these once Member A's real model is ready ---
HERE = os.path.dirname(__file__)
MODEL_DIR = os.path.join(HERE, "..", "models", "loan_model")
MODEL_PATH = os.path.join(MODEL_DIR, "model.onnx")
CALIBRATION_INPUT_PATH = os.path.join(MODEL_DIR, "input.json")

ARTIFACTS_DIR = os.path.join(HERE, "..", "artifacts")
SETTINGS_PATH = os.path.join(ARTIFACTS_DIR, "settings.json")
COMPILED_MODEL_PATH = os.path.join(ARTIFACTS_DIR, "model.compiled")
SRS_PATH = os.path.join(ARTIFACTS_DIR, "kzg.srs")
PK_PATH = os.path.join(ARTIFACTS_DIR, "proving.key")
VK_PATH = os.path.join(ARTIFACTS_DIR, "verifying.key")

# In-memory store of proofs generated this session: {proofId: {...}}
# For a real deployment you'd use a small DB/file store instead — fine for a
# student project demo.
_PROOF_STORE = {}

os.makedirs(ARTIFACTS_DIR, exist_ok=True)


def _run_setup_once_if_needed():
    """Steps 1-5 of the pipeline: only need to run once per model version."""
    if os.path.exists(PK_PATH) and os.path.exists(VK_PATH):
        return  # already set up

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"No model found at {MODEL_PATH}. "
            "Until Member A's real model is ready, point MODEL_PATH at "
            "toy_example/toy_model.onnx to keep developing."
        )

    ok = ezkl.gen_settings(MODEL_PATH, SETTINGS_PATH)
    assert ok, "gen_settings failed"

    ok = asyncio.run(
        ezkl.calibrate_settings(
            CALIBRATION_INPUT_PATH, MODEL_PATH, SETTINGS_PATH, "resources"
        )
    )
    assert ok, "calibrate_settings failed"

    ok = ezkl.compile_circuit(MODEL_PATH, COMPILED_MODEL_PATH, SETTINGS_PATH)
    assert ok, "compile_circuit failed"

    asyncio.run(ezkl.get_srs(SRS_PATH, SETTINGS_PATH))

    ok = ezkl.setup(COMPILED_MODEL_PATH, VK_PATH, PK_PATH, SRS_PATH)
    assert ok, "setup failed"


def generate_proof(input_data: list) -> dict:
    """
    input_data: e.g. [25000, 700, 3]  (income, credit_score, years_employed)

    Returns a dict shaped exactly like docs/API_CONTRACT.md expects:
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
    work_dir = os.path.join(ARTIFACTS_DIR, proof_id)
    os.makedirs(work_dir, exist_ok=True)

    input_path = os.path.join(work_dir, "input.json")
    witness_path = os.path.join(work_dir, "witness.json")
    proof_path = os.path.join(work_dir, "proof.json")

    with open(input_path, "w") as f:
        json.dump({"input_data": [input_data]}, f)

    asyncio.run(ezkl.gen_witness(input_path, COMPILED_MODEL_PATH, witness_path))
    ezkl.prove(witness_path, COMPILED_MODEL_PATH, PK_PATH, proof_path, "single", SRS_PATH)

    with open(proof_path) as f:
        proof_data = json.load(f)

    result = {
        "proofId": proof_id,
        "status": "done",
        "proof": proof_data,
        "publicSignals": proof_data.get("instances", []),
        "output": proof_data.get("pretty_public_inputs", {}).get("outputs", []),
    }
    _PROOF_STORE[proof_id] = {"proof_path": proof_path, "result": result}
    return result


def verify_proof(proof_id: str) -> bool:
    """Looks up a previously generated proof by ID and verifies it."""
    entry = _PROOF_STORE.get(proof_id)
    if entry is None:
        raise ValueError(f"Unknown proofId: {proof_id}")

    return ezkl.verify(entry["proof_path"], SETTINGS_PATH, VK_PATH, SRS_PATH)


def get_proof(proof_id: str) -> dict | None:
    """Used by the /prove/:proofId polling endpoint."""
    entry = _PROOF_STORE.get(proof_id)
    return entry["result"] if entry else None
