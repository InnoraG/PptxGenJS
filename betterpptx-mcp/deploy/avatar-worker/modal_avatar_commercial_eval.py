"""Commercial production worker for LivePortrait + MuseTalk + RestoreFormer++.

The model lane is intentionally isolated from the resale-safe BetterPPTX worker:

* separate Modal app name;
* exposes only an authenticated generic multipart endpoint;
* uses upstream InsightFace and BiSeNet model assets for the owner-approved
  commercial quality lane;
* applies the owner-selected RestoreFormer++ face-restoration stage only after
  MuseTalk completes;
* feature qualification verifies six distinct authenticated billing workspaces,
  the reviewed motion/mouth profile, and PowerPoint-compatible media canaries.

Run from the repository root:

    $env:MODAL_PROFILE='your-workspace'
    py -m modal run betterpptx-mcp/deploy/avatar-worker/modal_avatar_commercial_eval.py `
      --image-path portrait.jpg `
      --audio-path speech.wav `
      --output-path talking-head.mp4 `
      --bbox-shift 0
"""

from __future__ import annotations

import os

import modal

try:
    # FastAPI is installed inside the Modal image.  Keep a tiny fallback so
    # the deployment module can still be imported by the local Modal CLI.
    from fastapi import Request
except ImportError:  # pragma: no cover - exercised only on the deploy host
    class Request:  # type: ignore[no-redef]
        pass


APP_NAME = "betterpptx-avatar-commercial-production"
ENDPOINT_LABEL = "betterpptx-avatar-commercial-lipsync"
# CPU-only liveness route; its URL is the lipsync URL with "-lipsync" replaced by "-health".
HEALTH_LABEL = "betterpptx-avatar-commercial-health"
WORKER_BUILD = "commercial-health-20261026"
AUTH_SECRET_NAME = "betterpptx-avatar-commercial-auth"
GPU_PREFERENCE = ["A10G", "A100-40GB"]
MODEL_LOCK = os.path.join(os.path.dirname(__file__), "restoreformer-models.lock.json")
MODEL_FETCHER = os.path.join(os.path.dirname(__file__), "fetch_pinned_weights.py")
RESTORATION_COMMIT = "59d250f45d6b11a3e620d62e6e067ca1288f93a9"
MUSE_REPO_COMMIT = "0a89dec45a0192b824e3cf4daf96c239440c5ed8"
MUSE_MODEL_REVISION = "3ef28bc5cff08c90ad8178a25f1b570cd800170f"
LIVEPORTRAIT_REPO_COMMIT = "9b294b3d0536135442ea73cb01e6cb3ca7029dd3"
LIVEPORTRAIT_MODEL_REVISION = "82a4fa6735ca58432b6ce39301b4b9ee066dea47"
EYE_GAZE_BLEND_PATCH = os.path.join(os.path.dirname(__file__), "liveportrait_eye_gaze_blend_patch.py")

app = modal.App(
    APP_NAME,
    tags={
        "product": "betterpptx",
        "service": "avatar-commercial-eval",
        "pipeline": "upstream-liveportrait-musetalk-restoreformer-pp",
        "release": "production-candidate",
    },
)


mt_image = (
    modal.Image.from_registry("pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC"})
    .apt_install("git", "git-lfs", "ffmpeg", "libgl1-mesa-glx", "libglib2.0-0", "build-essential", "wget", "curl")
    .run_commands(
        f"git init /opt/MuseTalk && cd /opt/MuseTalk && git remote add origin https://github.com/TMElyralab/MuseTalk.git && git fetch --depth 1 origin {MUSE_REPO_COMMIT} && git checkout --detach FETCH_HEAD",
        "cd /opt/MuseTalk && pip install -r requirements.txt",
        "pip install -U openmim 'huggingface_hub[cli]' gdown",
        "mim install mmengine 'mmcv==2.1.0' 'mmdet==3.2.0' 'mmpose==1.2.0'",
    )
    .run_commands(
        f"cd /opt/MuseTalk && hf download TMElyralab/MuseTalk --revision {MUSE_MODEL_REVISION} musetalk/musetalk.json musetalk/pytorch_model.bin musetalkV15/musetalk.json musetalkV15/unet.pth --local-dir models",
        "cd /opt/MuseTalk && hf download stabilityai/sd-vae-ft-mse --revision 31f26fdeee1355a5c34592e401dd41e45d25a493 config.json diffusion_pytorch_model.bin --local-dir models/sd-vae",
        "cd /opt/MuseTalk && hf download openai/whisper-tiny --revision 169d4a4341b33bc18d8881c4b69c2e104e1cc0af config.json pytorch_model.bin preprocessor_config.json --local-dir models/whisper",
        "cd /opt/MuseTalk && hf download yzd-v/DWPose --revision 1a7144101628d69ee7a3768d1ee3a094070dc388 dw-ll_ucoco_384.pth --local-dir models/dwpose",
        "cd /opt/MuseTalk && mkdir -p models/face-parse-bisent && gdown 154JgKpzCPW82qINcVieuPH3fZ2e0P812 -O models/face-parse-bisent/79999_iter.pth",
        "cd /opt/MuseTalk && curl -fL https://download.pytorch.org/models/resnet18-5c106cde.pth -o models/face-parse-bisent/resnet18-5c106cde.pth",
        "cd /opt/MuseTalk && sha256sum models/face-parse-bisent/79999_iter.pth models/face-parse-bisent/resnet18-5c106cde.pth",
        "pip install 'huggingface_hub==0.30.2'",
    )
    .env({"PYTHONUNBUFFERED": "1", "HF_HUB_ENABLE_HF_TRANSFER": "0"})
    .workdir("/opt/MuseTalk")
)


