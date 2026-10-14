"""
Trust Lab automated test suite for Veriscore.
Verifies all tamper attack vectors, non-overwrite integrity, and error handling.
"""
import hashlib
import json
import os
import sys
import urllib.request
import urllib.error

BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:5000")
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
PROOFS_DIR = os.path.join(REPO_ROOT, "artifacts", "proofs")


def http_req(path, method="GET", body=None):
    url = f"{BACKEND_URL}{path}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"error": err_body}


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def run_tests():
    print("=== Veriscore Trust Lab Test Suite ===")
    passes = 0
    total = 0

    # Test 1: Recent proofs endpoint
    total += 1
    st, data = http_req("/api/trust-lab/recent-proofs")
    assert st == 200 and data.get("success") is True and len(data.get("proofs", [])) > 0, f"Expected 200 + proofs list, got {st} {data}"
    proof_id = data["proofs"][0]["proofId"]
    proof_file = os.path.join(PROOFS_DIR, proof_id, "proof.json")
    assert os.path.exists(proof_file), f"Proof file not found: {proof_file}"
    orig_hash = file_sha256(proof_file)
    print(f"[PASS] 1. Recent proofs listed ({len(data['proofs'])} entries) -- target: {proof_id[:16]}...")
    passes += 1

    # Test 2: Original proof verification (Control group)
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "original"})
    assert st == 200, f"Expected 200, got {st}"
    assert res.get("status") == "VERIFIED" and res.get("verified") is True, f"Expected VERIFIED, got {res}"
    assert res.get("error") is None, f"Expected error: None, got {res.get('error')}"
    print(f"[PASS] 2. Original proof verification -> VERIFIED ({res.get('verifyTimeSec')}s)")
    passes += 1

    # Test 3: Tampered public output (Outcome Forgery Attack)
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "tamper_public_output"})
    assert st == 200, f"Expected 200, got {st}"
    assert res.get("status") == "REJECTED" and res.get("verified") is False, f"Expected REJECTED, got {res}"
    assert "constraint" in str(res.get("error")).lower(), f"Expected constraint error, got {res.get('error')}"
    assert res.get("details", {}).get("instancesModified") is True, "Expected instancesModified: True"
    print(f"[PASS] 3. Tampered public output -> REJECTED: {res.get('error')}")
    passes += 1

    # Test 4: Tampered proof bytes (Transcript / KZG corruption)
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "tamper_proof_bytes"})
    assert st == 200, f"Expected 200, got {st}"
    assert res.get("status") == "REJECTED" and res.get("verified") is False, f"Expected REJECTED, got {res}"
    assert res.get("error") is not None, "Expected non-empty cryptographic error"
    assert res.get("details", {}).get("proofBytesModified") is True, "Expected proofBytesModified: True"
    print(f"[PASS] 4. Tampered proof bytes -> REJECTED: {res.get('error')}")
    passes += 1

    # Test 5: Dual tamper (Output + Proof bytes)
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "tamper_both"})
    assert st == 200, f"Expected 200, got {st}"
    assert res.get("status") == "REJECTED" and res.get("verified") is False, f"Expected REJECTED, got {res}"
    print(f"[PASS] 5. Dual tamper -> REJECTED ({res.get('verifyTimeSec')}s)")
    passes += 1

    # Test 6: Zero-disk mutation guarantee check
    total += 1
    after_hash = file_sha256(proof_file)
    assert orig_hash == after_hash, f"CRITICAL: Proof file on disk was modified! {orig_hash} != {after_hash}"
    print(f"[PASS] 6. Proof file immutability verified (SHA256 unchanged: {orig_hash[:16]}...)")
    passes += 1

    # Test 7: Unknown proofId -> 404
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": "non-existent-proof-id-0000"})
    assert st == 404, f"Expected 404, got {st}"
    print("[PASS] 7. Unknown proofId returns HTTP 404")
    passes += 1

    # Test 8: Invalid tamperType -> 400
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "invalid_attack"})
    assert st == 400, f"Expected 400, got {st}"
    print("[PASS] 8. Invalid tamperType returns HTTP 400")
    passes += 1

    # Test 9: Missing customPayload for custom type -> 400
    total += 1
    st, res = http_req("/api/trust-lab/verify", "POST", {"proofId": proof_id, "tamperType": "custom"})
    assert st == 400, f"Expected 400, got {st}"
    print("[PASS] 9. Missing customPayload returns HTTP 400")
    passes += 1

    # Test 10: Standard verify endpoint backward compatibility
    total += 1
    st, res = http_req("/api/verify", "POST", {"proofId": proof_id})
    assert st == 200 and res.get("verified") is True, f"Expected 200 verified: True, got {st} {res}"
    print("[PASS] 10. Standard /api/verify backward compatibility preserved")
    passes += 1

    print(f"\nRESULT: {passes} / {total} PASS")
    return passes == total


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
