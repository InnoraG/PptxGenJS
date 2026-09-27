"""Isolated, license-gated avatar enhancement and alpha evaluation worker.

The worker is deliberately owner-run only: it defines no HTTP endpoint and is
not registered with the BetterPPTX product router. CodeFormer is S-Lab
non-commercial unless separately licensed. Robust Video Matting is GPL-3.0 and
its checkpoint/training lineage must be reviewed before product promotion.

The output bundle contains:

* restored MP4: CodeFormer-enhanced, H.264/AAC-compatible source;
* transparent WebM: VP9 RGBA master with alpha;
* PowerPoint preview MP4: the RGBA master composited onto a chosen solid color;
* grayscale alpha MP4: inspection evidence for the matte.
"""

from __future__ import annotations

import os

import modal


APP_NAME = "betterpptx-avatar-commercial-enhancement-eval"
CODEFORMER_COMMIT = "b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b"
RVM_COMMIT = "53d74c6826735f01f4406b5ca9075eee27bec094"
RVM_WEIGHT_URLS = {
    "mobilenetv3": "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth",
    "resnet50": "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_resnet50.pth",
}

app = modal.App(
    APP_NAME,
    tags={
        "product": "betterpptx",
        "service": "avatar-commercial-enhancement-eval",
        "release": "never",
    },
)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC"})
    .apt_install("git", "ffmpeg", "libgl1-mesa-glx", "libglib2.0-0", "build-essential", "wget", "curl")
    .run_commands(
        f"git init /opt/CodeFormer && cd /opt/CodeFormer && git remote add origin https://github.com/sczhou/CodeFormer.git && git fetch --depth 1 origin {CODEFORMER_COMMIT} && git checkout --detach FETCH_HEAD",
        "cd /opt/CodeFormer && pip install -r requirements.txt",
        "pip install 'numpy<2' 'opencv-python<4.12' 'ffmpeg-python>=0.2,<0.3'",
        "cd /opt/CodeFormer && python basicsr/setup.py develop",
        "cd /opt/CodeFormer && python scripts/download_pretrained_models.py facelib",
        "cd /opt/CodeFormer && python scripts/download_pretrained_models.py CodeFormer",
        "cd /opt/CodeFormer && find weights -type f -print0 | sort -z | xargs -0 sha256sum",
    )
    .run_commands(
        f"git init /opt/RVM && cd /opt/RVM && git remote add origin https://github.com/PeterL1n/RobustVideoMatting.git && git fetch --depth 1 origin {RVM_COMMIT} && git checkout --detach FETCH_HEAD",
        # The 2021 requirements pin torch/torchvision to CUDA-era wheels that
        # are unavailable on the current Python runtime. Keep the already
        # pinned, GPU-compatible torch stack and install only RVM's I/O deps.
        "pip install 'av>=10,<13' 'pims>=0.6,<0.8' 'tqdm>=4.61,<5'",
        f"curl -fL {RVM_WEIGHT_URLS['mobilenetv3']} -o /opt/RVM/rvm_mobilenetv3.pth",
        f"curl -fL {RVM_WEIGHT_URLS['resnet50']} -o /opt/RVM/rvm_resnet50.pth",
        "sha256sum /opt/RVM/rvm_mobilenetv3.pth /opt/RVM/rvm_resnet50.pth",
    )
    .env({"PYTHONUNBUFFERED": "1"})
    .workdir("/opt/CodeFormer")
)


