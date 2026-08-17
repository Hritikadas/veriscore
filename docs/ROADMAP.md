# Roadmap (12-Week Plan)

Designed so all 4 people can work in parallel most weeks, with two integration checkpoints.

| Week | Member A (Model) | Member B (ZK Proving) | Member C (Backend) | Member D (Frontend) |
|---|---|---|---|---|
| 1–2 | Pick use case, collect/prep dataset, train small model (e.g. logistic regression or small MLP) | Install & learn `ezkl` CLI, run its official examples end-to-end | Scaffold Express project, define API contract (see backend README) | Scaffold React app, build static mockup screens |
| 3–4 | Export model to ONNX, verify with `onnxruntime`, write accuracy tests | Run `ezkl` on Member A's ONNX export, get first working proof + verify locally | Build `/predict` and `/prove` endpoints stubbed with mock data | Build input form UI, wire to mock backend |
| 5–6 | Tune quantization, document accuracy loss (target <1%) | Wrap ezkl steps into a reusable Python function/service (`generate_proof(model, input)`) | **Checkpoint 1**: connect real model-pipeline output into backend | Connect frontend to real backend `/predict` |
| 7–8 | Freeze final model, write model card doc | Add proof verification function; benchmark proof time & size | Add `/verify` endpoint; error handling; logging | Show proof status (verified ✅ / pending / failed) in UI |
| 9 | Support | Generate Solidity verifier via ezkl (`ezkl create-evm-verifier`) | Deploy verifier contract to a testnet (Sepolia), add `/verify-onchain` endpoint | Add "Verify on-chain" button + testnet explorer link |
| 10 | Support | Support | Full integration testing, write API docs | Polish UI/UX, loading states, error states |
| 11 | — | — | — | Record demo video, deploy frontend (Vercel) + backend (Render) |
| 12 | Everyone: final report, README polish, presentation slides, project viva prep | | | |

## Checkpoints (don't skip these)
- **End of Week 6**: full pipeline runs end-to-end at least once, even if slow/ugly.
- **End of Week 9**: on-chain verification working on a testnet.
- **End of Week 11**: public demo link + video works for someone who has never seen the project.

## Scope-cutting rules (if running behind)
1. Cut on-chain verification first (keep only backend/local verification) — still a legitimate, complete zkML project.
2. Use a smaller/simpler model (avoid CNNs; a small tabular/MLP model proves the concept just fine and proves much faster).
3. Cut UI polish before cutting the core prove/verify pipeline — a working pipeline with a plain UI beats a beautiful UI with a broken pipeline.
