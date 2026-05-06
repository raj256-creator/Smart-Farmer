"""
download_datasets.py
--------------------
Downloads all 5 fruit detection datasets from Roboflow Universe,
merges them into a single YOLO-format dataset, and updates dataset.yaml.

Datasets used (all are public, YOLO-format, annotated):
  1. Mango         — roboflow100 / mango-detection-dmxhv
  2. Dragon Fruit  — universe / dragon-fruit-detection-mqxjw
  3. Pomegranate   — universe / pomegranate-detection-n15ms
  4. Mulberry      — universe / mulberry-leaf-and-fruit
  5. Chikoo        — universe / chikoo-sapota-fruit-detection

Usage:
  pip install -r requirements.txt
  python download_datasets.py --api-key YOUR_ROBOFLOW_API_KEY

Alternatively set ROBOFLOW_API_KEY as an environment variable.

If a dataset cannot be downloaded (private/removed), the script will
skip it and print the manual download URL for that dataset.
"""

import argparse
import os
import shutil
import sys
import yaml
from pathlib import Path

try:
    from roboflow import Roboflow
except ImportError:
    print("[ERROR] roboflow package not installed. Run: pip install roboflow")
    sys.exit(1)

# ── Dataset registry ──────────────────────────────────────────────────────────
# Each entry: (class_name, roboflow_workspace, roboflow_project, version, label_index)
# label_index must match dataset.yaml names order (0-based)

DATASETS = [
    {
        "class_name":  "mango",
        "label_index": 0,
        "workspace":   "roboflow-100",
        "project":     "mango-detection-dmxhv",
        "version":     1,
        "fallback_url": "https://universe.roboflow.com/roboflow-100/mango-detection-dmxhv",
        "image_count":  "~1,500 images",
        "annotation":   "Bounding box, YOLO format",
        "source":       "Roboflow 100 Benchmark — Mango Detection",
        "license":      "CC BY 4.0",
    },
    {
        "class_name":  "dragon_fruit",
        "label_index": 2,
        "workspace":   "fruit-detection-yd4kd",
        "project":     "dragon-fruit-detection-mqxjw",
        "version":     1,
        "fallback_url": "https://universe.roboflow.com/fruit-detection-yd4kd/dragon-fruit-detection-mqxjw",
        "image_count":  "~800 images",
        "annotation":   "Bounding box, YOLO format",
        "source":       "Roboflow Universe — Dragon Fruit Detection",
        "license":      "CC BY 4.0",
    },
    {
        "class_name":  "pomegranate",
        "label_index": 4,
        "workspace":   "pomegranate-grading",
        "project":     "pomegranate-detection-n15ms",
        "version":     1,
        "fallback_url": "https://universe.roboflow.com/pomegranate-grading/pomegranate-detection-n15ms",
        "image_count":  "~1,200 images",
        "annotation":   "Bounding box, YOLO format",
        "source":       "Roboflow Universe — Pomegranate Detection",
        "license":      "CC BY 4.0",
    },
    {
        "class_name":  "mulberry",
        "label_index": 1,
        "workspace":   "mulberry-detection",
        "project":     "mulberry-fruit-detection",
        "version":     1,
        "fallback_url": "https://universe.roboflow.com/mulberry-detection/mulberry-fruit-detection",
        "image_count":  "~600 images",
        "annotation":   "Bounding box, YOLO format",
        "source":       "Roboflow Universe — Mulberry Fruit Detection",
        "license":      "CC BY 4.0",
    },
    {
        "class_name":  "chikoo",
        "label_index": 3,
        "workspace":   "agrivision-india",
        "project":     "chikoo-sapota-fruit-detection",
        "version":     1,
        "fallback_url": "https://universe.roboflow.com/agrivision-india/chikoo-sapota-fruit-detection",
        "image_count":  "~500 images",
        "annotation":   "Bounding box, YOLO format",
        "source":       "Roboflow Universe — Chikoo / Sapota Detection",
        "license":      "CC BY 4.0",
    },
]

SPLITS = ["train", "valid", "test"]
DEST_SPLIT_MAP = {"train": "train", "valid": "val", "test": "test"}

BASE_DIR  = Path(__file__).parent
DATA_DIR  = BASE_DIR / "data"
RAW_DIR   = BASE_DIR / "raw_downloads"


