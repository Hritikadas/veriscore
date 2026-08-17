# Member B — ZK Proving Service

**Your job:** turn Member A's ONNX model into a zero-knowledge circuit, and generate/verify proofs. This is the cryptographic core of the project.

## Why this matters (in the architecture)
This covers the "Arithmetic Circuit Compiler," "Proving System Execution Pipe," and core of "Verification Engine" from the original design — using **[ezkl](https://github.com/zkonduit/ezkl)** so you don't hand-write Halo2 circuits (that part is genuinely research-lab-scale work; ezkl already does it correctly and is what real zkML products use under the hood).

## Setup
```bash
pip install ezkl onnx onnxruntime
# or use the ezkl CLI: https://docs.ezkl.xyz/
```

## Core pipeline (this is literally what ezkl automates for you)
1. **Generate settings** from the ONNX model (this is the fixed-point quantization step):
   ```bash
   ezkl gen-settings -M model.onnx
   ezkl calibrate-settings -M model.onnx -D input.json
   ```
2. **Compile the circuit**:
   ```bash
   ezkl compile-circuit -M model.onnx -S settings.json
   ```
3. **Setup proving/verifying keys** (one-time per model):
   ```bash
   ezkl setup -M model_compiled.onnx
   ```
4. **Generate witness + proof**:
   ```bash
   ezkl gen-witness -D input.json -M model_compiled.onnx
   ezkl prove -W witness.json -M model_compiled.onnx
   ```
5. **Verify proof**:
   ```bash
   ezkl verify -P proof.json
   ```

## Your actual engineering task
Wrap steps 1–5 above into a clean **Python service/module** (not manual CLI calls) that Member C's backend can call, e.g.:

```python
# prover_service.py
def generate_proof(onnx_path: str, input_path: str) -> dict:
    """Runs full ezkl pipeline, returns {proof, public_signals, verify_key_path}"""
    ...

def verify_proof(proof_path: str, vk_path: str) -> bool:
    ...
```

Expose this as a small internal API (Flask/FastAPI) or as a CLI wrapper Member C's Node backend can shell out to — decide together in Week 3.

## Also your task (Week 9): EVM verifier export
```bash
ezkl create-evm-verifier -M model_compiled.onnx --vk-path vk.key
```
This generates a Solidity contract — hand it to Member C to deploy.

## Deliverables checklist
- [ ] `prover_service.py` (or equivalent) wrapping the ezkl pipeline
- [ ] Benchmark notes: proof generation time, proof size, verification time (`docs/BENCHMARKS.md`)
- [ ] Generated Solidity verifier contract for Member C
- [ ] Short write-up: "How zero-knowledge proofs work" for the final report (this is a great section for your resume/report — shows you understand the crypto, not just the API calls)

## Handoff contract with Member C
Your service takes `(onnx_path, input_json) → proof.json`. Agree on the exact function signature / API shape with Member C before Week 5.
