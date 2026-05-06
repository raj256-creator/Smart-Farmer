"""
train.py
--------
Train YOLOv8 on the merged 5-class fruit detection dataset.
Saves the best weights to models/best.pt after training.

Usage:
  python train.py                          # default: yolov8n, 100 epochs
  python train.py --model yolov8s          # small model
  python train.py --model yolov8m --epochs 150
  python train.py --resume                 # resume interrupted training

Prerequisites:
  1. pip install -r requirements.txt
  2. python download_datasets.py --api-key <YOUR_KEY>
  3. (GPU recommended) CUDA-enabled PyTorch
"""

import argparse
import shutil
import sys
from pathlib import Path

try:
    from ultralytics import YOLO
except ImportError:
    print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)

BASE_DIR   = Path(__file__).parent
YAML_PATH  = BASE_DIR / "dataset.yaml"
MODELS_DIR = BASE_DIR / "models"
RUNS_DIR   = BASE_DIR / "runs"

# Supported YOLOv8 model sizes (nano → xlarge)
YOLO_MODELS = {
    "yolov8n": "yolov8n.pt",   # nano   — fastest, least accurate
    "yolov8s": "yolov8s.pt",   # small
    "yolov8m": "yolov8m.pt",   # medium — good balance (recommended)
    "yolov8l": "yolov8l.pt",   # large
    "yolov8x": "yolov8x.pt",   # xlarge — most accurate, slowest
}

CLASSES = ["mango", "mulberry", "dragon_fruit", "chikoo", "pomegranate"]


def verify_dataset():
    if not YAML_PATH.exists():
        print(f"[ERROR] dataset.yaml not found at {YAML_PATH}")
        print("[INFO]  Run: python download_datasets.py --api-key <YOUR_KEY>")
        sys.exit(1)

    data_dir = BASE_DIR / "data"
    for split in ["train", "val"]:
        img_dir = data_dir / "images" / split
        if not img_dir.exists() or not any(img_dir.iterdir()):
            print(f"[ERROR] No images found in {img_dir}")
            print("[INFO]  Run: python download_datasets.py --api-key <YOUR_KEY>")
            sys.exit(1)

    # Count images per split
    for split in ["train", "val", "test"]:
        img_dir = data_dir / "images" / split
        if img_dir.exists():
            count = len(list(img_dir.glob("*.*")))
            print(f"  {split:6s}: {count} images")


def train(
    model_name: str = "yolov8n",
    epochs: int     = 100,
    imgsz: int      = 640,
    batch: int      = 16,
    patience: int   = 20,
    workers: int    = 4,
    device: str     = "cpu",
    resume: bool    = False,
    name: str       = "fruit_detector",
):
    print("=" * 60)
    print("  AgriVision — YOLOv8 Fruit Detection Training")
    print(f"  Classes  : {', '.join(CLASSES)}")
    print(f"  Model    : {model_name}")
    print(f"  Epochs   : {epochs}  |  Image size: {imgsz}  |  Batch: {batch}")
    print(f"  Device   : {device}")
    print("=" * 60)

    print("\n[1/4] Verifying dataset …")
    verify_dataset()

    print(f"\n[2/4] Loading {model_name} pretrained weights …")
    weights = YOLO_MODELS.get(model_name, "yolov8n.pt")
    if resume:
        last_run = RUNS_DIR / "detect" / name / "weights" / "last.pt"
        if not last_run.exists():
            print(f"[WARN] No checkpoint found at {last_run}. Starting fresh.")
            model = YOLO(weights)
        else:
            print(f"[INFO] Resuming from {last_run}")
            model = YOLO(str(last_run))
    else:
        model = YOLO(weights)

    print("\n[3/4] Starting training …")
    results = model.train(
        data     = str(YAML_PATH),
        epochs   = epochs,
        imgsz    = imgsz,
        batch    = batch,
        patience = patience,
        workers  = workers,
        device   = device,
        project  = str(RUNS_DIR / "detect"),
        name     = name,
        resume   = resume,

        # Augmentations (defaults are good; tuned for small agricultural datasets)
        hsv_h       = 0.015,
        hsv_s       = 0.7,
        hsv_v       = 0.4,
        flipud      = 0.1,
        fliplr      = 0.5,
        mosaic      = 1.0,
        mixup       = 0.1,
        copy_paste  = 0.1,
        degrees     = 10.0,

        # Save settings
        save        = True,
        save_period = 10,
    )

    print("\n[4/4] Saving best model …")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    best_src = RUNS_DIR / "detect" / name / "weights" / "best.pt"
    best_dst = MODELS_DIR / "best.pt"

    if best_src.exists():
        shutil.copy2(best_src, best_dst)
        print(f"\n[DONE] best.pt saved → {best_dst}")
    else:
        print(f"[WARN] best.pt not found at {best_src}")

    # Print summary metrics
    metrics = results.results_dict if hasattr(results, "results_dict") else {}
    if metrics:
        print("\n── Training Results ─────────────────────────────────")
        for key in ["metrics/mAP50(B)", "metrics/mAP50-95(B)", "metrics/precision(B)", "metrics/recall(B)"]:
            if key in metrics:
                print(f"  {key:35s}: {metrics[key]:.4f}")

    print(f"\n[INFO] Full run logs: {RUNS_DIR / 'detect' / name}")
    print(f"[INFO] Best weights : {best_dst}")
    print("[NEXT] Run: python infer.py --image <path_to_image>")


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 for 5-class fruit detection")
    parser.add_argument("--model",   default="yolov8n",  choices=list(YOLO_MODELS.keys()),
                        help="YOLOv8 model variant (default: yolov8n)")
    parser.add_argument("--epochs",  type=int,   default=100,   help="Number of training epochs (default: 100)")
    parser.add_argument("--imgsz",   type=int,   default=640,   help="Input image size in pixels (default: 640)")
    parser.add_argument("--batch",   type=int,   default=16,    help="Batch size (default: 16; reduce if OOM)")
    parser.add_argument("--patience",type=int,   default=20,    help="Early stopping patience epochs (default: 20)")
    parser.add_argument("--workers", type=int,   default=4,     help="DataLoader workers (default: 4)")
    parser.add_argument("--device",  default="cpu",              help="Device: cpu / 0 / 0,1 (default: cpu)")
    parser.add_argument("--resume",  action="store_true",        help="Resume from last checkpoint")
    parser.add_argument("--name",    default="fruit_detector",   help="Run name (default: fruit_detector)")
    args = parser.parse_args()

    train(
        model_name = args.model,
        epochs     = args.epochs,
        imgsz      = args.imgsz,
        batch      = args.batch,
        patience   = args.patience,
        workers    = args.workers,
        device     = args.device,
        resume     = args.resume,
        name       = args.name,
    )


if __name__ == "__main__":
    main()
