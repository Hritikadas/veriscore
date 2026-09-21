# Veriscore - Deployment Guide

## 1. Project Overview

Veriscore is a privacy-preserving AI decision verification demo. It runs a small loan-approval ONNX model, generates a zero-knowledge proof with EZKL, verifies the proof, and returns the decision and proof status to the frontend.

The repository is a multi-service application:

```text
Frontend
   |
   v
Backend API
   |
   +--> AI Model / ONNX Runtime
   |
   +--> EZKL Proving Service
             |
             v
          ZK Proof
             |
             v
       Verification
```

The main request flow is:

```text
User
  -> React/Vite frontend
  -> Node.js/Express backend API
  -> Python ONNX prediction
  -> EZKL proving code
  -> ZK proof generation
  -> EZKL proof verification
  -> Backend response
  -> Frontend result
```

The main online proof path is implemented in `backend-api/server.js`. The backend runs `backend-api/predict_mlp.py` and `backend-api/call_prover.py`. The latter imports `zk-proving-service/prover_service.py`, so the backend and prover must share the same filesystem and Python environment unless the backend is refactored to call the FastAPI service for proof generation.

The repository also contains a separate client-side and blockchain verification demonstration:

- `client-verify/` verifies staged proofs with a version-matched Solidity verifier in an in-memory EVM.
- `blockchain-verifier/` contains `Verifier.sol` and the `ProofRegistry` contract.
- The Ganache demonstration uses a local chain at `127.0.0.1:8545`, chain ID `1337`.
- Blockchain verification is not required for the primary `/api/prove` web demo.

## 2. Deployment Architecture

### RECOMMENDED ₹0 ARCHITECTURE

This is the practical zero-cost architecture for the current codebase and a college demonstration:

```text
                         HTTPS
Browser --------------------------------------------------+
                                                          |
                                                          v
                                                Vercel static frontend
                                                          |
                                                          | VITE_API_URL
                                                          v
                                            Cloudflare Tunnel URL
                                                          |
                                                          v
                                      Existing Windows laptop / desktop
                                                          |
                         +--------------------------------+----------------+
                         |                                                 |
                         v                                                 v
                 Node/Express :5000                              FastAPI :8000
                         |                                                 |
                         +--------------------+----------------------------+
                                              |
                                              v
                              Python + ONNX + EZKL 23.0.5
                                              |
                                              v
                         models/ and artifacts/ local files
```

| Component | Platform | URL / Address | Details |
|---|---|---|---|
| Frontend | Vercel Hobby | `https://<project>.vercel.app/` | Builds `frontend/dist` and serves the React/Vite application. |
| AI Verification page | Vercel Hobby | `https://<project>.vercel.app/home` | Requires SPA fallback so direct refresh works. |
| Backend API | Existing local machine through Cloudflare Tunnel | `https://<tunnel>.trycloudflare.com` | Public HTTPS endpoint forwarding to local port `5000`. |
| EZKL proving service | Existing local machine | `http://127.0.0.1:8000` | Kept local. The Node backend uses the local Python prover and FastAPI service. |
| Model and proof artifacts | Existing local machine | Local repository paths | Includes ONNX model, proving key, SRS, compiled circuit, and writable proof store. |
| Blockchain | Local only | `127.0.0.1:8545` | Optional Ganache/in-memory EVM demonstration; not required for the main web flow. |

This architecture costs ₹0 for the software and hosting services, but the proof service is available only while the local machine is running and connected to the internet.

There is no reliable always-on ₹0 public EZKL deployment guarantee for the current application. Ordinary serverless platforms do not provide the required co-located Node/Python/native-prover/filesystem environment.

## 3. Prerequisites

### Accounts

- GitHub account, if deploying from a Git repository.
- Vercel account for the static frontend. The Hobby plan is free for personal projects.
- Cloudflare account only if using a named tunnel. A temporary `cloudflared tunnel --url` URL can be used for a demonstration without configuring a permanent domain.
- Optional Oracle Cloud account if attempting the separate Always Free VM alternative. Oracle requires signup verification and capacity is not guaranteed.

