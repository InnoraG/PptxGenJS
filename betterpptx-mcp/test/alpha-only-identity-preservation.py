#!/usr/bin/env python3
"""Verify the body alpha-only contract without changing identity RGB pixels.

This is a fixture-level invariant test. It deliberately uses a deterministic
silhouette mask rather than claiming to measure segmentation quality. Any
future segmenter may replace the mask, but it must preserve this exact RGB
invariant and leave the authoritative upload untouched.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "consentedHumanAsset" / "FullBodyApose.png"
OUTPUT_DIR = ROOT / "betterpptx-mcp" / "outputs"
DERIVED = OUTPUT_DIR / "presenter-alpha-only-identity-preservation.png"
REPORT = OUTPUT_DIR / "presenter-alpha-only-identity-preservation-report.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    source_hash_before = sha256(SOURCE)
    source = Image.open(SOURCE).convert("RGB")
    source_rgb = np.asarray(source, dtype=np.uint8)
    width, height = source.size

    # Deterministic stand-in for a segmentation result. Only alpha is allowed
    # to change; the silhouette itself is not a quality claim.
    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((width * 0.14, height * 0.01, width * 0.86, height * 0.99), fill=255)
    alpha = np.asarray(mask, dtype=np.uint8)
    derived_rgba = np.dstack((source_rgb, alpha))
    Image.fromarray(derived_rgba, mode="RGBA").save(DERIVED, format="PNG")

    decoded = np.asarray(Image.open(DERIVED).convert("RGBA"), dtype=np.uint8)
    rgb_unchanged = bool(np.array_equal(decoded[:, :, :3], source_rgb))
    alpha_only = bool(np.any(decoded[:, :, 3] == 0) and np.any(decoded[:, :, 3] == 255))
    identity_roi = source_rgb[0 : max(1, int(height * 0.30)), int(width * 0.25) : int(width * 0.75)]
    derived_roi = decoded[0 : max(1, int(height * 0.30)), int(width * 0.25) : int(width * 0.75), :3]
    identity_roi_unchanged = bool(np.array_equal(identity_roi, derived_roi))
    source_hash_after = sha256(SOURCE)
    report = {
        "schemaVersion": "betterpptx.presenter-alpha-only-identity-preservation.v1",
        "status": "PASS" if rgb_unchanged and alpha_only and identity_roi_unchanged and source_hash_before == source_hash_after else "FAIL",
        "scope": "local/private research fixture; segmentation quality is not measured here",
        "source": {"path": str(SOURCE), "sha256": source_hash_before, "unchangedAfterProcessing": source_hash_before == source_hash_after},
        "derived": {"path": str(DERIVED.relative_to(ROOT)), "sha256": sha256(DERIVED), "operation": "alpha-only", "rgbUnchanged": rgb_unchanged, "alphaActuallyVaries": alpha_only, "identityRoiRgbUnchanged": identity_roi_unchanged},
        "policy": {"facePixelsMayBeRepainted": False, "lightingRemoval": False, "generativeRestyle": False, "originalRemainsAuthoritative": True},
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
