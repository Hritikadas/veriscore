# Member C — Backend API

**Your job:** the orchestration layer. Wires the model pipeline + ZK proving service together behind a clean REST API, and handles verification (including on-chain).

## How the backend fits the architecture

```
Frontend (Member D)
      ↓  POST /api/prove  { "input": [25000.0, 700.0, 3.0] }
Backend API (this folder, Member C)
      ├── predict_mlp.py     → runs Member A's 3-feature MLP (ONNX)
      └── call_prover.py     → calls Member B's prover_service.py
                                     (ezkl: witness → proof → verify)
      ↓
REST response: { prediction, proof, public_output, verified }
```

## Stack

Node.js + Express. No extra dependencies beyond `express` and `cors`.

- Prediction step shells out to `predict_mlp.py` (3 numeric features, PyTorch MLP exported to `models/loan_model/model.onnx`).
- Proving step shells out to `call_prover.py`, which imports **Member B's** `zk-proving-service/prover_service.py` — the backend never calls raw ezkl itself, it only uses the team's existing proving interface.
- Standalone verify (`/api/verify`) talks to **Member B's FastAPI service** over HTTP.

## Setup

```bash
cd backend-api
npm install
npm start        # or: node server.js
```

Server listens on `http://localhost:5000` (override with `PORT`).

Optional env vars:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Backend port |
| `PYTHON` | `python` | Python executable to spawn scripts with |
| `PROVER_SERVICE_URL` | `http://127.0.0.1:8000` | Member B's FastAPI proving service (used by `/api/verify`) |

## API endpoints

### `GET /api/health`

**Response (200):**
```json
{ "status": "healthy", "service": "Veriscore Backend API" }
```

### `POST /api/predict`

Two accepted input shapes:

**1) New — 3 numeric features (used by the ZK path):**
```json
{ "input": [25000.0, 700.0, 3.0] }
```
Features are `[income, credit_score, years_employed]`. Runs `predict_mlp.py`.

**Response (200):**
```json
{
  "success": true,
  "modelVersion": "v1",
  "prediction": 1,
  "decision": "approved",
  "probability": 0.5582
}
```

**Errors:** `400` if input is not a flat array of exactly 3 finite numbers.

**2) Legacy — 13 loan fields (kept for backwards compatibility):**
```json
{ "input": { "person_age": 26, "person_income": 59000, "...": "..." } }
```
Runs `model-pipeline/predict_api.py` on the old 13-feature model.

**Response (200):**
```json
{
  "success": true,
  "modelVersion": "v1",
  "prediction": { "success": true, "prediction": 0, "decision": "rejected", "approvalProbability": 0.1562, "model": "loan_model.onnx", "modelVersion": "v1" }
}
```

### `POST /api/prove`  ← main endpoint for Member D

Takes the 3 numeric features, runs the prediction AND generates+verifies a ZK proof in one call.

**Request:**
```json
{ "input": [25000.0, 700.0, 3.0] }
```
(ezkl-style `{ "input_data": [[25000.0, 700.0, 3.0]] }` also accepted.)

**Response (200) — once the proving service works:**
```json
{
  "success": true,
  "modelVersion": "v1",
  "prediction": 1,
  "decision": "approved",
  "probability": 0.5582,
  "proof": { "...": "ezkl proof object" },
  "public_output": [0],
  "verified": true,
  "proofId": "uuid"
}
```

**⚠️ Current status:** the prediction step works, but **proof generation currently fails** because Member B's ezkl setup panics (`ezkl.setup` → `NotPresent`) with the current settings/SRS — see **Known blockers** below. Until that's fixed, `/api/prove` returns a clean `502` with a sanitized message and the prediction included:

```json
{
  "success": false,
  "error": "ZK proof generation is not available right now. Check that Member B's proving service is set up (see backend-api/README.md).",
  "prediction": { "success": true, "prediction": 1, "decision": "approved", "probability": 0.5582 }
}
```

No fabricated proofs — the failure is reported honestly.

### `POST /api/verify`

Verifies an existing proof via Member B's FastAPI service.

**Request:**
```json
{ "proofId": "uuid" }
```

**Response (200):**
```json
{ "success": true, "verified": true }
```

Requires Member B's `api_server.py` to be running on port 8000:
```bash
cd zk-proving-service
uvicorn app.api_server:app --port 8000
```
If it's not running, returns `503` with a clear message (no guesswork).

## Known blockers / handoff notes

1. **ezkl setup panics with `NotPresent`.** Reproduced independently on Member A's MLP and Member B's own toy model. The existing `artifacts/kzg.srs` does not match the circuit, `ezkl.get_srs()` (download) stalls on this network, and local `ezkl.gen_srs()` at logrows 15 is impractical. This blocks ALL proof generation and is **Member B's** fix (SRS/settings/keys in `zk-proving-service`). The backend is fully wired and will start returning real proofs the moment the proving service works — no backend change needed.
2. **`prover_service.py` is locally modified** (someone on the team switched ezkl calls to keyword args). If Member B re-pulls the committed version, there may be a merge to reconcile — flagging so it isn't lost.
3. `/api/prove` is currently **synchronous** (blocks until the proof is ready). The team's `docs/API_CONTRACT.md` sketches an async `proofId`-poll design (Week 5+); the sync version is simpler for the demo and matches `call_prover.py`. Can be swapped to async job polling later without changing the request shape.

## Deliverables checklist

- [x] Express app with orchestration routes (`/api/predict`, `/api/prove`, `/api/verify`, `/api/health`)
- [x] Integration with Member B's proving service via `call_prover.py`
- [x] Request validation + proper HTTP status codes
- [x] Clean JSON responses; internal errors logged server-side, never leaked to the client
- [ ] (Blocked) End-to-end proof generation — needs Member B's ezkl setup fixed
- [ ] (Week 9) Testnet deployment of the EVM verifier contract
- [ ] `API_DOCS.md` (this file serves as the v1 doc)

## Handoff contract with Member D

Call **one endpoint** to demo the full flow:
```js
const res = await fetch("http://localhost:5000/api/prove", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: [25000.0, 700.0, 3.0] })
});
const data = await res.json();
// data.prediction, data.decision, data.probability, data.verified, data.proof
```
For a plain model call without the proving step: `POST /api/predict` with the same body.