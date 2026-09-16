# Blockchain / On-chain Verifier Experiments (Phases 4 & 5)

Status: **PASS** (Phase 4 - Solidity/EVM, Phase 5 - Ethers.js on a local chain)

## Phase 4 - Solidity registry + in-memory EVM experiments

`ProofRegistry` (`blockchain-verifier/Deployer.sol`) maps a **verification-key
digest** to a deployed `Halo2Verifier` and forwards `verify` calls, so one
chain can host several proofs/models. Both contracts compiled with solc
0.8.20 (optimizer, runs=1, viaIR=false), deployed into the in-memory
`@ethereumjs/vm` and driven through the registry:

```
proof_bytes 9538  instances 1 -> 61325
vk_digest    0xb1e50ef40c3e3eb7b5f44d3e061483dffa1e0c8c57178fb811d797b546d31c44
verifier_deployed  0x5fbdb2315678afecb367f032d93f642f64180aa3
registry_deployed  0xe7f1725e7734ce288f8367e1bb143e90bb3f0512
register_ok    true
REGISTRY_VERIFY true  verify_ms 118
exit=0
```

## Phase 5 - Ethers.js + genuine local chain (ganache)

A real JSON-RPC EVM node (`ganache`, chain id 1337, block gas limit 1 GGas)
started on `127.0.0.1:8545`; every step below is a **mined transaction**
through ethers.js v6 (contracts: `Verifier.sol` + `Deployer.sol` compiled at
runtime with solc 0.8.20). Calldata comes from the official ezkl 23.0.5
`encode_evm_calldata`; the proof is the same one validated server-side
(`proofs/8f53eac4-6dc0-4fb9-a22d-d1e5ade37593`, `ezkl.verify==True`).

```
local_chain ganache 127.0.0.1:8545 chain_id 1337
verifier_deployed 0xda9284f603B9AA7560920E19B5e9007dc44816Ad  block 1  gas 4,859,134
registry_deployed 0xD586579ac99570c61f47E6e26899b56f4945C4A2  block 2  gas   360,689
register_ok   true  tx 0xedd4fd4ca0fc5b69d26ac4da048a6449ab3f6145825c35515eda6eebb12bfa91  block 3  gas 48,308
unknown_digest_call_should_revert true                      # security check: wrong VK reverts
REGISTRY_VERIFY_ETH_CALL true                               # eth_call cross-check
REGISTRY_VERIFY_TX  true                                    # mined verify transaction
verify_tx  0x66cb087bd9eee787393b3bea07cbf60b515f2dd8db2ea014d44e3fadb8b3afdb  block 4  gas 717,294  ms_to_mine 817
verified_event [{"digest":"0xb1e50ef4...31c44","result":true}]   # Verified(bytes32,bool) log, topic0 check
exit=0
```

Notes

- The verifier deployment costs 4.86 MGas (the 23.0.5 `Verifier.sol` embeds
  the full SRS + VK constant table); a normal 30M block gas limit is required.
- `register` + `verify` are plain ABI calls; the demo re-computes the function
  selector (keccak of signature) and decodes the on-chain `Verified` log by
  topic `0x...` + trailing data word — no ABI decoding library involved.
- `RPC_URL` env override points the same script at any standard JSON-RPC EVM
  chain (testnets/mainnet-certified path), everything else is chain-agnostic.

## Files

- `blockchain-verifier/Verifier.sol` (+`.abi`) - ezkl 23.0.5-generated on-chain verifier.
- `blockchain-verifier/Deployer.sol` - `ProofRegistry` used here.
- `client-verify/evm-registry-demo.js` - Phase 4 in-memory EVM registry test.
- `client-verify/ethers-chain-demo.js` - Phase 5 ethers.js + ganache test (standalone: starts ganache, needs none running).
- `client-verify/calldata.hex` - official ezkl calldata (binary).
- `client-verify/registry.bytecode.hex` - cached `ProofRegistry` bytecode.
- `client-verify/verifier.bytecode.hex` - cached `Halo2Verifier` bytecode.