### Local software

The repository was audited with:

```text
Node.js v24.14.0
npm 11.9.0
Python 3.13.7
```

Install or verify:

```powershell
node --version
npm --version
python --version
git --version
```

The frontend requires Node.js and npm. The backend requires Node.js, npm, and a Python executable. The prover requires Python and native-compatible EZKL dependencies.

### Required project artifacts

The online proof flow requires these files:

```text
models/loan_model/model.onnx
artifacts/settings.json
artifacts/model.compiled
artifacts/kzg.srs
artifacts/proving.key
artifacts/verifying.key
artifacts/proofs/
```

Current important local sizes include approximately:

```text
artifacts/proving.key       30.7 MB
artifacts/kzg.srs            0.5 MB
artifacts/model.compiled     6 KB
models/loan_model/model.onnx 2 KB
```

The proof directory is writable and grows as proofs are generated. The current repository already contains persisted proof files.

### Required environment variables

Frontend:

```text
VITE_API_URL=https://<public-backend-tunnel-url>
```

Backend:

```text
PORT=5000
PYTHON=<path-to-the-EZKL-virtual-environment-python>
PROVER_SERVICE_URL=http://127.0.0.1:8000
```

Example Windows value:

```text
PYTHON=C:\Users\lohar\Desktop\veriscore\zk-proving-service\.venv\Scripts\python.exe
```

No API key is required by the current EZKL implementation. The blockchain scripts may accept `RPC_URL` when using a JSON-RPC network, but the primary demo uses no public blockchain RPC.

## 4. Repository Preparation

Do not commit secrets, private credentials, or unnecessary generated files. The proving key is sensitive operational material and should only be included in a deployment repository when that deployment is intentionally controlled.

Run these commands from the repository root:

```powershell
git status
```

Review the result before staging anything. The repository currently contains frontend changes from the UI and routing work; do not discard them.

If the repository is ready to publish:

```powershell
git add .
git commit -m "prepare project for deployment"
git push origin main
```

The audit found no existing deployment manifests. There is currently no:

- `Dockerfile`
- `docker-compose.yml`
- `vercel.json`
- `netlify.toml`
- `render.yaml`
- `.env.example`
- `pyproject.toml`

The frontend deployment will therefore need Vercel project settings or a small Vercel SPA fallback configuration for `/home`.

## 5. Local Service Setup

### 5.1 Prepare the EZKL environment

Folder:

```text
zk-proving-service/
```

Commands:

```powershell
cd zk-proving-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Verify the native packages:

```powershell
python -c "import ezkl, onnxruntime; print('EZKL and ONNX Runtime ready')"
```

Expected output is a successful import followed by:

```text
EZKL and ONNX Runtime ready
```

### 5.2 Start the FastAPI proving service

From `zk-proving-service/`:

```powershell
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000
```

Health URL:

```text
http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

### 5.3 Start the backend API

Open a second terminal:

```powershell
cd backend-api
npm install
$env:PORT="5000"
$env:PYTHON="C:\Users\lohar\Desktop\veriscore\zk-proving-service\.venv\Scripts\python.exe"
$env:PROVER_SERVICE_URL="http://127.0.0.1:8000"
npm start
```

Health URL:

```text
http://127.0.0.1:5000/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "service": "Veriscore Backend API"
}
```

### 5.4 Test the model registry

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/models
```

The response should identify the registered model as `loan-v1` and include its EZKL metadata.

### 5.5 Test prediction

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:5000/api/predict `
  -ContentType "application/json" `
  -Body '{"input":[25000,700,3]}'
```

Expected successful fields include:

```json
{
  "success": true,
  "decision": "approved",
  "probability": 0.0
}
```

The exact probability depends on the deployed model artifact.

### 5.6 Test real proof generation

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:5000/api/prove `
  -ContentType "application/json" `
  -Body '{"input":[25000,700,3]}'
