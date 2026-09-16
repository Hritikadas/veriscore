# Client-Side Verification Harness

Standalone scripts that verify Veriscore proofs **without** the backend/prover operator, plus the staged proof files used to drive them.

## What's here

| File | Purpose |
|---|---|
| `evm-client-verify.js` | Verifies a staged proof with the **version-matched** Solidity verifier in an in-memory EVM (no operator server). `CLIENT_SIDE_EVM_VERIFY true`. |
| `evm-registry-demo.js` | Delegates verification through the `ProofRegistry` contract. |
| `ethers-chain-demo.js` | Deploys `Verifier.sol` + `ProofRegistry` on a local ganache chain (id 1337) and mines real `register`/`verify` transactions. |
| `wasm-verify.js` / `verify-in-browser.js` | npm-WASM verification attempts (engine release line 22.0.1 is **incompatible** with ezkl 23.0.5 proofs — documented in `docs/architecture/client-verify.md`). |
| `calldata.hex` | Proof calldata for on-chain verification (selector `1e8e1e13`). |
| `proof.json`, `settings.json`, `verifying.key`, `kzg.srs` | Staged proof + public verification material for the loan model. |

## Run

```powershell
npm install
node evm-client-verify.js   # in-memory EVM verification
node evm-registry-demo.js   # delegate through ProofRegistry
node ethers-chain-demo.js   # local ganache chain (mined txs)
```

On-chain verification is demonstrated on a **local EVM development chain** (not a public testnet). The Solidity verifier that these harnesses execute is produced from `blockchain-verifier/Verifier.sol` (ezkl 23.0.5).