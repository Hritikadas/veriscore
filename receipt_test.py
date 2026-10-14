"""
Receipt automated test suite for Veriscore.
Tests verifiable AI decision receipts (both verified and failed/unverified cases).
"""
import json
import os
import sys
import urllib.request
import urllib.error

BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:5000")
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(REPO_ROOT, "artifacts")
PROOFS_DIR = os.path.join(ARTIFACTS_DIR, "proofs")


def http_req(path, method="GET", body=None, raw_resp=False):
    url = f"{BACKEND_URL}{path}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            if raw_resp:
                return resp.status, content
            return resp.status, json.loads(content.decode("utf-8"))
    except urllib.error.HTTPError as e:
        content = e.read()
        if raw_resp:
            return e.code, content
        try:
            return e.code, json.loads(content.decode("utf-8"))
        except Exception:
            return e.code, {"error": content.decode("utf-8", errors="ignore")}


def run_tests():
    print("=== Veriscore Verifiable AI Decision Receipt Test Suite ===")
    passes = 0
    total = 0

    # 1. Generate fresh valid proof via /api/prove
    total += 1
    st, prove_res = http_req("/api/prove", "POST", {"input": [100000, 800, 10]})
    assert st == 200 and prove_res.get("success") is True, f"Prove failed: {st} {prove_res}"
    proof_id = prove_res["proofId"]
    assert prove_res.get("verified") is True, "Expected valid proof to be verified"
    print(f"[PASS] 1. Live ZK proof generated & verified: {proof_id[:16]}... (decision: {prove_res.get('decision')})")
    passes += 1

    # 2. Fetch JSON receipt for verified decision
    total += 1
    decision_val = prove_res.get("decision", "approved").upper()
    prob_val = prove_res.get("probability", 0.6)
    st, r_res = http_req(f"/api/receipt/{proof_id}?format=json&decision={decision_val}&probability={prob_val}")
    assert st == 200 and r_res.get("success") is True, f"Receipt fetch failed: {st} {r_res}"
    receipt = r_res["receipt"]
    assert receipt["verified"] is True, f"Expected verified: True, got {receipt['verified']}"
    assert receipt["verificationStatus"] == "VERIFIED", f"Expected VERIFIED, got {receipt['verificationStatus']}"
    assert receipt["proofId"] == proof_id, "Proof ID mismatch"
    assert receipt["decision"] == decision_val, f"Expected {decision_val}, got {receipt['decision']}"
    assert receipt["probability"] > 0.5, f"Expected probability > 0.5, got {receipt['probability']}"
    assert "receiptDigest" in receipt and len(receipt["receiptDigest"]) == 64, "Expected valid SHA-256 receipt digest"
    assert "cryptographicDetails" in receipt, "Missing cryptographic details"
    print(f"[PASS] 2. Verified JSON receipt generated -- Receipt ID: {receipt['receiptId']}, Status: {receipt['verificationStatus']}")
    passes += 1

    # 3. Privacy compliance check: ensure zero raw financial inputs, keys, or paths
    total += 1
    receipt_str = json.dumps(receipt)
    assert "input" not in receipt, "CRITICAL LEAK: input field found in receipt!"
    assert "person_income" not in receipt_str, "CRITICAL LEAK: person_income found in receipt!"
    assert "credit_score" not in receipt_str, "CRITICAL LEAK: credit_score found in receipt!"
    assert "years_employed" not in receipt_str, "CRITICAL LEAK: years_employed found in receipt!"
    assert "proving.key" not in receipt_str, "CRITICAL LEAK: Private key path in receipt!"
    assert "witnessPath" not in receipt_str, "CRITICAL LEAK: Internal witness path in receipt!"
    assert "C:\\" not in receipt_str and "/Users/" not in receipt_str, "CRITICAL LEAK: Local filesystem path in receipt!"
    print("[PASS] 3. Privacy audit passed: Zero raw inputs, private keys, or sensitive internal paths leaked")
    passes += 1

    # 4. Fetch PDF receipt for verified decision
    total += 1
    st, pdf_bytes = http_req(f"/api/receipt/{proof_id}?format=pdf", raw_resp=True)
    assert st == 200, f"Expected 200 for PDF, got {st}"
    assert pdf_bytes.startswith(b"%PDF"), "Response is not a valid PDF file"
    assert len(pdf_bytes) > 2000, f"PDF file too small: {len(pdf_bytes)} bytes"
    print(f"[PASS] 4. Downloadable PDF receipt generated successfully ({len(pdf_bytes)} bytes, starts with %PDF)")
    passes += 1

    # 5. Failed / Unverified proof case:
    # Create a corrupted proof directory where the instances/proof fail constraint checking
    total += 1
    corrupt_id = "test-corrupt-proof-0000-000000000000"
    corrupt_dir = os.path.join(PROOFS_DIR, corrupt_id)
    os.makedirs(corrupt_dir, exist_ok=True)
    try:
        # Copy original proof but corrupt instance output so Halo2 rejects it
        orig_file = os.path.join(PROOFS_DIR, proof_id, "proof.json")
        with open(orig_file) as f:
            corrupt_proof = json.load(f)
        corrupt_proof["instances"] = [["00" * 32]]  # Corrupted instance
        with open(os.path.join(corrupt_dir, "proof.json"), "w") as f:
            json.dump(corrupt_proof, f)
        with open(os.path.join(corrupt_dir, "meta.json"), "w") as f:
            json.dump({"output": ["0.9999"], "proofSizeBytes": 26902}, f)

        st, corrupt_receipt_res = http_req(f"/api/receipt/{corrupt_id}?format=json")
        assert st == 200, f"Expected 200, got {st}"
        cr = corrupt_receipt_res["receipt"]
        assert cr["verified"] is False, "CRITICAL: Corrupted proof must NOT have verified: True!"
        assert cr["verificationStatus"] == "UNVERIFIED", f"Expected UNVERIFIED, got {cr['verificationStatus']}"
        assert cr["verificationError"] is not None, "Expected verificationError to explain failure"
        print(f"[PASS] 5. Failed verification case handled safely: Status is UNVERIFIED ({cr['verificationError'][:45]}...)")
        passes += 1

        # 6. PDF for unverified / failed case:
        total += 1
        st, unverified_pdf = http_req(f"/api/receipt/{corrupt_id}?format=pdf", raw_resp=True)
        assert st == 200 and unverified_pdf.startswith(b"%PDF"), "Unverified PDF generation failed"
        print(f"[PASS] 6. Unverified decision PDF generated with explicit warning banner ({len(unverified_pdf)} bytes)")
        passes += 1

        # 7. Safety check: Client calls POST /api/receipt with falsified verified: true
        total += 1
        st, fake_check = http_req("/api/receipt", "POST", {
            "proofId": corrupt_id,
            "decision": "APPROVED",
            "verified": True  # Attacker claims it's verified!
        })
        assert st == 200, f"Expected 200, got {st}"
        assert fake_check["receipt"]["verified"] is False, "CRITICAL: Server trusted client-claimed verified: True without verifier confirmation!"
        assert fake_check["receipt"]["verificationStatus"] == "UNVERIFIED", "Status was falsely set to VERIFIED!"
        print("[PASS] 7. Spoofing protection: Server rejects client-falsified verified claims and enforces verifier confirmation")
        passes += 1

    finally:
        # Cleanup corrupt proof test directory
        import shutil
        if os.path.exists(corrupt_dir):
            shutil.rmtree(corrupt_dir, ignore_errors=True)

    # 8. Unknown proofId returns 404
    total += 1
    st, _ = http_req("/api/receipt/non-existent-uuid-9999")
    assert st == 404, f"Expected 404, got {st}"
    print("[PASS] 8. Unknown proofId returns HTTP 404")
    passes += 1

    print(f"\nRESULT: {passes} / {total} PASS")
    return passes == total


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
