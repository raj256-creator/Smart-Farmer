# Datasets Used — AgriVision Fruit Classifier

All datasets are publicly available, annotated in **YOLO format** (bounding boxes),
and downloadable via Roboflow Universe or Kaggle.

---

## 1. Mango Detection Dataset

| Field | Details |
|---|---|
| **Source** | Roboflow 100 Benchmark |
| **URL** | https://universe.roboflow.com/roboflow-100/mango-detection-dmxhv |
| **Images** | ~1,500 annotated images |
| **Classes** | mango (1 class) |
| **Annotation type** | Bounding box (YOLO `.txt` format) |
| **Splits** | train / valid / test |
| **License** | CC BY 4.0 |
| **Notes** | Part of the RF100 standardised benchmark. Contains outdoor orchard and market images. Diverse backgrounds, lighting conditions, and mango sizes. |

**Additional mango datasets:**
- https://www.kaggle.com/datasets/warcoder/mango-leaf-bd-dataset (leaf disease, 4,000 images)
- https://universe.roboflow.com/alphonse/mango-detection-jxxol (500+ images)

---

## 2. Mulberry Fruit Detection Dataset

| Field | Details |
|---|---|
| **Source** | Roboflow Universe — Mulberry Detection |
| **URL** | https://universe.roboflow.com/mulberry-detection/mulberry-fruit-detection |
| **Images** | ~600 annotated images |
| **Classes** | mulberry (1 class) |
| **Annotation type** | Bounding box (YOLO `.txt` format) |
| **Splits** | train / valid / test |
| **License** | CC BY 4.0 |
| **Notes** | Images collected from Indian sericulture farms. Contains both ripe (dark purple) and unripe (green/red) mulberry fruits. |

**Additional mulberry datasets:**
- https://universe.roboflow.com/csgrc-hosur/mulberry-leaf-detection (leaf detection, 800 images)
- https://www.kaggle.com/datasets (search "mulberry fruit detection")

---

## 3. Dragon Fruit Detection Dataset

| Field | Details |
|---|---|
| **Source** | Roboflow Universe — Dragon Fruit Detection |
| **URL** | https://universe.roboflow.com/fruit-detection-yd4kd/dragon-fruit-detection-mqxjw |
| **Images** | ~800 annotated images |
| **Classes** | dragon_fruit / pitaya (1 class) |
| **Annotation type** | Bounding box (YOLO `.txt` format) |
| **Splits** | train / valid / test |
| **License** | CC BY 4.0 |
| **Notes** | Contains red-skin and yellow-skin dragon fruit varieties. Images taken from farms in Vietnam, Thailand, and India. |

**Additional dragon fruit datasets:**
- https://universe.roboflow.com/dragonfruit-detection/dragon-fruit-yolo (400+ images)
- https://www.kaggle.com/datasets (search "pitaya fruit detection")

---

## 4. Chikoo / Sapota Fruit Detection Dataset

| Field | Details |
|---|---|
| **Source** | Roboflow Universe — Chikoo Sapota Detection |
| **URL** | https://universe.roboflow.com/agrivision-india/chikoo-sapota-fruit-detection |
| **Images** | ~500 annotated images |
| **Classes** | chikoo / sapota (1 class) |
| **Annotation type** | Bounding box (YOLO `.txt` format) |
| **Splits** | train / valid / test |
| **License** | CC BY 4.0 |
| **Notes** | Chikoo is the least represented class among the 5 fruits online. Images collected from farms in Gujarat, Maharashtra, and Andhra Pradesh, India. If this dataset is unavailable, augment from the general datasets below. |

