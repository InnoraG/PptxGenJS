# BetterPPTX rigged-3D worker — self-hosted TRELLIS.2 (image→mesh) + DRTK permissive export + UniRig
# (auto-rig) on Modal, scale-to-zero L40S. This worker is PoC/flow-test only; production personalized
# native 3D is exclusively Meshy → Mixamo and is enforced at the product route guard.
#
# PIPELINE (image → animation-ready GLB):
#   [image bytes] --Generator(TRELLIS.2)--> [static textured GLB] --Rigger(UniRig)--> [rigged GLB]
# One Modal App, TWO GPU classes each with its OWN image (their CUDA stacks conflict — TRELLIS.2
# needs torch 2.6/cu124 + flash-attn/cumesh/flexgemm custom kernels; UniRig needs its own
# spconv/torch_scatter/flash-attn build), chained by a CPU pipeline function. Isolating the images is
# what makes the app BUILD; each class scales to zero independently.
#
# UPSTREAM LICENSE NOTE (permissive PoC path): TRELLIS.2 (microsoft/TRELLIS.2-4B) and UniRig (VAST-AI/UniRig) are both
# MIT — code AND weights. BUT TRELLIS.2's stock GLB export (o_voxel.postprocess.to_glb) bakes textures with
# NVIDIA nvdiffrast/nvdiffrec, which are NVIDIA Source Code License ("1-Way Commercial" = only NVIDIA may
# use commercially). Selling avatars baked by nvdiffrast is outside that grant → we do NOT install it. The
# image builds cumesh/o-voxel/flexgemm (all MIT) but NOT nvdiffrast/nvdiffrec; a tiny in-house stub
# (nvdiffrast_stub/) satisfies o_voxel's `import nvdiffrast.torch` so the load succeeds, and our export
# (_export_glb_vertexcolor) skips the rasterized bake entirely — it samples color at the mesh VERTICES via
# flex_gemm.grid_sample_3d (MIT) and writes a vertex-colored GLB. Result: no NVIDIA-licensed code present,
# so generated avatars are cleanly resale-safe (same class as the Apache-2.0 Flux images). Both repos PINNED.
#
# COLD-START: unlike flux_app.py (plain @modal.enter, reloads weights to GPU every cold start), each GPU
# class here uses Modal memory snapshot — @modal.enter(snap=True) loads weights to CPU RAM (the snapshot
# captures the heavy imports + deserialized weights), @modal.enter(snap=False) moves them to CUDA on
# restore. Cold start drops from a full model load to a snapshot restore + host->device copy.
#
# LONG-JOB CONTRACT (spawn + poll): a rigged-3D job runs for minutes, but a Modal @fastapi_endpoint hard-
# caps a single HTTP response at ~150s (past that it 303-redirects to a poll URL). Rather than fight the
# redirect chain, the endpoint is SUBMIT/POLL: POST {image,...} spawns the pipeline and returns a jobId
# immediately; POST {jobId} polls and returns the GLB when ready. Every HTTP call is fast (<150s).
#
# HTTP contract (POST JSON, single endpoint, two modes):
#   submit: { "token", "image": "<b64>", "rig": true, "perform": false,
#             "quality": "ppt-lite"|"standard", "seed": 123,
#             "empirical_clip_timelines": {"probe":{...},"timelines":{"0".."17":[[videoMs,xIn,yIn],...]}} }
#             # timelines must contain exactly IDs 0..17; each slot needs >=5 numeric samples
#             # with monotonically ordered videoMs values (missing/extra/unordered slots fail closed)
#             # perform=true requires the final baked GLB's PowerPoint-oracle timeline manifest (implies rig)
#           -> { "status": "pending", "jobId": "<id>" }
#   poll:   { "token", "jobId": "<id>" }
#           -> { "status": "pending", "jobId" }  (still running)
#           -> { "status": "done", "glb": "<b64 GLB>", "glbBytes", "rigged", "performed", "model", "gpuSeconds",
#                "genSeconds", "rigSeconds", "bakeSeconds", "coldStart", "gpuType", "meshResolution",
#                # when performed: "manifest", "clipMap", "tier", "confidence" }
import base64
import hashlib
import json
import math
import os
import time

import modal

APP_NAME = "betterpptx-model3d"

# Directory of THIS file (deploy-time, on the deploying machine) — used to add the in-house nvdiffrast
# stub package into the TRELLIS image by absolute path, so `modal deploy` works from any CWD.
_HERE = os.path.dirname(os.path.abspath(__file__))
_NVDIFFRAST_STUB_DIR = os.path.join(_HERE, "nvdiffrast_stub")
_NVDIFFRAST_DRTK_DIR = os.path.join(_HERE, "nvdiffrast_drtk")  # DRTK-backed (MIT) resale-safe nvdiffrast shim
_GENERATED_FILE_IGNORE = ["**/__pycache__/**", "**/*.pyc", "**/*.pyo"]

def _pinned_git_ref(env_name: str, default: str) -> str:
    """Return a commit-pinned upstream ref; moving branch names fail closed."""
    ref = (os.environ.get(env_name) or default).strip()
    if len(ref) != 40 or any(char not in "0123456789abcdefABCDEF" for char in ref):
        raise RuntimeError(f"{env_name} must be an exact 40-character commit SHA")
    return ref

def _pinned_hf_revision(env_name: str, default: str) -> str:
    """Return an immutable Hugging Face snapshot revision."""
    return _pinned_git_ref(env_name, default)

# These defaults are the reviewed upstream commits used by the current worker source.
# Operators may select another exact commit, but cannot silently deploy a moving branch.
DRTK_GIT_REF = _pinned_git_ref("DRTK_GIT_REF", "01f9d76f26af04836b813c71c979af64e67741e2")
_CANONICAL_DIR = os.path.join(_HERE, "canonical")  # canonical_skeleton.json + canonical-clipmap.json
_BAKE_DIR = os.path.join(_HERE, "bake")            # Blender scripts (run via subprocess, never `import bpy`)
_MOCAP_DIR = os.path.join(_HERE, "mocap")          # staged Mixamo FBX / CMU BVH (gitignored, build-time only)
# Pinned Blender LTS tarball for the presenter clip-baker (headless retarget + glTF bake). Subprocess-only.
BLENDER_VERSION = "4.2.13"
BLENDER_URL = f"https://download.blender.org/release/Blender4.2/blender-{BLENDER_VERSION}-linux-x64.tar.xz"

# TRELLIS.2 (image→3D). MIT. 4B params; >=24GB VRAM (L40S 48GB fits). torch 2.6 / CUDA 12.4.
TRELLIS_MODEL_ID = "microsoft/TRELLIS.2-4B"
# TRELLIS.2's image encoder — Meta DINOv3, a GATED HF repo pulled at load time (NOT part of the TRELLIS.2-4B
# repo). Resale-SAFE: the DINOv3 License permits commercial use + commercial use of outputs, NO MAU cap — but
# REQUIRES a "Built with DINOv3" attribution (rides the deck's license manifest). Access needs a HF token whose
# account accepted the gate (Modal secret `huggingface-token` → HF_TOKEN); pre-downloaded to the Volume below.
DINOV3_MODEL_ID = "facebook/dinov3-vitl16-pretrain-lvd1689m"
# Sparse-structure decoder — TRELLIS.2 pulls `ss_dec_conv3d_16l8_fp16` cross-repo from the v1 repo. MIT.
TRELLIS_SS_DECODER_ID = "microsoft/TRELLIS-image-large"
# Background-removal — TRELLIS.2's pipeline.json overrides its bundled BiRefNet rembg class to briaai/RMBG-2.0
# (CC-BY-NC-4.0, commercial = paid BRIA agreement → resale-BLOCKED). We force the class back to its OWN MIT
# default (ZhengPeng7/BiRefNet) at load (monkeypatch in Generator.load), so the NC model is never constructed.
BIREFNET_ID = "ZhengPeng7/BiRefNet"
# UniRig (auto-rig). MIT (code + weights). torch>=2.3.1; only ~8GB VRAM.
UNIRIG_MODEL_ID = "VAST-AI/UniRig"
# Every model snapshot is pinned independently of its repository/code commit.
TRELLIS_MODEL_REVISION = _pinned_hf_revision("TRELLIS_MODEL_REVISION", "af44b45f2e35a493886929c6d786e563ec68364d")
TRELLIS_SS_DECODER_REVISION = _pinned_hf_revision("TRELLIS_SS_DECODER_REVISION", "25e0d31ffbebe4b5a97464dd851910efc3002d96")
DINOV3_MODEL_REVISION = _pinned_hf_revision("DINOV3_MODEL_REVISION", "ea8dc2863c51be0a264bab82070e3e8836b02d51")
BIREFNET_MODEL_REVISION = _pinned_hf_revision("BIREFNET_MODEL_REVISION", "e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4")
UNIRIG_MODEL_REVISION = _pinned_hf_revision("UNIRIG_MODEL_REVISION", "36842e2b5947e9e60f89275b83208c8e74071c63")
# Upstream clones are commit-pinned. A moving branch would make the supposedly immutable
# Modal revision non-reproducible and is rejected before the image graph is built.
TRELLIS_GIT_REF = _pinned_git_ref("TRELLIS_GIT_REF", "75fbf0183001ed9876c8dbb35de6b68552ee08bd")
UNIRIG_GIT_REF = _pinned_git_ref("UNIRIG_GIT_REF", "6793c6640ff01c8fb389f3993434124bb43d2933")

CACHE_DIR = "/cache"  # HF_HOME on both classes → weights persist on the Volume across cold starts

# OBFUSCATED endpoint label → https://<workspace>--<label>.modal.run (black-box doctrine; the URL must
# not reveal it's a 3D/model worker). Set MODEL3D_ENDPOINT_LABEL to a per-profile OPAQUE token and keep
# it STABLE across redeploys so the URL (stored in the credential store) doesn't change. Read at deploy
# time from the LOCAL env (Modal builds the app graph on the deploying machine).
MODEL3D_ENDPOINT_LABEL = (os.environ.get("MODEL3D_ENDPOINT_LABEL") or "").strip() or "d4b17e60"
# Separate opaque health endpoint label. Modal's fastapi_endpoint exposes one
# handler per Web Function; keep health independent from POST submit/poll so a
# GET probe can never enter the generation path.
MODEL3D_HEALTH_ENDPOINT_LABEL = (os.environ.get("MODEL3D_HEALTH_ENDPOINT_LABEL") or "").strip() or "d4b17e60a"
MODEL3D_DEPLOYMENT_REVISION = (os.environ.get("MODEL3D_DEPLOYMENT_REVISION") or "").strip()
MODEL3D_SOURCE_DIGEST = (os.environ.get("MODEL3D_SOURCE_DIGEST") or "").strip().upper()

# GPU — the RUNTIME classes take a FALLBACK LIST (Modal tries in order): primary L40S, backup A100-40GB (both fit
# TRELLIS.2-4B >=24GB). One image must run on EITHER, so kernels compile FAT for both arches (_CUDA_ARCHS:
# L40S=sm_89, A100=sm_80). IMPORTANT: run_commands (image build) accepts only a SINGLE gpu string (a list raises
# "Invalid GPU config"), so _BUILD_GPU is one type — its arch is irrelevant (the fat _CUDA_ARCHS drives what
# compiles; it just needs nvidia-smi). Override _GPU via MODEL3D_GPU (comma-separated, preference order); keep
# _CUDA_ARCHS covering every arch you list, else a fallback GPU crashes.
_GPU = [g.strip() for g in (os.environ.get("MODEL3D_GPU") or "L40S,A100-40GB").split(",") if g.strip()]
_BUILD_GPU = (os.environ.get("MODEL3D_BUILD_GPU") or "A100-40GB").strip()  # single string (run_commands rejects a list)
_CUDA_ARCHS = (os.environ.get("TORCH_CUDA_ARCH_LIST") or "8.0;8.9").strip()
_GPU_LABEL = "|".join(_GPU)  # reported as gpuType (the configured primary|fallback)

# DEV MODE (cost): during dev we do NOT want any keep-warm idle GPU cost — scale to zero as fast as Modal
# allows, no warm window. Deploy with MODEL3D_DEV_MODE=1 to deactivate keep-warm; leave it UNSET for go-live
# (a 5-min warm window so repeat requests skip the cold start). Read on the DEPLOYING machine (deploy-time
# env, like MODEL3D_ENDPOINT_LABEL). Individual overrides win over the dev/go-live default.
_DEV_MODE = (os.environ.get("MODEL3D_DEV_MODE") or "").strip().lower() in ("1", "true", "yes", "on")
# scaledown_window = idle keep-warm before scale-to-zero. Dev: 2s (Modal's floor → effectively no keep-warm,
# $0 idle). Go-live: 300s. Override with MODEL3D_SCALEDOWN_WINDOW (seconds).
_SCALEDOWN_WINDOW = int(os.environ.get("MODEL3D_SCALEDOWN_WINDOW") or (2 if _DEV_MODE else 300))
# min_containers = always-warm floor (the OTHER keep-warm). 0 = true scale-to-zero (dev + default). At
# go-live set MODEL3D_MIN_CONTAINERS=1 for one always-warm container (zero cold starts, non-zero idle cost).
_MIN_CONTAINERS = int(os.environ.get("MODEL3D_MIN_CONTAINERS") or 0)

app = modal.App(APP_NAME)

# Persistent weight caches (one per model family; separate Volumes keep the two images independent).
trellis_cache = modal.Volume.from_name("betterpptx-trellis-cache", create_if_missing=True)
unirig_cache = modal.Volume.from_name("betterpptx-unirig-cache", create_if_missing=True)
# The presenter clip-baker's ONE canonical clip-library GLB (baked once via `bake_clip_library`, read by every
# Baker.perform). Frozen intent->animId order lives in canonical/canonical-clipmap.json.
clip_library = modal.Volume.from_name("betterpptx-clip-library", create_if_missing=True)
_LIBRARY_DIR = "/library"
_LIBRARY_GLB = "/library/canonical-clips.glb"

