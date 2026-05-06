"""
evaluate.py
-----------
Evaluate the trained best.pt model on the test split of the dataset.
Reports per-class and overall mAP50, mAP50-95, Precision, and Recall.

Usage:
  python evaluate.py
  python evaluate.py --model models/best.pt
  python evaluate.py --split val   # evaluate on val instead of test
"""

import argparse
import sys
from pathlib import Path

try:
    from ultralytics import YOLO
except ImportError:
    print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)

BASE_DIR   = Path(__file__).parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
YAML_PATH  = BASE_DIR / "dataset.yaml"

CLASSES = ["mango", "mulberry", "dragon_fruit", "chikoo", "pomegranate"]


def evaluate(model_path: Path, split: str, imgsz: int, batch: int, device: str):
    if not model_path.exists():
        print(f"[ERROR] Model not found: {model_path}")
        print("[INFO]  Train first: python train.py")
        sys.exit(1)

    if not YAML_PATH.exists():
        print(f"[ERROR] dataset.yaml not found: {YAML_PATH}")
        sys.exit(1)

    print("=" * 60)
    print("  AgriVision — YOLOv8 Fruit Detection Evaluation")
    print(f"  Model  : {model_path}")
    print(f"  Split  : {split}")
    print(f"  Device : {device}")
    print("=" * 60)

    model   = YOLO(str(model_path))
    metrics = model.val(
        data    = str(YAML_PATH),
        split   = split,
        imgsz   = imgsz,
        batch   = batch,
        device  = device,
        verbose = True,
    )

    print("\n── Overall Results ──────────────────────────────────")
    print(f"  mAP@50      : {metrics.box.map50:.4f}")
    print(f"  mAP@50-95   : {metrics.box.map:.4f}")
    print(f"  Precision   : {metrics.box.mp:.4f}")
    print(f"  Recall      : {metrics.box.mr:.4f}")

    print("\n── Per-Class Results ────────────────────────────────")
    print(f"  {'Class':20s}  {'AP50':>8s}  {'AP50-95':>10s}")
    print(f"  {'-'*20}  {'-'*8}  {'-'*10}")
    for i, (ap50, ap) in enumerate(zip(metrics.box.ap50, metrics.box.ap)):
        cls_name = CLASSES[i] if i < len(CLASSES) else f"class_{i}"
        print(f"  {cls_name:20s}  {ap50:8.4f}  {ap:10.4f}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate YOLOv8 fruit detector")
    parser.add_argument("--model",  default=str(MODEL_PATH), help="Path to .pt weights file")
    parser.add_argument("--split",  default="test", choices=["train", "val", "test"],
                        help="Dataset split to evaluate on (default: test)")
    parser.add_argument("--imgsz",  type=int, default=640,   help="Image size (default: 640)")
    parser.add_argument("--batch",  type=int, default=16,    help="Batch size (default: 16)")
    parser.add_argument("--device", default="cpu",            help="Device: cpu / 0 (default: cpu)")
    args = parser.parse_args()

    evaluate(Path(args.model), args.split, args.imgsz, args.batch, args.device)


if __name__ == "__main__":
    main()