lp_image = (
    modal.Image.from_registry("pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC"})
    .apt_install("git", "ffmpeg", "libgl1-mesa-glx", "libglib2.0-0", "build-essential", "wget", "curl")
    .run_commands(
        f"git init /opt/LivePortrait && cd /opt/LivePortrait && git remote add origin https://github.com/KlingAIResearch/LivePortrait.git && git fetch --depth 1 origin {LIVEPORTRAIT_REPO_COMMIT} && git checkout --detach FETCH_HEAD",
        # The CLI inference path does not need the Gradio UI.  Installing the
        # full requirements file without a lock currently pulls numkong via a
        # transitive UI dependency, which has no compatible wheel in this
        # CUDA/Python image and fails during image build.  Keep the upstream
        # pinned runtime set and add only the two model-runtime packages.
        "cd /opt/LivePortrait && pip install --no-deps -r requirements_base.txt",
        "cd /opt/LivePortrait && pip install --no-deps onnxruntime-gpu==1.18.0 transformers==4.38.0 huggingface_hub==0.30.2 gdown ffmpeg-python pykalman tyro docstring-parser shtab coloredlogs humanfriendly flatbuffers lazy_loader tifffile python-multipart 'fastapi[standard]'",
        "pip install 'fastapi[standard]'",
        "pip install -U 'huggingface_hub[cli]'",
        f"cd /opt/LivePortrait && hf download KwaiVGI/LivePortrait --revision {LIVEPORTRAIT_MODEL_REVISION} --local-dir pretrained_weights",
        "cd /opt/LivePortrait && find pretrained_weights/insightface -type f -print0 | sort -z | xargs -0 sha256sum",
    )
    .add_local_file(EYE_GAZE_BLEND_PATCH, "/opt/liveportrait_eye_gaze_blend_patch.py", copy=True)
    .run_commands("python /opt/liveportrait_eye_gaze_blend_patch.py")
    .env({"PYTHONUNBUFFERED": "1", "HF_HUB_ENABLE_HF_TRANSFER": "0"})
    .workdir("/opt/LivePortrait")
)


# RestoreFormer++ is the selected commercial enhancement stage.  It is a
# separate Modal image/function so the existing LP/MT images remain unchanged
# and rollback can remove this stage without rebuilding either model lane.
rf_image = (
    modal.Image.from_registry("pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime")
    .env({"DEBIAN_FRONTEND": "noninteractive", "TZ": "Etc/UTC", "PYTHONUNBUFFERED": "1"})
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "curl")
    .run_commands(
        "pip install 'numpy<2' 'opencv-python-headless<4.12' basicsr facexlib scikit-image lmdb addict pyyaml scipy tqdm yapf imageio-ffmpeg 'gdown==5.2.0'",
        "mkdir -p /opt/rfpp/experiments/pretrained_models/lpips /opt/rfpp/experiments/pretrained_models /opt/rfpp/facexlib-weights",
        "curl -fL https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth -o /opt/rfpp/facexlib-weights/detection_Resnet50_Final.pth",
        "curl -fL https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth -o /opt/rfpp/facexlib-weights/parsing_parsenet.pth",
    )
    .run_commands(
        "git init /opt/rfpp && cd /opt/rfpp && git remote add origin https://github.com/wzhouxiff/RestoreFormerPlusPlus.git && git fetch --depth 1 origin 59d250f45d6b11a3e620d62e6e067ca1288f93a9 && git checkout --detach FETCH_HEAD",
    )
    .workdir("/opt/rfpp")
    .add_local_file(MODEL_LOCK, "/opt/restoreformer-models.lock.json", copy=True)
    .add_local_file(MODEL_FETCHER, "/opt/fetch_pinned_weights.py", copy=True)
    .run_commands("python /opt/fetch_pinned_weights.py")
)

commercial_auth = modal.Secret.from_name(AUTH_SECRET_NAME)


