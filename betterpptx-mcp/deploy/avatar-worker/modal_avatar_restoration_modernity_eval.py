"""Isolated RestoreFormer++ / Real-ESRGAN quality experiment.

This is an owner-run evaluation worker only.  It has no HTTP endpoint and is
not attached to the production router.  It renders the same commercial
LivePortrait + MuseTalk clip through four branches so the enhancement choice
can be judged visually and with simple mouth-detail measurements:

* raw (control)
* RestoreFormer++ (face restoration only)
* Real-ESRGAN x4plus core-only (no --face_enhance/GFPGAN path)
* RestoreFormer++ followed by Real-ESRGAN core-only

The upstream checkpoints are sent as local build inputs so this experiment is
reproducible without relying on a mutable model download at inference time.
The result is deliberately kept outside the production application.
"""

from __future__ import annotations

import modal


APP_NAME = "betterpptx-avatar-restoration-modernity-eval"
RFPP_COMMIT = "59d250f45d6b11a3e620d62e6e067ca1288f93a9"
MODEL_ROOT = "D:/PptxGenJS_Claude/betterpptx-mcp/outputs/commercial-eval/restoreformer-pp-models"

app = modal.App(
    APP_NAME,
    tags={"product": "betterpptx", "service": "avatar-restoration-eval", "release": "never"},
)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC", "PYTHONUNBUFFERED": "1"})
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "build-essential", "curl")
    .run_commands(
        f"git init /opt/RestoreFormerPlusPlus && cd /opt/RestoreFormerPlusPlus && git remote add origin https://github.com/wzhouxiff/RestoreFormerPlusPlus.git && git fetch --depth 1 origin {RFPP_COMMIT} && git checkout --detach FETCH_HEAD",
        "pip install 'numpy<2' 'opencv-python-headless<4.12' basicsr facexlib gdown realesrgan scikit-image lmdb addict pyyaml scipy tqdm yapf imageio-ffmpeg",
        "mkdir -p /opt/RestoreFormerPlusPlus/experiments/pretrained_models/lpips /opt/RestoreFormerPlusPlus/experiments/weights",
        "curl -fL https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth -o /opt/RestoreFormerPlusPlus/experiments/weights/RealESRGAN_x2plus.pth",
        "sha256sum /opt/RestoreFormerPlusPlus/experiments/weights/RealESRGAN_x2plus.pth",
    )
    .workdir("/opt/RestoreFormerPlusPlus")
    .add_local_file(
        f"{MODEL_ROOT}/RestoreFormerPlusPlus/last.ckpt",
        "/opt/RestoreFormerPlusPlus/experiments/pretrained_models/RestoreFormer++.ckpt",
    )
    .add_local_file(
        f"{MODEL_ROOT}/pretrained_models/arcface_resnet18.pth",
        "/opt/RestoreFormerPlusPlus/experiments/pretrained_models/arcface_resnet18.pth",
    )
    .add_local_file(
        f"{MODEL_ROOT}/pretrained_models/FFHQ_eye_mouth_landmarks_512.pth",
        "/opt/RestoreFormerPlusPlus/experiments/pretrained_models/FFHQ_eye_mouth_landmarks_512.pth",
    )
    .add_local_file(
        f"{MODEL_ROOT}/pretrained_models/inception_FFHQ_512.pth",
        "/opt/RestoreFormerPlusPlus/experiments/pretrained_models/inception_FFHQ_512.pth",
    )
    .add_local_file(
        f"{MODEL_ROOT}/pretrained_models/lpips/vgg.pth",
        "/opt/RestoreFormerPlusPlus/experiments/pretrained_models/lpips/vgg.pth",
    )
)


