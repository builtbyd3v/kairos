# /// script
# requires-python = ">=3.11"
# dependencies = ["torch", "torchvision", "transformers>=4.53", "huggingface_hub", "pillow", "onnx", "onnxscript", "onnxruntime", "torchmetrics[detection]", "pycocotools", "scipy"]
# ///
"""Fine-tune RT-DETRv2-R18 (PekingU/rtdetr_v2_r18vd, Apache-2.0) to one class: water.

Runs on HF Jobs: hf jobs uv run --flavor l4x1 --secrets HF_TOKEN train.py <data_repo> <model_repo> <epochs> [max_steps]
Data: the packed set from prepare.py (labels.jsonl + images/), split by source/scene. Only train is trained on;
val picks the best epoch (mAP@0.5); calib and test are never touched here.
Small objects: random zoom-out (image pasted smaller on a 640 canvas) makes puddles smaller than in the source photos,
so the model sees more <1%-of-frame water than the data has. Inference stays at 640x640.
"""
import json, math, os, random, sys, tarfile, time
import torch
from PIL import Image, ImageEnhance
from huggingface_hub import snapshot_download, HfApi
from transformers import RTDetrV2ForObjectDetection, RTDetrImageProcessor
from torchmetrics.detection import MeanAveragePrecision

DATA_REPO, MODEL_REPO, EPOCHS = sys.argv[1], sys.argv[2], int(sys.argv[3])
MAX_STEPS = int(sys.argv[4]) if len(sys.argv) > 4 else 0  # smoke runs
BASE, SIZE, BS = "PekingU/rtdetr_v2_r18vd", 640, 16
NW = int(os.environ.get("NUM_WORKERS", "7"))  # note: Linux fork only; macOS spawn would re-run this script per worker, use 0 there
torch.manual_seed(0); random.seed(0)
dev = "cuda" if torch.cuda.is_available() else "cpu"

root = DATA_REPO if os.path.isdir(DATA_REPO) else snapshot_download(DATA_REPO, repo_type="dataset")
if os.path.exists(os.path.join(root, "pack.tar")):  # Hub dirs cap at 10k files, so the images ship as one tar
    tarfile.open(os.path.join(root, "pack.tar")).extractall("/tmp/pack")
    root = "/tmp/pack"
recs = [json.loads(l) for l in open(os.path.join(root, "labels.jsonl"))]
train = [r for r in recs if r["split"] == "train"]
val = [r for r in recs if r["split"] == "val"]
if MAX_STEPS:  # note: smoke run, small val
    val = val[:64]
print("train", len(train), "val", len(val), flush=True)


def augment(im, boxes):
    """boxes: normalized xywh. Returns augmented PIL image (any size) and boxes."""
    if random.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        boxes = [[1 - x - w, y, w, h] for x, y, w, h in boxes]
    im = ImageEnhance.Brightness(im).enhance(random.uniform(0.7, 1.3))
    im = ImageEnhance.Contrast(im).enhance(random.uniform(0.7, 1.3))
    im = ImageEnhance.Color(im).enhance(random.uniform(0.7, 1.3))
    r = random.random()
    if r < 0.3:  # zoom in: crop 50-100% of each side, keep boxes with >=40% of their area left
        cw, ch = random.uniform(0.5, 1), random.uniform(0.5, 1)
        cx, cy = random.uniform(0, 1 - cw), random.uniform(0, 1 - ch)
        W, H = im.size
        im = im.crop((int(cx * W), int(cy * H), int((cx + cw) * W), int((cy + ch) * H)))
        nb = []
        for x, y, w, h in boxes:
            x1, y1, x2, y2 = max(x, cx), max(y, cy), min(x + w, cx + cw), min(y + h, cy + ch)
            if x2 > x1 and y2 > y1 and (x2 - x1) * (y2 - y1) >= 0.4 * w * h:
                nb.append([(x1 - cx) / cw, (y1 - cy) / ch, (x2 - x1) / cw, (y2 - y1) / ch])
        boxes = nb
    elif r < 0.6:  # zoom out: paste at 40-100% scale on a gray 640 canvas -> smaller water
        s = random.uniform(0.4, 1)
        canvas = Image.new("RGB", (SIZE, SIZE), (114, 114, 114))
        pw, ph = int(SIZE * s), int(SIZE * s)
        ox, oy = random.randint(0, SIZE - pw), random.randint(0, SIZE - ph)
        canvas.paste(im.resize((pw, ph)), (ox, oy))
        im = canvas
        boxes = [[(ox + x * pw) / SIZE, (oy + y * ph) / SIZE, w * s, h * s] for x, y, w, h in boxes]
    return im, boxes


def to_tensor(im):
    # Same as RTDetrImageProcessor here: resize to 640x640 (stretch), rescale 1/255, no normalize.
    im = im.convert("RGB").resize((SIZE, SIZE), Image.BILINEAR)
    return torch.frombuffer(bytearray(im.tobytes()), dtype=torch.uint8).view(SIZE, SIZE, 3).permute(2, 0, 1).float() / 255