def _motion_args(profile: str) -> list[str]:
    profile = str(profile or "balanced").strip().lower()
    if profile == "balanced":
        return [
            "--driving_option", "expression-friendly",
            "--driving_multiplier", "0.60",
            "--animation_region", "all",
            "--driving_smooth_observation_variance", "5e-7",
        ]
    if profile == "low":
        return [
            "--driving_option", "expression-friendly",
            "--driving_multiplier", "0.35",
            "--animation_region", "pose",
            "--driving_smooth_observation_variance", "1e-6",
        ]
    if profile == "medium":
        return [
            "--driving_option", "expression-friendly",
            "--driving_multiplier", "0.45",
            "--animation_region", "all",
            "--driving_smooth_observation_variance", "8e-7",
        ]
    if profile == "blink":
        return [
            "--driving_option", "expression-friendly",
            # Keep the production blink profile and its eyes-only region, but
            # soften horizontal eye excursion. MuseTalk still owns the mouth
            # stage; this change must not alter lip-sync or face framing.
            "--driving_multiplier", "0.45",
            "--animation_region", "eyes",
            "--driving_smooth_observation_variance", "1e-6",
        ]
    if profile == "blink-soft":
        return [
            "--driving_option", "expression-friendly",
            "--driving_multiplier", "0.45",
            "--animation_region", "eyes",
            "--driving_smooth_observation_variance", "1e-6",
        ]
    if profile == "blink-closed-soft-gaze":
        return [
            "--driving_option", "expression-friendly",
            # Eye retargeting consumes the driving eyelid-close ratio instead
            # of the raw gaze expression. The higher multiplier strengthens
            # closure while avoiding the previous lateral eye excursion.
            "--driving_multiplier", "0.60",
            "--animation_region", "eyes",
            "--flag_eye_retargeting",
            # Reintroduce only a very small amount of horizontal gaze after
            # retargeting has restored full eyelid closure.
            "--eye_gaze_blend", "0.40",
            "--driving_smooth_observation_variance", "1e-6",
        ]
    if profile == "natural":
        return [
            "--driving_option", "expression-friendly",
            "--driving_multiplier", "0.45",
            "--animation_region", "all",
            "--flag_eye_retargeting",
            "--driving_smooth_observation_variance", "8e-7",
        ]
    if profile == "static":
        return []
    raise ValueError("motion_profile must be balanced, natural, medium, low, blink, blink-soft, blink-closed-soft-gaze, or static")


@app.function(image=lp_image, gpu=GPU_PREFERENCE, timeout=900, scaledown_window=60, max_containers=1)
def upstream_liveportrait(image_bytes: bytes, image_suffix: str = ".png", motion_profile: str = "balanced") -> dict:
    import glob
    import subprocess
    import tempfile
    import time

    work = tempfile.mkdtemp(prefix="commercial_eval_lp_", dir="/tmp")
    source = os.path.join(work, "source" + image_suffix)
    with open(source, "wb") as stream:
        stream.write(image_bytes)
    driving = sorted(glob.glob("/opt/LivePortrait/assets/examples/driving/*.mp4"))[0]
    output_dir = os.path.join(work, "out")
    command = ["python", "inference.py", "-s", source, "-d", driving, "--output-dir", output_dir] + _motion_args(motion_profile)
    started = time.time()
    result = subprocess.run(command, cwd="/opt/LivePortrait", capture_output=True, text=True)
    videos = [path for path in glob.glob(output_dir + "/**/*.mp4", recursive=True) if "concat" not in os.path.basename(path).lower()]
    if result.returncode != 0 or not videos:
        raise RuntimeError("upstream LivePortrait failed: " + result.stderr[-1200:])
    normalized = os.path.join(work, "liveportrait-25fps.mp4")
    subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-i", videos[0], "-r", "25", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", normalized],
        check=True,
        capture_output=True,
        text=True,
    )
    with open(normalized, "rb") as stream:
        payload = stream.read()
    return {"video": payload, "elapsedSec": round(time.time() - started, 2), "bytes": len(payload)}


