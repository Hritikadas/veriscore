"""
Creates a tiny 3-input, 1-output model with the SAME input shape as our real
loan model (income, credit_score, years_employed), so you can build and test
the whole ezkl pipeline today without waiting for Member A's real model.

Run: python toy_example/make_toy_model.py
"""
import json
import os
import torch
import torch.nn as nn

OUT_DIR = os.path.join(os.path.dirname(__file__))


class ToyLoanModel(nn.Module):
    """A stand-in for the real model. Same shape, trivial logic."""

    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(3, 1)

    def forward(self, x):
        return torch.sigmoid(self.linear(x))


def main():
    model = ToyLoanModel()
    model.eval()

    # Same input shape the real contract expects: [income, credit_score, years_employed]
    sample_input = torch.tensor([[25000.0, 700.0, 3.0]])

    onnx_path = os.path.join(OUT_DIR, "toy_model.onnx")
    torch.onnx.export(
        model,
        sample_input,
        onnx_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )
    print(f"Wrote {onnx_path}")

    # ezkl expects input data as a JSON file with an "input_data" key,
    # containing a flat array (or array of arrays for batches).
    input_json = {"input_data": [sample_input.tolist()[0]]}
    input_path = os.path.join(OUT_DIR, "toy_input.json")
    with open(input_path, "w") as f:
        json.dump(input_json, f)
    print(f"Wrote {input_path}")

    print("\nToy model ready. Next: python toy_example/run_pipeline_manually.py")


if __name__ == "__main__":
    main()
