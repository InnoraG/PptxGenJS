"""Private resale-safe avatar matting/compositing worker.

This worker uses the explicitly Apache-2.0 SAM 2.1 code and checkpoints.  It
has no public endpoint. The input video should already contain the selected
YuNet + MediaPipe narration result and deterministic BetterPPTX detail
enhancement.
"""

from __future__ import annotations

import os

import modal


APP_NAME = "betterpptx-avatar-resale-postprocess"
SAM2_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"
SAM2_CHECKPOINT_URL = "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt"
SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_s.yaml"
MEDIAPIPE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MEDIAPIPE_MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
OWNED_DETAIL_ENHANCER = os.path.join(os.path.dirname(__file__), "owned_temporal_detail_enhancer.py")

app = modal.App(APP_NAME, tags={"product": "betterpptx", "service": "avatar-resale-postprocess", "release": "frozen-safe"})

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC", "PYTHONUNBUFFERED": "1"})
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "curl")
    .run_commands(
        f"git init /opt/sam2 && cd /opt/sam2 && git remote add origin https://github.com/facebookresearch/sam2.git && git fetch --depth 1 origin {SAM2_COMMIT} && git checkout --detach FETCH_HEAD",
        "cd /opt/sam2 && pip install -e .",
        "pip install 'numpy<2' 'opencv-python-headless<4.12'",
        f"curl -fL {SAM2_CHECKPOINT_URL} -o /opt/sam2/sam2.1_hiera_small.pt",
        "sha256sum /opt/sam2/sam2.1_hiera_small.pt",
    )
    .workdir("/opt/sam2")
)

detail_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC", "PYTHONUNBUFFERED": "1"})
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0", "curl")
    .pip_install("numpy<2", "opencv-python-headless<4.12", "mediapipe==0.10.21", "imageio-ffmpeg==0.6.0")
    .add_local_file(OWNED_DETAIL_ENHANCER, "/opt/betterpptx/owned_temporal_detail_enhancer.py", copy=True)
    .run_commands(
        f"mkdir -p /opt/betterpptx && curl -fL {MEDIAPIPE_MODEL_URL} -o /opt/betterpptx/face_landmarker.task",
        f"echo {MEDIAPIPE_MODEL_SHA256} /opt/betterpptx/face_landmarker.task | sha256sum -c -",
    )
    .workdir("/opt/betterpptx")
)


@app.function(image=detail_image, cpu=2.0, memory=4096, timeout=900, scaledown_window=60, max_containers=2)
def enhance_detail(video_bytes: bytes) -> dict:
    import hashlib
    import sys
    import tempfile
    from pathlib import Path

    sys.path.insert(0, "/opt/betterpptx")
    from owned_temporal_detail_enhancer import run

    work = Path(tempfile.mkdtemp(prefix="avatar_owned_detail_", dir="/tmp"))
    source = work / "input.mp4"
    output = work / "enhanced.mp4"
    source.write_bytes(video_bytes)
    report = run(source, output, Path("/opt/betterpptx/face_landmarker.task"))
    rendered = output.read_bytes()
    return {
        "video": rendered,
        "frames": report["frames"],
        "fps": report["fps"],
        "sha256": hashlib.sha256(rendered).hexdigest(),
    }