@app.function(image=mt_image, gpu=GPU_PREFERENCE, timeout=900, scaledown_window=60, max_containers=1)
def upstream_musetalk(video_bytes: bytes, audio_bytes: bytes, bbox_shift: int = 0, parsing_mode: str = "jaw") -> dict:
    import glob
    import subprocess
    import tempfile
    import time

    if bbox_shift < -12 or bbox_shift > 12:
        raise ValueError("bbox_shift must be within -12..12")
    if parsing_mode not in ("jaw", "raw"):
        raise ValueError("parsing_mode must be jaw or raw")
    work = tempfile.mkdtemp(prefix="commercial_eval_mt_", dir="/tmp")
    video = os.path.join(work, "motion.mp4")
    audio = os.path.join(work, "narration.wav")
    with open(video, "wb") as stream:
        stream.write(video_bytes)
    with open(audio, "wb") as stream:
        stream.write(audio_bytes)
    config = os.path.join(work, "task.yaml")
    with open(config, "w", encoding="utf-8") as stream:
        stream.write(f"task_0:\n  video_path: {video}\n  audio_path: {audio}\n")
    result_dir = os.path.join(work, "results")
    command = [
        "python", "-m", "scripts.inference",
        "--inference_config", config,
        "--result_dir", result_dir,
        "--unet_model_path", "./models/musetalkV15/unet.pth",
        "--unet_config", "./models/musetalkV15/musetalk.json",
        "--version", "v15",
        "--fps", "25",
        "--bbox_shift", str(bbox_shift),
        "--parsing_mode", parsing_mode,
    ]
    environment = {**os.environ, "PATH": "/usr/bin:" + os.environ.get("PATH", "")}
    started = time.time()
    result = subprocess.run(command, cwd="/opt/MuseTalk", env=environment, capture_output=True, text=True)
    candidates = []
    for path in glob.glob(result_dir + "/**/*.mp4", recursive=True):
        name = os.path.basename(path).lower()
        if "temp" not in name and "concat" not in name:
            candidates.append(path)
    if result.returncode != 0 or not candidates:
        raise RuntimeError("upstream MuseTalk failed: " + result.stderr[-1600:])
    output = sorted(candidates)[0]
    with open(output, "rb") as stream:
        payload = stream.read()
    return {"video": payload, "elapsedSec": round(time.time() - started, 2), "bytes": len(payload)}


