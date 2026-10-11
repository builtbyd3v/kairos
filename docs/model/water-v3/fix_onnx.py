"""Make the exported ONNX run in onnxruntime-web, then quantize. Same fix as v2 (Hub commit 54c3bb4).

Usage: python -I fix_onnx.py <model_dir>   (reads onnx/model.onnx, writes onnx/model.onnx fixed + onnx/model_quantized.onnx)
- Fix: float64 Cast / Constant / value_info in the position embedding -> float32 (onnxruntime-web has no float64 kernels).
- q8: onnxruntime quantize_dynamic, uint8 weights, all ops (as v2).
- Check: max |fixed - original| on one random input at the model's input size, for both outputs.
"""
import json, os, shutil, sys
import numpy as np, onnx, onnxruntime as ort
from onnx import numpy_helper, TensorProto
from onnxruntime.quantization import quantize_dynamic, QuantType

d = sys.argv[1]
src, orig = os.path.join(d, "onnx", "model.onnx"), os.path.join(d, "onnx", "model.orig.onnx")
if not os.path.exists(orig):
    shutil.move(src, orig)
m = onnx.load(orig)
changed = 0
for n in m.graph.node:
    for a in n.attribute:
        if n.op_type == "Cast" and a.name == "to" and a.i == TensorProto.DOUBLE:
            a.i = TensorProto.FLOAT; changed += 1
        if n.op_type == "Constant" and a.name == "value" and a.t.data_type == TensorProto.DOUBLE:
            a.t.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(a.t).astype(np.float32), a.t.name)); changed += 1
for vi in m.graph.value_info:
    if vi.type.tensor_type.elem_type == TensorProto.DOUBLE:
        vi.type.tensor_type.elem_type = TensorProto.FLOAT; changed += 1
onnx.checker.check_model(m)
onnx.save(m, src)
q8 = os.path.join(d, "onnx", "model_quantized.onnx")
quantize_dynamic(src, q8, weight_type=QuantType.QUInt8)
left = sum(1 for p in (src, q8) for n in onnx.load(p).graph.node for a in n.attribute
           if n.op_type == "Cast" and a.name == "to" and a.i == TensorProto.DOUBLE)
S = json.load(open(os.path.join(d, "preprocessor_config.json")))["size"]["height"]
x = np.random.default_rng(0).random((1, 3, S, S), dtype=np.float32)
a, b = (ort.InferenceSession(p, providers=["CPUExecutionProvider"]).run(None, {"pixel_values": x}) for p in (orig, src))
print(json.dumps({"changed": changed, "double_casts_left": left, "size": S,
                  "max_diff_fixed_vs_orig": {"logits": float(np.abs(a[0] - b[0]).max()), "pred_boxes": float(np.abs(a[1] - b[1]).max())}}))