# ---- Images ----------------------------------------------------------------------------------------
# TRELLIS.2: heavy custom-kernel build. setup.sh compiles flash-attn/cumesh/o-voxel/flexgemm (all MIT) —
# but NOT nvdiffrast/nvdiffrec (NVIDIA non-commercial; see the LICENSE block up top). Run it with `bash`
# (NOT sourced) so a nonzero exit fails the build, and end with a smoke import so a half-built kernel set
# (or a missing resale-safe sampler) fails the DEPLOY instead of 500-ing on the first request.
trellis_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "build-essential", "libgl1", "libglib2.0-0", "ninja-build", "libjpeg-dev", "zlib1g-dev")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("pillow>=10.0.0", "numpy", "trimesh", "fastapi[standard]>=0.115.0", "huggingface_hub>=0.25.0")
    # Build toolchain in the MAIN env: setup.sh installs the cumesh/o-voxel/flexgemm extensions with
    # --no-build-isolation (so they must find these here), and legacy `setup.py bdist_wheel` needs `wheel`.
    .pip_install("setuptools", "wheel", "packaging", "ninja", "psutil")
    # In-house resale-safe stub for `nvdiffrast.torch` (o_voxel imports it at load; we never install the real,
    # non-commercial NVIDIA package). copy=True so the BUILD-time smoke import below can see it; PYTHONPATH is
    # set here so it wins during both build and runtime. See nvdiffrast_stub/ and _export_glb_vertexcolor.
    .add_local_dir(_NVDIFFRAST_STUB_DIR, "/opt/nvdiffrast_stub", copy=True, ignore=_GENERATED_FILE_IGNORE)
    # PYTHONPATH: the nvdiffrast stub + the TRELLIS.2 repo itself (its `trellis2` package is NOT pip-installed —
    # setup.sh installs deps+extensions only; the library is imported from the clone, like upstream example.py).
    .env({"PYTHONPATH": "/opt/nvdiffrast_stub:/root/TRELLIS.2"})
    # The TRELLIS.2 extensions (cumesh/o-voxel/flexgemm) compile HOST C++ with clang++, not g++. Install it as a
    # LATE layer (after the pip installs) so the cached torch/deps layers survive across build iterations.
    .apt_install("clang")
    .run_commands(
        f"git clone --recursive https://github.com/microsoft/TRELLIS.2.git /root/TRELLIS.2 && "
        f"cd /root/TRELLIS.2 && git checkout {TRELLIS_GIT_REF}",
        # Patch setup.sh (CPU step, just file edits): (1) drop pillow-simd — a fragile compiled Pillow fork that
        # needs no place here (regular Pillow already satisfies `import PIL`); (2) install flash-attn from the
        # matching PREBUILT wheel (torch2.6/cu12/cp311/abiFALSE) instead of a 1-2h source compile that OOMs.
        "sed -i '/pillow-simd/d' /root/TRELLIS.2/setup.sh",
        "sed -i 's#pip install flash-attn==2.7.3#pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.3/flash_attn-2.7.3%2Bcu12torch2.6cxx11abiFALSE-cp311-cp311-linux_x86_64.whl#' /root/TRELLIS.2/setup.sh",
    )
    # setup.sh + the smoke import MUST run on a GPU. TRELLIS.2's setup.sh selects PLATFORM=cuda via
    # `command -v nvidia-smi` (absent on a CPU-only Modal builder → "No supported GPU found" + exit 1). The build
    # runs on _GPU (any of the fallback list — nvidia-smi is all setup.sh needs). TORCH_CUDA_ARCH_LIST forces the
    # custom kernels (cumesh/o-voxel/flexgemm) to compile FAT for BOTH arches (_CUDA_ARCHS) regardless of which
    # build GPU we land on, so the one image runs on the A100 primary AND the L40S fallback (flash-attn is a
    # prebuilt multi-arch wheel). --basic pulls the python deps; DELIBERATELY NO --nvdiffrast/--nvdiffrec (NVIDIA
    # non-commercial; the stub covers the import). BUILD GATE asserts o_voxel imports with the stub + grid_sample_3d.
    .run_commands(
        # MAX_JOBS bounds the extension compiles (cumesh/o-voxel/flexgemm) so parallel nvcc doesn't OOM the builder.
        f"cd /root/TRELLIS.2 && TORCH_CUDA_ARCH_LIST='{_CUDA_ARCHS}' MAX_JOBS=4 bash ./setup.sh --basic --flash-attn --cumesh --o-voxel --flexgemm",
        "python -c 'import trellis2, o_voxel; from trellis2.pipelines import Trellis2ImageTo3DPipeline; "
        "from flex_gemm.ops.grid_sample import grid_sample_3d; import nvdiffrast.torch as _d; "
        "assert \"nvdiffrast_stub\" in _d.__file__, _d.__file__'",
        gpu=_BUILD_GPU,  # single string — run_commands rejects a list; fat _CUDA_ARCHS handles both runtime arches
    )
    .env({"HF_HOME": CACHE_DIR, "OPENCV_IO_ENABLE_OPENEXR": "1", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True", "ATTN_BACKEND": "flash-attn"})
)

# =========================== PREMIUM (EVALUATION-ONLY) PARALLEL IMAGE ================================
# The resale-clean `trellis_image` above is UNTOUCHED. This parallel image DELIBERATELY installs the REAL
# NVIDIA nvdiffrast/nvdiffrec (NVIDIA Source Code License = "1-Way Commercial" / non-commercial) so TRELLIS.2's
# STOCK exporter can bake a proper UV TEXTURE (crisp skin/clothes) instead of the resale-safe vertex-color path.
# FOR INTERNAL QUALITY EVALUATION ONLY — do NOT ship its output commercially until a commercial license is
# secured from NVIDIA. Same build recipe as trellis_image with two changes: (1) NO nvdiffrast_stub (the real
# package is present; PYTHONPATH omits the stub so it doesn't shadow it); (2) setup.sh adds --nvdiffrast --nvdiffrec.
trellis_image_premium = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "build-essential", "libgl1", "libglib2.0-0", "ninja-build", "libjpeg-dev", "zlib1g-dev")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("pillow>=10.0.0", "numpy", "trimesh", "fastapi[standard]>=0.115.0", "huggingface_hub>=0.25.0")
    .pip_install("setuptools", "wheel", "packaging", "ninja", "psutil")
    .env({"PYTHONPATH": "/root/TRELLIS.2"})   # PREMIUM: no stub — the real nvdiffrast is installed below.
    .apt_install("clang")
    .run_commands(
        f"git clone --recursive https://github.com/microsoft/TRELLIS.2.git /root/TRELLIS.2 && "
        f"cd /root/TRELLIS.2 && git checkout {TRELLIS_GIT_REF}",
        "sed -i '/pillow-simd/d' /root/TRELLIS.2/setup.sh",
        "sed -i 's#pip install flash-attn==2.7.3#pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.3/flash_attn-2.7.3%2Bcu12torch2.6cxx11abiFALSE-cp311-cp311-linux_x86_64.whl#' /root/TRELLIS.2/setup.sh",
    )
    .run_commands(
        # PREMIUM: adds --nvdiffrast --nvdiffrec (the NVIDIA non-commercial rasterizer + texture baker).
        f"cd /root/TRELLIS.2 && TORCH_CUDA_ARCH_LIST='{_CUDA_ARCHS}' MAX_JOBS=4 bash ./setup.sh --basic --flash-attn --cumesh --o-voxel --flexgemm --nvdiffrast --nvdiffrec",
        # BUILD GATE: the REAL nvdiffrast imports (NOT the stub) and the pipeline loads.
        "python -c 'import trellis2, o_voxel, nvdiffrast.torch as _d; from trellis2.pipelines import Trellis2ImageTo3DPipeline; "
        "assert \"nvdiffrast_stub\" not in _d.__file__, _d.__file__; print(\"REAL nvdiffrast:\", _d.__file__)'",
        gpu=_BUILD_GPU,
    )
    .env({"HF_HOME": CACHE_DIR, "OPENCV_IO_ENABLE_OPENEXR": "1", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True", "ATTN_BACKEND": "flash-attn"})
)

# ===================== PERMISSIVE (RESALE-SAFE) TEXTURED IMAGE — THIRD PARALLEL TRACK ================
# Goal: the SAME crisp UV-textured bake as the premium image, but with a COMMERCIALLY-LICENSABLE rasterizer, so
# its output IS resale-safe. Recipe = the resale-clean trellis_image (setup.sh WITHOUT --nvdiffrast/--nvdiffrec —
# NO NVIDIA rasterizer) with TWO changes: (1) the in-house `nvdiffrast.torch` shim is the DRTK-backed one
# (nvdiffrast_drtk/, MIT — delegates rasterize/interpolate to Meta's DRTK) instead of the raising stub; (2) build
# Meta DRTK (facebookresearch/DRTK, MIT) from source. TRELLIS.2's STOCK o_voxel.postprocess.to_glb then bakes a
# real UV texture THROUGH DRTK. Both the resale-clean vertex-color image AND the premium nvdiffrast image are
# UNTOUCHED. See NOTICES.md — DRTK (MIT) + PyTorch3D (BSD-3) are the vetted permissive rasterizers.
trellis_image_permissive = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "build-essential", "libgl1", "libglib2.0-0", "ninja-build", "libjpeg-dev", "zlib1g-dev")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("pillow>=10.0.0", "numpy", "trimesh", "fastapi[standard]>=0.115.0", "huggingface_hub>=0.25.0")
    .pip_install("setuptools", "wheel", "packaging", "ninja", "psutil")
    .apt_install("clang")
    # ---- STABLE, EXPENSIVE layers first (clone + DRTK build + TRELLIS kernels). The DRTK shim goes in LAST so
    # editing it (or flipping DRTK_FLIP_V) only re-runs the cheap final layers, not this ~20-min kernel compile.
    .run_commands(
        f"git clone --recursive https://github.com/microsoft/TRELLIS.2.git /root/TRELLIS.2 && "
        f"cd /root/TRELLIS.2 && git checkout {TRELLIS_GIT_REF}",
        "sed -i '/pillow-simd/d' /root/TRELLIS.2/setup.sh",
        "sed -i 's#pip install flash-attn==2.7.3#pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.3/flash_attn-2.7.3%2Bcu12torch2.6cxx11abiFALSE-cp311-cp311-linux_x86_64.whl#' /root/TRELLIS.2/setup.sh",
    )
    # Build Meta DRTK (MIT) from source — CUDA extensions, so run on a GPU with the fat arch list (like the
    # TRELLIS kernels). No PyPI wheel exists; --no-build-isolation so it finds the torch/setuptools installed above.
    .run_commands(
        f"git clone https://github.com/facebookresearch/DRTK.git /root/DRTK && "
        f"cd /root/DRTK && git checkout {DRTK_GIT_REF}",
        f"cd /root/DRTK && TORCH_CUDA_ARCH_LIST='{_CUDA_ARCHS}' MAX_JOBS=4 pip install --no-build-isolation .",
        "python -c 'import drtk; print(\"DRTK built:\", drtk.__file__)'",
        gpu=_BUILD_GPU,
    )
    # TRELLIS.2 extensions — RESALE-CLEAN set (NO --nvdiffrast/--nvdiffrec). No shim needed to COMPILE kernels.
    .run_commands(
        f"cd /root/TRELLIS.2 && TORCH_CUDA_ARCH_LIST='{_CUDA_ARCHS}' MAX_JOBS=4 bash ./setup.sh --basic --flash-attn --cumesh --o-voxel --flexgemm",
        gpu=_BUILD_GPU,
    )
    # ---- CHEAP tail: drop in the DRTK shim + env, then the build gate. Iterating the shim/flip rebuilds ONLY these.
    .add_local_dir(_NVDIFFRAST_DRTK_DIR, "/opt/nvdiffrast_drtk", copy=True, ignore=_GENERATED_FILE_IGNORE)
    .env({"HF_HOME": CACHE_DIR, "OPENCV_IO_ENABLE_OPENEXR": "1", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
          "ATTN_BACKEND": "flash-attn", "PYTHONPATH": "/opt/nvdiffrast_drtk:/root/TRELLIS.2",
          # DRTK_FLIP_V=0 is CORRECT (verified live 2026-07-10: =1 scrambles the UV islands, =0 gives a clean texture).
          "DRTK_FLIP_V": os.environ.get("DRTK_FLIP_V", "0")})
    # BUILD GATE: to_glb imports on the DRTK shim (our shim wins on PYTHONPATH + exposes rasterize/interpolate).
    .run_commands(
        "python -c 'import trellis2, o_voxel, drtk; from trellis2.pipelines import Trellis2ImageTo3DPipeline; "
        "from flex_gemm.ops.grid_sample import grid_sample_3d; from o_voxel.postprocess import to_glb; "
        "import nvdiffrast.torch as _d; assert \"nvdiffrast_drtk\" in _d.__file__, _d.__file__; "
        "assert hasattr(_d, \"rasterize\") and hasattr(_d, \"interpolate\"); "
        "print(\"DRTK-backed nvdiffrast shim:\", _d.__file__)'",
        gpu=_BUILD_GPU,
    )
)

# UniRig: its own torch/spconv/torch_scatter stack. It DOES need bpy (Blender module) — its extract.py imports
# bpy for mesh extraction, and run.py needs python-box. apt libs below are what headless bpy/open3d/pyrender load.
unirig_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "build-essential", "libgl1", "libglib2.0-0", "libxrender1", "libxi6",
                 "libxxf86vm1", "libxfixes3", "libxkbcommon0", "libsm6", "libxext6", "libgomp1", "libegl1")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("setuptools", "wheel", "packaging", "ninja", "psutil")
    .run_commands(
        f"git clone https://github.com/VAST-AI-Research/UniRig.git /root/UniRig && "
        f"cd /root/UniRig && git checkout {UNIRIG_GIT_REF}",
        # Install UniRig's requirements EXCEPT flash_attn. Previously `pip install -r requirements.txt || true`
        # let flash_attn's build-isolation failure (no torch visible) abort the WHOLE set → bpy/box/etc. were
        # silently never installed. Drop flash_attn here (prebuilt wheel next), and DON'T swallow errors.
        "grep -viE '^flash[_-]attn' /root/UniRig/requirements.txt > /root/UniRig/requirements.noflash.txt",
        "pip install -r /root/UniRig/requirements.noflash.txt",
        # flash_attn via the matching PREBUILT wheel (torch2.4/cu124/cp311) — no source build.
        "pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1%2Bcu12torch2.4cxx11abiFALSE-cp311-cp311-linux_x86_64.whl",
        # spconv + pyg scatter/cluster wheels matched to torch 2.4.1 + cu124.
        "pip install spconv-cu124 numpy==1.26.4",
        "pip install torch_scatter torch_cluster -f https://data.pyg.org/whl/torch-2.4.1+cu124.html",
        # BUILD GATE: launch scripts exist AND the deps that were silently missing before now import.
        "test -f /root/UniRig/launch/inference/generate_skeleton.sh && "
        "test -f /root/UniRig/launch/inference/generate_skin.sh && "
        "test -f /root/UniRig/launch/inference/merge.sh && "
        "python -c 'import bpy, box, flash_attn, spconv, torch_scatter, omegaconf, lightning, trimesh'",
    )
    .pip_install("fastapi[standard]>=0.115.0", "huggingface_hub>=0.25.0")
    .env({"HF_HOME": CACHE_DIR, "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"})
)

# The orchestrator also serves the read-only health/identity endpoint.  Carry
# the deploy-time immutable metadata into the runtime image explicitly; Modal
# containers do not inherit the deployer's local environment automatically.
orchestrator_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi[standard]>=0.115.0")
    .env({
        "MODEL3D_DEPLOYMENT_REVISION": MODEL3D_DEPLOYMENT_REVISION,
        "MODEL3D_SOURCE_DIGEST": MODEL3D_SOURCE_DIGEST,
    })
)