@app.function(image=image, gpu=["A10G", "A100-40GB"], timeout=1200, scaledown_window=60, max_containers=1)
def enhance_and_matte(
    video_bytes: bytes,
    fidelity_weight: float = 0.95,
    preview_color: str = "F1F3F5",
    matting_variant: str = "resnet50",
) -> dict:
    import glob
    import subprocess
    import sys
    import tempfile
    import time

    import torch

    if fidelity_weight < 0.0 or fidelity_weight > 1.0:
        raise ValueError("fidelity_weight must be within 0..1")
    if matting_variant not in RVM_WEIGHT_URLS:
        raise ValueError("matting_variant must be mobilenetv3 or resnet50")
    color = str(preview_color or "F1F3F5").strip().lstrip("#")
    if len(color) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in color):
        raise ValueError("preview_color must be a six-digit RGB hex value")

    work = tempfile.mkdtemp(prefix="avatar_enhancement_eval_", dir="/tmp")
    source = os.path.join(work, "input.mp4")
    restored_dir = os.path.join(work, "restored")
    with open(source, "wb") as stream:
        stream.write(video_bytes)

    started = time.time()
    codeformer = subprocess.run(
        [
            "python", "inference_codeformer.py",
            "--input_path", source,
            "--output_path", restored_dir,
            "--fidelity_weight", str(fidelity_weight),
            "--detection_model", "retinaface_resnet50",
            "--upscale", "1",
        ],
        cwd="/opt/CodeFormer",
        env={**os.environ, "PATH": "/usr/bin:/bin:/opt/conda/bin"},
        capture_output=True,
        text=True,
    )
    restored_candidates = [path for path in glob.glob(restored_dir + "/**/*.mp4", recursive=True) if os.path.isfile(path)]
    if codeformer.returncode != 0 or not restored_candidates:
        raise RuntimeError("CodeFormer failed: " + codeformer.stderr[-1800:])
    restored = sorted(restored_candidates, key=os.path.getsize, reverse=True)[0]
    restoration_elapsed = round(time.time() - started, 2)

    sys.path.insert(0, "/opt/RVM")
    from inference import convert_video
    from model import MattingNetwork

    foreground = os.path.join(work, "foreground.mp4")
    alpha = os.path.join(work, "alpha.mp4")
    model = MattingNetwork(matting_variant).eval().cuda()
    checkpoint = torch.load(f"/opt/RVM/rvm_{matting_variant}.pth", map_location="cpu")
    model.load_state_dict(checkpoint)
    matting_started = time.time()
    convert_video(
        model,
        input_source=restored,
        output_type="video",
        output_composition=None,
        output_alpha=alpha,
        output_foreground=foreground,
        output_video_mbps=6,
        downsample_ratio=None,
        seq_chunk=12,
        progress=False,
    )
    matting_elapsed = round(time.time() - matting_started, 2)
    if not os.path.isfile(foreground) or not os.path.isfile(alpha):
        raise RuntimeError("RVM did not produce foreground and alpha videos")

    transparent = os.path.join(work, "transparent.webm")
    transparent_result = subprocess.run(
        [
            "/usr/bin/ffmpeg", "-y",
            "-i", foreground,
            "-i", alpha,
            "-i", restored,
            "-filter_complex", "[1:v]format=gray[pha];[0:v][pha]alphamerge,format=yuva420p[rgba]",
            "-map", "[rgba]", "-map", "2:a?",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "3M",
            "-c:a", "libopus", "-shortest", transparent,
        ],
        capture_output=True,
        text=True,
    )
    if transparent_result.returncode != 0 or not os.path.isfile(transparent):
        raise RuntimeError("transparent WebM encoding failed: " + transparent_result.stderr[-1200:])

    preview = os.path.join(work, "powerpoint-preview.mp4")
    probe = subprocess.run(
        [
            "/usr/bin/ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "default=noprint_wrappers=1", restored,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    video_info = dict(
        line.split("=", 1) for line in probe.stdout.splitlines() if "=" in line
    )
    canvas_size = f"{video_info['width']}x{video_info['height']}"
    frame_rate = video_info.get("r_frame_rate", "25")
    preview_result = subprocess.run(
        [
            "/usr/bin/ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=0x{color}:s={canvas_size}:r={frame_rate}",
            "-i", foreground,
            "-i", alpha,
            "-i", restored,
            "-filter_complex", "[2:v]format=gray[pha];[1:v][pha]alphamerge[rgba];[0:v][rgba]overlay=shortest=1:format=auto,format=yuv420p[out]",
            "-map", "[out]", "-map", "3:a?",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-shortest", preview,
        ],
        capture_output=True,
        text=True,
    )
    if preview_result.returncode != 0 or not os.path.isfile(preview):
        raise RuntimeError("PowerPoint preview encoding failed: " + preview_result.stderr[-1200:])

    def read(path: str) -> bytes:
        with open(path, "rb") as stream:
            return stream.read()

    return {
        "restoredMp4": read(restored),
        "transparentWebm": read(transparent),
        "powerpointPreviewMp4": read(preview),
        "alphaMp4": read(alpha),
        "restorationElapsedSec": restoration_elapsed,
        "mattingElapsedSec": matting_elapsed,
        "totalElapsedSec": round(time.time() - started, 2),
        "fidelityWeight": fidelity_weight,
        "previewColor": color.upper(),
        "mattingVariant": matting_variant,
    }


@app.local_entrypoint()
def main(
    input_path: str,
    output_dir: str,
    fidelity_weight: float = 0.95,
    preview_color: str = "F1F3F5",
    matting_variant: str = "resnet50",
):
    from pathlib import Path
    import json

    source = Path(input_path).resolve()
    target = Path(output_dir).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    result = enhance_and_matte.remote(source.read_bytes(), fidelity_weight, preview_color, matting_variant)
    target.mkdir(parents=True, exist_ok=True)
    files = {
        "restoredMp4": target / "commercial-upstream-codeformer.mp4",
        "transparentWebm": target / "commercial-upstream-codeformer-alpha.webm",
        "powerpointPreviewMp4": target / "commercial-upstream-codeformer-powerpoint-preview.mp4",
        "alphaMp4": target / "commercial-upstream-alpha-matte.mp4",
    }
    for key, path in files.items():
        path.write_bytes(result[key])
    report = {
        "lane": "commercial-enhancement-evaluation-only",
        "releaseAllowed": False,
        "source": str(source),
        "outputs": {key: str(path) for key, path in files.items()},
        "fidelityWeight": result["fidelityWeight"],
        "previewColor": result["previewColor"],
        "mattingVariant": result["mattingVariant"],
        "restorationElapsedSec": result["restorationElapsedSec"],
        "mattingElapsedSec": result["mattingElapsedSec"],
        "totalElapsedSec": result["totalElapsedSec"],
        "pins": {"codeFormerCommit": CODEFORMER_COMMIT, "rvmCommit": RVM_COMMIT},
        "powerPointAlphaCompatible": False,
        "powerPointDelivery": "precomposited H.264/AAC MP4",
        "transparentMaster": "VP9 WebM with alpha",
    }
    report_path = target / "commercial-enhancement-eval-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
