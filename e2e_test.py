import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

BACKEND = "http://localhost:5000"
FRONTEND = "http://localhost:5173"

passed = 0
failed = 0
record = {}


def check(name, cond, detail=""):
    global passed, failed
    status = "PASS" if cond else "FAIL"
    if cond:
        passed += 1
    else:
        failed += 1
    print(f"[{status}] {name}" + (f"  -- {detail}" if detail else ""))


def post(url, payload, raw=False):
    body = None
    if not raw:
        body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}
    )
    t = time.perf_counter()
    with urllib.request.urlopen(req) as r:
        resp = json.load(r)
    return r.status, resp, time.perf_counter() - t


def get(url):
    t = time.perf_counter()
    with urllib.request.urlopen(url) as r:
        raw = r.read().decode()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = raw
    return r.status, data, time.perf_counter() - t


def expect_error(url, payload, raw=False, expected_code=None):
    try:
        if raw:
            req = urllib.request.Request(
                url, data=payload, headers={"Content-Type": "application/json"}
            )
        else:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


print("=== Veriscore E2E suite ===")

# 1. health
c, b, t = get(f"{BACKEND}/api/health")
check("backend health 200", c == 200 and b.get("status") == "healthy", f"{c}")

# 2. predict valid
c, b, t = post(f"{BACKEND}/api/predict", {"input": [25000.0, 700.0, 3.0]})
check(
    "predict valid -> approved 0.5582",
    c == 200 and b.get("prediction") == 1 and b.get("decision") == "approved"
    and abs(b.get("probability", 0) - 0.5582) < 1e-4,
    f"{c} d={b.get('decision')} p={b.get('probability')}",
)

# 3. prove valid -> real proof
c, b, t = post(f"{BACKEND}/api/prove", {"input": [25000.0, 700.0, 3.0]})
proof = b.get("proof") or {}
record["prove_http"] = round(t, 2)
check(
    "prove valid -> 200 real proof verified",
    c == 200 and b.get("success") is True and b.get("verified") is True
    and bool(proof.get("hex_proof")) and b.get("proofId"),
    f"{c} verified={b.get('verified')} proof={round(t,2)}s",
)
pid = b.get("proofId")

# 4. verify valid proofId
c, b, t = post(f"{BACKEND}/api/verify", {"proofId": pid})
record["verify_http"] = round(t, 2)
check("verify valid proofId -> verified true", c == 200 and b.get("verified") is True, f"{c} {round(t,2)}s")

# 5. invalid input -> 400 (missing input key)
c, b = expect_error(f"{BACKEND}/api/prove", {"foo": 1})
check("invalid input -> 400", c == 400 and "success" in b, f"{c}")

# 6. malformed JSON -> clean 400 (no stack/HTML)
c, b = expect_error(
    f"{BACKEND}/api/prove", b'{"input": [25000', raw=True
)
check(
    "malformed JSON -> clean 400",
    c == 400 and isinstance(b.get("error"), str) and "Internal" not in b.get("error", ""),
    f"{c} err={b.get('error')!r}",
)

# 7. frontend loads
c, html, t = get(f"{FRONTEND}/")
check("frontend loads (Veriscore page)", c == 200 and "Veriscore" in html, f"{c}")

# 8. frontend submit path via vite proxy -> real proof
c, b, t = post(f"{FRONTEND}/api/prove", {"input": [25000.0, 700.0, 3.0]})
record["prove_proxy"] = round(t, 2)
check(
    "frontend proxy submit -> 200 + decision + proofId",
    c == 200 and b.get("success") is True and b.get("decision") == "approved"
    and b.get("verified") is True and b.get("proofId"),
    f"{c} d={b.get('decision')} verified={b.get('verified')}",
)

# 9. decision fields the UI renders (probability present)
c, b, t = post(f"{BACKEND}/api/prove", {"input": [25000.0, 700.0, 3.0]})
check(
    "decision/probability rendered from API",
    c == 200 and isinstance(b.get("probability"), float)
    and b.get("decision") in ("approved", "rejected"),
    f"prob={b.get('probability')}",
)

# 10. server survives malformed + invalid (still healthy)
c, b, t = get(f"{BACKEND}/api/health")
check("backend healthy after error tests", c == 200, f"{c}")

# 11. proof generation / verification timing + size (recorded)
c, b, t = post(f"{BACKEND}/api/prove", {"input": [25000.0, 700.0, 3.0]})
check(f"proof gen ~{round(t,2)}s (recorded)", c == 200 and t < 30, f"{round(t,2)}s")

# 12. proof size recorded from disk store
import glob
import os

metas = [
    json.load(open(m))
    for m in glob.glob("artifacts/proofs/*/meta.json")
]
sizes = [m.get("proofSizeBytes", 0) for m in metas]
gen_times = [m.get("generationTimeSec", 0) for m in metas]
check(
    "proofs persisted with size + gen time",
    len(metas) >= 1 and all(s > 0 for s in sizes),
    f"latest {sizes[-1]}B gen={gen_times[-1]}s count={len(metas)}",
)
record["proof_size_bytes"] = sizes[-1] if sizes else None
record["proof_gen_sec"] = gen_times[-1] if gen_times else None

# ---------------------------------------------------------------------------
# Phase 8: expanded matrix - secondary input [50000, 750, 7] (additive)
# ---------------------------------------------------------------------------

# 13. predict valid (secondary input)
c, b, t = post(f"{BACKEND}/api/predict", {"input": [50000.0, 750.0, 7.0]})
check(
    "predict [50000,750,7] -> decision + probability",
    c == 200 and b.get("decision") in ("approved", "rejected")
    and isinstance(b.get("probability"), float) and 0 < b.get("probability") < 1,
    f"{c} d={b.get('decision')} p={b.get('probability')}",
)

# 14. prove valid (secondary input) -> real proof verified
c, b, t = post(f"{BACKEND}/api/prove", {"input": [50000.0, 750.0, 7.0]})
record["prove_http_50k"] = round(t, 2)
proof2 = b.get("proof") or {}
check(
    "prove [50000,750,7] -> 200 real proof verified",
    c == 200 and b.get("success") is True and b.get("verified") is True
    and bool(proof2.get("hex_proof")) and b.get("proofId"),
    f"{c} verified={b.get('verified')} proof={round(t,2)}s",
)
pid2 = b.get("proofId")

# 15. verify the secondary proof
c, b, t = post(f"{BACKEND}/api/verify", {"proofId": pid2})
record["verify_http_50k"] = round(t, 2)
check(
    "verify [50000,750,7] proofId -> verified true",
    c == 200 and b.get("verified") is True,
    f"{c} {round(t,2)}s",
)

# 16. registry endpoint (Phase 6) reachable, backward compatible
c, b, t = get(f"{BACKEND}/api/models")
check(
    "models registry reachable + model described",
    c == 200 and isinstance(b.get("models"), list) and b.get("models")
    and b["models"][0].get("id") == "loan-v1",
    f"{c} count={len(b.get('models') or [])}",
)

# 17. backend healthy after secondary matrix
c, b, t = get(f"{BACKEND}/api/health")
check("backend healthy after full matrix", c == 200, f"{c}")

print()
print(f"RESULT: {passed} passed, {failed} failed")
print("Recorded metrics:", json.dumps(record))
sys.exit(1 if failed else 0)