"""Write <model_dir>/onnx/model_quantized.onnx (transformers.js dtype "q8"), same recipe as the v1 wet-floor model.

Usage: python -I quantize.py <model_dir>
"""
import os, sys
from onnxruntime.quantization import QuantType, quantize_dynamic

d = sys.argv[1] + "/onnx"
# note: MatMul/Gemm only, uint8 weights; convs stay fp32. v1 found all-op int8 cost wet recall.
quantize_dynamic(f"{d}/model.onnx", f"{d}/model_quantized.onnx", op_types_to_quantize=["MatMul", "Gemm"], weight_type=QuantType.QUInt8)
print("size MB", os.path.getsize(f"{d}/model_quantized.onnx") / 1e6)
