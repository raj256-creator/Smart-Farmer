"""
infer.py
--------
Run inference using the trained best.pt model.
Detects and classifies fruits in images, video, or webcam.

Usage:
  python infer.py --image path/to/fruit.jpg
  python infer.py --image path/to/fruit.jpg --save
  python infer.py --folder path/to/images/
  python infer.py --video path/to/video.mp4
  python infer.py --webcam
  python infer.py --image fruit.jpg --model models/custom.pt   # custom weights

Output:
  - Prints detected class, confidence, and bounding box per detection
  - Optionally saves annotated image to output/ directory
"""

import argparse
import sys
from pathlib import Path

try:
    from ultralytics import YOLO
    import cv2
except ImportError as e:
    print(f"[ERROR] Missing package: {e}")
    print("Run: pip install ultralytics opencv-python")
    sys.exit(1)

BASE_DIR    = Path(__file__).parent
MODEL_PATH  = BASE_DIR / "models" / "best.pt"
OUTPUT_DIR  = BASE_DIR / "output"

CLASSES = {
    0: "Mango",
    1: "Mulberry",
    2: "Dragon Fruit",
    3: "Chikoo",
    4: "Pomegranate",
}

# Colour per class for bounding box rendering (BGR)
CLASS_COLORS = {
    0: (0,   165, 255),   # Orange  — Mango
    1: (128,  0,  128),   # Purple  — Mulberry
    2: (0,   200,  50),   # Green   — Dragon Fruit
    3: (0,   200, 200),   # Cyan    — Chikoo
    4: (0,    0,  220),   # Red     — Pomegranate
}


def load_model(model_path: Path) -> "YOLO":
    if not model_path.exists():
        print(f"[ERROR] Model not found: {model_path}")
        print("[INFO]  Train first: python train.py")
        sys.exit(1)
    print(f"[OK] Loaded model: {model_path}")
    return YOLO(str(model_path))


def print_detections(results, source_name: str):
    print(f"\n── {source_name} ─────────────────────────────────────")
    found_any = False
    for r in results:
        for box in r.boxes:
            cls_id  = int(box.cls[0])
            conf    = float(box.conf[0])
            xyxy    = box.xyxy[0].tolist()
            cls_name = CLASSES.get(cls_id, f"class_{cls_id}")
            print(f"  {cls_name:15s}  conf={conf:.2%}  box=[{xyxy[0]:.0f},{xyxy[1]:.0f},{xyxy[2]:.0f},{xyxy[3]:.0f}]")
            found_any = True
    if not found_any:
        print("  No fruits detected.")


def run_image(model: "YOLO", image_path: str, save: bool, conf_thresh: float):
    path = Path(image_path)
    if not path.exists():
        print(f"[ERROR] Image not found: {image_path}")
        return

    results = model.predict(
        source    = str(path),
        conf      = conf_thresh,
        save      = save,
        project   = str(OUTPUT_DIR),
        name      = "images",
        exist_ok  = True,
        verbose   = False,
    )
    print_detections(results, path.name)

    if save:
        print(f"[INFO] Annotated image saved → {OUTPUT_DIR / 'images'}")


def run_folder(model: "YOLO", folder_path: str, save: bool, conf_thresh: float):
    folder = Path(folder_path)
    if not folder.is_dir():
        print(f"[ERROR] Not a directory: {folder_path}")
        return

    images = list(folder.glob("*.jpg")) + list(folder.glob("*.jpeg")) + \
             list(folder.glob("*.png")) + list(folder.glob("*.bmp"))

    if not images:
        print(f"[WARN] No images found in {folder_path}")
        return

    print(f"[INFO] Running inference on {len(images)} images …")
    for img in sorted(images):
        results = model.predict(
            source   = str(img),
            conf     = conf_thresh,
            save     = save,
            project  = str(OUTPUT_DIR),
            name     = "folder",
            exist_ok = True,
            verbose  = False,
        )
        print_detections(results, img.name)

    if save:
        print(f"\n[INFO] All annotated images saved → {OUTPUT_DIR / 'folder'}")


def run_video(model: "YOLO", video_path: str, save: bool, conf_thresh: float):
    path = Path(video_path)
    if not path.exists():
        print(f"[ERROR] Video not found: {video_path}")
        return

    results = model.predict(
        source   = str(path),
        conf     = conf_thresh,
        save     = save,
        project  = str(OUTPUT_DIR),
        name     = "video",
        exist_ok = True,
        stream   = True,
        verbose  = False,
    )

    frame_num = 0
    for r in results:
        frame_num += 1
        for box in r.boxes:
            cls_id   = int(box.cls[0])
            conf     = float(box.conf[0])
            cls_name = CLASSES.get(cls_id, f"class_{cls_id}")
            print(f"  Frame {frame_num:04d}  {cls_name:15s}  conf={conf:.2%}")

    if save:
        print(f"\n[INFO] Annotated video saved → {OUTPUT_DIR / 'video'}")


def run_webcam(model: "YOLO", conf_thresh: float):
    print("[INFO] Starting webcam. Press 'q' to quit.")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model.predict(source=frame, conf=conf_thresh, verbose=False)

        for r in results:
            for box in r.boxes:
                cls_id   = int(box.cls[0])
                conf     = float(box.conf[0])
                xyxy     = [int(v) for v in box.xyxy[0].tolist()]
                cls_name = CLASSES.get(cls_id, f"class_{cls_id}")
                color    = CLASS_COLORS.get(cls_id, (255, 255, 255))

                cv2.rectangle(frame, (xyxy[0], xyxy[1]), (xyxy[2], xyxy[3]), color, 2)
                label = f"{cls_name} {conf:.0%}"
                cv2.putText(frame, label, (xyxy[0], xyxy[1] - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        cv2.imshow("AgriVision — Fruit Detector", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


def main():
    parser = argparse.ArgumentParser(description="AgriVision — Fruit Detection Inference")
    group  = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--image",  help="Path to a single image file")
    group.add_argument("--folder", help="Path to a folder of images")
    group.add_argument("--video",  help="Path to a video file")
    group.add_argument("--webcam", action="store_true", help="Use live webcam")
    parser.add_argument("--model", default=str(MODEL_PATH), help="Path to .pt weights file")
    parser.add_argument("--conf",  type=float, default=0.40, help="Confidence threshold (default: 0.40)")
    parser.add_argument("--save",  action="store_true", help="Save annotated output to output/ directory")
    args = parser.parse_args()

    model = load_model(Path(args.model))

    if args.image:
        run_image(model, args.image, args.save, args.conf)
    elif args.folder:
        run_folder(model, args.folder, args.save, args.conf)
    elif args.video:
        run_video(model, args.video, args.save, args.conf)
    elif args.webcam:
        run_webcam(model, args.conf)


if __name__ == "__main__":
    main()
