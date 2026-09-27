#!/usr/bin/env python3
"""Analyze PowerPoint slideshow frame pairs and make compact visual contact sheets."""

from __future__ import annotations

import json
import itertools
import math
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat


def pair_metrics(start_path: pathlib.Path, active_path: pathlib.Path) -> dict:
    start = Image.open(start_path).convert("RGB")
    active = Image.open(active_path).convert("RGB")
    if start.size != active.size:
        active = active.resize(start.size)
    diff = ImageChops.difference(start, active)
    stat = ImageStat.Stat(diff)
    rms = math.sqrt(sum(value * value for value in stat.mean) / 3.0)
    gray = diff.convert("L")
    histogram = gray.histogram()
    changed = sum(histogram[9:])
    total = max(1, start.width * start.height)
    return {
        "start": start_path.name,
        "active": active_path.name,
        "width": start.width,
        "height": start.height,
        "meanAbsDiff": round(sum(stat.mean) / 3.0, 4),
        "rmsDiff": round(rms, 4),
        "changedPixelFraction": round(changed / total, 6),
        "visiblyChanged": changed / total >= 0.0005 and rms >= 0.12,
    }


def contact_sheet(paths: list[pathlib.Path], output: pathlib.Path, title: str, cols: int = 3) -> None:
    if not paths:
        return
    thumb_w, thumb_h, label_h = 480, 270, 34
    rows = math.ceil(len(paths) / cols)
    canvas = Image.new("RGB", (cols * thumb_w, 52 + rows * (thumb_h + label_h)), "#101722")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.text((16, 18), title, fill="white", font=font)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_w, thumb_h))
        x = (index % cols) * thumb_w
        y = 52 + (index // cols) * (thumb_h + label_h)
        canvas.paste(image, (x, y))
        draw.text((x + 8, y + thumb_h + 8), path.stem, fill="#C8D3E0", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: analyze-authoring-v3-motion-frames.py ORACLE_OUTPUT_DIR")
    root = pathlib.Path(sys.argv[1])
    frame_dir = root / "atlas-playback-frames"
    pairs = []
    slide_indexes = sorted(
        {
            int(path.stem.split("-")[1])
            for path in frame_dir.glob("motion-*-sample-*.png")
        }
    )
    for slide_index in slide_indexes:
        samples = sorted(frame_dir.glob(f"motion-{slide_index:03d}-sample-*.png"))
        candidates = [pair_metrics(a, b) for a, b in itertools.combinations(samples, 2)]
        if candidates:
            metrics = max(
                candidates,
                key=lambda item: (item["changedPixelFraction"], item["rmsDiff"]),
            )
            metrics["slideIndex"] = slide_index
            metrics["sampleCount"] = len(samples)
            pairs.append(metrics)
    # Backward-compatible read of the first two-frame oracle corpus.
    if not pairs:
        for start in sorted(frame_dir.glob("motion-*-start.png")):
            active = start.with_name(start.name.replace("-start.png", "-active.png"))
            if active.exists():
                metrics = pair_metrics(start, active)
                metrics["slideIndex"] = int(start.stem.split("-")[1])
                metrics["sampleCount"] = 2
                pairs.append(metrics)
    report = {
        "schemaVersion": "betterpptx.authoring-v3-motion-frame-analysis.v1",
        "status": "PASS" if pairs and all(item["visiblyChanged"] for item in pairs) else "FAIL",
        "pairCount": len(pairs),
        "visiblyChangedCount": sum(1 for item in pairs if item["visiblyChanged"]),
        "pairs": pairs,
    }
    (root / "motion-frame-analysis.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    sample_indexes = [2, 10, 19, 20, 28, 37, 38, 44]
    if pairs:
        sample_indexes.append(max(item["slideIndex"] for item in pairs))
    sample_indexes = sorted(set(sample_indexes))
    best_by_slide = {item["slideIndex"]: frame_dir / item["active"] for item in pairs}
    active_samples = [best_by_slide[index] for index in sample_indexes if index in best_by_slide]
    contact_sheet([path for path in active_samples if path.exists()], root / "atlas-playback-contact-sheet.png", "Authoring-v3 native motion playback · active frames")
    static_samples = sorted((root / "static-renders").glob("*.png"))[:18]
    contact_sheet(static_samples, root / "static-render-contact-sheet.png", "PowerPoint static render samples")
    print(json.dumps({"status": report["status"], "pairCount": report["pairCount"], "visiblyChangedCount": report["visiblyChangedCount"]}))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