@app.function(image=image, gpu=["A10G", "A100-40GB"], timeout=1200, scaledown_window=60, max_containers=1)
def matte_and_composite(video_bytes: bytes, preview_color: str = "F1F3F5") -> dict:
    import glob
    import subprocess
    import tempfile
    import time

    import cv2
    import numpy as np
    import torch
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2, build_sam2_video_predictor

    color = str(preview_color or "F1F3F5").strip().lstrip("#")
    if len(color) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in color):
        raise ValueError("preview_color must be a six-digit RGB hex value")
    work = tempfile.mkdtemp(prefix="avatar_sam2_", dir="/tmp")
    source = os.path.join(work, "input.mp4")
    frames_dir = os.path.join(work, "frames")
    masks_dir = os.path.join(work, "masks")
    os.makedirs(frames_dir)
    os.makedirs(masks_dir)
    with open(source, "wb") as stream:
        stream.write(video_bytes)

    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-i", source, "-start_number", "0", "-q:v", "2", os.path.join(frames_dir, "%05d.jpg")],
        check=True,
        capture_output=True,
        text=True,
    )
    frame_paths = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))
    if not frame_paths:
        raise RuntimeError("no frames extracted")
    first = cv2.imread(frame_paths[0])
    height, width = first.shape[:2]
    started = time.time()

    still_model = build_sam2(SAM2_CONFIG, "/opt/sam2/sam2.1_hiera_small.pt", device="cuda")
    generator = SAM2AutomaticMaskGenerator(
        still_model,
        points_per_side=24,
        pred_iou_thresh=0.78,
        stability_score_thresh=0.86,
        min_mask_region_area=max(64, int(width * height * 0.002)),
    )
    proposals = generator.generate(cv2.cvtColor(first, cv2.COLOR_BGR2RGB))
    center = (int(width * 0.50), int(height * 0.43))
    plausible = [
        item for item in proposals
        if item["segmentation"][center[1], center[0]] and width * height * 0.12 <= item["area"] <= width * height * 0.92
    ]
    if not plausible:
        raise RuntimeError("SAM 2 could not isolate the centered presenter")
    seed = max(plausible, key=lambda item: item["area"])["segmentation"].astype(np.uint8)
    del generator, still_model, proposals
    torch.cuda.empty_cache()

    predictor = build_sam2_video_predictor(SAM2_CONFIG, "/opt/sam2/sam2.1_hiera_small.pt", device="cuda")
    state = predictor.init_state(video_path=frames_dir, offload_video_to_cpu=True, offload_state_to_cpu=False)
    predictor.add_new_mask(inference_state=state, frame_idx=0, obj_id=1, mask=seed)
    written = set()
    for frame_index, object_ids, mask_logits in predictor.propagate_in_video(state):
        del object_ids
        logits = mask_logits[0, 0].detach().float().cpu().numpy()
        binary = (logits > 0.0).astype(np.float32)
        alpha = cv2.GaussianBlur(binary, (0, 0), 1.25)
        alpha = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
        cv2.imwrite(os.path.join(masks_dir, f"{int(frame_index):05d}.png"), alpha)
        written.add(int(frame_index))
    if len(written) != len(frame_paths):
        raise RuntimeError(f"SAM 2 returned {len(written)} masks for {len(frame_paths)} frames")
    matting_elapsed = round(time.time() - started, 2)

    alpha_mp4 = os.path.join(work, "alpha.mp4")
    foreground = os.path.join(work, "foreground.mp4")
    transparent = os.path.join(work, "transparent.webm")
    preview = os.path.join(work, "powerpoint-preview.mp4")
    probe = subprocess.run(
        ["/usr/bin/ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", source],
        check=True,
        capture_output=True,
        text=True,
    )
    fps = probe.stdout.strip() or "25"
    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-framerate", fps, "-i", os.path.join(masks_dir, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", alpha_mp4],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-i", source, "-i", alpha_mp4, "-filter_complex", "[1:v]format=gray[a];[0:v][a]alphamerge[rgba];[rgba]format=yuv420p[fg]", "-map", "[fg]", "-map", "0:a?", "-c:v", "libx264", "-crf", "17", "-c:a", "aac", "-shortest", foreground],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-i", source, "-i", alpha_mp4, "-filter_complex", "[1:v]format=gray[a];[0:v][a]alphamerge,format=yuva420p[rgba]", "-map", "[rgba]", "-map", "0:a?", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "3M", "-c:a", "libopus", "-shortest", transparent],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=0x{color}:s={width}x{height}:r={fps}", "-i", source, "-i", alpha_mp4, "-filter_complex", "[2:v]format=gray[a];[1:v][a]alphamerge[rgba];[0:v][rgba]overlay=shortest=1:format=auto,format=yuv420p[out]", "-map", "[out]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-c:a", "aac", "-shortest", preview],
        check=True,
        capture_output=True,
        text=True,
    )

    def read(path: str) -> bytes:
        with open(path, "rb") as stream:
            return stream.read()

    return {
        "alphaMp4": read(alpha_mp4),
        "foregroundMp4": read(foreground),
        "transparentWebm": read(transparent),
        "powerpointPreviewMp4": read(preview),
        "frames": len(frame_paths),
        "mattingElapsedSec": matting_elapsed,
        "previewColor": color.upper(),
    }


@app.function(timeout=1800, scaledown_window=60, max_containers=2)
def finalize_resale_safe(video_bytes: bytes, preview_color: str = "F1F3F5") -> dict:
    """Owned deterministic detail enhancement followed by pinned SAM2 matting."""
    detail = enhance_detail.remote(video_bytes)
    result = matte_and_composite.remote(detail["video"], preview_color)
    result["detailEnhancedMp4"] = detail["video"]
    result["detailFrames"] = detail["frames"]
    result["detailFps"] = detail["fps"]
    result["detailSha256"] = detail["sha256"]
    return result


@app.local_entrypoint()
def main(input_path: str, output_dir: str, preview_color: str = "F1F3F5"):
    from pathlib import Path
    import hashlib
    import json

    source = Path(input_path).resolve()
    target = Path(output_dir).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    target.mkdir(parents=True, exist_ok=True)
    result = finalize_resale_safe.remote(source.read_bytes(), preview_color)
    outputs = {
        "detailEnhancedMp4": target / "resale-safe-owned-enhanced.mp4",
        "alphaMp4": target / "resale-safe-sam2-alpha.mp4",
        "foregroundMp4": target / "resale-safe-sam2-foreground.mp4",
        "transparentWebm": target / "resale-safe-sam2-alpha.webm",
        "powerpointPreviewMp4": target / "resale-safe-sam2-powerpoint-preview.mp4",
    }
    for key, path in outputs.items():
        path.write_bytes(result[key])
    report = {
        "schemaVersion": "betterpptx.avatar.resale-postprocess.v1",
        "status": "FROZEN_RESALE_SAFE",
        "source": str(source),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "detailEnhancedSha256": result["detailSha256"],
        "outputs": {key: str(path) for key, path in outputs.items()},
        "frames": result["frames"],
        "detailFrames": result["detailFrames"],
        "detailFps": result["detailFps"],
        "mattingElapsedSec": result["mattingElapsedSec"],
        "previewColor": result["previewColor"],
        "pins": {"sam2Commit": SAM2_COMMIT, "sam2Checkpoint": SAM2_CHECKPOINT_URL, "sam2Config": SAM2_CONFIG},
        "licenseEvidence": "SAM 2 code and checkpoints are Apache-2.0 per the official repository README.",
        "powerPointDelivery": "precomposited H.264/AAC MP4",
        "transparentMaster": "VP9 WebM with alpha",
    }
    (target / "resale-safe-postprocess-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
