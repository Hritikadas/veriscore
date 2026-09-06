# Client-Side Verification (Phase 3)

Status: **PASS**

Verification of an EZKL 23.0.5 KZG proof entirely `client-side` — no server,
no Python, no EZKL binary — executed purely with JavaScript/WASM/Solidity on a
consumer machine (Windows, 13th-gen Intel i5, 15.7 GB RAM, Node v24.14.0).

## 1. Two candidate mechanisms were evaluated

### 1a. `@ezkljs/engine` (WASM) — NOT AVAILABLE

`@ezkljs/engine@22.0.1` (latest published on npm) exposes
`verify(proof, vk, settings, srs)`. Tested directly against the 23.0.5 proof:

| attempt | settings shim | result |
|---|---|---|
| stock settings | (none) | `missing field transcript_type` |
| `transcript_type: "Poseidon"` | | `Invalid elliptic curve point encoding in proof` |
| `transcript_type: "EVM"` | | `The constraint system is not satisfied` |

The npm WASM engine is a **different release line** from the (pip) EZKL
23.0.5 that produced our proof; proof serialization and curve encoding differ
between 22.x and 23.x. Direct in-browser WASM verification of a 23.0.5 proof
is therefore not achievable with any published engine build. This is a
definitive **version-format mismatch**, not a fixable config issue.

### 1b. On-chain Solidity verifier in an in-memory EVM — PASS

The **version-matched** path: EZKL 23.0.5 itself can emit a Solidity verifier
(`ezkl.create_evm_verifier`) whose verifying key is *our* 23.0.5 key, and an
official 23.0.5 encoder (`ezkl.encode_evm_calldata`) builds the calldata. This
is exactly how `@ezkljs/verify@22.0.1` behaves in the browser (an ephemeral
`@ethereumjs/vm`), except here both verifier and calldata are produced by the
matching pipeline version.

## 2. Evidence

Fresh proof generated through the working HTTP prover
(`proofs/8f53eac4-6dc0-4fb9-a22d-d1e5ade37593/proof.json`), Python
`ezkl.verify` = `True`.

```
verifier_bytecode_len 22253        # Verifier.sol compiled via solc 0.8.20 (optimizer runs=1, viaIR=false)
calldata_bytes      4964           # selector 1e8e1e13 = verifyProof(bytes,uint256[])
verifier_deployed   0x5fbdb2315678afecb367f032d93f642f64180aa3   (18 ms)
CLIENT_SIDE_EVM_VERIFY true        # verifyProof returned 1; proof VALIDATED on-chain-style
verify_ms           123            # execution time of verifyProof
exit=0
```

Build/dependency notes (recorded so the result is reproducible):

- `@ethereumjs/util@9` CJS build does not re-export `keccak256`; it is
  polyfilled from `@noble/hashes/sha3` (the algorithm the ESM build uses).
- `@ethereumjs/block@5.3.0` expects a `Common` whose `customCrypto` property is
  always defined; the pinned `@ethereumjs/common@4.0.0` lacks it, so
  `@ethereumjs/common@4.3.0` is installed (compatible within the 4.x range).
- Deploy gas `0xfffffffff`; tx `gasPrice 10` (>= Shanghai genesis base fee 7).
- `Verifier.sol` (23.0.5-generated) compiles only with **viaIR=false,
  runs=1** (viaIR=true hits stack-too-deep at 24 slots; recorded in
  `blockchain-verifier/`).

## 3. Files

- `client-verify/evm-client-verify.js` — the client-side verifier harness.
- `client-verify/proof.json`, `settings.json`, `verifying.key`, `kzg.srs` —
  staged pipeline artifacts (same proof as `proofs/8f53eac4-…/proof.json`).
- `client-verify/calldata.hex` — raw calldata written by
  `ezkl.encode_evm_calldata` (do not read as text: binary).
- `client-verify/wasm-verify.js` + `proof_t22.json` — evidence of 1a.
- `blockchain-verifier/Verifier.sol` + `.abi` — the on-chain verifier used here.

## 4. Conclusion

Client-side ZK verification is **genuinely implemented and passing** through
the version-matched on-chain verifier executed in `client-side` JavaScript
against an in-memory EVM. This same artefact is used by Phase 4/5 who deploy
`Verifier.sol` (and a registry) to a persistent local chain via `ethers.js`.