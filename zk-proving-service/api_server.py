"""
Thin HTTP wrapper around prover_service.py, so Member C's Node/Express
backend can call this over HTTP instead of running Python directly.

Run: uvicorn api_server:app --port 8000   (from the zk-proving-service dir)

Endpoints deliberately mirror docs/API_CONTRACT.md so Member C's Express
routes can mostly just forward requests/responses to/from here.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from prover_service import (
    generate_proof,
    verify_proof,
    verify_proof_detailed,
    test_tamper,
    list_recent_proofs,
    get_proof,
    model_info,
    infer_model,
    MODEL_ID,
)

app = FastAPI(title="Veriscore ZK Proving Service")


class ProveRequest(BaseModel):
    input: list


class VerifyRequest(BaseModel):
    proofId: str


class TamperRequest(BaseModel):
    proofId: str
    tamperType: str = "original"
    customPayload: dict | None = None


@app.post("/generate-proof")
def http_generate_proof(req: ProveRequest):
    try:
        return generate_proof(req.input)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proof generation failed: {e}")


@app.get("/proof/{proof_id}")
def http_get_proof(proof_id: str):
    result = get_proof(proof_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown proofId")
    return result


@app.post("/verify-proof")
def http_verify_proof(req: VerifyRequest):
    try:
        return verify_proof_detailed(req.proofId)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/verify-tamper")
def http_verify_tamper(req: TamperRequest):
    try:
        return test_tamper(req.proofId, req.tamperType, req.customPayload)
    except ValueError as e:
        raise HTTPException(status_code=400 if "Unsupported" in str(e) else 404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tamper test failed: {e}")


@app.get("/api/trust-lab/recent-proofs")
def http_recent_proofs():
    return {"proofs": list_recent_proofs(20)}


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# MLaaS-style model registry (Phase 6) - additive, nothing above changed.
# ---------------------------------------------------------------------------

@app.get("/api/models")
def list_models():
    info = model_info()
    return {"models": [info], "count": 1}


@app.get("/api/models/{model_id}")
def get_model(model_id: str):
    info = model_info()
    if info["id"] != model_id:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")
    return info


class InferRequest(BaseModel):
    input: list


@app.post("/api/models/{model_id}/infer")
def http_infer_model(model_id: str, req: InferRequest):
    if model_id != MODEL_ID:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")
    try:
        return infer_model(req.input)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