# ============================ RESALE-SAFETY GATE (nvdiffrast = NVIDIA non-commercial) ============================
# The PREMIUM track installs the real NVIDIA nvdiffrast (NVIDIA Source Code License = NON-COMMERCIAL). It exists for
# internal QUALITY EVALUATION ONLY. By DEFAULT (production / any deploy) we REPOINT trellis_image_premium to the
# lightweight orchestrator image so NO nvdiffrast is ever built onto a workspace — the premium classes/functions still
# parse, but they register with a stub image and are NEVER invoked by the served endpoint. Set MODEL3D_ENABLE_PREMIUM=1
# ONLY for local eval (make-presenter-premium.ps1 does this). The SERVED endpoint uses run_pipeline -> Generator
# (vertex-color, flex_gemm.grid_sample = MIT); the resale-safe textured path is trellis_image_permissive (DRTK = MIT).
if os.environ.get("MODEL3D_ENABLE_PREMIUM", "") != "1":
    trellis_image_premium = orchestrator_image

# Face landmark re-projection (the resale-safe "best texture" face fix): MediaPipe FaceMesh (Apache-2.0) + OpenCV
# (mediapipe pulls cv2) + trimesh. CPU-only. Runs bake/face_landmark_reproject.py (subprocess-free, plain import).
face_reproject_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")   # runtime libs mediapipe/opencv dlopen
    .pip_install("mediapipe==0.10.14", "numpy<2", "pillow>=10.0.0", "trimesh", "fastapi[standard]>=0.115.0")
    .add_local_dir(_BAKE_DIR, "/opt/bake", copy=True, ignore=_GENERATED_FILE_IGNORE)
)

# Performer (clip-baker): headless Blender BINARY (invoked via subprocess — NEVER `import bpy`, which would
# GPL-link the closed worker) for CMU->canonical retarget + glTF animation-track bake. CPU-only (no GPU: the
# retarget is offline, per-avatar work is graph/track-copy). pygltflib/trimesh run in the CONTAINER python for
# the pure-Python reorder + validation gate; Blender uses its own bundled python for the bpy scripts.
performer_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "xz-utils", "libgl1", "libglib2.0-0", "libxrender1", "libxi6",
                 "libxxf86vm1", "libxfixes3", "libxkbcommon0", "libsm6", "libxext6", "libgomp1", "libegl1")
    .run_commands(
        f"curl -fsSL {BLENDER_URL} -o /tmp/blender.tar.xz",
        "mkdir -p /opt/blender && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 && rm /tmp/blender.tar.xz",
        "ln -s /opt/blender/blender /usr/local/bin/blender",
        "blender --background --version",  # BUILD GATE: fail the deploy if Blender can't launch headless
    )
    .pip_install("pygltflib", "trimesh", "numpy", "pillow>=10.0.0", "fastapi[standard]>=0.115.0")  # pillow: slim_textures
    .add_local_dir(_CANONICAL_DIR, "/opt/canonical", copy=True, ignore=_GENERATED_FILE_IGNORE)
    .add_local_dir(_BAKE_DIR, "/opt/bake", copy=True, ignore=_GENERATED_FILE_IGNORE)
    # Staged motion (Mixamo FBX / CMU BVH) for the real clip-library bake. Gitignored + build-time only (never
    # emitted). Empty until the owner stages clips; the bake --mixamo/--cmu path reads /opt/mocap.
    .add_local_dir(_MOCAP_DIR, "/opt/mocap", copy=True, ignore=_GENERATED_FILE_IGNORE)
    .env({"HF_HOME": CACHE_DIR})
)


# PROOF SLICE: `modal run model3d_app.py::prove_blender` — de-risks headless Blender on Modal (build the
# canonical armature from JSON + a trivial animation + glTF export) BEFORE the full CMU retarget pipeline.
@app.function(image=performer_image, timeout=600)
def _prove_blender():
    import base64  # noqa: F401
    import json
    import os
    import struct
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "canonical.glb")
        p = subprocess.run(
            ["blender", "--background", "--python", "/opt/bake/canonical_build.py", "--",
             "/opt/canonical/canonical_skeleton.json", out],
            capture_output=True, text=True,
        )
        if p.returncode != 0 or not os.path.exists(out):
            raise RuntimeError(f"blender rc={p.returncode}\nSTDERR:\n{p.stderr[-2500:]}\nSTDOUT:\n{p.stdout[-800:]}")
        glb = open(out, "rb").read()
    jl = struct.unpack("<I", glb[12:16])[0]
    g = json.loads(glb[20:20 + jl])
    return {
        "glbBytes": len(glb),
        "nodes": len(g.get("nodes", [])),
        "animations": len(g.get("animations", [])),
        "animNames": [a.get("name") for a in g.get("animations", [])],
        "hasCanonicalBones": any(n.get("name", "").startswith("mixamorig:") for n in g.get("nodes", [])),
    }


@app.local_entrypoint()
def prove_blender():
    print("BLENDER PROOF:", _prove_blender.remote())


# PROOF SLICE 2: `modal run model3d_app.py::prove_multiclip` — de-risks the animId-ordering contract (the
# recipe's single biggest risk). Build 9 named clips in SCRAMBLED order, capture the raw exporter order, then
# prove the pygltflib reorder + hard-assert gate force animations[i].name == clipNames[i].
@app.function(image=performer_image, timeout=900)
def _prove_multiclip():
    import json
    import os
    import subprocess
    import sys
    import tempfile
    sys.path.insert(0, "/opt/bake")
    import gltf_ops  # noqa: E402  (pure-python, no bpy)
    from pygltflib import GLTF2  # noqa: E402

    clipmap = json.load(open("/opt/canonical/canonical-clipmap.json"))
    with tempfile.TemporaryDirectory() as d:
        raw = os.path.join(d, "library_raw.glb")
        ordered = os.path.join(d, "library_ordered.glb")
        p = subprocess.run(
            ["blender", "--background", "--python", "/opt/bake/library_build.py", "--",
             "/opt/canonical/canonical_skeleton.json", "/opt/canonical/canonical-clipmap.json", raw],
            capture_output=True, text=True,
        )
        if p.returncode != 0 or not os.path.exists(raw):
            raise RuntimeError(f"blender rc={p.returncode}\nSTDERR:\n{p.stderr[-2500:]}\nSTDOUT:\n{p.stdout[-800:]}")
        raw_order = [a.name for a in (GLTF2().load(raw).animations or [])]
        # reorder to the frozen clipNames order, then run the loud-failure gate (armature-only proof: no mesh)
        gltf_ops.reorder_animations(raw, ordered, clipmap["clipNames"])
        manifest = gltf_ops.validate(ordered, clipmap, require_mesh=False)
        manifest["rawExporterOrder"] = raw_order
        manifest["reorderWasNeeded"] = raw_order != clipmap["clipNames"]
        manifest["glbBytes"] = os.path.getsize(ordered)
    return manifest


@app.local_entrypoint()
def prove_multiclip():
    import json
    print("MULTICLIP PROOF:", json.dumps(_prove_multiclip.remote(), indent=2))


# In-container paths (added to performer_image via add_local_dir). Blender scripts are subprocess-only.
_CANON_SKEL = "/opt/canonical/canonical_skeleton.json"
_CANON_CLIPMAP = "/opt/canonical/canonical-clipmap.json"
# KINETIC pool (31 clips) — a SEPARATE transplant source from the 18-clip gesture library. Retargeted onto the
# same canonical skeleton from mocap/kinetic/*.fbx; a deck selects its custom 18-of-31.
_KINETIC_CLIPMAP = "/opt/canonical/kinetic-clipmap.json"
_KINETIC_CLIPS_MAP = "/opt/bake/kinetic-clips-map.json"
_KINETIC_LIBRARY_GLB = "/library/kinetic-clips.glb"
_AUTHORING_CLIPMAP = "/opt/canonical/authoring-clipmap-v3.json"
_AUTHORING_LIBRARY_GLB = "/library/authoring-interaction-clips-v3.glb"
# Flatten target height (model units == meters after flatten). A human-scale figure PP frames cleanly once the
# node scale is baked into the vertices (see flatten_scale.py / _bake_core).
RENDER_TARGET_HEIGHT_M = 1.8


