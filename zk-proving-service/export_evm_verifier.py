"""
Week 9 task: export a Solidity smart contract that can verify proofs on-chain.
Hand the resulting .sol file to Member C for testnet deployment.

Prerequisite: solc installed —
    pip install solc-select
    solc-select install 0.8.20
    solc-select use 0.8.20

Run: python toy_example/export_evm_verifier.py
"""
import os
import ezkl

HERE = os.path.dirname(__file__)
ARTIFACTS_DIR = os.path.join(HERE, "..", "artifacts")

VK_PATH = os.path.join(ARTIFACTS_DIR, "verifying.key")
SETTINGS_PATH = os.path.join(ARTIFACTS_DIR, "settings.json")
SOL_PATH = os.path.join(ARTIFACTS_DIR, "Verifier.sol")
ABI_PATH = os.path.join(ARTIFACTS_DIR, "Verifier.abi")

if __name__ == "__main__":
    ezkl.create_evm_verifier(VK_PATH, SETTINGS_PATH, SOL_PATH, ABI_PATH)
    print(f"Wrote {SOL_PATH} and {ABI_PATH}")
    print("Hand these to Member C for testnet deployment.")
