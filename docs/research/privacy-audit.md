# Privacy & Security Assessment (Phase 9)

Status: **PASS with documented limitations** — the privacy architecture of the
Veriscore demo is genuinely implemented; the section below distinguishes
"verified in this repo" from "enterprise hardening recommended".

Ground truth is the actual calibrated settings (`artifacts/settings.json`,
EZKL 23.0.5):

```
input_visibility    = Private
output_visibility   = Public
param_visibility    = Fixed
logrows             = 12
model_instance_shapes = [[1, 1]]   # only the output remains a public instance
```

## 1. What the ZK pipeline actually protects

- **Input privacy (core claim, verified).** The loan features the user
  supplies are declared `Private`. Because EZKL calibration re-injects the
  private input shape (a known quirk), `prover_service.py` calibrates with the
  input public, then flips `input_visibility` to `Private` and strips the input
  instance shape, leaving only `[[1,1]]` (the output) in
  `model_instance_shapes`. Consequence: the **witness never contains the raw
  input as a public instance**; the proof commits to it without revealing it.
- **Stateless verifiability.** `ezkl.verify` runs server-side and checks the
  proof against the (public) verifying key + public output; a third party can
  run the same check without the input or the proving key. This is the
  "trust, but verify" property the frontend page states.
- **Keys split.** `proving.key` only exists in `artifacts/` on the prover host
  and is never served over HTTP; `verifying.key` is public-ish (readable by
  the service that verifies). The on-chain `Verifier.sol` embeds only the VK.
- **No output leakage of intermediate activations.** The only public instance
  is the final rescaled output (`61325 → 0.2339…`), not hidden-layer values.

## 2. Honest limitations (NOT covered by the current setup)

| area | status | what is actually exposed / needed |
|---|---|---|
| Server sees the raw input | by design | The proving HTTP endpoint receives `[income, credit, years]` to build the witness. Zero-knowledge hides it *from everyone else*; the operator still sees it **unless** proving moves to the client (Phase 3 showed a browser-friendly path, but witness generation is performed server-side here). |
| Output is public | by design | `output_visibility = Public` and `model_instance_shapes=[[1,1]]` mean the decision/probability is a public instance — anyone with the proof/SRS can read the model's answer. |
| Weights are fixed/public | by design | `param_visibility = Fixed` bakes weights into the circuit; they are not secret (matches a public MLaaS model). |
| Transport | demo | Services talk plain HTTP on localhost (`127.0.0.1:8000/5000`); production must sit behind TLS + auth. |
| Proving-key handling | demo | `artifacts/proving.key` lives in the repo working tree; a production deployment should store it in a secrets vault / TPM and distribute only the VK. |
| GPU MSM, client-side WASM verify, Q8.8-in-ZK | NOT AVAILABLE | documented in `docs/gpu-msm.md`, `docs/client-verify.md`, `docs/quantization.md` — no GPU, no 23.0.5-compatible WASM engine, limb-capacity limits. |
| Randomness/side channels | future | No entropy auditing or constant-time review of the prover host was performed; out of scope for the local demo. |

## 3. On-chain exposure (Phases 4–5)

On a real chain the `verify` calldata contains the proof and the public
instance (`61325`); the input remains private. The registry stores
`vkDigest → verifier`, which additionally makes the VK mapping public — as
intended for public verifiability.

## 4. Recommendations (cheap, high-value)

1. Move witness generation to the client once `gen_settings` maturation
   allows (or run the prover in a confidential enclave) so the operator never
   sees inputs.
2. Serve `:8000`/`:5000` behind TLS with an API key; never bind the prover
   to a public interface.
3. Store `proving.key` outside the repo (env/secret manager); commit only VK.
4. Add integrity checks: pin `ezkl==23.0.5`, hash `Verifier.sol`, and cache
   the verified digest in the registry.