```

A successful response must include:

```json
{
  "success": true,
  "proof": {},
  "public_output": [],
  "verified": true,
  "proofId": "uuid"
}
```

This is the deployment gate. Do not publish the public demo until this test succeeds on the machine that will host the prover.

## 6. Public Backend Tunnel

For the ₹0 demonstration architecture, expose the local backend with Cloudflare Tunnel.

Install `cloudflared` using the official Windows installer, then run:

```powershell
cloudflared tunnel --url http://localhost:5000
```

The command prints a temporary HTTPS URL similar to:

```text
https://random-name.trycloudflare.com
```

Use that URL as the frontend `VITE_API_URL` value.

Keep both local services running while the public demo is in use:

```text
Node backend :5000
FastAPI      :8000
cloudflared  -> :5000
```

A temporary tunnel URL can change when the process stops. A named Cloudflare Tunnel is preferable for repeated demonstrations and requires a Cloudflare-managed domain configuration.

## 7. Frontend Deployment

From the frontend folder:

```powershell
cd frontend
npm install
$env:VITE_API_URL="https://random-name.trycloudflare.com"
npm run build
```

Expected output:

```text
frontend/dist/index.html
frontend/dist/assets/...
```

Deploy the `frontend/` project to Vercel:

```powershell
npx vercel
```

Use these settings:

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
```

Set this Vercel environment variable:

```text
VITE_API_URL=https://random-name.trycloudflare.com
```

The production frontend URL will be generated by Vercel, for example:

```text
https://veriscore-frontend.vercel.app/
```

## 8. Routing and SPA Refresh

The frontend uses BrowserRouter with these routes:

```text
/       Landing page
/home   AI Verification page
*       Redirect to /
```

Direct refresh of `/home` requires the static host to rewrite unknown paths to `index.html`.

Configure the Vercel project with an SPA fallback equivalent to:

```text
/home -> /index.html
/*     -> /index.html
```

Without this fallback, navigation from `/` may work while directly opening `/home` can return a platform 404.

## 9. Free Platform Decisions

### Vercel

Recommended for the frontend only.

Not recommended for the current full backend/prover because the application uses local Python subprocesses, native EZKL dependencies, shared artifacts, and writable proof storage.

### Netlify

Suitable for the static Vite frontend only.

Not recommended for the current full EZKL service for the same native-runtime and filesystem reasons.

### Render Free

Not recommended for the full proof demo.

The current free service limits include approximately 0.1 CPU and 512 MB RAM. Free services sleep after inactivity and use ephemeral filesystems. That is a poor match for synchronous EZKL proving and persisted proof artifacts.

### Railway Free

Not recommended for continuous ₹0 hosting. The free plan provides limited monthly usage credit rather than a durable always-free compute allocation.

### Hugging Face Spaces

Static Spaces are free. Normal Docker compute is not a guaranteed free personal-account option. Docker Spaces also sleep and lose local filesystem changes on restart.

Not recommended as the guaranteed free host for this exact Node/Python/EZKL architecture.

### Cloudflare Workers

Recommended only for static delivery or lightweight edge logic. Not suitable for Python, ONNX Runtime, or native EZKL proving.

### GitHub Pages

Suitable only for the built frontend. It cannot host Express, FastAPI, Python, EZKL, or proof generation.

### Oracle Cloud Always Free

Potentially suitable for a future always-on deployment, subject to:

- Account verification
- Region capacity
- VM architecture compatibility
- Successful EZKL installation on that architecture

The ARM Always Free allocation has substantially more memory than typical free serverless services, but the current EZKL package must be validated on ARM before using it.

## 10. EZKL and Storage Warnings

The online proof service is not a stateless frontend request.

It requires:

- Native-compatible EZKL installation
- ONNX Runtime
- SRS
- Compiled circuit
- Proving key
- Verifying key
- Writable artifact directories
- Synchronous request duration sufficient for proof generation

The current proof service persists:

