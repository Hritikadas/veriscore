# Member C — Backend API

**Your job:** the orchestration layer. Wires the model pipeline + ZK proving service together behind a clean REST API, and handles verification (including on-chain).

## Why this matters (in the architecture)
This is the glue layer connecting every module in the diagram — not in the original academic spec explicitly, but essential for turning this into a real, demoable product (which is what makes it resume-worthy vs. a pile of scripts).

## Stack
Node.js + Express (per your existing skillset — this fits your other projects like EcoChain).

## API contract (agree on this with Members B & D early)

```
POST /api/predict
  body: { input: [...] }
  → { output: [...], modelVersion: "v1" }

POST /api/prove
  body: { input: [...] }
  → { proofId: "uuid", status: "generating" }

GET /api/prove/:proofId
  → { status: "done" | "generating" | "failed", proof: {...}, publicSignals: [...] }

POST /api/verify
  body: { proofId: "uuid" }
  → { verified: true|false }

POST /api/verify-onchain   (Week 9+)
  body: { proofId: "uuid" }
  → { txHash: "0x...", verified: true|false, explorerUrl: "..." }
```

## Tasks
1. Scaffold Express app with the routes above (stub with mock data first — don't block on Members A/B).
2. Once Member B's proving service is ready, call it (via child_process shelling to Python, or an internal HTTP call to their FastAPI/Flask service — pick one together).
3. Add job status tracking for `/prove` — proof generation can take seconds to minutes, so make it async (return a `proofId` immediately, poll for status). A simple in-memory map or SQLite table is enough for v1.
4. **Week 9**: deploy Member B's generated Solidity verifier contract to a testnet (Sepolia) using `ethers.js` + a free RPC (Alchemy/Infura), wire up `/verify-onchain`.
5. Add basic error handling, request validation, and logging.
6. Write API docs (can auto-generate with a tool like Swagger, or just a clean markdown table like above).

## Deliverables checklist
- [ ] Express app with all routes above
- [ ] Integration with Member B's proving service
- [ ] SQLite or in-memory job store for async proof generation
- [ ] Testnet deployment of the EVM verifier contract
- [ ] `API_DOCS.md`

## Handoff contract with Member D
Give Member D the finalized API contract (above) as early as possible (Week 2) — they can build the whole frontend against mocked responses matching this shape before your real endpoints exist.
