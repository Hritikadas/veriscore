# Veriscore — Privacy-Preserving AI Decision Verification

> Prove that an AI model produced a given output **without revealing the private input or the model's weights**, using zero-knowledge proofs.

Demo use case: a **loan/credit approval model** that proves its decisions were computed correctly and fairly — without exposing anyone's financial data or the model's proprietary weights.

Built by a 4-person team as a major project. This README is the front door — read this first, then jump into your own folder.

---

## 1. What problem does this solve? (explain-like-I'm-new)

Normally, if you want to trust an AI's output, you have two bad options:
1. **Run it yourself** — but then you need the model's private weights.
2. **Trust a server to run it for you** — but then you must hand over your private data, and you have no proof the server didn't cheat or use a different model.

**Zero-Knowledge Machine Learning (zkML)** gives a third option: the server runs the model and generates a small cryptographic **proof** alongside the answer. Anyone can check the proof in milliseconds and be mathematically certain the output is correct — without ever seeing the private input or the model weights.

Example demo we're building: a **credit-risk / loan-eligibility model**. A user submits their private financial data → gets an approve/deny decision → gets a proof that the *real* model was run correctly on their *real* data → a verifier (or smart contract) checks the proof instantly, with zero access to the sensitive data.

## 2. System Architecture

```
[ User Input (private) ]
        │
        ▼
┌─────────────────────────────┐
│ 1. MODEL PIPELINE            │  <- Member A
│    Train/export model (ONNX) │
│    Quantize float → fixed pt │
└──────────────┬───────────────┘
               │ quantized model + input
               ▼
┌─────────────────────────────┐
│ 2. ZK PROVING SERVICE        │  <- Member B
│    ezkl circuit compile      │
│    Generate proof (π)        │
└──────────────┬───────────────┘
               │ proof.json + public output
               ▼
┌─────────────────────────────┐
│ 3. BACKEND API               │  <- Member C
│    Orchestrates 1 & 2         │
│    Verifies proof             │
│    (optional) EVM verifier    │
└──────────────┬───────────────┘
               │ REST API
               ▼
┌─────────────────────────────┐
│ 4. FRONTEND DEMO              │  <- Member D
│    Upload input, see result   │
│    Show proof + verify status │
└─────────────────────────────┘
```

This mirrors classic zkML architecture (model → circuit → prover → verifier) but uses **[ezkl](https://github.com/zkonduit/ezkl)** as the circuit/proving engine instead of hand-writing Halo2 — so the team can focus on integration, correctness, and a working demo instead of re-implementing cryptography research.

## 3. Repo layout

| Folder | Owner | What lives here |
|---|---|---|
| `/model-pipeline` | Member A | Python: model training/export, ONNX conversion, quantization |
| `/zk-proving-service` | Member B | Python/Rust: ezkl wrapper, circuit setup, proof generation service |
| `/backend-api` | Member C | Node.js/Express: orchestration API, verification, EVM contract deployment |
| `/frontend-demo` | Member D | React: UI, calls backend, displays proof + result |
| `/docs` | Everyone | Architecture notes, weekly progress, final report |

## 4. Tech stack

- **Model**: Python, PyTorch, ONNX
- **ZK layer**: [ezkl](https://github.com/zkonduit/ezkl) (Halo2-based, handles quantization + circuit + proof for you)
- **Backend**: Node.js, Express
- **Frontend**: React + Vite
- **Optional on-chain verifier**: Solidity (ezkl can auto-generate this), deployed to a testnet

## 5. Related work — and how Veriscore is different

zkML tooling already exists and is actively funded — we're not inventing the cryptography, we're building on it and filling a gap it leaves open.

| Project | What it is | What it doesn't do |
|---|---|---|
| **EZKL** (Zkonduit) | Leading open-source toolkit: ONNX → Halo2 circuit → proof | Developer SDK/CLI only — no end-user product or narrative demo |
| **Giza** | Similar tooling targeting Cairo/Starknet | Same — infra layer, not a consumer-facing story |
| **Modulus Labs** | Published the founding zkML benchmark paper; demoed on-chain verified chess AI | Closed-source prover; demos are technical proofs-of-concept, not explained for a general audience |
| **RISC Zero / zkVMs** | General-purpose "prove any program" approach | Much higher overhead; not ML-specific |

**What all of the above have in common:** they're infrastructure for developers who already understand zero-knowledge proofs. None of them ship a polished, end-to-end product that explains itself to someone who doesn't.

**Where Veriscore differs — this is our actual contribution:**
1. **A real narrative use case** (loan fairness), not a generic "prove MNIST" tutorial demo.
2. **A plain-language explainer layer** in the UI — translates the cryptography for non-technical viewers instead of assuming they already know what a SNARK is.
3. **Both off-chain and on-chain verification shown side-by-side**, so the "seconds to prove, milliseconds to verify" property is visible, not just claimed.
4. **Our own published benchmarks** (proof time, proof size, accuracy loss from quantization) — a respected artifact in this space, and evidence of real engineering, not just API calls.
5. **Deliberate design** — most zkML demos look like a terminal output pasted into a webpage. We're treating the UI as a first-class part of the project.

We're built on top of EZKL (using it, not reimplementing it) — the same way most production zkML products in this space do.

## 6. How to get started

See [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) for git workflow and setup, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the week-by-week plan.

Each member folder has its own `README.md` with a full task breakdown — start there.
