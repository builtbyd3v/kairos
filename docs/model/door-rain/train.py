"""Fine-tune facebook/convnext-tiny-224 on manifest.csv (train/val only; calib and test are never read here).
Reused from builtbyd3v/spot-wetfloor-convnext-tiny training/train.py; only the labels changed.

Usage: python -I train.py <manifest.csv> <out_dir>
Recipe: https://huggingface.co/docs/transformers/tasks/image_classification
"""
import csv, random, sys
import torch
from PIL import Image, ImageEnhance, ImageOps
from transformers import AutoImageProcessor, AutoModelForImageClassification, Trainer, TrainingArguments

manifest, out = sys.argv[1:]
CKPT = "facebook/convnext-tiny-224"
labels = ["no_rain", "rain"]
label2id = {l: i for i, l in enumerate(labels)}

proc = AutoImageProcessor.from_pretrained(CKPT)


def augment(im):
    # note: hand-rolled light aug (crop 60-100% area, flip, +-20% jitter) because torchvision can't import on this Python (no _lzma)
    w, h = im.size
    s = random.uniform(0.6, 1.0) ** 0.5
    cw, ch = int(w * s), int(h * s)
    x, y = random.randint(0, w - cw), random.randint(0, h - ch)
    im = im.crop((x, y, x + cw, y + ch))
    if random.random() < 0.5:
        im = ImageOps.mirror(im)
    for E in (ImageEnhance.Brightness, ImageEnhance.Contrast, ImageEnhance.Color):
        im = E(im).enhance(random.uniform(0.8, 1.2))
    return im



class DS(torch.utils.data.Dataset):
    def __init__(self, rows, train):
        self.rows, self.train = rows, train

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        im = Image.open(r["path"]).convert("RGB")
        # both paths end in the published image processor so val numbers match what pipeline() users get
        px = proc(augment(im) if self.train else im, return_tensors="pt")["pixel_values"][0]
        return {"pixel_values": px, "labels": label2id[r["label"]]}


rows = list(csv.DictReader(open(manifest)))
train = DS([r for r in rows if r["split"] == "train"], True)
val = DS([r for r in rows if r["split"] == "val"], False)


def collate(b):
    return {"pixel_values": torch.stack([x["pixel_values"] for x in b]), "labels": torch.tensor([x["labels"] for x in b])}


def metrics(p):
    pred = p.predictions.argmax(-1)
    y = p.label_ids
    return {"accuracy": float((pred == y).mean()), "rain_recall": float((pred[y == 1] == 1).mean()), "no_rain_recall": float((pred[y == 0] == 0).mean())}


model = AutoModelForImageClassification.from_pretrained(
    CKPT, num_labels=2, id2label=dict(enumerate(labels)), label2id=label2id, ignore_mismatched_sizes=True)

args = TrainingArguments(
    output_dir=out + "/ckpt",
    per_device_train_batch_size=32, per_device_eval_batch_size=64,
    learning_rate=5e-5, num_train_epochs=4, warmup_steps=0.1, weight_decay=0.05,
    eval_strategy="epoch", save_strategy="epoch", save_total_limit=1,
    load_best_model_at_end=True, metric_for_best_model="accuracy",
    logging_steps=20, remove_unused_columns=False, report_to="none",
    dataloader_num_workers=0,  # note: 0 workers avoids macOS spawn issues; JPEG decode is the bottleneck but runs fit the time budget
    seed=0,
)
trainer = Trainer(model=model, args=args, train_dataset=train, eval_dataset=val, data_collator=collate, compute_metrics=metrics)
trainer.train()
print("VAL", trainer.evaluate())
trainer.save_model(out + "/model")
proc.save_pretrained(out + "/model")
