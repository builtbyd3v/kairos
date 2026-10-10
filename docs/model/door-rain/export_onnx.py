"""Export the fine-tuned model to <model_dir>/onnx/model.onnx (transformers.js layout) and check it against PyTorch.

Usage: python -I export_onnx.py <model_dir> <image>
"""
import os, sys
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

model_dir, img = sys.argv[1:]
model = AutoModelForImageClassification.from_pretrained(model_dir).eval()
proc = AutoImageProcessor.from_pretrained(model_dir)
x = proc(Image.open(img).convert("RGB"), return_tensors="pt")["pixel_values"]
os.makedirs(f"{model_dir}/onnx", exist_ok=True)
out = f"{model_dir}/onnx/model.onnx"


class Logits(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, pixel_values):
        return self.m(pixel_values=pixel_values).logits


# note: legacy TorchScript exporter (dynamo=False) at opset 17; plain ConvNeXt needs nothing newer
torch.onnx.export(Logits(model), (x,), out, input_names=["pixel_values"], output_names=["logits"],
                  dynamic_axes={"pixel_values": {0: "batch_size"}, "logits": {0: "batch_size"}}, opset_version=17, dynamo=False)

with torch.no_grad():
    ref = model(pixel_values=x).logits.numpy()
got = ort.InferenceSession(out).run(None, {"pixel_values": x.numpy()})[0]
print("max abs diff", float(np.abs(ref - got).max()), "size MB", os.path.getsize(out) / 1e6)
assert np.allclose(ref, got, atol=1e-3)