```text
artifacts/proofs/{proofId}/proof.json
artifacts/proofs/{proofId}/meta.json
```

Free services with ephemeral filesystems can lose this data whenever they restart, redeploy, or sleep.

The current backend also invokes `call_prover.py` locally. Simply placing the backend and prover on two separate free services will not work without changing the backend proof-generation path to use the FastAPI `/generate-proof` endpoint.

## 11. Blockchain Deployment Scope

Blockchain verification is optional for the primary web demo.

The current repository demonstrates:

- In-memory EVM verification
- Local Ganache verification
- Solidity verifier execution
- ProofRegistry registration and verification

Local chain command:

```powershell
cd client-verify
npm install
node evm-client-verify.js
node evm-registry-demo.js
node ethers-chain-demo.js
```

The local Ganache demonstration uses:

```text
RPC: http://127.0.0.1:8545
Chain ID: 1337
```

No public testnet or mainnet deployment is included in the current architecture. A public blockchain deployment would require a funded account, RPC URL, gas, contract deployment, and separate security review.

## 12. Environment Variables Reference

### Frontend

```text
VITE_API_URL=https://<public-backend-url>
```

### Backend

```text
PORT=5000
PYTHON=<python-executable-with-ezkl-installed>
PROVER_SERVICE_URL=http://127.0.0.1:8000
```

### Optional blockchain scripts

```text
RPC_URL=<json-rpc-url>
```

The main frontend proof flow does not require `RPC_URL`.

## 13. Final Testing Checklist

### Services

- [ ] `GET http://127.0.0.1:8000/health`
- [ ] `GET http://127.0.0.1:5000/api/health`
- [ ] `GET http://127.0.0.1:5000/api/models`
- [ ] `POST /api/predict`
- [ ] `POST /api/prove`
- [ ] `POST /api/verify`

### Frontend

- [ ] `npm run build`
- [ ] Landing page loads at `/`
- [ ] AI Verification page loads at `/home`
- [ ] Direct `/home` refresh works
- [ ] Browser back returns to `/`
- [ ] `VITE_API_URL` is configured
- [ ] Model Registry loads
- [ ] Form submission works
- [ ] Real proof generation returns `verified: true`
- [ ] No CORS errors
- [ ] No console errors

### Responsive checks

- [ ] 1440px
- [ ] 1366px
- [ ] 1024px
- [ ] 768px
- [ ] 390px
- [ ] No horizontal overflow
- [ ] No clipped model registry content
- [ ] Theme switching remains functional

### Blockchain checks

- [ ] `node evm-client-verify.js`
- [ ] `node evm-registry-demo.js`
- [ ] `node ethers-chain-demo.js`

## 14. Expected Final URLs

After deployment, the expected URL pattern is:

```text
Frontend landing:
https://<vercel-project>.vercel.app/

AI Verification:
https://<vercel-project>.vercel.app/home

Public backend tunnel:
https://<cloudflare-tunnel>.trycloudflare.com

Backend health:
https://<cloudflare-tunnel>.trycloudflare.com/api/health

Model registry:
https://<cloudflare-tunnel>.trycloudflare.com/api/models
```

Local service URLs remain:

```text
FastAPI prover:
http://127.0.0.1:8000

Node backend:
http://127.0.0.1:5000

Local blockchain:
http://127.0.0.1:8545
```

## 15. Honest Deployment Verdict

```text
Frontend-only deployment: YES
Prediction-only hosted deployment: YES WITH SMALL CHANGES
Full EZKL deployment on ordinary free serverless tiers: NO
Full college demo using Vercel + local machine + Cloudflare Tunnel: YES WITH SMALL CHANGES
Reliable always-on public EZKL deployment for ₹0: NO GUARANTEE
```

The recommended path for the current repository is therefore:

```text
Vercel frontend
+
Cloudflare Tunnel
+
Local Node/Express + Python/EZKL machine
```

This preserves the existing working architecture and is the most practical zero-cost approach for a professor demonstration, project viva, or controlled recruiter demo.
