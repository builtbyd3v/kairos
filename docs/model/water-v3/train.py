# /// script
# requires-python = ">=3.11"
# dependencies = ["torch", "torchvision", "transformers>=4.53", "huggingface_hub", "pillow", "onnx", "onnxscript", "onnxruntime", "torchmetrics[detection]", "pycocotools", "scipy"]
# ///
"""v3: continue the v2 water detector (builtbyd3v/kairos-water-rtdetr @ 54c3bb4) at a bigger input, for tiny water.

Runs on HF Jobs: hf jobs uv run --flavor l4x1 --secrets HF_TOKEN -e SIZE=960 train.py <data_repo> <out_repo> <epochs> [max_steps]
Same data and splits as v2 (prepare.py pack). Only train is trained on; val picks the best epoch (mAP@0.5 at SIZE);
calib and test are never touched here.
Changes vs v2 (docs/model/water-v2/train.py):
- Input SIZE (default 960) instead of 640, multi-scale training (0.8-1.07 x SIZE, multiples of 32).
- Copy-paste: tiny water crops (0.1-1% of the frame) from train wet frames pasted with a soft oval mask onto
  DRY train frames only (Kaggle dry train + SCAND train).
- Plant-like frames sampled UPWEIGHT (3) x as often: indoor spills (slipp/spill_detection), Mendeley Indoor, SCAND Spot
  frames (glossy campus floors, dry). Half of all pasted crops are indoor spills.
- Mosaic (2x2 of train frames) so every object is half size in context, plus the v2 zoom-in / zoom-out / flip / color.
"""
import json, math, os, random, sys, tarfile, time
import torch
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from huggingface_hub import snapshot_download, HfApi
from transformers import RTDetrV2ForObjectDetection, RTDetrImageProcessor
from torchmetrics.detection import MeanAveragePrecision