@app.function(image=rf_image, gpu=GPU_PREFERENCE, timeout=1200, scaledown_window=60, max_containers=4)
def restoreformer_pp(video_bytes: bytes) -> dict:
    """Apply the selected RestoreFormer++ face-restoration stage only.

    The original audio and frame cadence are preserved.  No Real-ESRGAN,
    GFPGAN, background upsampler, alpha compositor, or second enhancement
    stage is invoked in the production path.
    """
    import glob
    import os
    import shutil
    import subprocess
    import sys
    import tempfile
    import time
    import types
    from pathlib import Path

    import cv2
    import torch

    # BasicSR 1.4.2 imports a torchvision module removed by modern torchvision.
    import torchvision.transforms.functional as tv_functional
    functional_tensor = types.ModuleType("torchvision.transforms.functional_tensor")
    functional_tensor.rgb_to_grayscale = tv_functional.rgb_to_grayscale
    sys.modules["torchvision.transforms.functional_tensor"] = functional_tensor

    import facexlib
    from RestoreFormer.RestoreFormer import RestoreFormer

    weights_dir = Path(facexlib.__file__).resolve().parent / "weights"
    weights_dir.mkdir(parents=True, exist_ok=True)
    for name in ("detection_Resnet50_Final.pth", "parsing_parsenet.pth"):
        source_weight = Path("/opt/rfpp/facexlib-weights") / name
        target_weight = weights_dir / name
        if source_weight.is_file() and not target_weight.is_file():
            shutil.copy2(source_weight, target_weight)

    work = Path(tempfile.mkdtemp(prefix="commercial_restoreformer_", dir="/tmp"))
    source = work / "input.mp4"
    source.write_bytes(video_bytes)
    frames = work / "frames"
    restored = work / "restored"
    frames.mkdir()
    restored.mkdir()
    subprocess.run(["ffmpeg", "-y", "-i", str(source), "-q:v", "2", str(frames / "%06d.png")], check=True, capture_output=True)
    frame_paths = sorted(frames.glob("*.png"))
    if not frame_paths:
        raise RuntimeError("RestoreFormer++ received a video with no decodable frames")
    first = cv2.imread(str(frame_paths[0]), cv2.IMREAD_COLOR)
    if first is None:
        raise RuntimeError("RestoreFormer++ could not decode the first frame")
    height, width = first.shape[:2]
    started = time.time()
    restorer = RestoreFormer(
        model_path="/opt/rfpp/experiments/pretrained_models/RestoreFormer++.ckpt",
        upscale=1,
        arch="RestoreFormer++",
        bg_upsampler=None,
        device=torch.device("cuda"),
    )
    for frame_path in frame_paths:
        image = cv2.imread(str(frame_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"RestoreFormer++ could not decode {frame_path.name}")
        _, _, output = restorer.enhance(image, has_aligned=False, only_center_face=True, paste_back=True)
        if output is None:
            output = image
        if output.shape[1] != width or output.shape[0] != height:
            output = cv2.resize(output, (width, height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(restored / frame_path.name), output)

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(source)],
        check=True,
        capture_output=True,
        text=True,
    )
    fps = probe.stdout.strip() or "25/1"
    silent = work / "restored-silent.mp4"
    output = work / "restored.mp4"
    subprocess.run(["ffmpeg", "-y", "-framerate", fps, "-i", str(restored / "%06d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", str(silent)], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-y", "-i", str(silent), "-i", str(source), "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-shortest", str(output)], check=True, capture_output=True)
    payload = output.read_bytes()
    return {
        "video": payload,
        "elapsedSec": round(time.time() - started, 2),
        "bytes": len(payload),
        "frames": len(frame_paths),
        "width": width,
        "height": height,
        "fps": fps,
        "restoration": "restoreformer++",
    }


def _positive_stage_seconds(value):
    import math
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError("Stage timing must be finite and positive")
    return float(value)


def _restoration_segment_usage(results, expected_count):
    """Sum actual GPU-stage observations; reject incomplete restoration."""
    if isinstance(expected_count, bool) or not isinstance(expected_count, int) or expected_count < 1 or len(results) != expected_count:
        raise ValueError("Restoration segment coverage is incomplete")
    seconds = []
    for result in results:
        if not isinstance(result, dict) or not isinstance(result.get("video"), bytes) or not result["video"]:
            raise ValueError("Restoration segment output is missing")
        seconds.append(_positive_stage_seconds(result.get("elapsedSec")))
    return _positive_stage_seconds(sum(seconds))


def _commercial_usage_headers(lp, mt, enhanced):
    base = _positive_stage_seconds(lp.get("elapsedSec")) + _positive_stage_seconds(mt.get("elapsedSec"))
    restoration = _positive_stage_seconds(enhanced.get("gpuSeconds"))
    count = enhanced.get("segments")
    completed = enhanced.get("segmentsCompleted")
    if isinstance(count, bool) or not isinstance(count, int) or count < 1 or isinstance(completed, bool) or not isinstance(completed, int) or completed != count:
        raise ValueError("Restoration segment coverage is incomplete")
    return {
        "X-Gpu-Seconds": str(round(base, 3)),
        "X-Total-Gpu-Seconds": str(round(base + restoration, 3)),
        "X-Gpu-Seconds-Scope": "full-pipeline",
        "X-RestoreFormer-Seconds": str(round(restoration, 3)),
        "X-RestoreFormer-Segments": str(count),
        "X-RestoreFormer-Segments-Completed": str(completed),
    }


def restoreformer_pp_segmented(video_bytes: bytes, segment_seconds: int = 45) -> dict:
    """Restore long videos in parallel segments without changing frame quality.

    RestoreFormer++ is intentionally kept as the only enhancement stage. A
    three-minute clip contains thousands of frames; running one function call
    serially exceeds the 15-minute Cloud Run request ceiling. Segmentation
    keeps every frame enhanced while allowing Modal to run up to four chunks
    concurrently, then reassembles the original stream order and audio.
    """
    import glob
    import subprocess
    import tempfile
    import time
    from pathlib import Path

    started = time.time()
    work = Path(tempfile.mkdtemp(prefix="commercial_restoreformer_segments_", dir="/tmp"))
    source = work / "input.mp4"
    source.write_bytes(video_bytes)
    segments = work / "segments"
    segments.mkdir()
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(source), "-map", "0", "-c", "copy", "-f", "segment",
         "-segment_time", str(int(segment_seconds)), "-reset_timestamps", "1", str(segments / "segment-%03d.mp4")],
        check=True, capture_output=True,
    )
    segment_paths = sorted(Path(p) for p in glob.glob(str(segments / "segment-*.mp4")))
    if not segment_paths:
        raise RuntimeError("RestoreFormer++ could not segment the input video")
    calls = [restoreformer_pp.spawn(segment.read_bytes()) for segment in segment_paths]
    results = [call.get() for call in calls]
    # Parallel coordinator wall time is not GPU usage: sum every actual stage.
    gpu_seconds = _restoration_segment_usage(results, len(segment_paths))
    restored_paths = []
    for index, result in enumerate(results):
        restored_path = work / f"restored-{index:03d}.mp4"
        restored_path.write_bytes(result["video"])
        restored_paths.append(restored_path)
    concat = work / "concat.txt"
    concat.write_text("".join(f"file '{p.as_posix()}'\n" for p in restored_paths), encoding="utf-8")
    output = work / "restored.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(output)],
        check=True, capture_output=True,
    )
    payload = output.read_bytes()
    return {
        "video": payload,
        "coordinatorElapsedSec": round(time.time() - started, 2),
        "gpuSeconds": gpu_seconds,
        "bytes": len(payload),
        "segments": len(segment_paths),
        "segmentsCompleted": len(results),
        "segmentSeconds": int(segment_seconds),
        "restoration": "restoreformer++",
    }