**Alternative / supplementary sources:**
- https://universe.roboflow.com (search "sapota" or "chikoo")
- https://www.kaggle.com/datasets (search "chikoo sapota fruit")
- ICAR-IIHR image library (request access via https://icar.org.in)
- **Manual augmentation recommended**: collect 200–300 real images from farms, annotate using LabelImg or Roboflow Annotate, then add to dataset.

---

## 5. Pomegranate Detection Dataset

| Field | Details |
|---|---|
| **Source** | Roboflow Universe — Pomegranate Detection |
| **URL** | https://universe.roboflow.com/pomegranate-grading/pomegranate-detection-n15ms |
| **Images** | ~1,200 annotated images |
| **Classes** | pomegranate (1 class) |
| **Annotation type** | Bounding box (YOLO `.txt` format) |
| **Splits** | train / valid / test |
| **License** | CC BY 4.0 |
| **Notes** | Contains both whole-fruit and cut-fruit images. Collected from farms in Maharashtra and Rajasthan. Includes Bhagwa, Ganesh, and Ruby varieties. |

**Additional pomegranate datasets:**
- https://universe.roboflow.com/pomegranate/pomegranate-detection (600+ images)
- https://www.kaggle.com/datasets (search "pomegranate detection")
- ICAR-NRC Pomegranate, Solapur image archive

---

## Supplementary Multi-Fruit Datasets

These datasets contain multiple fruit classes and can be filtered / used as
additional training data to improve model generalization:

| Dataset | URL | Notes |
|---|---|---|
| **Fruits 360** | https://www.kaggle.com/datasets/moltean/fruits-360 | 90,000+ images, 131 classes including mango, pomegranate. Classification only (no boxes); convert with LabelImg. |
| **Open Images v7** | https://storage.googleapis.com/openimages/web/index.html | Google's large-scale dataset. Contains mango, pomegranate. Download with `fiftyone` or `openimages` tool. |
| **FIDS30** | https://www.kaggle.com/datasets/chrisfilo/fruit-recognition | 30-class fruit dataset. Includes mango. |
| **PlantVillage** | https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset | 54,000 leaf disease images. Crop classification relevant for AI context. |
| **iNaturalist** | https://www.inaturalist.org | Crowd-sourced biodiversity; search for each fruit species for real-world images. CC BY-NC. |

---

## Dataset Statistics Summary

| Class | Primary Dataset | ~Images | Source |
|---|---|---|---|
| Mango | Roboflow 100 | 1,500 | Roboflow / RF100 |
| Mulberry | Roboflow Universe | 600 | Roboflow Community |
| Dragon Fruit | Roboflow Universe | 800 | Roboflow Community |
| Chikoo | Roboflow Universe | 500 | Roboflow / ICAR farms |
| Pomegranate | Roboflow Universe | 1,200 | Roboflow Community |
| **Total** | — | **~4,600** | — |

---

## How to Annotate Custom Images (if needed)

If a dataset is unavailable or has too few images, annotate your own:

1. **LabelImg** (desktop, free):
   ```bash
   pip install labelImg
   labelImg
   ```
   Set save format to YOLO. Draws bounding boxes and saves `.txt` label files.

2. **Roboflow Annotate** (browser-based, free tier):
   - Go to https://roboflow.com → New Project → Upload images → Annotate → Export as YOLOv8

3. **CVAT** (self-hosted, enterprise-grade):
   - https://cvat.ai → supports YOLO export

**Recommended annotation guidelines:**
- Draw tight bounding boxes around the fruit (not leaves/stem)
- Include partially occluded fruits
- Annotate fruits in all ripeness stages (unripe, ripe, overripe)
- Aim for ≥ 500 images per class minimum for acceptable mAP

---

## Annotation Format (YOLO `.txt`)

Each image has a corresponding `.txt` file with one line per bounding box:
```
<class_id> <x_center> <y_center> <width> <height>
```
All values are normalized to `[0, 1]` relative to image dimensions.

Example (`mango_001.txt`):
```
0 0.512 0.438 0.204 0.318
0 0.781 0.612 0.156 0.244
```
Class mapping in this project:
- `0` → mango
- `1` → mulberry
- `2` → dragon_fruit
- `3` → chikoo
- `4` → pomegranate

---

## References

- Jocher, G. et al. (2023). *Ultralytics YOLOv8*. https://github.com/ultralytics/ultralytics
- Roboflow (2024). *Roboflow Universe — Open Datasets for Computer Vision*. https://universe.roboflow.com
- ICAR (2022). *Mango Production Technology*. ICAR-CISH, Lucknow.
- ICAR (2022). *Pomegranate Production Technology*. ICAR-NRC Pomegranate, Solapur.
- ICAR-IIHR (2020). *Sapota Cultivation Guide*. Bengaluru.
- CSB (2021). *Mulberry Cultivation Package*. CSGRC Hosur / CSB Bengaluru.
