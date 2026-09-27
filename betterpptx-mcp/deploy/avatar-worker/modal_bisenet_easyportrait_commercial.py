"""Commercial-lane EasyPortrait BiSeNet-V2 training and evaluation.

This app is deliberately separate from the resale-safe worker.  It uses the
official EasyPortrait repository, dataset, and BiSeNet-V2 configuration.  The
EasyPortrait data/model artifacts are distributed under the project's CC
BY-SA-derived terms; keep the attribution/share-alike notice with every
checkpoint and do not copy this output into the resale-safe lane.

The first operation should be ``preflight``.  It downloads only the small
metadata/annotation archive and the official checkpoint, verifies the archive
layout, and records the intended full-training command.  ``prepare`` downloads
the 68.3 GB official train archive into a persistent Modal Volume.  ``train``
then runs the official MMSegmentation training entry point for a bounded
number of epochs and writes checkpoints/metrics to that same volume.

Examples (from the repository root):

    $env:MODAL_PROFILE='betterxavatar2'
    py -m modal run betterpptx-mcp/deploy/avatar-worker/modal_bisenet_easyportrait_commercial.py `
      --mode preflight

    py -m modal run betterpptx-mcp/deploy/avatar-worker/modal_bisenet_easyportrait_commercial.py `
      --mode prepare

    py -m modal run betterpptx-mcp/deploy/avatar-worker/modal_bisenet_easyportrait_commercial.py `
      --mode train --epochs 3
"""

from __future__ import annotations

import os
from pathlib import Path

import modal


APP_NAME = "betterpptx-avatar-commercial-bisenet-training"
VOLUME_NAME = "betterpptx-easyportrait-commercial"
DATA_ROOT = "/data/easyportrait"
UPSTREAM = "https://github.com/hukenovs/easyportrait.git"
TRAIN_URL = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/easyportrait/v2/train.zip"
ANNOTATIONS_URL = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/easyportrait/v2/annotations.zip"
META_URL = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/easyportrait/v2/meta.zip"
CHECKPOINT_URL = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/easyportrait/experiments/models/bisenet-fp.pth"

app = modal.App(
    APP_NAME,
    tags={
        "product": "betterpptx",
        "service": "avatar-commercial-bisenet-training",
        "pipeline": "easyportrait-bisenet-v2",
        "lane": "commercial",
        "release": "research-only",
    },
)

dataset_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


training_image = (
    modal.Image.from_registry("pytorch/pytorch:1.13.1-cuda11.6-cudnn8-devel")
    .env({"DEBIAN_FRONTEND": "noninteractive", "PYTHONUNBUFFERED": "1"})
    .apt_install("git", "git-lfs", "wget", "unzip", "libgl1-mesa-glx", "libglib2.0-0")
    .run_commands(
        f"git clone --depth 1 {UPSTREAM} /opt/easyportrait",
        "python -m pip install --upgrade 'pip<24'",
        "python -m pip install --no-deps 'numpy==1.23.5' 'Pillow==9.3.0' 'opencv-python-headless==4.7.0.68' addict packaging prettytable yapf==0.32.0 mmcls==0.25.0",
        "python -m pip install --no-deps 'mmcv-full==1.7.1' -f https://download.openmmlab.com/mmcv/dist/cu116/torch1.13/index.html",
    )
    .env({"PYTHONPATH": "/opt/easyportrait/pipelines"})
    .workdir("/opt/easyportrait")
)


def _download(url: str, destination: str) -> None:
    import os
    import subprocess

    os.makedirs(os.path.dirname(destination), exist_ok=True)
    if os.path.exists(destination) and os.path.getsize(destination) > 0:
        return
    subprocess.run(["wget", "-c", "--show-progress", "-O", destination, url], check=True)


def _extract_once(archive: str, marker: str, target: str) -> None:
    import os
    import subprocess

    if os.path.exists(marker):
        return
    os.makedirs(target, exist_ok=True)
    subprocess.run(["unzip", "-q", "-o", archive, "-d", target], check=True)
    Path(marker).write_text("ok\n", encoding="utf-8")


