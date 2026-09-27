from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def read_frame(path: Path, index: int) -> np.ndarray:
    capture = cv2.VideoCapture(str(path))
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError(f"Could not read frame {index} from {path}")
    return frame


def letterbox(frame: np.ndarray, width: int, height: int) -> np.ndarray:
    scale = min(width / frame.shape[1], height / frame.shape[0])
    resized = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    canvas = np.full((height, width, 3), 246, dtype=np.uint8)
    x = (width - resized.shape[1]) // 2
    y = (height - resized.shape[0]) // 2
    canvas[y : y + resized.shape[0], x : x + resized.shape[1]] = resized
    return canvas


def label(frame: np.ndarray, title: str, frame_index: int) -> np.ndarray:
    result = frame.copy()
    cv2.rectangle(result, (0, 0), (result.shape[1], 42), (14, 23, 38), -1)
    cv2.putText(
        result,
        f"{title} | f{frame_index}",
        (12, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.58,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )
    return result


def alpha_metrics(alpha_path: Path) -> dict[str, float | int]:
    capture = cv2.VideoCapture(str(alpha_path))
    areas: list[float] = []
    ious: list[float] = []
    previous: np.ndarray | None = None
    frames = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = gray >= 128
        areas.append(float(mask.mean()))
        if previous is not None:
            union = np.logical_or(mask, previous).sum()
            intersection = np.logical_and(mask, previous).sum()
            ious.append(float(intersection / union) if union else 1.0)
        previous = mask
        frames += 1
    capture.release()
    values = np.asarray(areas, dtype=np.float64)
    return {
        "frames": frames,
        "foregroundAreaMean": float(values.mean()),
        "foregroundAreaStd": float(values.std()),
        "foregroundAreaCv": float(values.std() / values.mean()),
        "frameToFrameIouMean": float(np.mean(ious)),
        "frameToFrameIouMin": float(np.min(ious)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commercial", type=Path, required=True)
    parser.add_argument("--safe-raw", type=Path, required=True)
    parser.add_argument("--safe-enhanced", type=Path, required=True)
    parser.add_argument("--safe-preview", type=Path, required=True)
    parser.add_argument("--alpha", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    videos = [
        ("Commercial reference", args.commercial),
        ("Safe raw", args.safe_raw),
        ("Safe + owned detail", args.safe_enhanced),
        ("Safe + SAM2 delivery", args.safe_preview),
        ("SAM2 alpha matte", args.alpha),
    ]
    frames = [0, 30, 60, 90, 120, 150]
    rows = []
    for frame_index in frames:
        cells = []
        for title, path in videos:
            frame = letterbox(read_frame(path, frame_index), 320, 400)
            cells.append(label(frame, title, frame_index))
        rows.append(np.hstack(cells))
    sheet = np.vstack(rows)
    sheet_path = args.output_dir / "resale-safe-convergence-contact-sheet.jpg"
    cv2.imwrite(str(sheet_path), sheet, [cv2.IMWRITE_JPEG_QUALITY, 94])

    representative_index = 90
    for title, path in videos:
        safe_name = title.lower().replace(" + ", "-").replace(" ", "-")
        cv2.imwrite(
            str(args.output_dir / f"frame-{representative_index}-{safe_name}.png"),
            read_frame(path, representative_index),
            [cv2.IMWRITE_PNG_COMPRESSION, 3],
        )

    metrics = {
        "schemaVersion": "betterpptx.avatar.resale-safe-convergence.v1",
        "alpha": alpha_metrics(args.alpha),
        "framesInspected": frames,
        "contactSheet": str(sheet_path.resolve()),
    }
    metrics_path = args.output_dir / "resale-safe-convergence-metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