# Coordination performs authentication, multipart I/O and remote GPU calls only.
# Reserve GPUs on the three rendering stages, never while their caller waits.
@app.function(image=lp_image, cpu=1, memory=1024, timeout=1200, scaledown_window=60, max_containers=1, secrets=[commercial_auth])
@modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL)
async def lipsync(request: "Request"):
    """Authenticated production candidate endpoint for the upstream commercial lane.

    This endpoint deliberately exposes only the generic multipart worker contract.
    Feature qualification requires six independently authenticated billing
    workspaces and reviewed media canaries. Every restoration segment must
    complete with valid measured usage; this coordinator performs no local GPU
    inference.
    """
    import os
    import time
    import uuid
    from fastapi import HTTPException, Response

    expected = str(os.environ.get("BETTERPPTX_COMMERCIAL_AVATAR_ENDPOINT_TOKEN", "")).strip()
    supplied = str(request.headers.get("authorization", ""))
    if not expected or supplied != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")
    form = await request.form()
    image = form.get("image")
    audio = form.get("audio")
    if image is None or audio is None or not hasattr(image, "read") or not hasattr(audio, "read"):
        raise HTTPException(status_code=400, detail="image and audio are required")
    image_bytes = await image.read()
    audio_bytes = await audio.read()
    if not image_bytes or not audio_bytes:
        raise HTTPException(status_code=400, detail="image and audio must be non-empty")
    motion_profile = str(form.get("motionProfile") or "low").strip().lower()
    if motion_profile not in {"low", "balanced", "natural", "medium", "blink", "blink-soft", "blink-closed-soft-gaze", "static"}:
        raise HTTPException(status_code=400, detail="unsupported motion profile")
    bbox_shift = int(str(form.get("bboxShift") or "0"))
    parsing_mode = str(form.get("parsingMode") or "jaw").strip().lower()
    if parsing_mode not in {"jaw", "raw"}:
        raise HTTPException(status_code=400, detail="unsupported parsing mode")
    # The commercial production lane uses the modestly stronger jaw treatment
    # by default. Explicit raw/jaw requests remain supported for controlled
    # comparisons and rollback.
    requested_mouth_profile = form.get("mouthProfile")
    mouth_profile = str(requested_mouth_profile if requested_mouth_profile is not None else ("raw" if parsing_mode == "raw" else "jaw-strong")).strip().lower()
    if mouth_profile in {"default", "jaw"}:
        mouth_profile = "jaw" if parsing_mode == "jaw" else "raw"
    elif mouth_profile in {"jaw-strong", "strong", "enhanced"}:
        if parsing_mode != "jaw":
            raise HTTPException(status_code=400, detail="jaw-strong requires jaw parsing")
        if bbox_shift > 11:
            raise HTTPException(status_code=400, detail="jaw-strong bbox shift exceeds supported range")
        bbox_shift += 1
        mouth_profile = "jaw-strong"
    elif mouth_profile in {"raw", "tight", "tight-mouth"}:
        parsing_mode = "raw"
        mouth_profile = "raw"
    else:
        raise HTTPException(status_code=400, detail="unsupported mouth profile")
    started = time.time()
    try:
        lp = upstream_liveportrait.remote(image_bytes, ".png", motion_profile)
        mt = upstream_musetalk.remote(lp["video"], audio_bytes, bbox_shift, parsing_mode)
        # Keep RestoreFormer++ as the sole enhancement stage. Short, per-slide
        # narration clips use the proven direct Modal function; spawning the
        # segmented coordinator for a single sub-45-second segment adds failure
        # surface with no latency benefit. Long-form videos still parallelize
        # into 45-second restoration segments.
        requested_duration_ms = int(str(form.get("durationMs") or "0"))
        if 0 < requested_duration_ms <= 45_000:
            enhanced = restoreformer_pp.remote(mt["video"])
            enhanced["gpuSeconds"] = _restoration_segment_usage([enhanced], 1)
            enhanced["segments"] = 1
            enhanced["segmentsCompleted"] = 1
            enhanced["segmentSeconds"] = 45
        else:
            enhanced = restoreformer_pp_segmented(mt["video"], segment_seconds=45)
        usage_headers = _commercial_usage_headers(lp, mt, enhanced)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="commercial avatar worker failed") from exc
    elapsed = round(time.time() - started, 3)
    execution_id = str(uuid.uuid4())
    headers = {
        "X-Pipeline": "liveportrait-musetalk-commercial-restoreformer-pp",
        "X-Enhancement": "restoreformer++",
        "X-Motion-Profile": motion_profile,
        "X-Mouth-Profile": mouth_profile,
        "X-Mouth-Parsing-Mode": parsing_mode,
        "X-Gpu-Type": "A10G",
        "X-Render-Seconds": str(round(float(form.get("durationMs") or 0) / 1000, 3)),
        "X-Provider-Execution-Ids": execution_id,
        "X-Idempotency-State": "completed",
        "Cache-Control": "no-store",
    }
    headers.update(usage_headers)
    return Response(content=enhanced["video"], media_type="video/mp4", headers=headers)


