import sys
import json
import os
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
zk_dir = os.path.abspath(os.path.join(HERE, "..", "zk-proving-service"))
sys.path.append(zk_dir)

import prover_service

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No input data provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])

        # input_data should be [income, credit_score, years_employed]
        result = prover_service.generate_proof(input_data)

        # Verify it right away
        is_verified = prover_service.verify_proof(result["proofId"])

        output = {
            "success": True,
            "prediction": result.get("output", [None])[0] if result.get("output") else None,
            "proof": result.get("proof"),
            "public_output": result.get("publicSignals"),
            "verified": is_verified,
            "proofId": result.get("proofId")
        }

        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": "Proving failed",
            "details": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
