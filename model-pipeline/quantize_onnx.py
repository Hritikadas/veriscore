from onnxruntime.quantization import quantize_dynamic, QuantType
import os


# Original ONNX model
input_model = "loan_model.onnx"

# Quantized ONNX model
output_model = "loan_model_quantized.onnx"


print("Starting ONNX quantization...")


# Check original model exists
if not os.path.exists(input_model):
    print("ERROR: loan_model.onnx not found!")
    exit()


# Perform dynamic quantization
quantize_dynamic(
    input_model,
    output_model,
    weight_type=QuantType.QInt8
)


print("\n================================")
print("QUANTIZATION COMPLETED!")
print("================================")

print("Original model:")
print(input_model)

print("\nQuantized model:")
print(output_model)


# Show file sizes
original_size = os.path.getsize(input_model)
quantized_size = os.path.getsize(output_model)

print("\nOriginal model size:",
      round(original_size / 1024, 2), "KB")

print("Quantized model size:",
      round(quantized_size / 1024, 2), "KB")