health_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]==0.115.6")


@app.function(image=health_image, cpu=0.125, memory=128, timeout=30, scaledown_window=10, max_containers=2, secrets=[commercial_auth])
@modal.fastapi_endpoint(method="GET", label=HEALTH_LABEL)
async def health(request: "Request"):
    """CPU-only liveness and auth check; never starts a GPU stage.

    Returns the worker build and whether the endpoint token is configured. With a bearer
    token it also reports whether that token is the configured one (constant-time compare).
    No secret, account id, or provider internal is returned.
    """
    import hmac
    import os

    expected = str(os.environ.get("BETTERPPTX_COMMERCIAL_AVATAR_ENDPOINT_TOKEN", "")).strip()
    supplied = str(request.headers.get("authorization", ""))
    body = {"ok": True, "service": "betterpptx-avatar-worker", "build": WORKER_BUILD, "gpu": False, "authConfigured": bool(expected)}
    if supplied:
        body["authorized"] = bool(expected) and hmac.compare_digest(supplied.encode(), f"Bearer {expected}".encode())
    return body


@app.local_entrypoint()
def main(
    image_path: str,
    audio_path: str,
    output_path: str,
    bbox_shift: int = 0,
    parsing_mode: str = "jaw",
    motion_profile: str = "balanced",
    mouth_profile: str = "jaw-strong",
    detector_lane: str = "upstream",
    parser_lane: str = "upstream",
    safe_worker_app: str = "svc-e3b56934",
    safe_mouth_profile: str = "default",
):
    from pathlib import Path
    import json
    import time

    image_file = Path(image_path).resolve()
    audio_file = Path(audio_path).resolve()
    output_file = Path(output_path).resolve()
    if not image_file.is_file() or not audio_file.is_file():
        raise FileNotFoundError("image_path and audio_path must exist")
    detector_lane = str(detector_lane).strip().lower()
    parser_lane = str(parser_lane).strip().lower()
    mouth_profile = str(mouth_profile).strip().lower()
    if detector_lane not in ("upstream", "resale-safe"):
        raise ValueError("detector_lane must be upstream or resale-safe")
    if parser_lane not in ("upstream", "resale-safe"):
        raise ValueError("parser_lane must be upstream or resale-safe")
    if mouth_profile in ("default", "jaw"):
        mouth_profile = "jaw" if parsing_mode == "jaw" else "raw"
    elif mouth_profile in ("jaw-strong", "strong", "enhanced"):
        if parsing_mode != "jaw":
            raise ValueError("jaw-strong requires jaw parsing")
        if bbox_shift > 11:
            raise ValueError("jaw-strong bbox shift exceeds supported range")
        bbox_shift += 1
        mouth_profile = "jaw-strong"
    elif mouth_profile in ("raw", "tight", "tight-mouth"):
        parsing_mode = "raw"
        mouth_profile = "raw"
    else:
        raise ValueError("unsupported mouth profile")
    started = time.time()
    image_bytes = image_file.read_bytes()
    audio_bytes = audio_file.read_bytes()
    if detector_lane == "upstream":
        lp = upstream_liveportrait.remote(image_bytes, image_file.suffix or ".png", motion_profile)
        motion_video = lp["video"]
        liveportrait_elapsed = lp["elapsedSec"]
    else:
        safe_lp = modal.Function.from_name(safe_worker_app, "lp_animate")
        lp_started = time.time()
        motion_video = safe_lp.remote(image_bytes, image_file.name, motion_profile)
        liveportrait_elapsed = round(time.time() - lp_started, 2)

    if parser_lane == "upstream":
        mt = upstream_musetalk.remote(motion_video, audio_bytes, bbox_shift, parsing_mode)
        # The local entrypoint renders one short slide clip at a time, so a
        # single remote RestoreFormer++ call is sufficient. The segmented
        # helper is intentionally reserved for the long-video HTTP path and is
        # a plain coordinator function, not a Modal Function handle.
        enhanced = restoreformer_pp.remote(mt["video"])
        output_video = enhanced["video"]
        musetalk_elapsed = mt["elapsedSec"]
        output_bytes = enhanced["bytes"]
    else:
        safe_mt = modal.Function.from_name(safe_worker_app, "mt_render")
        mt = safe_mt.remote(
            motion_video,
            "motion.mp4",
            audio_bytes,
            audio_file.name,
            safe_mouth_profile,
        )
        if not mt.get("ok"):
            raise RuntimeError("resale-safe MuseTalk stage failed: " + str(mt.get("detail") or mt))
        output_video = mt["mp4"]
        musetalk_elapsed = mt["elapsedSec"]
        output_bytes = mt["bytes"]
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_bytes(output_video)
    report = {
        "lane": "commercial-production-candidate",
        "releaseAllowed": False,
        "image": str(image_file),
        "audio": str(audio_file),
        "output": str(output_file),
        "motionProfile": motion_profile,
        "mouthProfile": mouth_profile,
        "enhancement": "restoreformer++" if parser_lane == "upstream" else "resale-safe-worker-output",
        "detectorLane": detector_lane,
        "parserLane": parser_lane,
        "safeWorkerApp": safe_worker_app if "resale-safe" in (detector_lane, parser_lane) else None,
        "safeMouthProfile": safe_mouth_profile if parser_lane == "resale-safe" else None,
        "bboxShift": bbox_shift,
        "parsingMode": parsing_mode,
        "livePortraitElapsedSec": liveportrait_elapsed,
        "museTalkElapsedSec": musetalk_elapsed,
        "restoreFormerElapsedSec": enhanced["elapsedSec"] if parser_lane == "upstream" else None,
        "wallElapsedSec": round(time.time() - started, 2),
        "outputBytes": output_bytes,
        "pins": {
            "livePortraitCommit": LIVEPORTRAIT_REPO_COMMIT,
            "livePortraitModelRevision": LIVEPORTRAIT_MODEL_REVISION,
            "museTalkCommit": MUSE_REPO_COMMIT,
            "museTalkModelRevision": MUSE_MODEL_REVISION,
        },
    }
    report_file = output_file.with_suffix(".json")
    report_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


