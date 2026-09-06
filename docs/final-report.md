# Veriscore Upgrade — Final Report

Date: 2026-09-06 · Machine: Windows, 13th-gen Intel Core i5-1334U
(10C/12T, 15.7 GB RAM), Python 3.13.7, Node v24.14.0, npm 11.9.0,
**ezkl 23.0.5** (pip), solc 0.8.20.

Scope: complete the previously-blocked upgrade (Phases 0–11) with
**genuinely implemented, tested** features. Anything that could not be done
honestly is reported as **NOT AVAILABLE** with the exact technical reason.
The working demo was preserved and re-verified at the end.

---

## Result summary

| Phase | Deliverable | Status | Evidence |
|---|---|---|---|
| 0 | Audit + restore working demo | **PASS** | root cause = EZKL limb decomposition; fixed calibration (5-row data, `scales=[11,18]`, `max_logrows=12`); e2e restored |
| 1 | Q8.8 quantization | **PASS** | fixed-point ONNX decision-consistent; Q8.8-in-ZK **NOT AVAILABLE** (limb capacity) |
| 2 | GPU / accelerated MSM | **NOT AVAILABLE** | no CUDA GPU/toolkit; ezkl wheels expose no GPU API; CPU fallback benchmarked |
| 3 | Client-side verification | **PASS** | version-matched Solidity verifier in in-memory EVM: `CLIENT_SIDE_EVM_VERIFY true`; npm WASM (engine 22.0.1) incompatible with 23.0.5 proofs — documented |
| 4 | Solidity/EVM experiments | **PASS** | `ProofRegistry`(Deployer.sol) + `Verifier.sol`; `REGISTRY_VERIFY true` |
| 5 | Ethers.js + local chain | **PASS** | ganache chain, real mined register+verify txs, `Verified` event `result=true` |
| 6 | MLaaS `/api/models` registry | **PASS** | new + backward compatible (old routes re-tested on live services) |
| 7 | Frontend sections | **PASS** | live registry + client-verify/quantum-readiness sections; `vite build` clean |
| 8 | Expanded E2E matrix | **PASS** | added `[50000,750,7]`; **17/17 checks pass** |
| 9 | Privacy audit | **PASS** | `input_visibility=Private`, keys split; honest limitations documented |
| 10 | README | **PASS** | architecture, running instructions, proof-of-work table |
| 11 | This report | — | |

## Key numbers (measured)

- E2E: **17 passed / 0 failed** (`python e2e_test.py`).
- Proof: ~1.5 s to generate, ~0.03 s to verify, **26 951 B** per proof (2¹² rows).
- `[25000,700,3]` → approved, probability **0.5582** (matches float model);
  `[50000,750,7]` → approved, probability **0.549**; both proofs verified.
- Q8.8 fixed-point vs float: decision-identical for required inputs, abs logit
  error ≤ 0.065 (float-with-quantized-weights 0.2462 vs fixed-point 0.2422 vs
  float 0.1827 for `[80000,800,10]`).
- Client-side EVM verify: deploy 18 ms, `verifyProof` 123 ms, gas 717 294
  (on-chain tx), calldata 4 964 B (selector `1e8e1e13`).

## NOT AVAILABLE items (honest, with reasons)

1. **Q8.8-in-ZK** — EZKL's forward-pass synthesis fails:
   `[tensor] decomposition error: integer -274877906944 is too large to be
   represented by base 16384 and n 2` → `forward pass failed: [halo2] General
   synthesis error`. The fixed 2×14-bit limb tower (2²⁸) cannot hold the
   Q8.8 graph's large intermediates.
2. **GPU MSM** — the host has only an Intel Iris Xe iGPU; no `nvidia-smi`, no
   `nvcc`, no `CUDA_PATH`; the ezkl PyPI wheel exposes **no GPU/acceleration
   API** (`gpu-related api: NONE`). All timing numbers above are CPU.
3. **Direct npm-WASM verification of 23.0.5 proofs** — the only published
   engine (`@ezkljs/engine@22.0.1`) is a different release line: `missing
   field transcript_type` → (`Poseidon`) `Invalid elliptic curve point
   encoding` → (`EVM`) `The constraint system is not satisfied`. Version
   mismatch, not a fixable setting. The version-matched path (Solidity
   verifier) is why client-side verification still **PASS**es.

## Deployed artifacts (all in the working tree, nothing committed)

- `model-pipeline/` — Q8.8 primitives, fixed-point reference, `loan_model_q8.onnx`, `evidence_q8_8.json`, `probe_q8_zk.py`.
- `docs/` — `quantization.md`, `gpu-msm.md`, `client-verify.md`, `blockchain-evm.md`, `api-registry.md`, `privacy-audit.md`.
- `blockchain-verifier/` — `Verifier.sol` + `.abi` (ezkl-generated), `Deployer.sol` (`ProofRegistry`).
- `client-verify/` — `evm-client-verify.js`, `evm-registry-demo.js`, `ethers-chain-demo.js`, staged proof `proof.json`/`settings.json`/`verifying.key`/`kzg.srs`, `calldata.hex`, WASM-incompat evidence.
- `zk-proving-service/` — `model_info()`, `infer_model()`, `/api/models[/:id][/infer]`.
- `backend-api/server.js` — MLaaS gateway routes.
- `frontend-demo/src/App.jsx` + `index.css` — live registry + verification sections.
- `e2e_test.py` — 17 checks.

## Final demo state (verified after all changes)

- `:8000` uvicorn, `:5000` node, `:5173` vite — running with final code.
- `GET /api/models` → `loan-v1` (ezkl 23.0.5, bn254/KZG, logrows 12, scales 11/18, input Private).
- `POST /api/prove[+verify]` through the gateway works end-to-end (proof id
  `c97015a8-497b-4f1b-b4ce-f4feca5ce708` → `verified true`).

## How to reproduce

```bash
cd zk-proving-service && python -m uvicorn api_server:app --port 8000   # 1
cd backend-api && node server.js                                          # 2
cd frontend-demo && npm run dev                                          # 3
python e2e_test.py                                                       # full suite
cd client-verify
node evm-client-verify.js    # client-side verify (in-memory EVM)
node ethers-chain-demo.js    # ethers.js + local ganache chain verify
```