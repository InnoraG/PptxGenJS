#!/usr/bin/env python3
"""Run the pinned MediaPipe face-landmarker on the synthetic presenter fixture.

This is a maintainer-only crop-path probe. It writes only a derived crop and a
redacted report; the source image is never rewritten and its hash is checked
again after processing.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import mediapipe as mp
import numpy as np
from PIL import Image

MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("BETTERPPTX_MEDIAPIPE_SOURCE", str(ROOT / "betterpptx-mcp" / "outputs" / "presenter-identity-continuity-fixture.png")))
MODEL = Path(os.environ.get("BETTERPPTX_MEDIAPIPE_MODEL", str(Path(os.environ.get("TEMP", "/tmp")) / "betterpptx-face-landmarker.task")))
DERIVED = Path(os.environ.get("BETTERPPTX_MEDIAPIPE_DERIVED", str(ROOT / "betterpptx-mcp" / "outputs" / "presenter-face-crop-fixture.png")))
REPORT = Path(os.environ.get("BETTERPPTX_MEDIAPIPE_REPORT", str(ROOT / "betterpptx-mcp" / "outputs" / "mediapipe-face-landmarker-fixture-report.json")))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if not SOURCE.exists() or not MODEL.exists():
        raise SystemExit(f"missing fixture or model: {SOURCE} / {MODEL}")
    model_hash = sha256(MODEL)
    if model_hash != MODEL_SHA256:
        raise SystemExit(f"unexpected MediaPipe model hash: {model_hash}")
    source_hash_before = sha256(SOURCE)
    image = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(image)
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
        output_face_blendshapes=True,
    )
    with mp.tasks.vision.FaceLandmarker.create_from_options(options) as landmarker:
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not result.face_landmarks:
        report = {"schemaVersion": "betterpptx.mediapipe-face-landmarker-fixture.v1", "status": "NO_FACE", "source": {"path": str(SOURCE), "sha256": source_hash_before}, "modelSha256": model_hash, "consentScope": "local-research-demo-subject-001 / local-or-private-modal-only"}
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return 2
    landmarks = result.face_landmarks[0]
    width, height = image.size
    xs = [point.x * width for point in landmarks]
    ys = [point.y * height for point in landmarks]
    left, right = max(0, min(xs)), min(width, max(xs))
    top, bottom = max(0, min(ys)), min(height, max(ys))
    side = max(right - left, bottom - top) * 1.6
    center_x, center_y = (left + right) / 2, (top + bottom) / 2
    crop_left = max(0, round(center_x - side / 2))
    crop_top = max(0, round(center_y - side / 2))
    crop_right = min(width, round(center_x + side / 2))
    crop_bottom = min(height, round(center_y + side / 2))
    image.crop((crop_left, crop_top, crop_right, crop_bottom)).save(DERIVED, format="PNG")
    source_hash_after = sha256(SOURCE)
    report = {
        "schemaVersion": "betterpptx.mediapipe-face-landmarker-fixture.v1",
        "status": "PASS" if source_hash_before == source_hash_after else "BLOCKED",
        "source": {"path": str(SOURCE), "sha256": source_hash_before, "unchangedAfterCrop": source_hash_before == source_hash_after},
        "consentScope": "local-research-demo-subject-001 / local-or-private-modal-only / no-production",
        "model": {"url": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", "sha256": model_hash},
        "detection": {"landmarkCount": len(landmarks), "faceLandmarkBounds": {"left": left, "top": top, "right": right, "bottom": bottom}, "bboxPixels": round((right - left) * (bottom - top))},
        "derivedCrop": {"path": "betterpptx-mcp/outputs/presenter-face-crop-fixture.png", "sha256": sha256(DERIVED), "crop": {"left": crop_left, "top": crop_top, "right": crop_right, "bottom": crop_bottom}, "operations": ["crop", "pad-at-boundary", "resize-not-applied"], "generativeChanges": False},
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
