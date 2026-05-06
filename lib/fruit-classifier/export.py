"""
export.py
---------
Export the trained best.pt model to other formats for deployment.

Supported formats:
  onnx       — ONNX (cross-platform, works with OpenCV DNN, ONNX Runtime)
  torchscript — TorchScript (deploy with PyTorch Mobile)
  tflite     — TensorFlow Lite (Android / Raspberry Pi)
  coreml     — Core ML (iOS / macOS)
  openvino   — Intel OpenVINO (edge inference)
  engine     — TensorRT (NVIDIA GPU, fastest)

Usage:
  python export.py                        # export to ONNX (default)
  python export.py --format torchscript
  python export.py --format tflite
  python export.py --format engine --device 0   # TensorRT (requires CUDA)
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
EXPORT_DIR = BASE_DIR / "models" / "exported"

SUPPORTED_FORMATS = ["onnx", "torchscript", "tflite", "coreml", "openvino", "engine", "saved_model"]


def export_model(model_path: Path, fmt: str, imgsz: int, half: bool, device: str):
    if not model_path.exists():
        print(f"[ERROR] Model not found: {model_path}")
        print("[INFO]  Train first: python train.py")
        sys.exit(1)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("  AgriVision — YOLOv8 Model Export")
    print(f"  Source : {model_path}")
    print(f"  Format : {fmt}")
    print(f"  Imgsz  : {imgsz}  |  Half-precision: {half}")
    print("=" * 60)

    model = YOLO(str(model_path))
    exported_path = model.export(
        format = fmt,
        imgsz  = imgsz,
        half   = half,
        device = device,
    )

    print(f"\n[DONE] Exported model → {exported_path}")
    print(f"\n── Usage examples ───────────────────────────────────")
    if fmt == "onnx":
        print("  import onnxruntime as ort")
        print("  sess = ort.InferenceSession('models/best.onnx')")
    elif fmt == "torchscript":
        print("  import torch")
        print("  model = torch.jit.load('models/best.torchscript')")
    elif fmt == "tflite":
        print("  import tensorflow as tf")
        print("  interpreter = tf.lite.Interpreter('models/best.tflite')")


def main():
    parser = argparse.ArgumentParser(description="Export YOLOv8 fruit detector to deployment format")
    parser.add_argument("--model",  default=str(MODEL_PATH), help="Path to .pt weights file")
    parser.add_argument("--format", default="onnx", choices=SUPPORTED_FORMATS,
                        help="Export format (default: onnx)")
    parser.add_argument("--imgsz",  type=int, default=640, help="Image size (default: 640)")
    parser.add_argument("--half",   action="store_true",   help="Use FP16 half precision (GPU only)")
    parser.add_argument("--device", default="cpu",          help="Device: cpu / 0 (default: cpu)")
    args = parser.parse_args()

    export_model(Path(args.model), args.format, args.imgsz, args.half, args.device)


if __name__ == "__main__":
    main()