@app.function(image=image, gpu=["A10G", "A100-40GB"], timeout=1800, scaledown_window=60, max_containers=1)
def compare(video_bytes: bytes, preview_color: str = "F1F3F5") -> dict:
    import hashlib
    import json
    import os
    import shutil
    import subprocess
    import tempfile
    import time
    from pathlib import Path

    import cv2
    import numpy as np
    import torch
    from skimage.metrics import structural_similarity

    # BasicSR 1.4.2 still imports the torchvision module removed in modern
    # torchvision.  Keep the compatibility shim local to this evaluation.
    import sys
    import types
    import torchvision.transforms.functional as tv_functional
    functional_tensor = types.ModuleType("torchvision.transforms.functional_tensor")
    functional_tensor.rgb_to_grayscale = tv_functional.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = functional_tensor

    from RestoreFormer.RestoreFormer import RestoreFormer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    work = Path(tempfile.mkdtemp(prefix="avatar_restore_modernity_", dir="/tmp"))
    source = work / "source.mp4"
    source.write_bytes(video_bytes)
    frames = work / "frames"
    frames.mkdir()
    subprocess.run(["ffmpeg", "-y", "-i", str(source), "-q:v", "2", str(frames / "%06d.png")], check=True, capture_output=True)
    frame_paths = sorted(frames.glob("*.png"))
    if not frame_paths:
        raise RuntimeError("no frames extracted")

    # Keep a clean control and render each branch at the original dimensions.
    first = cv2.imread(str(frame_paths[0]), cv2.IMREAD_COLOR)
    if first is None:
        raise RuntimeError("cannot decode first frame")
    height, width = first.shape[:2]
    branches = {name: work / name for name in ("raw", "restoreformer_pp", "realesrgan_core", "restoreformer_pp_realesrgan_core")}
    for path in branches.values():
        path.mkdir()

    rf_started = time.time()
    restorer = RestoreFormer(
        model_path="/opt/RestoreFormerPlusPlus/experiments/pretrained_models/RestoreFormer++.ckpt",
        upscale=1,
        arch="RestoreFormer++",
        bg_upsampler=None,
        device=torch.device("cuda"),
    )
    rf_count = 0
    for frame_path in frame_paths:
        image = cv2.imread(str(frame_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"cannot decode {frame_path}")
        cv2.imwrite(str(branches["raw"] / frame_path.name), image)
        _, _, restored = restorer.enhance(image, has_aligned=False, only_center_face=True, paste_back=True)
        if restored is None:
            restored = image
        restored = cv2.resize(restored, (width, height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(branches["restoreformer_pp"] / frame_path.name), restored)
        rf_count += 1
    rf_elapsed = round(time.time() - rf_started, 2)

    # Core Real-ESRGAN only: no --face_enhance flag and no GFPGAN import.
    esr_started = time.time()
    rrdb = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
    esr = RealESRGANer(
        scale=2,
        model_path="/opt/RestoreFormerPlusPlus/experiments/weights/RealESRGAN_x2plus.pth",
        model=rrdb,
        tile=0,
        tile_pad=10,
        pre_pad=0,
        half=True,
        device="cuda",
    )
    for frame_path in frame_paths:
        raw = cv2.imread(str(branches["raw"] / frame_path.name), cv2.IMREAD_COLOR)
        rf = cv2.imread(str(branches["restoreformer_pp"] / frame_path.name), cv2.IMREAD_COLOR)
        raw_up, _ = esr.enhance(raw, outscale=1)
        rf_up, _ = esr.enhance(rf, outscale=1)
        cv2.imwrite(str(branches["realesrgan_core"] / frame_path.name), cv2.resize(raw_up, (width, height), interpolation=cv2.INTER_AREA))
        cv2.imwrite(str(branches["restoreformer_pp_realesrgan_core"] / frame_path.name), cv2.resize(rf_up, (width, height), interpolation=cv2.INTER_AREA))
    esr_elapsed = round(time.time() - esr_started, 2)

    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(source)], check=True, capture_output=True, text=True)
    fps = probe.stdout.strip() or "25"
    output = {}
    for name, folder in branches.items():
        silent = work / f"{name}-silent.mp4"
        final = work / f"{name}.mp4"
        subprocess.run(["ffmpeg", "-y", "-framerate", fps, "-i", str(folder / "%06d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", str(silent)], check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-i", str(silent), "-i", str(source), "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-shortest", str(final)], check=True, capture_output=True)
        output[name] = final.read_bytes()

    # Fixed mouth ROI is deliberately identical across branches; this is a
    # comparative signal, not an identity metric.
    x0, x1 = int(width * 0.28), int(width * 0.72)
    y0, y1 = int(height * 0.48), int(height * 0.82)
    metrics = {}
    raw_frames = [cv2.imread(str(p), cv2.IMREAD_GRAYSCALE) for p in sorted(branches["raw"].glob("*.png"))]
    for name, folder in branches.items():
        vals = []
        edge_vals = []
        for idx, raw_gray in enumerate(raw_frames):
            candidate = cv2.imread(str(sorted(folder.glob("*.png"))[idx]), cv2.IMREAD_GRAYSCALE)
            a = raw_gray[y0:y1, x0:x1]
            b = candidate[y0:y1, x0:x1]
            vals.append(float(structural_similarity(a, b, data_range=255)))
            edge_vals.append(float(cv2.Laplacian(b, cv2.CV_64F).var()))
        metrics[name] = {
            "mouthSsimVsRawMean": round(float(np.mean(vals)), 4),
            "mouthLaplacianVarianceMean": round(float(np.mean(edge_vals)), 2),
            "frames": len(vals),
        }

    return {
        "sourceSha256": hashlib.sha256(video_bytes).hexdigest(),
        "frames": len(frame_paths),
        "width": width,
        "height": height,
        "fps": fps,
        "restoreFormerPlusPlusElapsedSec": rf_elapsed,
        "realEsrganElapsedSec": esr_elapsed,
        "metrics": metrics,
        "outputs": output,
        "modelPins": {
            "restoreFormerPlusPlusCommit": RFPP_COMMIT,
            "restoreFormerPlusPlusCheckpoint": "RestoreFormerPlusPlus/last.ckpt",
            "realEsrganCheckpoint": "RealESRGAN_x2plus.pth",
            "realEsrganFaceEnhance": False,
        },
    }


@app.local_entrypoint()
def main(input_path: str, output_dir: str, preview_color: str = "F1F3F5"):
    import hashlib
    import json
    from pathlib import Path

    source = Path(input_path).resolve()
    target = Path(output_dir).resolve()
    target.mkdir(parents=True, exist_ok=True)
    result = compare.remote(source.read_bytes(), preview_color)
    outputs = {}
    for name, data in result.pop("outputs").items():
        path = target / f"{name}.mp4"
        path.write_bytes(data)
        outputs[name] = str(path)
    result["outputs"] = outputs
    result["source"] = str(source)
    result["status"] = "ISOLATED_TECHNICAL_EXPERIMENT"
    result["productionPromotionAllowed"] = False
    result["sourceSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
    (target / "restoration-modernity-experiment-report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