class DS(torch.utils.data.Dataset):
    def __init__(self, rows, aug):
        self.rows, self.aug = rows, aug

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        im = Image.open(os.path.join(root, r["file"])).convert("RGB")
        boxes = r["boxes"]
        if self.aug:
            im, boxes = augment(im, boxes)
        b = torch.tensor([[x + w / 2, y + h / 2, w, h] for x, y, w, h in boxes], dtype=torch.float32).reshape(-1, 4)
        return to_tensor(im), {"class_labels": torch.zeros(len(b), dtype=torch.long), "boxes": b}


def collate(batch):
    return torch.stack([b[0] for b in batch]), [b[1] for b in batch]


dl = torch.utils.data.DataLoader(DS(train, True), BS, shuffle=True, num_workers=NW, collate_fn=collate, drop_last=True, persistent_workers=NW > 0)
vdl = torch.utils.data.DataLoader(DS(val, False), 32, num_workers=NW, collate_fn=collate)

model = RTDetrV2ForObjectDetection.from_pretrained(BASE, num_labels=1, id2label={0: "water"}, label2id={"water": 0}, ignore_mismatched_sizes=True).to(dev)
bb = [p for n, p in model.named_parameters() if "backbone" in n]
rest = [p for n, p in model.named_parameters() if "backbone" not in n]
opt = torch.optim.AdamW([{"params": bb, "lr": 1e-5}, {"params": rest, "lr": 1e-4}], weight_decay=1e-4)
total = MAX_STEPS or EPOCHS * len(dl)
warm = max(1, min(300, total // 10))
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(s, total) / total)))


@torch.no_grad()
def evaluate():
    model.eval()
    m = MeanAveragePrecision(box_format="cxcywh", iou_thresholds=[0.5])
    for x, t in vdl:
        with torch.autocast(dev, dtype=torch.bfloat16):
            out = model(pixel_values=x.to(dev))
        prob = out.logits.float().sigmoid()[..., 0].cpu()
        boxes = out.pred_boxes.float().cpu()
        m.update([{"boxes": boxes[i], "scores": prob[i], "labels": torch.zeros(300, dtype=torch.long)} for i in range(len(x))],
                 [{"boxes": tt["boxes"], "labels": tt["class_labels"]} for tt in t])
    model.train()
    return float(m.compute()["map_50"])


out_dir = os.environ.get("OUT_DIR", "out/model")
best, step, t0 = -1.0, 0, time.time()
model.train()
for ep in range(EPOCHS):
    for x, t in dl:
        with torch.autocast(dev, dtype=torch.bfloat16):
            loss = model(pixel_values=x.to(dev), labels=[{k: v.to(dev) for k, v in tt.items()} for tt in t]).loss
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 0.1)
        opt.step(); sched.step(); step += 1
        if step % 50 == 0:
            print(f"ep {ep} step {step}/{total} loss {loss.item():.3f} {(time.time() - t0) / step:.3f}s/step", flush=True)
        if MAX_STEPS and step >= MAX_STEPS:
            break
    m50 = evaluate()
    print(f"EPOCH {ep} val mAP@0.5 {m50:.4f} elapsed {(time.time() - t0) / 60:.1f} min", flush=True)
    if m50 > best:
        best = m50
        model.save_pretrained(out_dir)
        print("saved best", flush=True)
    if MAX_STEPS and step >= MAX_STEPS:
        break

proc = RTDetrImageProcessor.from_pretrained(BASE)
proc.save_pretrained(out_dir)
json.dump({"best_val_map50": best, "epochs": EPOCHS, "steps": step, "train_images": len(train), "val_images": len(val)},
          open(os.path.join(out_dir, "train_summary.json"), "w"), indent=1)

# ONNX export in the layout transformers.js loads: onnx/model.onnx, input pixel_values, outputs logits + pred_boxes.
try:
    best_model = RTDetrV2ForObjectDetection.from_pretrained(out_dir).eval().cpu()

    class Wrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__(); self.m = m

        def forward(self, pixel_values):
            o = self.m(pixel_values=pixel_values)
            return o.logits, o.pred_boxes

    os.makedirs(os.path.join(out_dir, "onnx"), exist_ok=True)
    torch.onnx.export(Wrap(best_model), torch.rand(1, 3, SIZE, SIZE), os.path.join(out_dir, "onnx/model.onnx"),
                      input_names=["pixel_values"], output_names=["logits", "pred_boxes"], opset_version=17,
                      dynamic_axes={"pixel_values": {0: "batch_size"}, "logits": {0: "batch_size"}, "pred_boxes": {0: "batch_size"}}, dynamo=False)
    print("onnx export ok", flush=True)
except Exception as e:  # note: export failure must not lose the trained weights; they upload below either way
    print("ONNX EXPORT FAILED", repr(e), flush=True)

if MODEL_REPO != "-":
    HfApi().upload_folder(repo_id=MODEL_REPO, folder_path=out_dir, commit_message=f"v2 train: best val mAP@0.5 {best:.4f}")
    print("UPLOADED", MODEL_REPO, flush=True)
