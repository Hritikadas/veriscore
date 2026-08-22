# Member B — Full Implementation Guide

This is your complete, start-to-finish guide. Follow it in order — don't skip to "connect Member A's model" until Day 3 works.

---

## Big picture: what you're actually building

You are **not** writing cryptography. You're writing a thin **wrapper** around `ezkl` (a library that already does the cryptography) so the rest of the team can call two simple functions:

```
generate_proof(model.onnx, input.json)  →  proof + public output
verify_proof(proof)                     →  true / false
```

Everything below is about building that wrapper reliably.

---

## Day 1 — Install & sanity check

```bash
cd zk-proving-service
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Check it installed:
```bash
python -c "import ezkl; print(ezkl.__file__)"
```
If that errors, stop here and fix installation before continuing (usually a Python version issue — ezkl needs Python 3.9+).

> ⚠️ ezkl is beta software and evolves fast. If any function below errors with "not found" or wrong arguments, run `python -c "import ezkl; help(ezkl)"` and check https://docs.ezkl.xyz — the concepts stay stable even when exact function signatures shift between versions.

---

## Day 1-2 — Run the pipeline on a TOY model first

**Do not start with Member A's real model.** Debugging ezkl + a real model at the same time is too many unknowns at once. First prove it works on a tiny model you control.

Run:
```bash
python toy_example/make_toy_model.py
```
This creates a 3-input, 1-output toy model — same input shape as our real loan model (`income, credit_score, years_employed`) — so it's a realistic stand-in.

Then run the full pipeline against it:
```bash
python toy_example/run_pipeline_manually.py
```
This runs, step by step, printing what's happening at each stage. **Read the comments in that file** — it's the same logic as `app/prover_service.py`, just spelled out linearly so you can see each ezkl call in isolation. If something breaks, it'll break here first, where it's easy to debug.

---

## Day 3 — Understand the 6 pipeline stages

This is what's actually happening (all wrapped inside `generate_proof()` for you):

| # | Stage | ezkl call | Plain English |
|---|---|---|---|
| 1 | Generate settings | `ezkl.gen_settings()` | Look at the model, write a default config for how to turn it into a circuit |
| 2 | Calibrate settings | `ezkl.calibrate_settings()` | Fine-tune that config using a real example input, so numbers don't overflow/underflow |
| 3 | Compile circuit | `ezkl.compile_circuit()` | Actually turn the model into a zero-knowledge circuit |
| 4 | Get SRS | `ezkl.get_srs()` | Download/generate shared cryptographic parameters (one-time, reusable across proofs) |
| 5 | Setup | `ezkl.setup()` | Generate the proving key (yours, kept private-ish) and verifying key (shared with everyone) |
| 6 | Witness + Prove | `ezkl.gen_witness()` then `ezkl.prove()` | Run the actual input through the model, then generate the proof |
| 7 | Verify | `ezkl.verify()` | Check a proof is valid using the verifying key |

Steps 1–5 only need to happen **once per model** (whenever Member A ships a new model version). Steps 6–7 happen **once per user request** — that's your hot path.

---

## Day 4-5 — Use the real service module

Don't call ezkl functions ad hoc — use `app/prover_service.py`, already built for you (see that file). It exposes exactly two functions:

```python
from app.prover_service import generate_proof, verify_proof

result = generate_proof(input_data=[25000, 700, 3])
# → {"proofId": "...", "proof": {...}, "publicSignals": [...], "output": [...]}

is_valid = verify_proof(proof_id="...")
# → True / False
```

This matches the shapes in `docs/API_CONTRACT.md` exactly — Member C's backend calls these (via the HTTP wrapper below), and gets back JSON in the format everyone already agreed on.

---

## Day 6+ — Expose it over HTTP for Member C

Member C's Node backend needs to call your Python code. Easiest way: a tiny FastAPI server (`app/api_server.py`, already built). Run it:

```bash
uvicorn app.api_server:app --reload --port 8000
```

Now Member C's Express backend can call `http://localhost:8000/generate-proof` and `http://localhost:8000/verify-proof` — see the file for the exact request/response shape (it mirrors `docs/API_CONTRACT.md`).

---

## Once Member A's real model is ready (Week 3-4)

1. Get `model.onnx` and a sample `input.json` from Member A (see their README for the export format).
2. Drop them in `models/loan_model/`.
3. Update the `MODEL_PATH` at the top of `app/prover_service.py`.
4. Re-run `python toy_example/run_pipeline_manually.py`-style steps once manually against the real model to confirm it compiles and proves before wiring it into the API server.
5. **Watch proving time.** If a proof takes more than ~30–60 seconds, that's your cue to simplify the model (fewer parameters/layers) — this is expected and normal, not a sign you did something wrong. Note it in `docs/BENCHMARKS.md`.

---

## Week 9 — EVM (on-chain) verifier

Once the core pipeline is solid:
```bash
python toy_example/export_evm_verifier.py
```
This calls `ezkl.create_evm_verifier()` and produces a Solidity contract. Hand that `.sol` file to Member C — they deploy it to a testnet.

---

## Debugging checklist (things that commonly go wrong)

- **"solc not found"** → `create_evm_verifier` needs the Solidity compiler installed (`pip install solc-select && solc-select install 0.8.20 && solc-select use 0.8.20`). You don't need this until Week 9.
- **Calibration fails / weird accuracy** → your sample input for calibration should be realistic (not all zeros). Use a real row from Member A's dataset.
- **Proof generation is very slow** → expected for larger models; this is literally the KPI the whole zkML field is trying to improve. Keep the model small.
- **Numbers look slightly different between PyTorch and ezkl's output** → normal — ezkl quantizes to fixed-point, so tiny differences are expected. Document this in your accuracy notes, don't chase it to zero.