DATA_REPO, OUT_REPO, EPOCHS = sys.argv[1], sys.argv[2], int(sys.argv[3])
MAX_STEPS = int(sys.argv[4]) if len(sys.argv) > 4 else 0  # smoke runs
BASE = os.environ.get("BASE", "builtbyd3v/kairos-water-rtdetr")
BASE_REV = os.environ.get("BASE_REV", "54c3bb405fdce4fcc27294d10051e1ae87ac2942")  # v2, fp32 position-embedding fix
SIZE, BS = int(os.environ.get("SIZE", "960")), int(os.environ.get("BS", "16"))
LR = float(os.environ.get("LR", "5e-5"))  # head; backbone gets LR / 10. Lower than v2 (1e-4): this starts from a trained model.
NW = int(os.environ.get("NUM_WORKERS", "7"))  # note: Linux fork only; macOS spawn would re-run this script per worker, use 0 there
BUDGET_MIN = float(os.environ.get("BUDGET_MIN", "1e9"))  # training minutes; the job --timeout must leave ~15 min for setup, export, upload
SCALES = [s for s in range(int(SIZE * 0.8) // 32 * 32, int(SIZE * 1.07) + 1, 32)]
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
INDOOR_WET = ("rf:slipp/spill_detection",)  # indoor spills on hard floors: closest to a plant floor


def plant_like(r):
    """Train frames that look most like where Spot works: indoor spills, Mendeley Indoor, real Spot frames (SCAND)."""
    return r["source"] in INDOOR_WET or r["source"] == "scand" or "/Indoor/" in r["scene"]


UPW = float(os.environ.get("UPWEIGHT", "3"))
weights = [UPW if plant_like(r) else 1.0 for r in train]
# Paste sources: train water boxes covering 0.5-30% of their frame (enough pixels to shrink cleanly). Half the pastes are indoor spills.
crops = [(r["file"], b) for r in train for b in r["boxes"] if 0.005 <= b[2] * b[3] <= 0.3]
crops_in = [(r["file"], b) for r in train if r["source"] in INDOOR_WET for b in r["boxes"] if 0.005 <= b[2] * b[3] <= 0.3]
print("train", len(train), "plant-like", sum(w > 1 for w in weights), "val", len(val), "paste crops", len(crops), "indoor", len(crops_in),
      "scales", SCALES, flush=True)


def load(r):
    return Image.open(os.path.join(root, r["file"])).convert("RGB"), list(r["boxes"])


def paste_tiny(im, boxes):
    """Paste 1-3 tiny water crops (0.1-1% of the frame) with a feathered oval mask. Boxes: normalized xywh."""
    W, H = im.size
    for _ in range(random.randint(1, 3)):
        f, (x, y, w, h) = random.choice(crops_in if random.random() < 0.5 else crops)
        src = Image.open(os.path.join(root, f)).convert("RGB")
        sw, sh = src.size
        c = src.crop((int(x * sw), int(y * sh), max(int(x * sw) + 2, int((x + w) * sw)), max(int(y * sh) + 2, int((y + h) * sh))))
        a = random.uniform(0.001, 0.01) * W * H  # target pixel area
        asp = max(0.25, min(4, c.width / c.height))
        pw, ph = max(4, int(math.sqrt(a * asp))), max(4, int(math.sqrt(a / asp)))
        if pw >= W or ph >= H:
            continue
        c = c.resize((pw, ph), Image.BILINEAR)
        m = Image.new("L", (pw, ph), 0)
        ImageDraw.Draw(m).ellipse((0, 0, pw - 1, ph - 1), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(max(1, min(pw, ph) // 8)))
        ox, oy = random.randint(0, W - pw), random.randint(int(0.3 * (H - ph)), H - ph)  # floor half of the frame, mostly
        im.paste(c, (ox, oy), m)
        boxes.append([ox / W, oy / H, pw / W, ph / H])
    return im, boxes


def mosaic():
    """2x2 grid of 4 random train frames on a SIZE canvas: every object at half size, real context around it."""
    canvas, boxes, half = Image.new("RGB", (SIZE, SIZE), (114, 114, 114)), [], SIZE // 2
    for k in range(4):
        im, bx = load(random.choices(train, weights)[0])
        if not bx and random.random() < 0.5:
            im, bx = paste_tiny(im, bx)
        ox, oy = (k % 2) * half, (k // 2) * half
        canvas.paste(im.resize((half, half), Image.BILINEAR), (ox, oy))
        boxes += [[(ox + x * half) / SIZE, (oy + y * half) / SIZE, w / 2, h / 2] for x, y, w, h in bx]
    return canvas, boxes


def augment(im, boxes):
    """boxes: normalized xywh. Returns augmented PIL image (any size) and boxes. Same as v2 plus a wider zoom-out."""
    if random.random() < 0.5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        boxes = [[1 - x - w, y, w, h] for x, y, w, h in boxes]
    im = ImageEnhance.Brightness(im).enhance(random.uniform(0.7, 1.3))
    im = ImageEnhance.Contrast(im).enhance(random.uniform(0.7, 1.3))
    im = ImageEnhance.Color(im).enhance(random.uniform(0.7, 1.3))
    r = random.random()
    if r < 0.25:  # zoom in: crop 50-100% of each side, keep boxes with >=40% of their area left
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
    elif r < 0.5:  # zoom out: paste at 30-100% scale on a gray canvas -> smaller water
        s = random.uniform(0.3, 1)
        canvas = Image.new("RGB", (SIZE, SIZE), (114, 114, 114))
        pw, ph = int(SIZE * s), int(SIZE * s)
        ox, oy = random.randint(0, SIZE - pw), random.randint(0, SIZE - ph)
        canvas.paste(im.resize((pw, ph)), (ox, oy))
        im = canvas
        boxes = [[(ox + x * pw) / SIZE, (oy + y * ph) / SIZE, w * s, h * s] for x, y, w, h in boxes]
    return im, [b for b in boxes if b[2] > 0.002 and b[3] > 0.002]


def to_tensor(im, size=SIZE):
    # Same as RTDetrImageProcessor here: resize to size x size (stretch), rescale 1/255, no normalize.
    im = im.convert("RGB").resize((size, size), Image.BILINEAR)
    return torch.frombuffer(bytearray(im.tobytes()), dtype=torch.uint8).view(size, size, 3).permute(2, 0, 1).float() / 255


class DS(torch.utils.data.Dataset):
    def __init__(self, rows, aug):
        self.rows, self.aug = rows, aug

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        if self.aug and random.random() < 0.25:
            im, boxes = mosaic()
        else:
            im, boxes = load(self.rows[i])
            if self.aug and not boxes and random.random() < 0.5:
                im, boxes = paste_tiny(im, boxes)
        if self.aug:
            im, boxes = augment(im, boxes)
        b = torch.tensor([[x + w / 2, y + h / 2, w, h] for x, y, w, h in boxes], dtype=torch.float32).reshape(-1, 4)
        return im, {"class_labels": torch.zeros(len(b), dtype=torch.long), "boxes": b}


def collate_train(batch):  # multi-scale: one random size per batch
    s = random.choice(SCALES)
    return torch.stack([to_tensor(b[0], s) for b in batch]), [b[1] for b in batch]


def collate_val(batch):
    return torch.stack([to_tensor(b[0]) for b in batch]), [b[1] for b in batch]


sampler = torch.utils.data.WeightedRandomSampler(weights, len(train), replacement=True)  # plant-like frames UPW x as often
dl = torch.utils.data.DataLoader(DS(train, True), BS, sampler=sampler, num_workers=NW, collate_fn=collate_train, drop_last=True, persistent_workers=NW > 0)
vdl = torch.utils.data.DataLoader(DS(val, False), 16, num_workers=NW, collate_fn=collate_val)

model = RTDetrV2ForObjectDetection.from_pretrained(BASE, revision=BASE_REV).to(dev)
bb = [p for n, p in model.named_parameters() if "backbone" in n]
rest = [p for n, p in model.named_parameters() if "backbone" not in n]
opt = torch.optim.AdamW([{"params": bb, "lr": LR / 10}, {"params": rest, "lr": LR}], weight_decay=1e-4)
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
        m.update([{"boxes": boxes[i], "scores": prob[i], "labels": torch.zeros(prob.shape[1], dtype=torch.long)} for i in range(len(x))],
                 [{"boxes": tt["boxes"], "labels": tt["class_labels"]} for tt in t])
    model.train()
    return float(m.compute()["map_50"])


out_dir = os.environ.get("OUT_DIR", "out/model")
best = evaluate()  # v2 at SIZE, before any v3 step: an epoch must beat this to be saved
print(f"START val mAP@0.5 {best:.4f} (v2 weights at {SIZE})", flush=True)
model.save_pretrained(out_dir)
best_ep, step, t0 = -1, 0, time.time()
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
            print(f"ep {ep} step {step}/{total} loss {loss.item():.3f} {(time.time() - t0) / step:.3f}s/step "
                  f"mem {torch.cuda.max_memory_allocated() / 2**30 if dev == 'cuda' else 0:.1f}GB", flush=True)
        if MAX_STEPS and step >= MAX_STEPS:
            break
    m50 = evaluate()
    print(f"EPOCH {ep} val mAP@0.5 {m50:.4f} elapsed {(time.time() - t0) / 60:.1f} min", flush=True)
    if m50 > best:
        best, best_ep = m50, ep
        model.save_pretrained(out_dir)
        print("saved best", flush=True)
    if MAX_STEPS and step >= MAX_STEPS:
        break
    if (time.time() - t0) / 60 * (ep + 2) / (ep + 1) > BUDGET_MIN:  # another epoch would overrun: keep time to export + upload
        print(f"STOP after epoch {ep}: time budget {BUDGET_MIN} min", flush=True)
        break

proc = RTDetrImageProcessor.from_pretrained(BASE, revision=BASE_REV)
proc.size = {"height": SIZE, "width": SIZE}
proc.save_pretrained(out_dir)
json.dump({"best_val_map50": best, "best_epoch": best_ep, "epochs": EPOCHS, "steps": step, "size": SIZE, "scales": SCALES, "bs": BS, "lr": LR,
           "base": f"{BASE}@{BASE_REV}", "train_images": len(train), "val_images": len(val)},
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

if OUT_REPO != "-":  # a private staging repo: v3 reaches the public repo only if it passes the ship rule on test
    api = HfApi()
    api.create_repo(OUT_REPO, private=True, exist_ok=True)
    api.upload_folder(repo_id=OUT_REPO, folder_path=out_dir, path_in_repo=f"s{SIZE}", commit_message=f"v3 s{SIZE}: best val mAP@0.5 {best:.4f}")
    print("UPLOADED", OUT_REPO, f"s{SIZE}", flush=True)