@app.local_entrypoint(name="matrix")
def matrix(
    image_path: str,
    audio_path: str,
    output_dir: str,
    motion_profile: str = "natural",
    bbox_shift: int = 0,
    parsing_mode: str = "jaw",
    safe_worker_app: str = "svc-e3b56934",
    safe_mouth_profile: str = "default",
):
    """Render the one-swap-at-a-time detector/parser comparison matrix.

    The all-upstream reference is intentionally not regenerated here.  The
    matrix produces the three required substitutions from the same source,
    audio, motion profile and encoder settings.
    """
    from pathlib import Path
    import json
    import time

    image_file = Path(image_path).resolve()
    audio_file = Path(audio_path).resolve()
    target = Path(output_dir).resolve()
    if not image_file.is_file() or not audio_file.is_file():
        raise FileNotFoundError("image_path and audio_path must exist")
    target.mkdir(parents=True, exist_ok=True)
    image_bytes = image_file.read_bytes()
    audio_bytes = audio_file.read_bytes()
    safe_lp = modal.Function.from_name(safe_worker_app, "lp_animate")
    safe_mt = modal.Function.from_name(safe_worker_app, "mt_render")

    started = time.time()
    upstream_lp_call = upstream_liveportrait.spawn(image_bytes, image_file.suffix or ".png", motion_profile)
    safe_lp_call = safe_lp.spawn(image_bytes, image_file.name, motion_profile)
    upstream_lp_result = upstream_lp_call.get()
    safe_lp_video = safe_lp_call.get()

    jobs = {
        "01-yunet-only": upstream_musetalk.spawn(safe_lp_video, audio_bytes, bbox_shift, parsing_mode),
        "02-mediapipe-only": safe_mt.spawn(
            upstream_lp_result["video"], "motion.mp4", audio_bytes, audio_file.name, safe_mouth_profile
        ),
        "03-yunet-mediapipe": safe_mt.spawn(
            safe_lp_video, "motion.mp4", audio_bytes, audio_file.name, safe_mouth_profile
        ),
    }
    rows = []
    for name, call in jobs.items():
        result = call.get()
        if name == "01-yunet-only":
            payload = result["video"]
            elapsed = result["elapsedSec"]
        else:
            if not result.get("ok"):
                raise RuntimeError(name + " failed: " + str(result.get("detail") or result))
            payload = result["mp4"]
            elapsed = result["elapsedSec"]
        output = target / f"{name}.mp4"
        output.write_bytes(payload)
        rows.append({"id": name, "output": str(output), "bytes": len(payload), "museTalkElapsedSec": elapsed})

    report = {
        "schemaVersion": "betterpptx.avatar.detector-parser-ab.v1",
        "lane": "owner-only-controlled-license-substitution",
        "releaseAllowed": False,
        "image": str(image_file),
        "audio": str(audio_file),
        "motionProfile": motion_profile,
        "bboxShift": bbox_shift,
        "upstreamParsingMode": parsing_mode,
        "safeMouthProfile": safe_mouth_profile,
        "rows": rows,
        "wallElapsedSec": round(time.time() - started, 2),
        "interpretation": {
            "01-yunet-only": "YuNet replaces InsightFace; upstream BiSeNet remains.",
            "02-mediapipe-only": "MediaPipe geometry compositor replaces BiSeNet; upstream InsightFace remains.",
            "03-yunet-mediapipe": "Both restricted detector/parser components are replaced.",
        },
    }
    report_file = target / "detector-parser-ab-report.json"
    report_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
