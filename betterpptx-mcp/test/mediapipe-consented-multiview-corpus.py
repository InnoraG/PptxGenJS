#!/usr/bin/env python3
"""Run the pinned Face Landmarker across the consented multi-view face sheet."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("BETTERPPTX_CONSENTED_MULTIVIEW_SOURCE", str(ROOT / "consentedHumanAsset" / "CompositedFaces.png")))
MODEL = Path(os.environ.get("BETTERPPTX_MEDIAPIPE_MODEL", str(Path(os.environ.get("TEMP", "/tmp")) / "betterpptx-face-landmarker.task")))
OUTPUT_DIR = ROOT / "betterpptx-mcp" / "outputs"
REPORT = Path(os.environ.get("BETTERPPTX_CONSENTED_MULTIVIEW_REPORT", str(OUTPUT_DIR / "mediapipe-consented-multiview-report.json")))
CONTACT_SHEET = Path(os.environ.get("BETTERPPTX_CONSENTED_MULTIVIEW_CONTACT_SHEET", str(OUTPUT_DIR / "consented-multiview-face-crops.png")))
MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if sha256(MODEL) != MODEL_SHA256:
        raise SystemExit("MediaPipe model hash mismatch")
    source_hash_before = sha256(SOURCE)
    sheet = Image.open(SOURCE).convert("RGB")
    # Fixed layout of the owner-scoped consented contact sheet: 3 columns × 4 rows.
    x_ranges = [(18, 255), (265, 502), (512, 749)]
    # Measured from the current owner-provided sheet (768×1365).  The
    # deliberate blank band between rows 2 and 3 is part of the source and
    # is not passed to the detector.
    y_ranges = [(32, 285), (300, 555), (728, 982), (1050, 1315)]
    tiles = [sheet.crop((left, top, right, bottom)) for top, bottom in y_ranges for left, right in x_ranges]
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        output_face_blendshapes=True,
    )
    derived = []
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
        for index, tile in enumerate(tiles, 1):
            rgb = np.asarray(tile)
            result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not result.face_landmarks:
                derived.append({"view": index, "status": "NO_FACE", "tileSha256": hashlib.sha256(np.asarray(tile).tobytes()).hexdigest()})
                continue
            landmarks = result.face_landmarks[0]
            width, height = tile.size
            xs = [point.x * width for point in landmarks]
            ys = [point.y * height for point in landmarks]
            left, right = max(0, min(xs)), min(width, max(xs))
            top, bottom = max(0, min(ys)), min(height, max(ys))
            side = max(right - left, bottom - top) * 1.6
            center_x, center_y = (left + right) / 2, (top + bottom) / 2
            crop_box = (max(0, round(center_x - side / 2)), max(0, round(center_y - side / 2)), min(width, round(center_x + side / 2)), min(height, round(center_y + side / 2)))
            crop = tile.crop(crop_box)
            crop_path = OUTPUT_DIR / f"consented-multiview-face-crop-{index:02d}.png"
            crop.save(crop_path, format="PNG")
            derived.append({"view": index, "status": "PASS", "landmarkCount": len(landmarks), "bboxPixels": round((right - left) * (bottom - top)), "cropBox": list(crop_box), "cropPath": str(crop_path.relative_to(ROOT)), "cropSha256": sha256(crop_path)})
    canvas = Image.new("RGB", (3 * 237, 4 * 253), "#20242b")
    draw = ImageDraw.Draw(canvas)
    for index in range(1, 13):
        crop_path = OUTPUT_DIR / f"consented-multiview-face-crop-{index:02d}.png"
        if crop_path.exists():
            crop = Image.open(crop_path).convert("RGB")
            crop.thumbnail((220, 220))
            x = ((index - 1) % 3) * 237 + 8
            y = ((index - 1) // 3) * 253 + 24
            canvas.paste(crop, (x, y))
            draw.text((x, y - 18), f"view {index}", fill="white")
    canvas.save(CONTACT_SHEET, format="PNG")
    source_hash_after = sha256(SOURCE)
    passed = sum(item["status"] == "PASS" for item in derived)
    report = {
        "schemaVersion": "betterpptx.mediapipe-consented-multiview.v1",
        "status": "PASS" if passed == len(tiles) and source_hash_before == source_hash_after else "PARTIAL",
        "subjectRef": "local-research-demo-subject-001",
        "consentScope": "local-research-demo-subject-001 / local-or-private-modal-only / no-production / no-training",
        "source": {"path": str(SOURCE), "sha256": source_hash_before, "unchangedAfterProcessing": source_hash_before == source_hash_after, "viewCount": len(tiles)},
        "modelSha256": MODEL_SHA256,
        "summary": {"totalViews": len(tiles), "passedViews": passed, "failedViews": len(tiles) - passed, "derivedContactSheet": str(CONTACT_SHEET.relative_to(ROOT))},
        "views": derived,
        "interpretation": "This is local/private research evidence across the consented face-angle sheet. It validates detector angle tolerance and source preservation; it is not public or production authorization.",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