@app.function(
    image=training_image,
    volumes={"/data": dataset_volume},
    timeout=1800,
    scaledown_window=120,
    max_containers=1,
)
def preflight() -> dict:
    """Verify the official archives/checkpoint without downloading train images."""

    import hashlib
    import os
    import zipfile

    root = os.path.join(DATA_ROOT, "preflight")
    os.makedirs(root, exist_ok=True)
    annotation_zip = os.path.join(root, "annotations.zip")
    meta_zip = os.path.join(root, "meta.zip")
    checkpoint = os.path.join(root, "bisenet-fp.pth")
    _download(ANNOTATIONS_URL, annotation_zip)
    _download(META_URL, meta_zip)
    _download(CHECKPOINT_URL, checkpoint)

    def archive_summary(path: str) -> dict:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            return {
                "file": os.path.basename(path),
                "bytes": os.path.getsize(path),
                "members": len(names),
                "firstMembers": names[:5],
            }

    digest = hashlib.sha256()
    with open(checkpoint, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {
        "lane": "commercial",
        "dataset": "EasyPortrait v2",
        "upstream": UPSTREAM,
        "archives": [archive_summary(annotation_zip), archive_summary(meta_zip)],
        "checkpoint": {"file": checkpoint, "bytes": os.path.getsize(checkpoint), "sha256": digest.hexdigest()},
        "trainArchive": {"url": TRAIN_URL, "expectedBytes": 68274803248},
        "config": "/opt/easyportrait/pipelines/local_configs/easyportrait_experiments_v2/bisenet-fp/bisenetv2-fp.py",
        "status": "preflight-ok",
    }


@app.function(
    image=training_image,
    volumes={"/data": dataset_volume},
    timeout=21600,
    scaledown_window=120,
    max_containers=1,
)
def prepare_dataset() -> dict:
    """Download/extract the official train and annotation archives once."""

    import os
    import shutil

    root = os.path.join(DATA_ROOT, "archives")
    os.makedirs(root, exist_ok=True)
    train_zip = os.path.join(root, "train.zip")
    annotations_zip = os.path.join(root, "annotations.zip")
    _download(TRAIN_URL, train_zip)
    _download(ANNOTATIONS_URL, annotations_zip)
    _extract_once(train_zip, os.path.join(root, ".train-extracted"), DATA_ROOT)
    _extract_once(annotations_zip, os.path.join(root, ".annotations-extracted"), DATA_ROOT)
    dataset_candidates = []
    for dirpath, _, files in os.walk(DATA_ROOT):
        if any(name.endswith(".jpg") for name in files):
            dataset_candidates.append(dirpath)
    return {
        "status": "dataset-ready",
        "root": DATA_ROOT,
        "trainZipBytes": os.path.getsize(train_zip),
        "annotationZipBytes": os.path.getsize(annotations_zip),
        "imageDirectories": sorted(dataset_candidates)[:20],
        "volume": VOLUME_NAME,
    }


@app.function(
    image=training_image,
    gpu="A10G",
    volumes={"/data": dataset_volume},
    timeout=21600,
    scaledown_window=120,
    max_containers=1,
)
def train_bisenet(epochs: int = 3, batch_size: int = 8, workers: int = 4) -> dict:
    """Run official EasyPortrait BiSeNet-V2 face parsing fine-tuning."""

    import glob
    import os
    import subprocess
    import time

    if not 1 <= int(epochs) <= 100:
        raise ValueError("epochs must be between 1 and 100")
    if not 1 <= int(batch_size) <= 32:
        raise ValueError("batch_size must be between 1 and 32")
    config = "/opt/easyportrait/pipelines/local_configs/easyportrait_experiments_v2/bisenet-fp/bisenetv2-fp.py"
    work_dir = os.path.join(DATA_ROOT, "runs", "bisenet-fp-commercial")
    checkpoint = os.path.join(DATA_ROOT, "preflight", "bisenet-fp.pth")
    os.makedirs(work_dir, exist_ok=True)
    command = [
        "python", "/opt/easyportrait/pipelines/tools/train.py", config,
        "--work-dir", work_dir,
        "--load-from", checkpoint,
        "--gpu-id", "0",
        "--cfg-options",
        f"data_root={DATA_ROOT}",
        f"data.samples_per_gpu={int(batch_size)}",
        f"data.workers_per_gpu={int(workers)}",
        f"runner.max_epochs={int(epochs)}",
        "evaluation.interval=1",
        "checkpoint_config.interval=1",
    ]
    started = time.time()
    result = subprocess.run(command, cwd="/opt/easyportrait/pipelines", capture_output=True, text=True)
    log_path = os.path.join(work_dir, "modal-train.stdout.log")
    with open(log_path, "w", encoding="utf-8") as stream:
        stream.write(result.stdout)
        stream.write("\n--- STDERR ---\n")
        stream.write(result.stderr)
    checkpoints = sorted(glob.glob(os.path.join(work_dir, "*.pth")))
    if result.returncode != 0 or not checkpoints:
        raise RuntimeError("EasyPortrait training failed; see " + log_path + "\n" + result.stderr[-2000:])
    dataset_volume.commit()
    return {
        "status": "training-ok",
        "lane": "commercial",
        "epochs": int(epochs),
        "batchSize": int(batch_size),
        "elapsedSec": round(time.time() - started, 2),
        "workDir": work_dir,
        "checkpoints": checkpoints,
        "log": log_path,
        "licenseNotice": "EasyPortrait CC BY-SA-derived terms; retain attribution and share-alike obligations.",
    }


@app.local_entrypoint()
def main(mode: str = "preflight", epochs: int = 3, batch_size: int = 8, workers: int = 4):
    import json

    mode = str(mode).strip().lower()
    if mode == "preflight":
        result = preflight.remote()
    elif mode == "prepare":
        result = prepare_dataset.remote()
    elif mode == "train":
        result = train_bisenet.remote(epochs=epochs, batch_size=batch_size, workers=workers)
    else:
        raise ValueError("mode must be preflight, prepare, or train")
    print(json.dumps(result, indent=2, sort_keys=True))