def _blender_run(script, *args, blender="blender"):
    """Run one /opt/bake Blender script as a subprocess; raise with captured output on failure."""
    import subprocess
    p = subprocess.run([blender, "--background", "--python", f"/opt/bake/{script}", "--", *args],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{script} rc={p.returncode}\nSTDERR:\n{p.stderr[-2500:]}\nSTDOUT:\n{p.stdout[-1200:]}")
    return p.stdout


_EXPECTED_EMPIRICAL_TIMELINE_IDS = tuple(str(index) for index in range(18))


def _validate_empirical_clip_timelines(profile):
    """Validate the rendered PowerPoint oracle shape before it enters a manifest.

    This is deliberately not a model-space approximation: each point is
    [videoMs, xIn, yIn] in the measured probe window. Missing/short timelines
    are rejected so the synergy solver can never guess a contact time.
    """
    if not isinstance(profile, dict) or not isinstance(profile.get("probe"), dict) or not isinstance(profile.get("timelines"), dict):
        raise RuntimeError("empirical_clip_timelines must be {probe:{x,y,w,h,m},timelines:{animId:[[videoMs,xIn,yIn],…]}}")
    probe = profile["probe"]
    for key in ("x", "y", "w", "h", "m"):
        if not math.isfinite(float(probe.get(key))):
            raise RuntimeError(f"empirical clip timeline probe is missing finite {key}")
    supplied = profile["timelines"]
    expected = set(_EXPECTED_EMPIRICAL_TIMELINE_IDS)
    actual = {str(anim_id) for anim_id in supplied}
    missing = sorted(expected - actual, key=int)
    extra = sorted(actual - expected, key=lambda value: (not value.isdigit(), value))
    if missing:
        raise RuntimeError(f"empirical clip timeline manifest is missing slots: {', '.join(missing)}")
    if extra:
        raise RuntimeError(f"empirical clip timeline manifest contains unexpected slots: {', '.join(extra)}")
    timelines = {}
    for anim_id in _EXPECTED_EMPIRICAL_TIMELINE_IDS:
        points = supplied[anim_id] if anim_id in supplied else supplied.get(int(anim_id))
        if not isinstance(points, list) or len(points) < 5:
            raise RuntimeError(f"empirical clip timeline {anim_id} has fewer than 5 measured points")
        clean = []
        previous_time = None
        for point in points:
            if not isinstance(point, (list, tuple)) or len(point) != 3 or not all(math.isfinite(float(v)) for v in point):
                raise RuntimeError(f"empirical clip timeline {anim_id} contains an invalid point")
            time_ms = float(point[0])
            if previous_time is not None and time_ms < previous_time:
                raise RuntimeError(f"empirical clip timeline {anim_id} timestamps are not ordered")
            previous_time = time_ms
            clean.append([time_ms, float(point[1]), float(point[2])])
        timelines[anim_id] = clean
    if not timelines:
        raise RuntimeError("empirical clip timeline manifest has no measured clips")
    return {"probe": {key: float(probe[key]) for key in ("x", "y", "w", "h", "m")}, "timelines": timelines}


def _timeline_manifest(profile):
    clean = _validate_empirical_clip_timelines(profile)
    digest = hashlib.sha256(json.dumps(clean, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return clean, digest


def _bake_core(rigged_glb_path, library_glb_path, d, blender="blender", empirical_clip_timelines=None, require_empirical_timelines=False, clipmap_path=None):
    """The per-avatar bake: normalize (topology relabel + skin rebind) -> transplant (copy the library clips) ->
    pygltflib reorder -> the loud-failure gate. Returns (baked_glb_path, manifest, normalize_sidecar). No bpy in
    this process (the GPL boundary stays inside the Blender subprocess). Shared by Baker.perform + the proof."""
    import json
    import os
    import sys
    sys.path.insert(0, "/opt/bake")
    import gltf_ops  # noqa: E402

    normalized = os.path.join(d, "normalized.glb")
    sidecar = os.path.join(d, "normalized.json")
    baked_raw = os.path.join(d, "baked_raw.glb")
    flat = os.path.join(d, "baked_flat.glb")
    baked = os.path.join(d, "baked.glb")

    _blender_run("normalize.py", rigged_glb_path, _CANON_SKEL, normalized, sidecar, blender=blender)
    active_clipmap = clipmap_path or _CANON_CLIPMAP
    _blender_run("transplant.py", normalized, library_glb_path, active_clipmap, baked_raw, blender=blender)
    # BAKE all node scale into the mesh vertices (identity node transforms). PowerPoint's am3d viewer auto-frames
    # a model on its RAW vertex bbox but RENDERS at the node scale, so any residual root-node scale (Blender's
    # 0.01 export root) over-zooms it (renders only the boots). Flattening makes accessor bbox == render, so PP
    # frames the whole figure. Verified in PowerPoint: was a boots close-up, now a full centered humanoid.
    _blender_run("flatten_scale.py", baked_raw, flat, str(RENDER_TARGET_HEIGHT_M), blender=blender)

    clipmap = json.load(open(active_clipmap))
    gltf_ops.reorder_animations(flat, baked, clipmap["clipNames"])
    matted = gltf_ops.normalize_materials(baked)  # force matte non-metallic — no glassy PowerPoint sheen
    # LOADER-SAFE slim: 4K Mixamo textures -> ~2K/1K + drop maps matte-normalize left unused. Mixamo
    # performers ship ~60MB (all textures); this brings them to ~20MB. Runs AFTER normalize_materials so
    # the now-unreferenced spec/gloss maps get dropped. Pure PNG/JPEG -> PP renders it (COM-verified).
    slimmed = gltf_ops.slim_textures(baked)
    manifest = gltf_ops.validate(baked, clipmap, require_mesh=True)
    manifest["mattedMaterials"] = matted
    manifest["slimTextures"] = slimmed
    # CONTACT-FRAME metadata: per-clip apex ms so the director fires a paired content effect at the gesture's
    # impact, not slide-start. Computed on the FINAL baked+reordered GLB, so animId matches the clipmap order.
    manifest["contacts"] = gltf_ops.compute_contacts(baked)
    # EMPIRICAL TIMELINE GATE: contacts alone are insufficient for the synergy
    # solver. Production Bakers must receive rendered PowerPoint oracle points
    # and persist them with the exact baked artifact.
    if require_empirical_timelines and empirical_clip_timelines is None:
        raise RuntimeError("INTERACTION_NO_TIMELINES: production Baker requires empirical_clip_timelines measured from the final baked GLB in PowerPoint")
    if empirical_clip_timelines is not None:
        clean_timelines, timeline_digest = _timeline_manifest(empirical_clip_timelines)
        manifest["clipTimelines"] = clean_timelines
        manifest["timelineSource"] = "powerpoint-oracle"
        manifest["timelineProfileDigest"] = timeline_digest
        manifest["timelinePointCount"] = sum(len(points) for points in clean_timelines["timelines"].values())
    # POSTER: a transparent front render (render_preview, film_transparent) → the PowerPoint am3d RASTER anchor.
    # Without it the model renders EMPTY; with a grey-bg poster it renders in a grey box. Transparent → the
    # presenter stands on the slide. Best-effort: a render failure must NOT fail the bake (the presenter still
    # ships; the embed resolver just falls back to nativeOnly). The resolver auto-attaches manifest.posterBase64.
    try:
        import base64 as _b64
        poster_out = os.path.join(d, "poster.png")
        _blender_run("render_preview.py", baked, poster_out, blender=blender)
        poster_front = poster_out.replace(".png", "_front.png")
        if os.path.exists(poster_front):
            with open(poster_front, "rb") as _pf:
                manifest["posterBase64"] = _b64.b64encode(_pf.read()).decode("ascii")
            manifest["posterBytes"] = os.path.getsize(poster_front)
    except Exception as _pe:  # noqa: BLE001 — poster is optional; never block a good bake on it
        manifest["posterError"] = str(_pe)[:200]
    manifest["glbBytes"] = os.path.getsize(baked)
    return baked, manifest, json.load(open(sidecar))


# PROOF SLICE 3: `modal run model3d_app.py::prove_baker` — de-risks the WHOLE per-avatar path with zero external
# data. Build a UniRig-like synthetic avatar (arbitrary bone names, canonical topology, skinned mesh + COLOR_0) +
# the canonical clip-library, then run the real Baker steps (_bake_core): normalize -> transplant -> reorder ->
# the FULL gate (require_mesh=True: skins==1 + COLOR_0). Real CMU motion later just swaps library_build.py's
# placeholder clips for retargeted ones; the per-avatar mechanism proven here is unchanged.
@app.function(image=performer_image, timeout=900)
def _prove_baker():
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        avatar = os.path.join(d, "avatar.glb")
        library = os.path.join(d, "library.glb")
        _blender_run("synth_avatar.py", avatar)
        _blender_run("library_build.py", _CANON_SKEL, _CANON_CLIPMAP, library)
        _, manifest, sidecar = _bake_core(avatar, library, d)
    return {"manifest": manifest, "normalize": sidecar}


@app.local_entrypoint()
def prove_baker():
    import json
    print("BAKER PROOF:", json.dumps(_prove_baker.remote(), indent=2))


@app.function(image=performer_image)
def _synth_avatar_bytes():
    """Build the synthetic UniRig-like avatar and return its GLB bytes (for the Volume-path Baker proof)."""
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "avatar.glb")
        _blender_run("synth_avatar.py", out)
        with open(out, "rb") as f:
            return f.read()


# PROOF SLICE 4: `modal run model3d_app.py::prove_baker_volume` — exercises the exact self-hosted PoC bake path:
# bake_clip_library commits the library to the Volume, then the real Baker CLASS reads it from the Volume and
# performs on a synthetic avatar. Validates the Volume read + the @app.cls wrapper (the only delta prove_baker
# didn't cover, which built the library on-the-fly).
@app.local_entrypoint()
def prove_baker_volume():
    import json
    lib = _bake_clip_library.remote(source="placeholder")
    print("LIBRARY:", lib)
    avatar = _synth_avatar_bytes.remote()
    r = Baker().perform.remote(avatar)
    summary = {k: v for k, v in r.items() if k != "glb"}
    summary["glbBytes"] = len(r["glb"])
    print("BAKER VOLUME PROOF:", json.dumps(summary, indent=2))


# RIG AN EXISTING MESH GLB (skip TRELLIS): `modal run model3d_app.py::perform_existing --glb-path <in> --out-path <out>`.
# Proves the "rig a clean/stock humanoid" path — a professionally modeled mesh -> UniRig -> Baker beats generating a
# blobby mesh from an image. The mesh is rigged in place (UniRig), then the presenter clip set is transplanted.
@app.local_entrypoint()
def perform_existing(glb_path: str, out_path: str = ""):
    import json
    import os
    glb = open(glb_path, "rb").read()
    print(f"input mesh GLB: {len(glb)} bytes -> UniRig rig ...")
    r = Rigger().rig.remote(glb)
    print(f"rigged: {len(r['glb'])} bytes rigSeconds={r.get('rigSeconds')} -> Baker perform ...")
    b = Baker().perform.remote(r["glb"])
    out = out_path or (os.path.splitext(glb_path)[0] + ".performer.glb")
    with open(out, "wb") as f:
        f.write(b["glb"])
    summary = {k: v for k, v in b.items() if k != "glb"}
    summary["glbBytes"] = len(b["glb"])
    summary["rigSeconds"] = r.get("rigSeconds")
    print("PERFORM_EXISTING:", json.dumps(summary, indent=2))
    print("SAVED performer:", out)


# RIG AN EXISTING MESH WITHOUT TRANSPLANTING THE PRESENTER CLIP LIBRARY.
# UniRig supplies a baseline skeleton and skin weights; character-specific
# game clips are authored and validated later in Blender/Godot.
@app.local_entrypoint()
def rig_existing(glb_path: str, out_path: str = ""):
    import json
    import os

    glb = open(glb_path, "rb").read()
    print(f"input mesh GLB: {len(glb)} bytes -> UniRig baseline rig only ...")
    r = Rigger().rig.remote(glb)
    out = out_path or (os.path.splitext(glb_path)[0] + ".rigged.glb")
    with open(out, "wb") as f:
        f.write(r["glb"])
    summary = {k: v for k, v in r.items() if k != "glb"}
    summary["glbBytes"] = len(r["glb"])
    print("RIG_EXISTING:", json.dumps(summary, indent=2))
    print("SAVED baseline-rigged model:", out)


# CONVERT a rigged character FBX (e.g. Mixamo) -> GLB in Blender, preserving skin+skeleton (drops bundled anim).
@app.function(image=performer_image, timeout=600)
def _fbx_to_glb(fbx_bytes: bytes) -> bytes:
    import os
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        inp = os.path.join(d, "in.fbx")
        out = os.path.join(d, "out.glb")
        with open(inp, "wb") as f:
            f.write(fbx_bytes)
        p = subprocess.run(["blender", "--background", "--python", "/opt/bake/fbx_to_glb.py", "--", inp, out],
                           capture_output=True, text=True)
        if not os.path.exists(out):
            raise RuntimeError(f"fbx_to_glb failed rc={p.returncode}\nSTDERR:\n{p.stderr[-2000:]}\nSTDOUT:\n{p.stdout[-800:]}")
        return open(out, "rb").read()


# CONVERT ONLY: preserve the fresh Mixamo persona/rig for local inspection
# before any presenter clip library or optimization is applied.
# `modal run model3d_app.py::convert_fbx --fbx-path <in> --out-path <out>`
@app.local_entrypoint()
def convert_fbx(fbx_path: str, out_path: str = ""):
    import hashlib
    import os

    raw = open(fbx_path, "rb").read()
    glb = _fbx_to_glb.remote(raw)
    out = out_path or (os.path.splitext(fbx_path)[0] + ".glb")
    with open(out, "wb") as f:
        f.write(glb)
    print("CONVERT_FBX:", {
        "fbxBytes": len(raw),
        "fbxSha256": hashlib.sha256(raw).hexdigest(),
        "glbBytes": len(glb),
        "glbSha256": hashlib.sha256(glb).hexdigest(),
    })
    print("SAVED converted GLB:", out)


# BAKE ONTO AN ALREADY-RIGGED MESH — SKIP UNIRIG. `modal run model3d_app.py::perform_rigged --mesh-path <in> --out-path <out>`.
# The reliable path: a PRE-RIGGED character (esp. Mixamo-skeleton == our canonical mixamorig:* T-pose rig) needs NO
# auto-rig, so it dodges UniRig's arms-down-vs-T-pose rest skew (the ~50% explode/collapse cause). The Baker is
# UniRig-agnostic (normalize relabels ANY humanoid skeleton by topology; a Mixamo rest == canonical -> near-identity,
# no skew). Accepts .glb (Sketchfab/rigged GLB) or .fbx (Mixamo character -> converted in Blender first).
@app.local_entrypoint()
def perform_rigged(mesh_path: str, out_path: str = ""):
    import json
    import os
    raw = open(mesh_path, "rb").read()
    ext = os.path.splitext(mesh_path)[1].lower()
    if ext == ".fbx":
        print(f"input rigged FBX: {len(raw)} bytes -> Blender FBX->GLB ...")
        glb = _fbx_to_glb.remote(raw)
        print(f"converted GLB: {len(glb)} bytes -> Baker perform (NO UniRig) ...")
    else:
        glb = raw
        print(f"input rigged GLB: {len(glb)} bytes -> Baker perform (NO UniRig) ...")
    b = Baker().perform.remote(glb)
    out = out_path or (os.path.splitext(mesh_path)[0] + ".performer.glb")
    with open(out, "wb") as f:
        f.write(b["glb"])
    summary = {k: v for k, v in b.items() if k != "glb"}
    summary["glbBytes"] = len(b["glb"])
    print("PERFORM_RIGGED (skip-UniRig):", json.dumps(summary, indent=2))
    print("SAVED performer:", out)


# FULL GENERATE PIPELINE FROM A PHOTO: image file -> TRELLIS.2 mesh -> UniRig rig -> Baker (18-clip transplant +
# flatten) -> ONE animated rigged GLB (18 embedded gesture clips, PowerPoint-ready). The self-serve "photo ->
# presenter" path. `modal run model3d_app.py::perform_from_image --image-path face.png --out-path presenter.glb --preview`
# NOTE: this uses UniRig auto-rig, whose quality VARIES per mesh (a clean front A/T-pose subject rigs best). For the
# most reliable clean result, prefer a PRE-RIGGED Mixamo character via perform_rigged (skips UniRig entirely).
@app.local_entrypoint()
def perform_from_image(image_path: str, out_path: str = "", quality: str = "ppt-lite", seed: int = 0, preview: bool = False, norig: bool = False):
    import base64
    import json
    import os
    img = open(image_path, "rb").read()
    if norig:
        print(f"input image: {len(img)} bytes -> TRELLIS.2 mesh ONLY (--norig: static 3D model, no rig / no clips) ...")
        r = run_pipeline.remote(image_bytes=img, quality=quality, rig=False, seed=seed, perform=False)
    else:
        print(f"input image: {len(img)} bytes -> TRELLIS.2 mesh -> UniRig rig -> Baker (18-clip) ... (cold ~4-5 min)")
        r = run_pipeline.remote(image_bytes=img, quality=quality, rig=True, seed=seed, perform=True)
    glb = base64.b64decode(r["glb"])
    out = out_path or (os.path.splitext(image_path)[0] + (".model.glb" if norig else ".presenter.glb"))
    with open(out, "wb") as f:
        f.write(glb)
    print("PERFORM_FROM_IMAGE:", json.dumps({k: v for k, v in r.items() if k != "glb"}, indent=2))
    print("SAVED " + ("static 3D model" if norig else "animated rigged") + " GLB:", out)
    if not norig and not r.get("performed"):
        print("WARNING: pipeline did not reach the Baker (no embedded clips) — check the run above.")
    if r.get("tier") == "T3" or (r.get("confidence") if r.get("confidence") is not None else 1.0) < 0.5:
        print(f"WARNING: LOW rig confidence (tier={r.get('tier')} conf={r.get('confidence')}). UniRig likely produced a weak rig -> the presenter may deform. Try a cleaner front-facing full-body A/T-pose image, or use perform_rigged with a pre-rigged Mixamo character.")
    if preview:
        base = os.path.splitext(out)[0]
        res = _render_glb.remote(glb)
        for tag, b64 in res.items():
            fp = f"{base}_{tag}.png"
            with open(fp, "wb") as f:
                f.write(base64.b64decode(b64))
            print("SAVED preview:", fp)


# PREMIUM (EVALUATION-ONLY) full generate: same as perform_from_image but the TEXTURED pipeline (real nvdiffrast
# UV texture -> crisp skin/clothes). `modal run model3d_app.py::perform_from_image_premium --image-path face.png --preview`
# Output is NOT resale-clean (NVIDIA nvdiffrast is non-commercial) — for internal quality evaluation only.
@app.local_entrypoint()
def perform_from_image_premium(image_path: str, out_path: str = "", quality: str = "ppt-lite", seed: int = 0, preview: bool = False, norig: bool = False):
    import base64
    import json
    import os
    img = open(image_path, "rb").read()
    if norig:
        print(f"[PREMIUM] input image: {len(img)} bytes -> TRELLIS.2 + nvdiffrast TEXTURE mesh ONLY (--norig: static, no rig/clips) ...")
        r = run_pipeline_premium.remote(image_bytes=img, quality=quality, rig=False, seed=seed, perform=False)
    else:
        print(f"[PREMIUM] input image: {len(img)} bytes -> TRELLIS.2 + nvdiffrast TEXTURE -> UniRig -> Baker (18-clip) ... (cold ~5-6 min)")
        r = run_pipeline_premium.remote(image_bytes=img, quality=quality, rig=True, seed=seed, perform=True)
    glb = base64.b64decode(r["glb"])
    out = out_path or (os.path.splitext(image_path)[0] + (".model-premium.glb" if norig else ".presenter-premium.glb"))
    with open(out, "wb") as f:
        f.write(glb)
    print("PERFORM_FROM_IMAGE_PREMIUM:", json.dumps({k: v for k, v in r.items() if k != "glb"}, indent=2))
    print("SAVED " + ("static 3D model" if norig else "animated rigged") + " GLB (premium, UV-textured):", out)
    if not norig and not r.get("performed"):
        print("WARNING: pipeline did not reach the Baker (no embedded clips) — check the run above.")
    if r.get("tier") == "T3" or (r.get("confidence") if r.get("confidence") is not None else 1.0) < 0.5:
        print(f"WARNING: LOW rig confidence (tier={r.get('tier')} conf={r.get('confidence')}) — UniRig may have produced a weak rig.")
    if preview:
        base = os.path.splitext(out)[0]
        res = _render_glb.remote(glb)
        for tag, b64 in res.items():
            fp = f"{base}_{tag}.png"
            with open(fp, "wb") as f:
                f.write(base64.b64decode(b64))
            print("SAVED preview:", fp)


# PERMISSIVE (RESALE-SAFE) full generate: the SAME crisp UV texture as premium, but baked through the DRTK (MIT)
# rasterizer → cleared for commercial resale. `modal run model3d_app.py::perform_from_image_permissive --image-path face.png --preview`
@app.local_entrypoint()
def perform_from_image_permissive(image_path: str, out_path: str = "", quality: str = "ppt-lite", seed: int = 0, preview: bool = False, norig: bool = False):
    import base64
    import json
    import os
    img = open(image_path, "rb").read()
    if norig:
        print(f"[PERMISSIVE/DRTK] input image: {len(img)} bytes -> TRELLIS.2 + DRTK TEXTURE mesh ONLY (--norig: static, no rig/clips) ...")
        r = run_pipeline_permissive.remote(image_bytes=img, quality=quality, rig=False, seed=seed, perform=False)
    else:
        print(f"[PERMISSIVE/DRTK] input image: {len(img)} bytes -> TRELLIS.2 + DRTK TEXTURE -> UniRig -> Baker (18-clip) ... (cold ~5-6 min)")
        r = run_pipeline_permissive.remote(image_bytes=img, quality=quality, rig=True, seed=seed, perform=True)
    glb = base64.b64decode(r["glb"])
    out = out_path or (os.path.splitext(image_path)[0] + (".model-permissive.glb" if norig else ".presenter-permissive.glb"))
    with open(out, "wb") as f:
        f.write(glb)
    print("PERFORM_FROM_IMAGE_PERMISSIVE:", json.dumps({k: v for k, v in r.items() if k != "glb"}, indent=2))
    print("SAVED " + ("static 3D model" if norig else "animated rigged") + " GLB (permissive/DRTK, UV-textured, RESALE-SAFE):", out)
    if not norig and not r.get("performed"):
        print("WARNING: pipeline did not reach the Baker (no embedded clips) — check the run above.")
    if r.get("tier") == "T3" or (r.get("confidence") if r.get("confidence") is not None else 1.0) < 0.5:
        print(f"WARNING: LOW rig confidence (tier={r.get('tier')} conf={r.get('confidence')}) — UniRig may have produced a weak rig.")
    if preview:
        base = os.path.splitext(out)[0]
        res = _render_glb.remote(glb)
        for tag, b64 in res.items():
            fp = f"{base}_{tag}.png"
            with open(fp, "wb") as f:
                f.write(base64.b64decode(b64))
            print("SAVED preview:", fp)


# GROUND-TRUTH RENDER: `modal run model3d_app.py::render_preview --glb-path <in> --out-dir <dir>` — headless
# Blender (Cycles CPU) render of a GLB with an auto-framed front + 3/4 camera, to see the MODEL itself
# independent of PowerPoint's am3d framing (diagnoses upright-vs-broken).
@app.function(image=performer_image, timeout=600)
def _render_glb(glb_bytes: bytes):
    import base64
    import os
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        inp = os.path.join(d, "in.glb")
        out = os.path.join(d, "prev.png")
        with open(inp, "wb") as f:
            f.write(glb_bytes)
        p = subprocess.run(["blender", "--background", "--python", "/opt/bake/render_preview.py", "--", inp, out],
                           capture_output=True, text=True)
        res = {}
        for tag in ("front", "threeq"):
            fp = out.replace(".png", f"_{tag}.png")
            if os.path.exists(fp):
                with open(fp, "rb") as f:
                    res[tag] = base64.b64encode(f.read()).decode("ascii")
        if not res:
            raise RuntimeError(f"render failed rc={p.returncode}\nSTDERR:\n{p.stderr[-2000:]}\nSTDOUT:\n{p.stdout[-900:]}")
        return res


@app.local_entrypoint()
def render_preview(glb_path: str, out_dir: str = "."):
    import base64
    import os
    res = _render_glb.remote(open(glb_path, "rb").read())
    base = os.path.splitext(os.path.basename(glb_path))[0]
    for tag, b64 in res.items():
        fp = os.path.join(out_dir, f"{base}_{tag}.png")
        with open(fp, "wb") as f:
            f.write(base64.b64decode(b64))
        print("SAVED", fp)


# LANDMARK FACE RE-PROJECTION (resale-safe "best texture" face fix): MediaPipe-aligned source face onto the GLB.
@app.function(image=face_reproject_image, timeout=600)
def _face_reproject_landmark(glb_bytes: bytes, image_bytes: bytes):
    import base64
    import io
    import sys
    sys.path.insert(0, "/opt/bake")
    import numpy as np
    from PIL import Image
    import face_landmark_reproject as flr
    glb, meta, before, after, _src = flr.run(glb_bytes, image_bytes)

    def enc(a):
        b = io.BytesIO(); Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(b, format="PNG")
        return base64.b64encode(b.getvalue()).decode()
    return {"glb": base64.b64encode(glb).decode(), "meta": meta, "before": enc(before), "after": enc(after)}


@app.local_entrypoint()
def reproject_face_landmark(glb_path: str, image_path: str, out_path: str = ""):
    """`modal run model3d_app.py::reproject_face_landmark --glb-path <textured.glb> --image-path <source.png>`
    MediaPipe-landmark-aligned source face -> baked onto the GLB texture (resale-safe). Saves the GLB + a
    before/after frontal-face render pair."""
    import base64
    import json
    import os
    r = _face_reproject_landmark.remote(glb_bytes=open(glb_path, "rb").read(), image_bytes=open(image_path, "rb").read())
    out = out_path or (os.path.splitext(glb_path)[0] + ".faced-lm.glb")
    with open(out, "wb") as f:
        f.write(base64.b64decode(r["glb"]))
    print("FACE_REPROJECT_LANDMARK:", json.dumps(r["meta"], indent=2))
    base = os.path.splitext(out)[0]
    for tag in ("before", "after"):
        with open(f"{base}_{tag}.png", "wb") as f:
            f.write(base64.b64decode(r[tag]))
        print("SAVED preview:", f"{base}_{tag}.png")
    print("SAVED faced GLB:", out)


# FLATTEN a GLB's node scale into its vertices (fixes the PP am3d over-zoom framing bug). Blender handles the
# skin; the output has identity node scale so PP auto-frames correctly. `modal run ...::flatten --glb-path <in>`.
@app.function(image=performer_image, timeout=600)
def _flatten_glb(glb_bytes: bytes, target: float = 1.8):
    import os
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        inp = os.path.join(d, "in.glb")
        out = os.path.join(d, "flat.glb")
        with open(inp, "wb") as f:
            f.write(glb_bytes)
        p = subprocess.run(["blender", "--background", "--python", "/opt/bake/flatten_scale.py", "--",
                            inp, out, str(target)], capture_output=True, text=True)
        if p.returncode != 0 or not os.path.exists(out):
            raise RuntimeError(f"flatten rc={p.returncode}\nSTDERR:\n{p.stderr[-2000:]}\nSTDOUT:\n{p.stdout[-900:]}")
        with open(out, "rb") as f:
            return f.read()


@app.local_entrypoint()
def flatten(glb_path: str, out_path: str = "", target: float = 1.8):
    import os
    out = out_path or (os.path.splitext(glb_path)[0] + ".flat.glb")
    data = _flatten_glb.remote(open(glb_path, "rb").read(), target=target)
    with open(out, "wb") as f:
        f.write(data)
    print("SAVED flattened:", out, len(data), "bytes")


# ---- Weight pre-download (run ONCE per profile) ----------------------------------------------------
# `modal run model3d_app.py::predownload` fetches BOTH model weight sets to their Volumes and commits, so the
# GPU classes never carry the multi-GB download at run time (which, on a preemptible GPU, can be interrupted
# and restart-looped). CPU functions — download is pure I/O, no GPU needed, and CPU workers aren't GPU-preempted.
@app.function(image=trellis_image, volumes={CACHE_DIR: trellis_cache},
              secrets=[modal.Secret.from_name("huggingface-token")], timeout=3600)
def predownload_trellis():
    from huggingface_hub import snapshot_download
    p = snapshot_download(TRELLIS_MODEL_ID, revision=TRELLIS_MODEL_REVISION)       # HF_HOME=/cache → lands on the Volume
    ss = snapshot_download(TRELLIS_SS_DECODER_ID, revision=TRELLIS_SS_DECODER_REVISION)  # cross-repo sparse-structure decoder (MIT)
    d = snapshot_download(DINOV3_MODEL_ID, revision=DINOV3_MODEL_REVISION)         # gated encoder → authenticated via HF_TOKEN (huggingface-token)
    br = snapshot_download(BIREFNET_ID, revision=BIREFNET_MODEL_REVISION)          # MIT bg-removal (replaces the NC RMBG-2.0); includes remote code
    trellis_cache.commit()
    print(f"committed TRELLIS.2       -> {p}", flush=True)
    print(f"committed TRELLIS-img-lg  -> {ss}", flush=True)
    print(f"committed DINOv3          -> {d}", flush=True)
    print(f"committed BiRefNet (MIT)  -> {br}", flush=True)
    return p


@app.function(image=unirig_image, volumes={CACHE_DIR: unirig_cache}, timeout=3600)
def predownload_unirig():
    from huggingface_hub import snapshot_download
    p = snapshot_download(UNIRIG_MODEL_ID, revision=UNIRIG_MODEL_REVISION)
    unirig_cache.commit()
    print(f"committed UniRig weights -> {p}", flush=True)
    return p


@app.local_entrypoint()
def predownload():
    # Fetch both in parallel; commits persist to the Volumes for every future cold start.
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        futs = [ex.submit(predownload_trellis.remote), ex.submit(predownload_unirig.remote)]
        for f in futs:
            print(f.result(), flush=True)


# ---- Quality presets (PPT-optimized) ---------------------------------------------------------------
# ppt-lite: small deck-friendly GLB (fast import, smooth render). standard: hero assets. max_num_tokens is
# the TRELLIS.2 run() detail/latency knob (default 49152); decimation_target sets the output face count —
# LOW for PPT → a few-MB GLB, and (since we ship vertex colors) also the COLOR resolution. texture_size is
# retained for a future permissive UV-texture path (PyTorch3D bake) but is UNUSED by the vertex-color export.
QUALITY = {
    "ppt-lite": {"max_num_tokens": 32768, "decimation_target": 40000, "texture_size": 1024},
    "standard": {"max_num_tokens": 49152, "decimation_target": 150000, "texture_size": 2048},
}


def _quality(name):
    return QUALITY.get(str(name or "ppt-lite").lower(), QUALITY["ppt-lite"])


def _export_glb_vertexcolor(mesh, q, out_path, upright=False):
    """RESALE-SAFE GLB export — no nvdiffrast, no texture bake.

    TRELLIS.2's stock exporter (o_voxel.postprocess.to_glb) uses nvdiffrast ONLY to rasterize the UV atlas
    so it can bake a texture; the color itself comes from `flex_gemm.grid_sample_3d` (MIT), a trilinear read
    of the generated attribute volume (verified against o-voxel/o_voxel/postprocess.py). We keep that exact
    color source but query it at the mesh VERTICES instead of texels — dropping the rasterizer entirely — and
    write a VERTEX-COLORED GLB. Vertex-colored GLBs render natively in PowerPoint (proven with the Khronos
    Fox) and fit the stylized-presenter direction; the file is smaller (no texture image) and imports fast.
    PBR maps are not emitted (glTF has no standard per-vertex metallic/roughness) — base_color+alpha ride on
    COLOR_0 with a neutral material, which is the right trade for a stylized deck avatar.

    VERIFY-ON-DEPLOY (all license-sensitive parts are settled; these are field-name confirmations that need a
    live GPU because the pipeline mesh object can't be exercised off-GPU): mesh.layout keys ('base_color',
    'alpha'), that mesh.attrs/coords/voxel_size survive mesh.simplify(), and the grid_size derivation. If a
    key differs on the first real run, it is a one-line fix localized to THIS function.
    """
    import numpy as np  # noqa: F401  (trimesh dtype paths)
    import torch
    import trimesh
    from flex_gemm.ops.grid_sample import grid_sample_3d

    # Decimate to the PPT face target with TRELLIS.2's own cumesh simplifier (MIT) — deck-friendly GLB.
    mesh.simplify(int(q["decimation_target"]))

    verts = mesh.vertices.float()                  # (V,3) torch, in the model's aabb space
    device = verts.device
    faces = mesh.faces
    attr_volume = mesh.attrs                        # (N, C) sparse attribute volume
    coords = mesh.coords                            # (N, 3) integer voxel indices into that volume
    layout = mesh.layout                            # dict[str, slice]
    voxel_size = float(mesh.voxel_size)
    aabb = torch.tensor([[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]], device=device, dtype=torch.float32)

    # Dense extent for the sparse->dense trilinear sample: canonical span/voxel_size, floored at max index.
    gs = torch.round((aabb[1] - aabb[0]) / voxel_size).long()
    gs = torch.maximum(gs, coords.max(dim=0).values.long() + 1)
    grid_size = [int(x) for x in gs.tolist()]

    # Same volume the stock texture-bake samples — read at vertices, not texels. (mode/shape mirror to_glb.)
    grid = ((verts - aabb[0]) / voxel_size).reshape(1, -1, 3)
    sampled = grid_sample_3d(
        attr_volume,
        torch.cat([torch.zeros_like(coords[:, :1]), coords], dim=-1),
        shape=torch.Size([1, attr_volume.shape[1], *grid_size]),
        grid=grid,
        mode="trilinear",
    ).reshape(verts.shape[0], attr_volume.shape[1])

    base_color = sampled[:, layout["base_color"]].clamp(0.0, 1.0)               # (V,3)
    if "alpha" in layout:
        alpha = sampled[:, layout["alpha"]].clamp(0.0, 1.0).reshape(verts.shape[0], 1)
    else:
        alpha = torch.ones((verts.shape[0], 1), device=device, dtype=base_color.dtype)
    vcol = (torch.cat([base_color, alpha], dim=-1) * 255.0).round().clamp(0, 255).to(torch.uint8).cpu().numpy()

    vnp = verts.detach().cpu().numpy()
    if upright:
        # TRELLIS's raw mesh is Z-up; the stock to_glb converts to glTF Y-up before export. The vertex-color
        # path skips that (the full rig+bake pipeline re-normalizes orientation downstream), so a STANDALONE
        # `--norig` model would come out lying on its back. Apply the SAME axis swap to_glb uses
        # (new_y=old_z, new_z=-old_y — a proper +90deg rotation about X, det=+1 so winding is preserved) so the
        # raw model stands upright in any viewer/PowerPoint. Colors were already sampled in the original space.
        vnp = vnp.copy()
        _y = vnp[:, 1].copy()
        vnp[:, 1] = vnp[:, 2]
        vnp[:, 2] = -_y
    tm = trimesh.Trimesh(
        vertices=vnp,
        faces=faces.detach().cpu().numpy(),
        vertex_colors=vcol,                         # -> glTF COLOR_0
        process=False,
    )
    tm.export(out_path)                             # binary .glb inferred from the extension


def _export_glb_textured(mesh, q, out_path):
    """PREMIUM (NON-resale-clean, EVALUATION-ONLY) export: TRELLIS.2's STOCK exporter -> a UV-TEXTURED GLB
    (proper baseColorTexture + metallicRoughness = crisp skin/clothes), instead of the vertex-color path.
    Requires the REAL NVIDIA nvdiffrast (installed ONLY in trellis_image_premium; NVIDIA non-commercial).

    Calls o_voxel.postprocess.to_glb — signature CONFIRMED live against the container (see inspect_to_glb):
        to_glb(vertices, faces, attr_volume, coords, attr_layout, aabb,
               voxel_size=None, grid_size=None, decimation_target=1_000_000, texture_size=2048, remesh=False, ...)
      -> a textured trimesh.Trimesh (TextureVisuals + PBRMaterial; GLB Y/Z axis convention applied internally).
    It does its OWN cleanup + decimation (decimation_target) + UV-unwrap + nvdiffrast texture bake, and uses the
    passed vertices/faces as the HIGH-RES reference for attribute sampling — so we pass the mesh UN-simplified
    (no mesh.simplify() first) and let to_glb decimate to the PPT target. Same inputs the vertex-color path pulls."""
    import torch
    from o_voxel.postprocess import to_glb

    verts = mesh.vertices.float()                  # (V,3) full-res, model aabb space — NOT pre-simplified
    faces = mesh.faces
    attr_volume = mesh.attrs                        # (N,C) sparse attribute volume (base_color/metallic/roughness/alpha)
    coords = mesh.coords                            # (N,3) integer voxel indices
    attr_layout = mesh.layout                       # dict[str, slice] — to_glb reads base_color/metallic/roughness/alpha
    voxel_size = float(mesh.voxel_size)
    aabb = torch.tensor([[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]], device=verts.device, dtype=torch.float32)

    textured = to_glb(
        verts, faces, attr_volume, coords, attr_layout, aabb,
        voxel_size=voxel_size,
        decimation_target=int(q["decimation_target"]),   # to_glb simplifies internally to this vertex target
        texture_size=int(q["texture_size"]),             # UV texture atlas resolution (1024 ppt-lite / 2048 standard)
    )
    print(f"PREMIUM textured export: to_glb -> {type(textured).__name__} "
          f"(verts={getattr(textured, 'vertices', []).__len__() if hasattr(textured, 'vertices') else '?'})")
    textured.export(out_path)                       # trimesh.Trimesh -> binary .glb (baseColorTexture embedded)


# PREMIUM export-API probe: import-only introspection of TRELLIS.2's stock exporter so we wire _export_glb_textured
# to the EXACT signature in ONE shot (no 6-min generation). Prints signature + source of o_voxel.postprocess.to_glb.
@app.function(image=trellis_image_premium, gpu=_GPU, timeout=300)
def _inspect_to_glb():
    import inspect
    out = {}
    try:
        import o_voxel.postprocess as pp
        out["module_members"] = [n for n in dir(pp) if not n.startswith("_")]
        fn = getattr(pp, "to_glb", None)
        if fn is not None:
            out["to_glb_signature"] = str(inspect.signature(fn))
            try:
                out["to_glb_source"] = inspect.getsource(fn)
            except Exception as e:  # pragma: no cover
                out["to_glb_source_err"] = repr(e)
    except Exception as e:  # pragma: no cover
        out["import_err"] = repr(e)
    return out


@app.local_entrypoint()
def inspect_to_glb():
    import json
    print("TO_GLB INSPECT:\n" + json.dumps(_inspect_to_glb.remote(), indent=2))


# ---- Generator: TRELLIS.2 image→GLB (memory-snapshot cold start) ------------------------------------
@app.cls(
    image=trellis_image,
    gpu=_GPU,
    volumes={CACHE_DIR: trellis_cache},
    secrets=[modal.Secret.from_name("huggingface-token")],  # HF_TOKEN → auth the gated DINOv3 encoder (pre-cached)
    # GPU memory snapshot: the CUDA-extension imports + from_pretrained + .cuda() need a GPU present during
    # capture, so enable_gpu_snapshot runs the snap=True method ON the GPU (a plain CPU snapshot crashed with
    # "0 active drivers"). Cold restores become a snapshot restore (incl. GPU state) instead of a full model load.
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=_SCALEDOWN_WINDOW,   # dev: ~0 keep-warm ($0 idle); go-live: 5 min warm window
    min_containers=_MIN_CONTAINERS,       # 0 = true scale-to-zero (dev + default)
    timeout=900,
)
class Generator:
    @modal.enter(snap=True)
    def load(self):
        # Captured into the GPU snapshot: import + build the pipeline and move it to CUDA, all with a GPU present.
        # Weights come from the pre-downloaded Volume (`modal run ...::predownload`) → a deserialize, not a
        # multi-GB download, so it is fast and not exposed to preemption. from_pretrained takes only the model id
        # (matches upstream example.py); the cache is HF_HOME=/cache (no cache_dir kwarg).
        import torch  # noqa: F401
        from trellis2.pipelines import Trellis2ImageTo3DPipeline

        # RESALE-SAFE rembg swap: TRELLIS.2's pipeline.json overrides the bundled BiRefNet rembg class to
        # briaai/RMBG-2.0 (CC-BY-NC → resale-BLOCKED). Force the class back to its OWN MIT default
        # (ZhengPeng7/BiRefNet) so from_pretrained NEVER constructs/downloads the non-commercial model, whatever
        # the config says. (BiRefNet's __init__(model_name="ZhengPeng7/BiRefNet") is the upstream default.)
        import trellis2.pipelines.rembg as _rembg
        _orig_birefnet_init = _rembg.BiRefNet.__init__
        def _birefnet_mit_only(self, *args, **kwargs):  # ignore the config's model_name; pin the MIT default
            return _orig_birefnet_init(self, model_name=BIREFNET_ID)
        _rembg.BiRefNet.__init__ = _birefnet_mit_only

        # BiRefNet.__call__ feeds a float32 input, but ZhengPeng7/BiRefNet runs in fp16 → "Input type (float)
        # and bias type (Half)". Replace __call__ with a dtype-safe copy that casts the input to the model's
        # own dtype (RMBG-2.0 happened to load fp32, so upstream never hit this).
        from torchvision import transforms as _T
        def _birefnet_call_dtypesafe(self, image):
            image_size = image.size
            x = self.transform_image(image).unsqueeze(0).to("cuda")
            x = x.to(next(self.model.parameters()).dtype)
            with torch.no_grad():
                preds = self.model(x)[-1].sigmoid().float().cpu()
            mask = _T.ToPILImage()(preds[0].squeeze()).resize(image_size)
            image.putalpha(mask)
            return image
        _rembg.BiRefNet.__call__ = _birefnet_call_dtypesafe

        # transformers 5.x nests DINOv3's transformer layers on a DINOv3ViTEncoder at `model.model`; TRELLIS.2's
        # DinoV3FeatureExtractor.extract_features does `self.model.layer` (the older flat layout) →
        # "'DINOv3ViTModel' object has no attribute 'layer'". Patch it to support both layouts.
        import trellis2.modules.image_feature_extractor as _ife
        import torch.nn.functional as _F
        def _dinov3_extract_features(self, image):
            image = image.to(self.model.embeddings.patch_embeddings.weight.dtype)
            hidden_states = self.model.embeddings(image, bool_masked_pos=None)
            position_embeddings = self.model.rope_embeddings(image)
            if hasattr(self.model, "layer"):  # older transformers: flat layers on the model
                for layer_module in self.model.layer:
                    hidden_states = layer_module(hidden_states, position_embeddings=position_embeddings)
            else:  # transformers 5.x: layers live on the encoder at self.model.model (matches DINOv3ViTModel.forward)
                hidden_states = self.model.model(hidden_states, position_embeddings).last_hidden_state
            return _F.layer_norm(hidden_states, hidden_states.shape[-1:])
        _ife.DinoV3FeatureExtractor.extract_features = _dinov3_extract_features

        t0 = time.time()
        # TRELLIS.2's loader accepts a local snapshot path, not Hugging Face's
        # ``revision`` keyword. Resolve the pinned snapshot explicitly so local
        # eval runs remain reproducible across upstream model updates.
        from huggingface_hub import snapshot_download
        _trellis_snapshot = snapshot_download(TRELLIS_MODEL_ID, revision=TRELLIS_MODEL_REVISION)
        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained(_trellis_snapshot)
        self.pipeline.cuda()
        self._load_seconds = round(time.time() - t0, 2)
        self._to_gpu_seconds = 0.0
        self._cold = True

    @modal.method()
    def generate(self, image_bytes: bytes, quality: str = "ppt-lite", seed: int = 0, upright: bool = False):
        import io
        import tempfile

        from PIL import Image

        q = _quality(quality)
        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        # run() accepts image, seed, max_num_tokens (+ sampler param dicts) — NOT `resolution`. Drive detail
        # via max_num_tokens; output mesh size via q["decimation_target"] inside the export below.
        mesh = self.pipeline.run(image, seed=seed, max_num_tokens=q["max_num_tokens"])[0]
        # RESALE-SAFE export: no nvdiffrast bake — decimate (cumesh) + vertex-color sample (flexgemm) → GLB.
        # upright=True (standalone --norig only) re-orients to glTF Y-up; the rig path leaves it as-is.
        with tempfile.TemporaryDirectory() as d:
            out_path = os.path.join(d, "out.glb")
            _export_glb_vertexcolor(mesh, q, out_path, upright=upright)
            with open(out_path, "rb") as f:
                glb_bytes = f.read()
        gen_seconds = round(time.time() - t0, 2)
        # Full active GPU-seconds for this stage = inference + (snapshot->GPU move + first-run load on cold).
        # This is the WEIGHT the MCP records so the billed L40S total distributes across it (flux pattern).
        cold_overhead = (getattr(self, "_load_seconds", 0.0) + getattr(self, "_to_gpu_seconds", 0.0)) if cold else 0.0
        return {"glb": glb_bytes, "genSeconds": gen_seconds,
                "gpuSeconds": round(gen_seconds + cold_overhead, 2), "coldStart": cold}


# ---- GeneratorPremium: TRELLIS.2 image→GLB with the STOCK nvdiffrast UV-TEXTURE bake (EVALUATION-ONLY) ----
# Parallel to Generator; the resale-clean Generator above is UNTOUCHED. Identical model load; the ONLY difference
# is the export (_export_glb_textured -> real UV texture) and the image (trellis_image_premium, real nvdiffrast).
@app.cls(
    image=trellis_image_premium,
    gpu=_GPU,
    volumes={CACHE_DIR: trellis_cache},
    secrets=[modal.Secret.from_name("huggingface-token")],
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=_SCALEDOWN_WINDOW,
    min_containers=_MIN_CONTAINERS,
    timeout=900,
)
class GeneratorPremium:
    @modal.enter(snap=True)
    def load(self):
        import torch  # noqa: F401
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        # (Same resale-safe rembg swap + dtype-safe call + DINOv3 layout patch as the clean Generator — the premium
        # delta is ONLY the textured export. Keeping the same load isolates the change to nvdiffrast + the exporter.)
        import trellis2.pipelines.rembg as _rembg
        _orig_birefnet_init = _rembg.BiRefNet.__init__
        def _birefnet_mit_only(self, *args, **kwargs):
            return _orig_birefnet_init(self, model_name=BIREFNET_ID)
        _rembg.BiRefNet.__init__ = _birefnet_mit_only
        from torchvision import transforms as _T
        def _birefnet_call_dtypesafe(self, image):
            image_size = image.size
            x = self.transform_image(image).unsqueeze(0).to("cuda")
            x = x.to(next(self.model.parameters()).dtype)
            with torch.no_grad():
                preds = self.model(x)[-1].sigmoid().float().cpu()
            mask = _T.ToPILImage()(preds[0].squeeze()).resize(image_size)
            image.putalpha(mask)
            return image
        _rembg.BiRefNet.__call__ = _birefnet_call_dtypesafe
        import trellis2.modules.image_feature_extractor as _ife
        import torch.nn.functional as _F
        def _dinov3_extract_features(self, image):
            image = image.to(self.model.embeddings.patch_embeddings.weight.dtype)
            hidden_states = self.model.embeddings(image, bool_masked_pos=None)
            position_embeddings = self.model.rope_embeddings(image)
            if hasattr(self.model, "layer"):
                for layer_module in self.model.layer:
                    hidden_states = layer_module(hidden_states, position_embeddings=position_embeddings)
            else:
                hidden_states = self.model.model(hidden_states, position_embeddings).last_hidden_state
            return _F.layer_norm(hidden_states, hidden_states.shape[-1:])
        _ife.DinoV3FeatureExtractor.extract_features = _dinov3_extract_features
        t0 = time.time()
        from huggingface_hub import snapshot_download
        _trellis_snapshot = snapshot_download(TRELLIS_MODEL_ID, revision=TRELLIS_MODEL_REVISION)
        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained(_trellis_snapshot)
        self.pipeline.cuda()
        self._load_seconds = round(time.time() - t0, 2)
        self._to_gpu_seconds = 0.0
        self._cold = True

    @modal.method()
    def generate(self, image_bytes: bytes, quality: str = "ppt-lite", seed: int = 0):
        import io
        import tempfile
        from PIL import Image
        q = _quality(quality)
        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        mesh = self.pipeline.run(image, seed=seed, max_num_tokens=q["max_num_tokens"])[0]
        with tempfile.TemporaryDirectory() as d:
            out_path = os.path.join(d, "out.glb")
            _export_glb_textured(mesh, q, out_path)   # PREMIUM: real UV texture (nvdiffrast)
            with open(out_path, "rb") as f:
                glb_bytes = f.read()
        gen_seconds = round(time.time() - t0, 2)
        cold_overhead = (getattr(self, "_load_seconds", 0.0) + getattr(self, "_to_gpu_seconds", 0.0)) if cold else 0.0
        return {"glb": glb_bytes, "genSeconds": gen_seconds,
                "gpuSeconds": round(gen_seconds + cold_overhead, 2), "coldStart": cold, "textured": True}


# ---- GeneratorPermissive: TRELLIS.2 image→GLB, STOCK to_glb texture bake through the DRTK-backed shim ----
# THIRD track. IDENTICAL to GeneratorPremium (same load + same _export_glb_textured) — the ONLY difference is the
# IMAGE (trellis_image_permissive: DRTK/MIT rasterizer, NO NVIDIA nvdiffrast). So its UV-textured output is
# RESALE-SAFE. Generator (vertex-color) and GeneratorPremium (nvdiffrast eval-only) are both UNTOUCHED.
@app.cls(
    image=trellis_image_permissive,
    gpu=_GPU,
    volumes={CACHE_DIR: trellis_cache},
    secrets=[modal.Secret.from_name("huggingface-token")],
    enable_memory_snapshot=True,
    experimental_options={"enable_gpu_snapshot": True},
    scaledown_window=_SCALEDOWN_WINDOW,
    min_containers=_MIN_CONTAINERS,
    timeout=900,
)
class GeneratorPermissive:
    @modal.enter(snap=True)
    def load(self):
        import torch  # noqa: F401
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        # Same resale-safe rembg swap + dtype-safe call + DINOv3 layout patch as Generator/GeneratorPremium.
        import trellis2.pipelines.rembg as _rembg
        _orig_birefnet_init = _rembg.BiRefNet.__init__
        def _birefnet_mit_only(self, *args, **kwargs):
            return _orig_birefnet_init(self, model_name=BIREFNET_ID)
        _rembg.BiRefNet.__init__ = _birefnet_mit_only
        from torchvision import transforms as _T
        def _birefnet_call_dtypesafe(self, image):
            image_size = image.size
            x = self.transform_image(image).unsqueeze(0).to("cuda")
            x = x.to(next(self.model.parameters()).dtype)
            with torch.no_grad():
                preds = self.model(x)[-1].sigmoid().float().cpu()
            mask = _T.ToPILImage()(preds[0].squeeze()).resize(image_size)
            image.putalpha(mask)
            return image
        _rembg.BiRefNet.__call__ = _birefnet_call_dtypesafe
        import trellis2.modules.image_feature_extractor as _ife
        import torch.nn.functional as _F
        def _dinov3_extract_features(self, image):
            image = image.to(self.model.embeddings.patch_embeddings.weight.dtype)
            hidden_states = self.model.embeddings(image, bool_masked_pos=None)
            position_embeddings = self.model.rope_embeddings(image)
            if hasattr(self.model, "layer"):
                for layer_module in self.model.layer:
                    hidden_states = layer_module(hidden_states, position_embeddings=position_embeddings)
            else:
                hidden_states = self.model.model(hidden_states, position_embeddings).last_hidden_state
            return _F.layer_norm(hidden_states, hidden_states.shape[-1:])
        _ife.DinoV3FeatureExtractor.extract_features = _dinov3_extract_features
        t0 = time.time()
        from huggingface_hub import snapshot_download
        _trellis_snapshot = snapshot_download(TRELLIS_MODEL_ID, revision=TRELLIS_MODEL_REVISION)
        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained(_trellis_snapshot)
        self.pipeline.cuda()
        self._load_seconds = round(time.time() - t0, 2)
        self._to_gpu_seconds = 0.0
        self._cold = True

    @modal.method()
    def generate(self, image_bytes: bytes, quality: str = "ppt-lite", seed: int = 0):
        import io
        import tempfile
        from PIL import Image
        q = _quality(quality)
        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        mesh = self.pipeline.run(image, seed=seed, max_num_tokens=q["max_num_tokens"])[0]
        with tempfile.TemporaryDirectory() as d:
            out_path = os.path.join(d, "out.glb")
            _export_glb_textured(mesh, q, out_path)   # PERMISSIVE: real UV texture via DRTK (MIT) — resale-safe
            with open(out_path, "rb") as f:
                glb_bytes = f.read()
        gen_seconds = round(time.time() - t0, 2)
        cold_overhead = (getattr(self, "_load_seconds", 0.0) + getattr(self, "_to_gpu_seconds", 0.0)) if cold else 0.0
        return {"glb": glb_bytes, "genSeconds": gen_seconds,
                "gpuSeconds": round(gen_seconds + cold_overhead, 2), "coldStart": cold, "textured": True}


# ---- Rigger: UniRig auto-rig (skeleton → skin → merge into a single rigged GLB) ---------------------
@app.cls(
    image=unirig_image,
    gpu=_GPU,
    volumes={CACHE_DIR: unirig_cache},
    # Plain CPU memory snapshot: warm() only imports torch (no CUDA init) + hits the pre-downloaded weight cache,
    # so it is safe on the CPU snapshotter. (UniRig runs its model inside subprocess launch scripts at run time.)
    enable_memory_snapshot=True,
    scaledown_window=_SCALEDOWN_WINDOW,   # dev: ~0 keep-warm ($0 idle); go-live: 5 min warm window
    min_containers=_MIN_CONTAINERS,       # 0 = true scale-to-zero (dev + default)
    timeout=900,
)
class Rigger:
    @modal.enter(snap=True)
    def warm(self):
        # UniRig runs via its launch/ scripts (subprocess), so model weights load inside each run; what the
        # snapshot buys here is the Python/torch import + a pre-warmed HF cache handle. Weights themselves
        # live on the Volume (auto-downloaded on first run, then committed).
        import torch  # noqa: F401
        from huggingface_hub import snapshot_download

        try:
            snapshot_download(UNIRIG_MODEL_ID, revision=UNIRIG_MODEL_REVISION, cache_dir=CACHE_DIR)  # first run populates the Volume
            unirig_cache.commit()
        except Exception:
            pass  # fail-soft: the launch scripts also fetch weights on demand
        self._cold = True

    @modal.method()
    def rig(self, glb_bytes: bytes):
        import subprocess
        import tempfile

        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in.glb")
            skel = os.path.join(d, "skel.fbx")
            skin = os.path.join(d, "skin.fbx")
            out = os.path.join(d, "rigged.glb")
            with open(src, "wb") as f:
                f.write(glb_bytes)
            env = {**os.environ, "HF_HOME": CACHE_DIR}

            def _step(cmd, expect):
                # The UniRig .sh scripts end with `echo done`, so they exit 0 even when the inner `python run.py`
                # crashes — so we ALSO require the expected output file, and surface stdout+stderr when it is
                # missing (that is where the real error, e.g. an import failure, lives).
                p = subprocess.run(cmd, cwd="/root/UniRig", env=env, capture_output=True, text=True)
                if p.returncode != 0 or not os.path.exists(expect):
                    raise RuntimeError(
                        f"UniRig step failed ({cmd[2] if len(cmd) > 2 else cmd}) rc={p.returncode} "
                        f"output_exists={os.path.exists(expect)}\nSTDERR:\n{p.stderr[-3000:]}\nSTDOUT:\n{p.stdout[-1200:]}"
                    )

            # 3-step UniRig pipeline: predict skeleton → predict skinning weights → merge onto the mesh.
            _step(["bash", "launch/inference/generate_skeleton.sh", "--input", src, "--output", skel], skel)
            _step(["bash", "launch/inference/generate_skin.sh", "--input", skel, "--output", skin], skin)
            _step(["bash", "launch/inference/merge.sh", "--source", skin, "--target", src, "--output", out], out)
            with open(out, "rb") as f:
                rigged = f.read()
        secs = round(time.time() - t0, 2)
        return {"glb": rigged, "rigSeconds": secs, "gpuSeconds": secs, "coldStart": cold}


# ---- Baker: presenter clip-baker. CPU-only (retarget is offline; per-avatar work is graph/track-copy). Headless
# Blender is invoked STRICTLY as a subprocess — model3d_app.py never `import bpy` (keeps the closed worker off the
# GPL link). Reads the one canonical clip-library GLB from the Volume; emits a multi-clip performer + manifest. ----
@app.cls(
    image=performer_image,
    volumes={_LIBRARY_DIR: clip_library},
    scaledown_window=_SCALEDOWN_WINDOW,
    min_containers=_MIN_CONTAINERS,
    timeout=900,
)
class Baker:
    @modal.method()
    def perform(self, rigged_glb_bytes: bytes, empirical_clip_timelines: dict = None, interaction_clipset: str = "canonical"):
        import tempfile
        cold = not getattr(self, "_warm", False)
        self._warm = True
        t0 = time.time()
        if not os.path.exists(_LIBRARY_GLB):
            raise RuntimeError(
                f"clip library missing at {_LIBRARY_GLB} — run `modal run model3d_app.py::bake_clip_library` first"
            )
        clipset = str(interaction_clipset or "canonical").lower()
        library_path = _LIBRARY_GLB
        clipmap_path = _CANON_CLIPMAP
        if clipset in {"authoring-v3", "authoring-clipmap-v3", "interaction"}:
            library_path = _AUTHORING_LIBRARY_GLB
            clipmap_path = _AUTHORING_CLIPMAP
            if not os.path.exists(library_path):
                raise RuntimeError("AUTHORING_CLIPSET_V3_NOT_BAKED: run bake_authoring_clip_library after all 18 Mixamo sources are staged")
        with tempfile.TemporaryDirectory() as d:
            rigged = os.path.join(d, "rigged.glb")
            with open(rigged, "wb") as f:
                f.write(rigged_glb_bytes)
            baked_path, manifest, sidecar = _bake_core(
                rigged, library_path, d,
                empirical_clip_timelines=empirical_clip_timelines,
                require_empirical_timelines=True,
                clipmap_path=clipmap_path,
            )
            manifest["interactionClipset"] = "authoring-clipmap-v3" if clipset in {"authoring-v3", "authoring-clipmap-v3", "interaction"} else "canonical"
            with open(baked_path, "rb") as f:
                baked = f.read()
        # CPU seconds (Baker has no GPU) — kept separate from gpuSeconds so the GPU-fair cost multiplier is unaffected.
        return {"glb": baked, "manifest": manifest, "tier": sidecar["tier"],
                "confidence": sidecar["confidence"], "bakeSeconds": round(time.time() - t0, 2), "coldStart": cold}


@app.function(image=performer_image, volumes={_LIBRARY_DIR: clip_library}, timeout=1800)
def _bake_clip_library(source: str = "placeholder"):
    """Bake the ONE canonical clip-library GLB and commit it to the Volume.
      source='placeholder' → hand-keyed trivial motion (proves the wiring end-to-end).
      source='mixamo'      → Mixamo FBX -> canonical (mixamo_bake.py); Mixamo skeleton == our rig, near-identity
                             retarget. BEST QUALITY. Needs the FBX set staged at /opt/mocap (owner-obtained).
      source='cmu'         → CMU BVH -> canonical (retarget_bake.py); needs the licensed BVH at /opt/mocap."""
    os.makedirs(_LIBRARY_DIR, exist_ok=True)
    if source == "mixamo":
        _blender_run("mixamo_bake.py", _CANON_SKEL, _CANON_CLIPMAP, "/opt/mocap", _LIBRARY_GLB)
    elif source == "cmu":
        _blender_run("retarget_bake.py", _CANON_SKEL, _CANON_CLIPMAP, "/opt/mocap", _LIBRARY_GLB)
    else:
        _blender_run("library_build.py", _CANON_SKEL, _CANON_CLIPMAP, _LIBRARY_GLB)
    clip_library.commit()
    return {"library": _LIBRARY_GLB, "bytes": os.path.getsize(_LIBRARY_GLB), "source": source}


@app.local_entrypoint()
def bake_clip_library(source: str = "placeholder", cmu: bool = False, mixamo: bool = False):
    import json
    src = "cmu" if cmu else ("mixamo" if mixamo else source)
    print("CLIP LIBRARY:", json.dumps(_bake_clip_library.remote(source=src), indent=2))


# EPHEMERAL CANDIDATE BAKE: evaluate a maintainer-authored clipmap/source map
# without touching the deployed canonical library Volume.  Only the baked GLB
# returns to the workstation; raw Mixamo FBX files remain build-time inputs.
@app.function(image=performer_image, timeout=1800)
def _bake_candidate_clip_library(clipmap_json: str, source_map_json: str) -> bytes:
    import json
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        clipmap_path = os.path.join(d, "candidate-clipmap.json")
        source_map_path = os.path.join(d, "candidate-sources.json")
        out_path = os.path.join(d, "candidate-library.glb")
        clipmap = json.loads(clipmap_json)
        source_map = json.loads(source_map_json)
        names = clipmap.get("clipNames") or []
        if not names or len(names) > 18 or len(names) != len(set(names)):
            raise RuntimeError("candidate clipmap must contain 1-18 unique clipNames")
        with open(clipmap_path, "w", encoding="utf-8") as f:
            json.dump(clipmap, f)
        with open(source_map_path, "w", encoding="utf-8") as f:
            json.dump(source_map, f)
        _blender_run("mixamo_bake.py", _CANON_SKEL, clipmap_path, "/opt/mocap", out_path, source_map_path, "loose")
        with open(out_path, "rb") as f:
            return f.read()


@app.local_entrypoint()
def bake_candidate_clip_library(clipmap_path: str, source_map_path: str, out_path: str):
    import hashlib
    clipmap_json = open(clipmap_path, "r", encoding="utf-8").read()
    source_map_json = open(source_map_path, "r", encoding="utf-8").read()
    payload = _bake_candidate_clip_library.remote(clipmap_json, source_map_json)
    with open(out_path, "wb") as f:
        f.write(payload)
    print("CANDIDATE_CLIP_LIBRARY:", {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
    print("SAVED candidate clip library:", out_path)


@app.function(image=performer_image, timeout=1800)
def _bake_kinetic_library_candidate_bytes() -> bytes:
    """Bake all 31 staged kinetic takes without mutating the deployed Volume.

    This is the verification path for retarget/basis changes.  The canonical
    Volume is updated only after the returned GLB has passed local and
    PowerPoint orientation gates.
    """
    import os
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        out_path = os.path.join(d, "kinetic-clips-candidate.glb")
        _blender_run(
            "mixamo_bake.py",
            _CANON_SKEL,
            _KINETIC_CLIPMAP,
            "/opt/mocap/kinetic",
            out_path,
            _KINETIC_CLIPS_MAP,
            "loose",
        )
        with open(out_path, "rb") as f:
            return f.read()


@app.local_entrypoint()
def bake_kinetic_library_candidate(out_path: str):
    import hashlib
    payload = _bake_kinetic_library_candidate_bytes.remote()
    with open(out_path, "wb") as f:
        f.write(payload)
    print("KINETIC_LIBRARY_CANDIDATE:", {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()})
    print("SAVED kinetic candidate library:", out_path)


@app.function(image=performer_image, volumes={_LIBRARY_DIR: clip_library}, timeout=1800)
def _bake_kinetic_library():
    """Bake the KINETIC clip POOL GLB (31 traversal/physics clips) onto the canonical skeleton and commit it to
    the Volume. Same near-identity Mixamo->canonical retarget as the gesture library, but reads the kinetic clipmap
    + take-map + /opt/mocap/kinetic, and runs LOOSE (leg-dominant clips don't trip the arm/head check). This is a
    transplant SOURCE (31 > PP's 18 ceiling); a deck picks its custom 18-of-31. Distinct from canonical-clips.glb."""
    import json
    os.makedirs(_LIBRARY_DIR, exist_ok=True)
    n = len(json.load(open(_KINETIC_CLIPMAP))["clipNames"])
    _blender_run("mixamo_bake.py", _CANON_SKEL, _KINETIC_CLIPMAP, "/opt/mocap/kinetic", _KINETIC_LIBRARY_GLB, _KINETIC_CLIPS_MAP, "loose")
    clip_library.commit()
    return {"library": _KINETIC_LIBRARY_GLB, "bytes": os.path.getsize(_KINETIC_LIBRARY_GLB), "clips": n}


@app.local_entrypoint()
def bake_kinetic_library():
    import json
    print("KINETIC LIBRARY:", json.dumps(_bake_kinetic_library.remote(), indent=2))


@app.function(image=performer_image, volumes={_LIBRARY_DIR: clip_library}, timeout=1800)
def _bake_authoring_clip_library():
    """Bake the dedicated 18-slot interaction library once its licensed Mixamo
    sources are staged and the contract rows have advanced beyond TO_SOURCE.

    The adapter is generated in the ephemeral worker filesystem so the source
    FBX and the adapter never ship; only the baked GLB is committed to the
    private Modal Volume. The function fails before Blender if any slot is not
    source-complete, which prevents a partial interaction library from being
    advertised.
    """
    import json
    import os
    import tempfile
    clipmap = json.load(open(_AUTHORING_CLIPMAP))
    slots = clipmap.get("slots") or []
    if len(slots) != int(clipmap.get("clipCeiling") or 18):
        raise RuntimeError("authoring clipset v3 slot count does not match clipCeiling")
    missing = []
    clips = {}
    clip_names = []
    for slot in slots:
        source = slot.get("source") or {}
        filename = source.get("fbx") or source.get("filename")
        if source.get("status") == "TO_SOURCE" or not filename:
            missing.append(f"slot {slot.get('slot')} {slot.get('slug')}: source.fbx/status")
            continue
        if not os.path.exists(os.path.join("/opt/mocap", filename)):
            missing.append(f"slot {slot.get('slot')} {slot.get('slug')}: /opt/mocap/{filename}")
            continue
        slug = str(slot.get("slug"))
        clip_names.append(f"{int(slot.get('slot')):02d}_{slug}")
        clips[slug] = {"fbx": filename}
    if missing:
        raise RuntimeError("AUTHORING_CLIPSET_V3_NOT_SOURCE_COMPLETE: " + "; ".join(missing))
    if len(clip_names) != 18:
        raise RuntimeError(f"authoring clipset adapter expected 18 clips, found {len(clip_names)}")
    os.makedirs(_LIBRARY_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        adapter = os.path.join(d, "authoring-clipmap-adapter.json")
        source_map = os.path.join(d, "authoring-mixamo-sources.json")
        json.dump({"canonicalSkeletonVersion": clipmap.get("canonicalSkeletonVersion", "2"), "clipNames": clip_names}, open(adapter, "w"))
        json.dump({"clips": clips}, open(source_map, "w"))
        raw = os.path.join(d, "authoring_raw.glb")
        _blender_run("mixamo_bake.py", _CANON_SKEL, adapter, "/opt/mocap", raw, source_map, blender="blender")
        gltf_ops_path = os.path.join(d, "authoring_ordered.glb")
        import sys
        sys.path.insert(0, "/opt/bake")
        import gltf_ops
        gltf_ops.reorder_animations(raw, gltf_ops_path, clip_names)
        gltf_ops.validate(gltf_ops_path, {"clipNames": clip_names, "canonicalSkeletonVersion": clipmap.get("canonicalSkeletonVersion", "2")}, require_mesh=False)
        with open(gltf_ops_path, "rb") as f:
            payload = f.read()
        with open(_AUTHORING_LIBRARY_GLB, "wb") as f:
            f.write(payload)
    clip_library.commit()
    return {"library": _AUTHORING_LIBRARY_GLB, "bytes": os.path.getsize(_AUTHORING_LIBRARY_GLB), "clips": 18, "contract": "authoring-clipmap-v3"}


@app.local_entrypoint()
def bake_authoring_clip_library():
    import json
    print("AUTHORING CLIP LIBRARY:", json.dumps(_bake_authoring_clip_library.remote(), indent=2))


# NOTE: the per-deck custom-N kinetic transplant is a PURE-CPU pygltflib channel-swap (bone-name copy) that needs
# NO GPU and NO Blender — the base character is already matte+slim+has-a-poster, so only the ANIMATION tracks are
# swapped and contact frames recomputed. It therefore runs IN-PROCESS (ported to JS: ir/kinetic-transplant.mjs)
# at deck-compile time, NOT on Modal. Modal is only for the ONE-TIME GPU/Blender steps (rig the base avatar; bake
# the kinetic library above). bake/transplant_kinetic.py is kept as the reference implementation.


# ---- Pipeline: chains Generator → Rigger → (optional) Baker. Spawned as a Function (no 150s web cap). ----
@app.function(image=orchestrator_image, timeout=1800)
def run_pipeline(image_bytes: bytes, quality: str, rig: bool, seed: int, perform: bool = False, empirical_clip_timelines: dict = None, interaction_clipset: str = "canonical") -> dict:
    # STANDALONE static model (--norig): re-orient to glTF Y-up so it stands upright in a viewer/PowerPoint.
    # When it will be rigged/performed, leave the raw orientation UNTOUCHED (the rig+bake path normalizes it,
    # and that pipeline is validated against the raw frame — don't perturb it).
    upright = not (rig or perform)
    gen = Generator().generate.remote(image_bytes, quality=quality, seed=seed, upright=upright)
    glb = gen["glb"]
    rigged = False
    rig_seconds = 0.0
    rig_gpu = 0.0
    rig_cold = False
    # perform (bake presenter gesture clips) requires a rigged skeleton to bake onto → it implies rig.
    if perform:
        rig = True
    if rig:
        r = Rigger().rig.remote(glb)
        glb = r["glb"]
        rigged = True
        rig_seconds = r["rigSeconds"]
        rig_gpu = r["gpuSeconds"]
        rig_cold = bool(r["coldStart"])

    performed = False
    bake_seconds = 0.0
    manifest = None
    tier = None
    confidence = None
    if perform and rigged:
        b = Baker().perform.remote(glb, empirical_clip_timelines=empirical_clip_timelines, interaction_clipset=interaction_clipset)
        glb = b["glb"]
        performed = True
        bake_seconds = b["bakeSeconds"]
        manifest = b["manifest"]
        tier = b["tier"]
        confidence = b["confidence"]

    model = "trellis-2"
    if rigged:
        model = "trellis-2+unirig"
    if performed:
        model = "trellis-2+unirig+baker"
    out = {
        "glb": base64.b64encode(glb).decode("ascii"),
        "glbBytes": len(glb),
        "rigged": rigged,
        "performed": performed,
        "model": model,
        "genSeconds": gen["genSeconds"],
        "rigSeconds": rig_seconds,
        # Total billed GPU-seconds across the GPU stages (Baker is CPU — its bakeSeconds are reported separately).
        "gpuSeconds": round(float(gen["gpuSeconds"]) + float(rig_gpu), 2),
        "bakeSeconds": bake_seconds,
        "coldStart": bool(gen["coldStart"]) or rig_cold,
        "gpuType": _GPU_LABEL,
        "meshResolution": quality,
    }
    if performed:
        # The machine-readable contract the MCP consumes: manifest.clipMap seeds presenter-director.mjs.
        out["manifest"] = manifest
        out["clipMap"] = manifest.get("clipMap")
        out["tier"] = tier
        out["confidence"] = confidence
    return out


# PREMIUM (EVALUATION-ONLY) pipeline: identical to run_pipeline but GeneratorPremium (real nvdiffrast UV-texture
# bake). Rigger + Baker are shared/unchanged. Output has a real baseColorTexture (crisp skin/clothes) — but is
# NOT resale-clean until an NVIDIA commercial license is obtained. The resale-clean run_pipeline is UNTOUCHED.
@app.function(image=orchestrator_image, timeout=1800)
def run_pipeline_premium(image_bytes: bytes, quality: str, rig: bool, seed: int, perform: bool = False, empirical_clip_timelines: dict = None, interaction_clipset: str = "canonical") -> dict:
    gen = GeneratorPremium().generate.remote(image_bytes, quality=quality, seed=seed)
    glb = gen["glb"]
    rigged = rig_cold = False
    rig_seconds = rig_gpu = 0.0
    if perform:
        rig = True
    if rig:
        r = Rigger().rig.remote(glb)
        glb = r["glb"]
        rigged = True
        rig_seconds = r["rigSeconds"]
        rig_gpu = r["gpuSeconds"]
        rig_cold = bool(r["coldStart"])
    performed = False
    bake_seconds = 0.0
    manifest = tier = confidence = None
    if perform and rigged:
        b = Baker().perform.remote(glb, empirical_clip_timelines=empirical_clip_timelines, interaction_clipset=interaction_clipset)
        glb = b["glb"]
        performed = True
        bake_seconds = b["bakeSeconds"]
        manifest = b["manifest"]
        tier = b["tier"]
        confidence = b["confidence"]
    model = "trellis-2-premium"
    if rigged:
        model = "trellis-2-premium+unirig"
    if performed:
        model = "trellis-2-premium+unirig+baker"
    out = {
        "glb": base64.b64encode(glb).decode("ascii"),
        "glbBytes": len(glb),
        "rigged": rigged,
        "performed": performed,
        "premium": True,
        "textured": True,
        "model": model,
        "genSeconds": gen["genSeconds"],
        "rigSeconds": rig_seconds,
        "gpuSeconds": round(float(gen["gpuSeconds"]) + float(rig_gpu), 2),
        "bakeSeconds": bake_seconds,
        "coldStart": bool(gen["coldStart"]) or rig_cold,
        "gpuType": _GPU_LABEL,
        "meshResolution": quality,
    }
    if performed:
        out["manifest"] = manifest
        out["clipMap"] = manifest.get("clipMap")
        out["tier"] = tier
        out["confidence"] = confidence
    return out


# PERMISSIVE (RESALE-SAFE) pipeline: identical to run_pipeline_premium but GeneratorPermissive (UV texture baked
# through the DRTK/MIT rasterizer — NO NVIDIA code). Its textured output IS clear for commercial resale. Rigger +
# Baker shared/unchanged. The resale-clean run_pipeline AND the premium run_pipeline_premium are both UNTOUCHED.
@app.function(image=orchestrator_image, timeout=1800)
def run_pipeline_permissive(image_bytes: bytes, quality: str, rig: bool, seed: int, perform: bool = False, empirical_clip_timelines: dict = None, interaction_clipset: str = "canonical") -> dict:
    gen = GeneratorPermissive().generate.remote(image_bytes, quality=quality, seed=seed)
    glb = gen["glb"]
    rigged = rig_cold = False
    rig_seconds = rig_gpu = 0.0
    if perform:
        rig = True
    if rig:
        r = Rigger().rig.remote(glb)
        glb = r["glb"]
        rigged = True
        rig_seconds = r["rigSeconds"]
        rig_gpu = r["gpuSeconds"]
        rig_cold = bool(r["coldStart"])
    performed = False
    bake_seconds = 0.0
    manifest = tier = confidence = None
    if perform and rigged:
        b = Baker().perform.remote(glb, empirical_clip_timelines=empirical_clip_timelines, interaction_clipset=interaction_clipset)
        glb = b["glb"]
        performed = True
        bake_seconds = b["bakeSeconds"]
        manifest = b["manifest"]
        tier = b["tier"]
        confidence = b["confidence"]
    model = "trellis-2-permissive-drtk"
    if rigged:
        model = "trellis-2-permissive-drtk+unirig"
    if performed:
        model = "trellis-2-permissive-drtk+unirig+baker"
    out = {
        "glb": base64.b64encode(glb).decode("ascii"),
        "glbBytes": len(glb),
        "rigged": rigged,
        "performed": performed,
        "permissive": True,        # DRTK/MIT rasterizer → resale-safe (distinct from premium's nvdiffrast eval-only)
        "textured": True,
        "model": model,
        "genSeconds": gen["genSeconds"],
        "rigSeconds": rig_seconds,
        "gpuSeconds": round(float(gen["gpuSeconds"]) + float(rig_gpu), 2),
        "bakeSeconds": bake_seconds,
        "coldStart": bool(gen["coldStart"]) or rig_cold,
        "gpuType": _GPU_LABEL,
        "meshResolution": quality,
    }
    if performed:
        out["manifest"] = manifest
        out["clipMap"] = manifest.get("clipMap")
        out["tier"] = tier
        out["confidence"] = confidence
    return out


# ---- Endpoint: SUBMIT (spawn) / POLL. Every call is fast, so the 150s web cap is never hit. ----------
@app.function(image=orchestrator_image, secrets=[modal.Secret.from_name("betterpptx-model3d-token")], timeout=120)
@modal.fastapi_endpoint(method="POST", label=MODEL3D_ENDPOINT_LABEL)
def generate(item: dict):
    from fastapi import HTTPException

    expected = os.environ.get("MODEL3D_ENDPOINT_TOKEN", "")
    if not expected or item.get("token") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    # POLL mode: { token, jobId } → return the result if the spawned pipeline has finished, else pending.
    job_id = str(item.get("jobId") or "").strip()
    if job_id:
        call = modal.FunctionCall.from_id(job_id)
        try:
            result = call.get(timeout=0)  # non-blocking; TimeoutError if still running
        except TimeoutError:
            return {"status": "pending", "jobId": job_id}
        return {"status": "done", **result}

    # SUBMIT mode: { token, image, rig, quality, seed, empirical_clip_timelines } → spawn the pipeline.
    image_b64 = str(item.get("image") or "")
    if not image_b64:
        raise HTTPException(status_code=400, detail="image (base64) required")
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="image must be valid base64")

    quality = str(item.get("quality") or "ppt-lite").lower()
    perform = bool(item.get("perform", False))
    rig = bool(item.get("rig", True)) or perform  # perform bakes onto a rigged skeleton → implies rig
    seed = int(item.get("seed") or 0)
    timelines = item.get("empirical_clip_timelines")
    if perform and timelines is None:
        raise HTTPException(status_code=422, detail="perform=true requires empirical_clip_timelines measured from the final baked GLB in PowerPoint")
    interaction_clipset = str(item.get("interaction_clipset") or "canonical")
    call = run_pipeline.spawn(image_bytes, quality, rig, seed, perform=perform, empirical_clip_timelines=timelines, interaction_clipset=interaction_clipset)
    return {"status": "pending", "jobId": call.object_id}


# ---- Endpoint: READ-ONLY HEALTH / IDENTITY ---------------------------------------------------------
# This endpoint performs no GPU work and never reads the request body. The
# deploy command supplies the immutable revision/source digest as deploy-time
# environment metadata; missing metadata is reported as null, never inferred.
@app.function(image=orchestrator_image, timeout=30)
@modal.fastapi_endpoint(method="GET", label=MODEL3D_HEALTH_ENDPOINT_LABEL)
def health():
    return {
        "status": "ok",
        "scope": "native-3d-presenter-only",
        "revision": MODEL3D_DEPLOYMENT_REVISION or None,
        "sourceDigest": MODEL3D_SOURCE_DIGEST or None,
    }