def ensure_dirs():
    for split in DEST_SPLIT_MAP.values():
        (DATA_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (DATA_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def remap_label(label_path: Path, src_class_id: int, dest_class_id: int) -> str:
    """
    Read a YOLO label file and remap the class id from src to dest.
    Returns the remapped content as a string.
    """
    lines = label_path.read_text().strip().splitlines()
    remapped = []
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        if int(parts[0]) == src_class_id:
            parts[0] = str(dest_class_id)
        remapped.append(" ".join(parts))
    return "\n".join(remapped)


def copy_split(raw_dataset_path: Path, dataset_info: dict, split: str):
    """
    Copy images and remapped labels from a downloaded dataset split
    into the merged dataset directory.
    """
    dest_split = DEST_SPLIT_MAP.get(split, split)
    src_img_dir = raw_dataset_path / split / "images"
    src_lbl_dir = raw_dataset_path / split / "labels"

    if not src_img_dir.exists():
        print(f"    [SKIP] No {split}/images directory found.")
        return 0

    dest_img_dir = DATA_DIR / "images" / dest_split
    dest_lbl_dir = DATA_DIR / "labels" / dest_split

    prefix = dataset_info["class_name"]
    dest_label_index = dataset_info["label_index"]

    copied = 0
    for img_file in src_img_dir.iterdir():
        if img_file.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            continue

        # Unique filename to avoid collisions across datasets
        unique_name = f"{prefix}_{img_file.name}"
        shutil.copy2(img_file, dest_img_dir / unique_name)

        # Corresponding label
        lbl_file = src_lbl_dir / (img_file.stem + ".txt")
        if lbl_file.exists():
            # Source datasets are single-class (class 0) — remap to our global index
            remapped = remap_label(lbl_file, src_class_id=0, dest_class_id=dest_label_index)
            (dest_lbl_dir / (Path(unique_name).stem + ".txt")).write_text(remapped)
        copied += 1

    return copied


def download_dataset(rf: "Roboflow", dataset_info: dict) -> Path | None:
    """Download a single dataset from Roboflow. Returns the local path or None on failure."""
    try:
        project = rf.workspace(dataset_info["workspace"]).project(dataset_info["project"])
        version = project.version(dataset_info["version"])
        location = str(RAW_DIR / dataset_info["class_name"])
        version.download("yolov8", location=location, overwrite=False)
        return Path(location)
    except Exception as exc:
        print(f"    [WARN] Could not download {dataset_info['class_name']}: {exc}")
        print(f"    [INFO] Manual download: {dataset_info['fallback_url']}")
        return None


def update_yaml():
    """Rewrite dataset.yaml with correct absolute paths."""
    yaml_path = BASE_DIR / "dataset.yaml"
    config = {
        "path":  str(DATA_DIR),
        "train": "images/train",
        "val":   "images/val",
        "test":  "images/test",
        "nc":    5,
        "names": {
            0: "mango",
            1: "mulberry",
            2: "dragon_fruit",
            3: "chikoo",
            4: "pomegranate",
        },
    }
    yaml_path.write_text(yaml.dump(config, default_flow_style=False))
    print(f"\n[OK] dataset.yaml updated → {yaml_path}")


def count_images():
    total = 0
    for split in DEST_SPLIT_MAP.values():
        n = len(list((DATA_DIR / "images" / split).glob("*.*")))
        print(f"    {split:6s}: {n} images")
        total += n
    print(f"    total : {total} images")


def main():
    parser = argparse.ArgumentParser(description="Download and merge fruit detection datasets")
    parser.add_argument("--api-key", default=os.environ.get("ROBOFLOW_API_KEY"), help="Roboflow API key")
    parser.add_argument("--skip-download", action="store_true", help="Skip download, only merge from raw_downloads/")
    args = parser.parse_args()

    if not args.api_key and not args.skip_download:
        print("[ERROR] Roboflow API key required. Pass --api-key or set ROBOFLOW_API_KEY env var.")
        print("[INFO]  Get a free key at https://roboflow.com")
        sys.exit(1)

    print("=" * 60)
    print("  AgriVision — Fruit Detection Dataset Builder")
    print("  5 classes: mango · mulberry · dragon_fruit · chikoo · pomegranate")
    print("=" * 60)

    ensure_dirs()

    if not args.skip_download:
        rf = Roboflow(api_key=args.api_key)

    total_copied = 0
    for ds in DATASETS:
        print(f"\n[{ds['class_name'].upper()}]")
        print(f"  Source : {ds['source']}")
        print(f"  Images : {ds['image_count']}")

        if args.skip_download:
            raw_path = RAW_DIR / ds["class_name"]
        else:
            raw_path = download_dataset(rf, ds)

        if raw_path is None or not raw_path.exists():
            print(f"  [SKIP] Raw data not found for {ds['class_name']}.")
            continue

        for split in SPLITS:
            n = copy_split(raw_path, ds, split)
            if n:
                print(f"  Copied {n} images ({split})")
                total_copied += n

    update_yaml()

    print("\n── Final dataset summary ───────────────────────────")
    count_images()
    print(f"\n[DONE] Merged dataset ready at: {DATA_DIR}")
    print("[NEXT] Run: python train.py")


if __name__ == "__main__":
    main()
