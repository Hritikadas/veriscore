# MLaaS-style Model Registry API (Phase 6)

Status: **PASS** — additive, fully backward compatible.

The ZK proving service now exposes an MLaaS-style model registry alongside the
original proof endpoints. No existing route/login was removed or renamed:
`/generate-proof`, `/proof/{id}`, `/verify-proof`, `/health` and the Node
gateway's `/api/predict`, `/api/prove`, `/api/verify` behave exactly as before.

## New endpoints

### ZK provider (`zk-proving-service/api_server.py`, uvicorn :8000)

| route | description |
|---|---|
| `GET /api/models` | registry listing for the registered model(s) |
| `GET /api/models/{model_id}` | detail for one model (404 if unknown) |
| `POST /api/models/{model_id}/infer` | float ONNX inference: `{"input":[25e3,700,3]}` |

The registry entry is produced by `prover_service.model_info()` — the single
source of truth — and includes the real calibrated settings (logrows, scales
[11,18], input Private / output Public), declared GPU status (False) with the
exact reason, presence of the Q8.8 quantized fallback and the on-chain
verifier, plus artifact availability flags. `infer_model()` lazily loads one
onnxruntime CPU session and returns logit/probability/approved.

### Node gateway (`backend-api/server.js`, :5000)

Additive passthrough routes with the same guard patterns as the existing
routes: `GET /api/models`, `GET /api/models/:id`, `POST /api/models/:id/infer`
(forwarded to the provider; clean 503 when the provider is down, 404 passthrough).

## Evidence (measured against the real services)

Python uvicorn on :8001 and Node gateway on :5001 (test instances, since removed):

```
models_count=1 id=loan-v1 zk.ezklVersion=23.0.5 gpuAcceleratedMsms=False
quantizedQ8_8Fallback.available=True onChainVerifier.available=True
detail.input.features = person_income, credit_score, person_emp_exp
infer [25000,700,3]  -> logit=0.234012 prob=0.558238 approved=True   (matches demo semantics)
infer [80000,800,10] -> logit=0.182739 prob=0.545558 approved=True   (matches float ONNX, compare_q8_8)
unknown model id     -> 404
legacy GET /proof/8f53eac4-... -> proofId ok, output=0.23393630981445313 (unchanged behaviour)
gateway /api/health           -> healthy (unchanged behaviour)
```

## Files

- `zk-proving-service/prover_service.py` — `model_info()`, `infer_model()`, config additions.
- `zk-proving-service/api_server.py` — `/api/models` family.
- `backend-api/server.js` — gateway passthrough routes + startup log lines.