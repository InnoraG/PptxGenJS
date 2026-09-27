"""Score and visualize the one-at-a-time avatar detector/parser substitutions."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from skimage.metrics import structural_similarity


ROOT = Path(r"D:\PptxGenJS_Claude\betterpptx-mcp")
OUT = ROOT / "outputs" / "commercial-eval" / "detector-parser-ab-natural-v11-jaw"
MODEL = ROOT / "outputs" / "commercial-eval" / "face_landmarker.task"
VIDEOS = {
    "00 commercial reference": ROOT / "outputs" / "commercial-eval" / "upstream-natural-bbox-0.mp4",
    "01 YuNet only": OUT / "01-yunet-only.mp4",
    "02 MediaPipe only": OUT / "02-mediapipe-only.mp4",
    "03 YuNet + MediaPipe": OUT / "03-yunet-mediapipe.mp4",
}
FRAME_IDS = (0, 20, 45, 65, 88, 110, 135, 150)
OUTER_LIP = (61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308)


def load_video(path: Path) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    if not frames:
        raise RuntimeError(f"no frames in {path}")
    return frames


def landmarker():
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=1,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def mouth_box(detector, frame: np.ndarray) -> tuple[int, int, int, int]:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    h, w = frame.shape[:2]
    if not result.face_landmarks:
        return int(w * 0.28), int(h * 0.54), int(w * 0.72), int(h * 0.75)
    points = result.face_landmarks[0]
    xs = np.asarray([points[index].x * w for index in OUTER_LIP])
    ys = np.asarray([points[index].y * h for index in OUTER_LIP])
    cx, cy = float(xs.mean()), float(ys.mean())
    bw = max(40.0, float(xs.max() - xs.min()) * 2.2)
    bh = max(28.0, float(ys.max() - ys.min()) * 3.0)
    return (
        max(0, int(cx - bw / 2)),
        max(0, int(cy - bh / 2)),
        min(w, int(cx + bw / 2)),
        min(h, int(cy + bh / 2)),
    )


def crop(frame: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, x1, y1 = box
    return frame[y0:y1, x0:x1]


def labeled(tile: np.ndarray, label: str, width: int, height: int) -> np.ndarray:
    resized = cv2.resize(tile, (width, height), interpolation=cv2.INTER_AREA)
    cv2.rectangle(resized, (0, 0), (width, 28), (12, 18, 29), -1)
    cv2.putText(resized, label, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 238, 76), 1, cv2.LINE_AA)
    return resized


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    clips = {name: load_video(path) for name, path in VIDEOS.items()}
    reference = clips["00 commercial reference"]
    sample_indices = list(range(0, len(reference), 5))
    with landmarker() as detector:
        boxes = {index: mouth_box(detector, reference[index]) for index in sample_indices}

    metrics = {}
    for name, frames in clips.items():
        count = min(len(reference), len(frames))
        mouth_scores = []
        face_scores = []
        sharpness = []
        for index in [value for value in sample_indices if value < count]:
            ref = reference[index]
            current = frames[index]
            if current.shape != ref.shape:
                current = cv2.resize(current, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
            ref_gray = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
            cur_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
            face_scores.append(float(structural_similarity(ref_gray, cur_gray, data_range=255)))
            ref_mouth = crop(ref_gray, boxes[index])
            cur_mouth = crop(cur_gray, boxes[index])
            mouth_scores.append(float(structural_similarity(ref_mouth, cur_mouth, data_range=255)))
            sharpness.append(float(cv2.Laplacian(cur_mouth, cv2.CV_64F).var()))
        metrics[name] = {
            "frames": count,
            "wholeFrameSsimVsCommercial": round(float(np.mean(face_scores)), 4),
            "mouthRegionSsimVsCommercial": round(float(np.mean(mouth_scores)), 4),
            "mouthLaplacianVariance": round(float(np.mean(sharpness)), 2),
        }

    full_rows = []
    mouth_rows = []
    with landmarker() as detector:
        for name, frames in clips.items():
            full_tiles = []
            mouth_tiles = []
            for frame_id in FRAME_IDS:
                index = min(frame_id, len(frames) - 1)
                frame = frames[index]
                full_tiles.append(labeled(frame, f"{name} · f{index}", 240, 300))
                box = mouth_box(detector, frame)
                mouth_tiles.append(labeled(crop(frame, box), f"{name} · f{index}", 240, 150))
            full_rows.append(np.hstack(full_tiles))
            mouth_rows.append(np.hstack(mouth_tiles))

    cv2.imwrite(str(OUT / "detector-parser-full-contact-sheet.jpg"), np.vstack(full_rows), [cv2.IMWRITE_JPEG_QUALITY, 94])
    cv2.imwrite(str(OUT / "detector-parser-mouth-contact-sheet.jpg"), np.vstack(mouth_rows), [cv2.IMWRITE_JPEG_QUALITY, 96])
    report = {
        "schemaVersion": "betterpptx.avatar.detector-parser-quality.v1",
        "reference": str(VIDEOS["00 commercial reference"]),
        "metrics": metrics,
        "notes": [
            "SSIM is a diagnostic similarity measure, not an aesthetic quality verdict.",
            "The detector-only row retains upstream BiSeNet; the parser-only row retains upstream InsightFace.",
        ],
    }
    (OUT / "detector-parser-quality-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
