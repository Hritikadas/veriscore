"""
Runs the full ezkl pipeline step by step, with print statements explaining
each stage, against the toy model. This is a LEARNING script — once you
understand it, use app/prover_service.py (the clean reusable version) instead.

Prerequisite: python toy_example/make_toy_model.py

Run: python toy_example/run_pipeline_manually.py
"""
import asyncio
import os
import ezkl

HERE = os.path.dirname(__file__)
MODEL_PATH = os.path.join(HERE, "toy_model.onnx")
INPUT_PATH = os.path.join(HERE, "toy_input.json")

SETTINGS_PATH = os.path.join(HERE, "settings.json")
COMPILED_MODEL_PATH = os.path.join(HERE, "toy_model.compiled")
SRS_PATH = os.path.join(HERE, "kzg.srs")
PK_PATH = os.path.join(HERE, "proving.key")
VK_PATH = os.path.join(HERE, "verifying.key")
WITNESS_PATH = os.path.join(HERE, "witness.json")
PROOF_PATH = os.path.join(HERE, "toy_proof.json")


async def main():
    print("STEP 1/7: Generating default settings from the ONNX model...")
    res = ezkl.gen_settings(MODEL_PATH, SETTINGS_PATH)
    assert res, "gen_settings failed"
    print("  -> wrote", SETTINGS_PATH)

    print("STEP 2/7: Calibrating settings using a real sample input...")
    res = await ezkl.calibrate_settings(
        INPUT_PATH, MODEL_PATH, SETTINGS_PATH, "resources"
    )
    assert res, "calibrate_settings failed"
    print("  -> calibration done")

    print("STEP 3/7: Compiling the model into a zero-knowledge circuit...")
    res = ezkl.compile_circuit(MODEL_PATH, COMPILED_MODEL_PATH, SETTINGS_PATH)
    assert res, "compile_circuit failed"
    print("  -> wrote", COMPILED_MODEL_PATH)

    print("STEP 4/7: Fetching the SRS (shared cryptographic parameters)...")
    res = await ezkl.get_srs(SRS_PATH, SETTINGS_PATH)
    print("  -> wrote", SRS_PATH)

    print("STEP 5/7: Running setup (generates proving key + verifying key)...")
    res = ezkl.setup(COMPILED_MODEL_PATH, VK_PATH, PK_PATH, SRS_PATH)
    assert res, "setup failed"
    print("  -> wrote", PK_PATH, "and", VK_PATH)
    print("  (steps 1-5 only need to re-run when the MODEL changes)")

    print("STEP 6/7: Generating witness (running the input through the model)...")
    res = await ezkl.gen_witness(INPUT_PATH, COMPILED_MODEL_PATH, WITNESS_PATH)
    print("  -> wrote", WITNESS_PATH)

    print("STEP 6b/7: Generating the proof...")
    res = ezkl.prove(WITNESS_PATH, COMPILED_MODEL_PATH, PK_PATH, PROOF_PATH, "single", SRS_PATH)
    print("  -> wrote", PROOF_PATH)

    print("STEP 7/7: Verifying the proof...")
    res = ezkl.verify(PROOF_PATH, SETTINGS_PATH, VK_PATH, SRS_PATH)
    print("  -> verified:", res)

    print("\n✅ Full pipeline ran successfully on the toy model.")
    print("If this worked, app/prover_service.py will work the same way against a real model.")


if __name__ == "__main__":
    asyncio.run(main())
