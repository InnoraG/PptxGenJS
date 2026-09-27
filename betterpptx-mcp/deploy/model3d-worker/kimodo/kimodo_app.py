"""Private Modal motion lab for the 18-slot BetterPPTX authoring-v3 contract.

The app has no web endpoint. Generated BVH files and candidate GLBs stay in a
private Modal Volume until they are explicitly downloaded for oracle review.
No function in this file promotes a candidate to the production clip library.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import zipfile

import modal


APP_NAME = "betterpptx-motion-lab"
KIMODO_GIT_REPOSITORY = "https://github.com/nv-tlabs/kimodo.git"
KIMODO_GIT_REVISION = "1aece8c124d73d255ceff5086d983b844c9f4e94"
KIMODO_MODEL_REPOSITORY = "nvidia/Kimodo-SOMA-RP-v1.1"
KIMODO_MODEL_REVISION = "6c9233af1180b8151e3c4703477104af5dce9dd5"
LLAMA_BASE_REPOSITORY = "meta-llama/Meta-Llama-3-8B-Instruct"
LLAMA_BASE_REVISION = "8afb486c1db24fe5011ec46dfbe5b5dccdb575c2"
TEXT_ENCODER_MNTP_REPOSITORY = "McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp"
TEXT_ENCODER_MNTP_REVISION = "31474e395ada192e8ed1586db6be79fb3b70c9c0"
TEXT_ENCODER_SUPERVISED_REPOSITORY = "McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised"
TEXT_ENCODER_SUPERVISED_REVISION = "baa8ebf04a1c2500e61288e7dad65e8ae42601a7"
MODEL_DISPLAY_NAME = "Kimodo-SOMA-RP-v1.1"

# PowerPoint frames a 3D model from its static bounds and does not expand the
# viewport for animation root travel. Keep turn semantics but compress the
# generated walk-turn's horizontal root path so the presenter remains visible.
# The PowerPoint render oracle is the authority for this retarget-only policy.
RETARGET_VIEWPORT_POLICIES = {
    "walk_turn": {"rootTranslationScale": 0.08},
}

HERE = Path(__file__).resolve().parent
WORKER_ROOT = HERE.parent
PROFILE_PATH = HERE / "authoring-v3-profile.json"
PRESENTER_MOTION_PROFILE_PATH = HERE / "default-presenter-motion-profile.json"
CANONICAL_DIR = WORKER_ROOT / "canonical"
BAKE_DIR = WORKER_ROOT / "bake"
ASSETS_DIR = WORKER_ROOT.parent.parent / "assets"
PRESENTER_SOURCE_JOE = ASSETS_DIR / "presenter-source-joe-static.glb"
MODEL_CACHE_DIR = "/cache"
MOTION_STORE_DIR = "/motions"
CHECKPOINT_DIR = f"{MODEL_CACHE_DIR}/checkpoints/{MODEL_DISPLAY_NAME}"
LLAMA_BASE_DIR = f"{MODEL_CACHE_DIR}/text-encoder/meta-llama-3-8b-instruct"
TEXT_ENCODER_MNTP_DIR = f"{MODEL_CACHE_DIR}/text-encoder/mntp"
TEXT_ENCODER_SUPERVISED_DIR = f"{MODEL_CACHE_DIR}/text-encoder/supervised"
GPU_PREFERENCES = [item.strip() for item in os.environ.get("BETTERPPTX_KIMODO_GPU", "L40S,A100-40GB").split(",") if item.strip()]
DEV_MODE = os.environ.get("BETTERPPTX_KIMODO_DEV_MODE", "1").strip().lower() in {"1", "true", "yes", "on"}
SCALEDOWN_WINDOW = int(os.environ.get("BETTERPPTX_KIMODO_SCALEDOWN_WINDOW", "2" if DEV_MODE else "300"))
MAX_CONTAINERS = int(os.environ.get("BETTERPPTX_KIMODO_MAX_CONTAINERS", "1"))
RUN_ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$")

for immutable_revision in (
    KIMODO_GIT_REVISION,
    KIMODO_MODEL_REVISION,
    LLAMA_BASE_REVISION,
    TEXT_ENCODER_MNTP_REVISION,
    TEXT_ENCODER_SUPERVISED_REVISION,
):
    if not re.fullmatch(r"[0-9a-f]{40}", immutable_revision):
        raise RuntimeError(f"Kimodo deployment revision is not immutable: {immutable_revision}")
if not GPU_PREFERENCES:
    raise RuntimeError("BETTERPPTX_KIMODO_GPU resolved to an empty GPU preference list")

app = modal.App(APP_NAME)
model_cache = modal.Volume.from_name("betterpptx-kimodo-model-cache", create_if_missing=True)
motion_store = modal.Volume.from_name("betterpptx-kimodo-motion-store", create_if_missing=True)
huggingface_secret = modal.Secret.from_name("huggingface-token")


kimodo_image = (
    # Reuse the CUDA/Python/Torch stack already proven by the BetterPPTX
    # model3d worker instead of inheriting NGC's unreachable extra pip index.
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "cmake", "build-essential", "ninja-build")
    .pip_install("torch==2.6.0", index_url="https://download.pytorch.org/whl/cu124")
    .run_commands(
        f"git clone --recursive {KIMODO_GIT_REPOSITORY} /opt/kimodo",
        f"cd /opt/kimodo && git checkout {KIMODO_GIT_REVISION}",
        # The NGC base adds an unreachable NVIDIA package index. Use public PyPI
        # explicitly and install only inference/BVH dependencies; the upstream
        # demo/video/render stack is irrelevant to this private batch worker.
        "PIP_CONFIG_FILE=/dev/null PIP_EXTRA_INDEX_URL= python -m pip install --index-url https://pypi.org/simple "
        "numpy==1.26.4 scipy==1.15.3 hydra-core==1.3.2 omegaconf==2.3.0 "
        "transformers==5.1.0 peft==0.18.1 accelerate==1.13.0 "
        "huggingface-hub==1.6.0 safetensors==0.7.0 tokenizers==0.22.2 "
        "urllib3==2.6.3 boto3==1.42.66 einops==0.8.2 tqdm==4.67.3 "
        "packaging==26.0 pydantic==2.12.5 filelock==3.25.2 bvhio==1.5.4",
        "cd /opt/kimodo && SKIP_MOTION_CORRECTION_IN_SETUP=0 "
        "PIP_CONFIG_FILE=/dev/null PIP_EXTRA_INDEX_URL= python -m pip install --index-url https://pypi.org/simple -e . --no-deps",
        "python -c 'import kimodo, motion_correction; from kimodo.model import load_model'",
    )
    .add_local_dir(HERE, "/opt/betterpptx-kimodo", copy=True)
    .env({
        "PYTHONPATH": "/opt/betterpptx-kimodo:/opt/kimodo",
        "HF_HOME": f"{MODEL_CACHE_DIR}/huggingface",
        "HUGGINGFACE_CACHE_DIR": f"{MODEL_CACHE_DIR}/huggingface",
        "CHECKPOINT_DIR": f"{MODEL_CACHE_DIR}/checkpoints",
        "TEXT_ENCODER_MODE": "local",
        "TEXT_ENCODER_DEVICE": "cuda",
        "HF_ENABLE_PARALLEL_LOADING": "YES",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
)

control_image = modal.Image.debian_slim(python_version="3.11").pip_install("huggingface_hub==1.6.0")

BLENDER_VERSION = "4.3.2"
BLENDER_URL = f"https://download.blender.org/release/Blender4.3/blender-{BLENDER_VERSION}-linux-x64.tar.xz"
performer_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "curl", "xz-utils", "libgl1", "libglib2.0-0", "libxrender1", "libxi6",
        "libxxf86vm1", "libxfixes3", "libxkbcommon0", "libsm6", "libxext6", "libgomp1", "libegl1",
    )
    .run_commands(
        f"curl -fsSL {BLENDER_URL} -o /tmp/blender.tar.xz",
        "mkdir -p /opt/blender && tar -xJf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 && rm /tmp/blender.tar.xz",
        "ln -s /opt/blender/blender /usr/local/bin/blender",
        "blender --background --version",
    )
    .pip_install("pygltflib", "numpy")
    .add_local_dir(CANONICAL_DIR, "/opt/canonical", copy=True)
    .add_local_dir(BAKE_DIR, "/opt/bake", copy=True)
    .add_local_dir(HERE, "/opt/betterpptx-kimodo", copy=True)
    .add_local_file(PRESENTER_SOURCE_JOE, "/opt/presenter-source-joe-static.glb", copy=True)
)


def _safe_run_id(run_id: str) -> str:
    value = str(run_id or "").strip()
    if not RUN_ID_PATTERN.fullmatch(value):
        raise ValueError("run_id must be 1-96 characters using letters, digits, dot, underscore, or hyphen")
    return value


def _profile_digest(profile: dict) -> str:
    return hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


@app.function(
    image=control_image,
    volumes={MODEL_CACHE_DIR: model_cache},
    secrets=[huggingface_secret],
    timeout=3600,
)
def _predownload_models() -> dict:
    """Resolve every remote model at an immutable revision into the private cache."""
    from huggingface_hub import get_hf_file_metadata, hf_hub_url, snapshot_download
    from huggingface_hub.errors import GatedRepoError

    try:
        base_metadata = get_hf_file_metadata(hf_hub_url(
            repo_id=LLAMA_BASE_REPOSITORY,
            filename="config.json",
            revision=LLAMA_BASE_REVISION,
        ))
    except GatedRepoError as error:
        return {
            "status": "BLOCKED_GATED_TEXT_ENCODER",
            "repository": LLAMA_BASE_REPOSITORY,
            "revision": LLAMA_BASE_REVISION,
            "reason": "The selected Modal profile's existing huggingface-token is not authorized for Meta Llama 3.",
            "weightsDownloaded": False,
            "httpStatus": getattr(getattr(error, "response", None), "status_code", 403),
        }

    sources = [
        (KIMODO_MODEL_REPOSITORY, KIMODO_MODEL_REVISION, CHECKPOINT_DIR),
        (LLAMA_BASE_REPOSITORY, LLAMA_BASE_REVISION, LLAMA_BASE_DIR),
        (TEXT_ENCODER_MNTP_REPOSITORY, TEXT_ENCODER_MNTP_REVISION, TEXT_ENCODER_MNTP_DIR),
        (TEXT_ENCODER_SUPERVISED_REPOSITORY, TEXT_ENCODER_SUPERVISED_REVISION, TEXT_ENCODER_SUPERVISED_DIR),
    ]
    evidence = []
    for repository, revision, destination in sources:
        resolved = snapshot_download(repo_id=repository, revision=revision, local_dir=destination)
        evidence.append({"repository": repository, "revision": revision, "cacheDirectory": destination, "resolved": bool(resolved)})
    _write_json(Path(MODEL_CACHE_DIR) / "immutable-sources.json", {
        "schema": "betterpptx.kimodo-immutable-sources.v1",
        "kimodoCode": {"repository": KIMODO_GIT_REPOSITORY, "revision": KIMODO_GIT_REVISION},
        "models": evidence,
    })
    model_cache.commit()
    return {"status": "READY", "baseConfigSize": base_metadata.size, "sources": evidence}


@app.cls(
    image=kimodo_image,
    gpu=GPU_PREFERENCES,
    volumes={MODEL_CACHE_DIR: model_cache, MOTION_STORE_DIR: motion_store},
    secrets=[huggingface_secret],
    scaledown_window=SCALEDOWN_WINDOW,
    min_containers=0,
    max_containers=MAX_CONTAINERS,
    timeout=1800,
)
class MotionGenerator:
    @modal.enter()
    def load(self) -> None:
        import torch
        from kimodo.model import load_model
        from kimodo_text_encoder import KimodoLlamaTextEncoder

        required = [CHECKPOINT_DIR, LLAMA_BASE_DIR, TEXT_ENCODER_MNTP_DIR, TEXT_ENCODER_SUPERVISED_DIR]
        missing = [item for item in required if not Path(item).exists()]
        if missing:
            raise RuntimeError(f"KIMODO_MODELS_NOT_PREDOWNLOADED: {missing}")
        self.device = "cuda:0"
        text_encoder = KimodoLlamaTextEncoder(
            base_model_path=LLAMA_BASE_DIR,
            mntp_adapter_path=TEXT_ENCODER_MNTP_DIR,
            supervised_adapter_path=TEXT_ENCODER_SUPERVISED_DIR,
            dtype="bfloat16",
            llm_dim=4096,
            device="cuda",
        )
        self.model, resolved_name = load_model(
            MODEL_DISPLAY_NAME,
            device=self.device,
            return_resolved_name=True,
            text_encoder=text_encoder,
        )
        self.model_name = resolved_name
        self.output_skeleton = getattr(self.model, "output_skeleton", self.model.skeleton)
        self.fps = float(self.model.fps)
        if abs(self.fps - 30.0) > 0.001:
            raise RuntimeError(f"Kimodo model fps must be 30 for authoring-v3, got {self.fps}")
        torch.set_grad_enabled(False)

    def _generate(
        self,
        prompts: list[str] | str,
        frames: int,
        steps: int,
        seed: int,
        candidate_count: int,
        constraints: list | None,
        cfg_weight: list[float],
        post_processing: bool,
        *,
        cfg_type: str = "separated",
        first_heading_angle: float = 0.0,
        root_margin: float = 0.04,
    ):
        import torch

        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        with torch.inference_mode():
            return self.model(
                prompts,
                frames,
                num_denoising_steps=steps,
                multi_prompt=False,
                constraint_lst=constraints or [],
                cfg_weight=cfg_weight,
                cfg_type=cfg_type,
                num_samples=candidate_count,
                return_numpy=True,
                first_heading_angle=first_heading_angle,
                post_processing=post_processing,
                root_margin=root_margin,
                progress_bar=lambda iterable: iterable,
            )

    def _candidate_skeleton(self, candidate: dict):
        joint_count = int(candidate["local_rot_mats"].shape[-3])
        for skeleton in (self.output_skeleton, self.model.skeleton):
            if int(skeleton.nbjoints) == joint_count:
                return skeleton
        raise RuntimeError(
            f"Kimodo candidate has {joint_count} joints, but the model/input skeletons "
            f"have {self.output_skeleton.nbjoints}/{self.model.skeleton.nbjoints}"
        )

    def _candidate_for_model_skeleton(self, candidate: dict) -> dict:
        """Project Kimodo's public SOMA77 output back to its SOMA30 constraint rig."""
        import numpy as np

        source_skeleton = self._candidate_skeleton(candidate)
        target_skeleton = self.model.skeleton
        if int(source_skeleton.nbjoints) == int(target_skeleton.nbjoints):
            return candidate
        source_indices = np.asarray([
            int(source_skeleton.bone_index[name]) for name in target_skeleton.bone_order_names
        ], dtype=np.int64)
        projected = dict(candidate)
        for key in ("posed_joints", "global_rot_mats", "local_rot_mats"):
            projected[key] = np.take(np.asarray(candidate[key]), source_indices, axis=1)
        return projected

    def _bvh_bytes(self, candidate: dict) -> bytes:
        import torch
        from kimodo.exports.bvh import motion_to_bvh_bytes

        return motion_to_bvh_bytes(
            torch.as_tensor(candidate["local_rot_mats"], device=self.device),
            torch.as_tensor(candidate["root_positions"], device=self.device),
            skeleton=self._candidate_skeleton(candidate),
            fps=self.fps,
            standard_tpose=True,
        )

    @modal.method()
    def generate_slot(self, run_id: str, profile: dict, slot: dict, mode: str = "quality") -> dict:
        from kimodo_contract import build_refinement_constraints, score_candidate, split_candidates, validate_motion_profile

        started = time.perf_counter()
        run_id = _safe_run_id(run_id)
        if mode not in {"canary", "quality"}:
            raise ValueError("mode must be canary or quality")
        profile_errors = validate_motion_profile(profile)
        if profile_errors:
            raise ValueError("invalid Kimodo motion profile: " + "; ".join(profile_errors[:20]))
        defaults = profile["defaults"]
        cfg_type = str(defaults.get("cfgType", "separated"))
        first_heading_angle = float(defaults.get("firstHeadingAngle", 0.0))
        root_margin = float(defaults.get("rootMargin", 0.04))
        candidate_count = int(defaults["canaryCandidateCount"] if mode == "canary" else defaults["candidateCount"])
        steps = int(defaults["canaryDiffusionSteps"] if mode == "canary" else defaults["diffusionSteps"])
        frames = int(round(float(slot["durationSeconds"]) * self.fps))
        prompts = [slot["promptVariants"][index % len(slot["promptVariants"])] for index in range(candidate_count)]
        output = self._generate(
            prompts,
            frames,
            steps,
            int(slot["seed"]),
            candidate_count,
            None,
            list(defaults.get("textGuidance", [2.5, 2.5])),
            bool(defaults.get("postProcessing", True)),
            cfg_type=cfg_type,
            first_heading_angle=first_heading_angle,
            root_margin=root_margin,
        )
        generated = split_candidates(output)
        candidates: list[dict] = []
        materialized: list[tuple[dict, dict]] = []
        for index, candidate in enumerate(generated):
            assessment = score_candidate(candidate, slot, defaults, self.output_skeleton, self.fps)
            metadata = {
                "candidateId": f"base-{index:02d}",
                "kind": "text-candidate",
                "prompt": prompts[index],
                "seed": int(slot["seed"]),
                "batchIndex": index,
                **assessment,
            }
            candidates.append(metadata)
            materialized.append((metadata, candidate))

        if mode == "quality" and bool(defaults.get("refineBestCandidate")) and generated:
            best_index = max(range(len(candidates)), key=lambda item: candidates[item]["score"])
            best_candidate = generated[best_index]
            constraint_candidate = self._candidate_for_model_skeleton(best_candidate)
            height_target = None
            height_band_name = (slot.get("qualityGates") or {}).get("heightBand")
            height_band = (defaults.get("heightBands") or {}).get(height_band_name) or []
            if len(height_band) == 2:
                desired_height = (float(height_band[0]) + float(height_band[1])) / 2.0
                height_target = desired_height
            else:
                desired_height = None
            is_nod = (slot.get("qualityGates") or {}).get("headMotion") == "nod"
            refinement_attempts = 3 if desired_height is not None or is_nod or slot.get("authoredTargets") else 1
            for refinement_index in range(refinement_attempts):
                constraints = build_refinement_constraints(
                    constraint_candidate,
                    slot,
                    defaults,
                    self.model.skeleton,
                    self.fps,
                    self.device,
                    height_target_override=height_target,
                    nod_pitch_degrees=24.0 + refinement_index * 6.0,
                )
                if not constraints:
                    break
                refinement_seed = int(slot["seed"]) + 9000 + best_index + refinement_index
                refined_output = self._generate(
                    prompts[best_index],
                    frames,
                    steps,
                    refinement_seed,
                    1,
                    constraints,
                    list(defaults.get("constraintGuidance", [2.5, 4.0])),
                    bool(defaults.get("postProcessing", True)),
                    cfg_type=cfg_type,
                    first_heading_angle=first_heading_angle,
                    root_margin=root_margin,
                )
                refined_candidate = split_candidates(refined_output)[0]
                assessment = score_candidate(refined_candidate, slot, defaults, self.output_skeleton, self.fps)
                metadata = {
                    "candidateId": f"refined-{refinement_index:02d}",
                    "kind": "self-anchored-refinement",
                    "derivedFrom": candidates[best_index]["candidateId"],
                    "prompt": prompts[best_index],
                    "seed": refinement_seed,
                    "constraintCount": len(constraints),
                    **assessment,
                }
                candidates.append(metadata)
                materialized.append((metadata, refined_candidate))
                if assessment["kinematicGatesPassed"]:
                    break
                if desired_height is not None and not assessment["gates"].get("heightBand", True):
                    plateaus = assessment["metrics"].get("plateaus") or []
                    measured = next(
                        (item.get("heightRatio") for item in plateaus if item.get("heightBand") == height_band_name),
                        None,
                    )
                    if measured is not None:
                        height_target = max(0.15, min(1.05, float(height_target) + desired_height - float(measured)))

        slot_number = int(slot["slot"])
        slug = str(slot["slug"])
        slot_directory = Path(MOTION_STORE_DIR) / "runs" / run_id / f"{slot_number:02d}-{slug}"
        slot_directory.mkdir(parents=True, exist_ok=True)
        for metadata, candidate in materialized:
            filename = f"{metadata['candidateId']}.bvh"
            payload = self._bvh_bytes(candidate)
            (slot_directory / filename).write_bytes(payload)
            metadata["bvhRelativePath"] = str((slot_directory / filename).relative_to(MOTION_STORE_DIR)).replace("\\", "/")
            metadata["bvhBytes"] = len(payload)
            metadata["bvhSha256"] = hashlib.sha256(payload).hexdigest()

        # A candidate that satisfies the motion contract must always outrank a
        # slightly higher-scoring candidate that failed a required kinematic
        # gate.  The score is only meaningful within the same pass/fail tier.
        selected = max(
            candidates,
            key=lambda item: (bool(item["kinematicGatesPassed"]), float(item["score"])),
        )
        selected_source = slot_directory / f"{selected['candidateId']}.bvh"
        selected_path = slot_directory / "selected.bvh"
        shutil.copyfile(selected_source, selected_path)
        selection_status = "KINEMATIC_GATE_PASSED_REVIEW_REQUIRED" if selected["kinematicGatesPassed"] else "FAILED_CLOSED"
        report = {
            "schema": "betterpptx.kimodo-slot-report.v1",
            "runId": run_id,
            "mode": mode,
            "slot": slot_number,
            "slug": slug,
            "profileSha256": _profile_digest(profile),
            "generator": profile["generator"],
            "candidateCount": len(candidates),
            "diffusionSteps": steps,
            "effectiveParameters": {
                "fps": self.fps,
                "frames": frames,
                "durationSeconds": float(slot["durationSeconds"]),
                "candidateCountRequested": candidate_count,
                "diffusionSteps": steps,
                "textGuidance": list(defaults.get("textGuidance", [2.5, 2.5])),
                "constraintGuidance": list(defaults.get("constraintGuidance", [2.5, 4.0])),
                "cfgType": cfg_type,
                "firstHeadingAngle": first_heading_angle,
                "rootMargin": root_margin,
                "postProcessing": bool(defaults.get("postProcessing", True)),
                "candidateSeed": int(slot["seed"]),
                "candidateSeedSemantics": "deterministic-batched-torch-stream",
                "promptVariantsUsed": prompts,
            },
            "selectedCandidateId": selected["candidateId"],
            "selectedBvhRelativePath": str(selected_path.relative_to(MOTION_STORE_DIR)).replace("\\", "/"),
            "selectionStatus": selection_status,
            "promotionStatus": "CANDIDATE_ONLY",
            "pendingGates": ["retarget-validation", "powerpoint-oracle-timeline", "g5-distribution-record", "owner-release-approval"],
            "generationSeconds": round(time.perf_counter() - started, 3),
            "candidates": candidates,
        }
        _write_json(slot_directory / "slot-report.json", report)
        motion_store.commit()
        return report


@app.function(image=control_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=300)
def _load_existing_slot_reports(run_id: str, profile_sha256: str, mode: str, slots: list[dict]) -> list[dict]:
    """Return only immutable, internally consistent slot results for safe resume."""
    run_id = _safe_run_id(run_id)
    motion_store.reload()
    reports = []
    for slot in slots:
        slot_number = int(slot["slot"])
        slug = str(slot["slug"])
        report_path = (
            Path(MOTION_STORE_DIR) / "runs" / run_id /
            f"{slot_number:02d}-{slug}" / "slot-report.json"
        )
        if not report_path.exists():
            continue
        report = json.loads(report_path.read_text(encoding="utf-8"))
        expected = {
            "schema": "betterpptx.kimodo-slot-report.v1",
            "runId": run_id,
            "mode": mode,
            "slot": slot_number,
            "slug": slug,
            "profileSha256": profile_sha256,
            "promotionStatus": "CANDIDATE_ONLY",
        }
        if any(report.get(key) != value for key, value in expected.items()):
            continue
        if mode == "quality" and report.get("selectionStatus") != "KINEMATIC_GATE_PASSED_REVIEW_REQUIRED":
            continue
        selected_path = Path(MOTION_STORE_DIR) / str(report.get("selectedBvhRelativePath") or "")
        if not selected_path.is_file():
            continue
        reports.append(report)
    return reports


@app.function(image=control_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=300)
def _record_run(run_id: str, profile: dict, mode: str, reports: list[dict]) -> dict:
    run_id = _safe_run_id(run_id)
    slots = sorted((int(report["slot"]) for report in reports))
    expected = list(range(18))
    complete = slots == expected
    passed = complete and all(report["selectionStatus"] == "KINEMATIC_GATE_PASSED_REVIEW_REQUIRED" for report in reports)
    manifest = {
        "schema": "betterpptx.kimodo-authoring-run.v1",
        "runId": run_id,
        "mode": mode,
        "strategy": profile["strategy"],
        "profileSha256": _profile_digest(profile),
        "generator": profile["generator"],
        "requestedSlots": slots,
        "complete18SlotRun": complete,
        "allKinematicGatesPassed": passed,
        "promotionStatus": "CANDIDATE_ONLY",
        "pendingGates": ["retarget-validation", "powerpoint-oracle-timeline", "g5-distribution-record", "owner-release-approval"],
        "reports": [{
            "slot": report["slot"],
            "slug": report["slug"],
            "selectionStatus": report["selectionStatus"],
            "selectedCandidateId": report["selectedCandidateId"],
            "selectedBvhRelativePath": report["selectedBvhRelativePath"],
        } for report in reports],
    }
    destination = Path(MOTION_STORE_DIR) / "runs" / run_id / "run-manifest.json"
    _write_json(destination, manifest)
    motion_store.commit()
    return manifest


@app.function(image=control_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=300)
def _record_profile_run(run_id: str, profile: dict, mode: str, reports: list[dict]) -> dict:
    """Record a complete custom-profile run without changing authoring-v3."""
    run_id = _safe_run_id(run_id)
    slots = sorted(int(report["slot"]) for report in reports)
    expected = sorted(int(slot["slot"]) for slot in profile["slots"])
    complete = slots == expected
    passed = complete and all(
        report["selectionStatus"] == "KINEMATIC_GATE_PASSED_REVIEW_REQUIRED"
        for report in reports
    )
    manifest = {
        "schema": "betterpptx.kimodo-profile-run.v1",
        "runId": run_id,
        "mode": mode,
        "strategy": profile["strategy"],
        "profileSchema": profile["schema"],
        "profileSha256": _profile_digest(profile),
        "generator": profile["generator"],
        "requestedSlots": slots,
        "expectedSlots": expected,
        "completeProfileRun": complete,
        "allKinematicGatesPassed": passed,
        "candidateGlbName": profile.get("candidateGlbName", "kimodo-profile-candidate.glb"),
        "promotionStatus": "CANDIDATE_ONLY",
        "pendingGates": ["retarget-validation", "powerpoint-oracle-timeline", "g5-distribution-record", "owner-release-approval"],
        "reports": [{
            "slot": report["slot"],
            "slug": report["slug"],
            "selectionStatus": report["selectionStatus"],
            "selectedCandidateId": report["selectedCandidateId"],
            "selectedBvhRelativePath": report["selectedBvhRelativePath"],
        } for report in reports],
    }
    destination = Path(MOTION_STORE_DIR) / "runs" / run_id / "run-manifest.json"
    _write_json(destination, manifest)
    motion_store.commit()
    return manifest


@app.function(image=control_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=600)
def _download_run(run_id: str, selected_only: bool = False) -> bytes:
    run_id = _safe_run_id(run_id)
    run_directory = Path(MOTION_STORE_DIR) / "runs" / run_id
    if not (run_directory / "run-manifest.json").exists():
        raise FileNotFoundError(f"Kimodo run does not exist: {run_id}")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(run_directory.rglob("*")):
            if not file.is_file():
                continue
            if selected_only and file.suffix.lower() == ".bvh" and file.name != "selected.bvh":
                continue
            archive.write(file, file.relative_to(run_directory.parent))
    return output.getvalue()


@app.function(image=performer_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=1800)
def _bake_candidate_run(run_id: str) -> dict:
    """Retarget a complete passing run to a candidate GLB; never promote it."""
    run_id = _safe_run_id(run_id)
    run_directory = Path(MOTION_STORE_DIR) / "runs" / run_id
    manifest_path = run_directory / "run-manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Kimodo run does not exist: {run_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest.get("complete18SlotRun") or not manifest.get("allKinematicGatesPassed"):
        raise RuntimeError("KIMODO_RUN_NOT_KINEMATICALLY_COMPLETE: candidate bake requires 18 passing slots")
    reports = manifest["reports"]
    clip_names = [f"{int(item['slot']):02d}_{item['slug']}" for item in reports]
    clip_map = {str(item["slug"]): int(item["slot"]) for item in reports}
    clipmap_contract = {
        "canonicalSkeletonVersion": "2",
        "clipMap": clip_map,
        "clipNames": clip_names,
    }
    source_map = {
        item["slug"]: {
            "bvh": item["selectedBvhRelativePath"],
            **RETARGET_VIEWPORT_POLICIES.get(str(item["slug"]), {}),
        }
        for item in reports
    }
    with tempfile.TemporaryDirectory() as temporary:
        temporary_path = Path(temporary)
        adapter = temporary_path / "authoring-clipmap-adapter.json"
        sources = temporary_path / "authoring-kimodo-sources.json"
        raw = temporary_path / "authoring-kimodo-raw.glb"
        ordered = temporary_path / "authoring-kimodo-ordered.glb"
        _write_json(adapter, clipmap_contract)
        _write_json(sources, {"clips": source_map})
        process = subprocess.run([
            "blender", "--background", "--python", "/opt/betterpptx-kimodo/kimodo_retarget_bake.py", "--",
            "/opt/canonical/canonical_skeleton.json", str(adapter), MOTION_STORE_DIR, str(raw), str(sources),
            "/opt/betterpptx-kimodo/soma77-bonemap.json",
        ], capture_output=True, text=True)
        if process.returncode != 0 or not raw.exists():
            raise RuntimeError(f"Kimodo Blender retarget failed rc={process.returncode}\nSTDERR:\n{process.stderr[-3000:]}\nSTDOUT:\n{process.stdout[-1500:]}")
        import sys
        sys.path.insert(0, "/opt/bake")
        import gltf_ops
        gltf_ops.reorder_animations(str(raw), str(ordered), clip_names)
        validation = gltf_ops.validate(str(ordered), clipmap_contract, require_mesh=False)
        destination = run_directory / "authoring-interaction-clips-v3-candidate.glb"
        shutil.copyfile(ordered, destination)
    bake_report = {
        "schema": "betterpptx.kimodo-candidate-bake.v1",
        "runId": run_id,
        "status": "RETARGETED_CANDIDATE_ONLY",
        "glbRelativePath": str(destination.relative_to(MOTION_STORE_DIR)).replace("\\", "/"),
        "glbBytes": destination.stat().st_size,
        "glbSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "validation": validation,
        "retargetViewportPolicies": RETARGET_VIEWPORT_POLICIES,
        "promotionStatus": "CANDIDATE_ONLY",
        "pendingGates": ["powerpoint-oracle-timeline", "g5-distribution-record", "owner-release-approval"],
    }
    _write_json(run_directory / "candidate-bake-report.json", bake_report)
    motion_store.commit()
    return bake_report


@app.function(image=performer_image, volumes={MOTION_STORE_DIR: motion_store}, timeout=1800)
def _bake_profile_candidate_run(run_id: str, profile: dict) -> dict:
    """Retarget a complete passing custom profile; never promote it."""
    run_id = _safe_run_id(run_id)
    run_directory = Path(MOTION_STORE_DIR) / "runs" / run_id
    manifest_path = run_directory / "run-manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Kimodo run does not exist: {run_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest.get("completeProfileRun") or not manifest.get("allKinematicGatesPassed"):
        raise RuntimeError("KIMODO_PROFILE_RUN_NOT_KINEMATICALLY_COMPLETE: candidate bake requires every profile slot to pass")
    reports = sorted(manifest["reports"], key=lambda item: int(item["slot"]))
    profile_slots = {
        str(item["slug"]): item
        for item in profile["slots"]
    }
    clip_names = [f"{int(item['slot']):02d}_{item['slug']}" for item in reports]
    clipmap_contract = {
        "canonicalSkeletonVersion": "2",
        "clipMap": {str(item["slug"]): int(item["slot"]) for item in reports},
        "clipNames": clip_names,
    }
    source_map = {
        item["slug"]: {
            "bvh": item["selectedBvhRelativePath"],
            "authoredTargets": profile_slots[str(item["slug"])].get("authoredTargets", []),
        }
        for item in reports
    }
    with tempfile.TemporaryDirectory() as temporary:
        temporary_path = Path(temporary)
        adapter = temporary_path / "profile-clipmap-adapter.json"
        sources = temporary_path / "profile-kimodo-sources.json"
        raw = temporary_path / "profile-kimodo-raw.glb"
        ordered = temporary_path / "profile-kimodo-ordered.glb"
        _write_json(adapter, clipmap_contract)
        _write_json(sources, {"clips": source_map})
        process = subprocess.run([
            "blender", "--background", "--python", "/opt/betterpptx-kimodo/kimodo_retarget_bake.py", "--",
            "/opt/canonical/canonical_skeleton.json", str(adapter), MOTION_STORE_DIR, str(raw), str(sources),
            "/opt/betterpptx-kimodo/soma77-bonemap.json", "/opt/presenter-source-joe-static.glb",
        ], capture_output=True, text=True)
        if process.returncode != 0 or not raw.exists():
            raise RuntimeError(f"Kimodo Blender retarget failed rc={process.returncode}\nSTDERR:\n{process.stderr[-3000:]}\nSTDOUT:\n{process.stdout[-1500:]}")
        import sys
        sys.path.insert(0, "/opt/bake")
        import gltf_ops
        gltf_ops.reorder_animations(str(raw), str(ordered), clip_names)
        validation = gltf_ops.validate(str(ordered), clipmap_contract, require_mesh=False)
        destination = run_directory / str(manifest.get("candidateGlbName") or "kimodo-profile-candidate.glb")
        shutil.copyfile(ordered, destination)
    bake_report = {
        "schema": "betterpptx.kimodo-profile-candidate-bake.v1",
        "runId": run_id,
        "status": "RETARGETED_CANDIDATE_ONLY",
        "glbRelativePath": str(destination.relative_to(MOTION_STORE_DIR)).replace("\\", "/"),
        "glbBytes": destination.stat().st_size,
        "glbSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "validation": validation,
        "promotionStatus": "CANDIDATE_ONLY",
        "pendingGates": ["powerpoint-oracle-timeline", "g5-distribution-record", "owner-release-approval"],
    }
    _write_json(run_directory / "candidate-bake-report.json", bake_report)
    motion_store.commit()
    return bake_report


def _load_profile() -> dict:
    from kimodo_contract import validate_motion_profile

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    errors = validate_motion_profile(profile)
    if errors:
        raise ValueError("invalid authoring-v3 Kimodo profile: " + "; ".join(errors[:20]))
    return profile


def _load_presenter_motion_profile(profile_path: str = "") -> dict:
    from kimodo_contract import validate_motion_profile

    path = Path(profile_path).expanduser().resolve() if str(profile_path or "").strip() else PRESENTER_MOTION_PROFILE_PATH
    profile = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_motion_profile(profile)
    if errors:
        raise ValueError(f"invalid presenter Kimodo profile {path}: " + "; ".join(errors[:20]))
    return profile


def _select_slots(profile: dict, selectors: str) -> list[dict]:
    if not selectors.strip():
        return list(profile["slots"])
    requested = {item.strip() for item in selectors.split(",") if item.strip()}
    selected = [slot for slot in profile["slots"] if str(slot["slot"]) in requested or slot["slug"] in requested]
    matched = {str(slot["slot"]) for slot in selected} | {slot["slug"] for slot in selected}
    missing = sorted(item for item in requested if item not in matched)
    if missing:
        raise ValueError(f"unknown slot selectors: {', '.join(missing)}")
    return selected


@app.local_entrypoint()
def predownload() -> None:
    cache_status = _predownload_models.remote()
    print(json.dumps(cache_status, indent=2))
    if cache_status.get("status") != "READY":
        raise RuntimeError(
            f"KIMODO_DEPENDENCY_NOT_READY: {cache_status.get('status')} "
            f"{cache_status.get('repository', '')}"
        )


@app.local_entrypoint()
def generate_authoring_v3(mode: str = "canary", slots: str = "", run_id: str = "") -> None:
    profile = _load_profile()
    selected_slots = _select_slots(profile, slots)
    if not run_id:
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        run_id = f"authoring-v3-{mode}-{stamp}-{_profile_digest(profile)[:8]}"
    run_id = _safe_run_id(run_id)
    cache_status = _predownload_models.remote()
    print("MODEL CACHE:", json.dumps(cache_status, indent=2))
    if cache_status.get("status") != "READY":
        raise RuntimeError(
            f"KIMODO_DEPENDENCY_NOT_READY: {cache_status.get('status')} "
            f"{cache_status.get('repository', '')}"
        )
    generator = MotionGenerator()
    profile_sha256 = _profile_digest(profile)
    reports = _load_existing_slot_reports.remote(run_id, profile_sha256, mode, selected_slots)
    reports_by_slot = {int(report["slot"]): report for report in reports}
    for slot in selected_slots:
        if int(slot["slot"]) in reports_by_slot:
            report = reports_by_slot[int(slot["slot"])]
            print(
                f"KIMODO SLOT {report['slot']:02d} {report['slug']}: "
                f"REUSED {report['selectionStatus']} selected={report['selectedCandidateId']}"
            )
            continue
        report = generator.generate_slot.remote(run_id, profile, slot, mode)
        reports.append(report)
        print(f"KIMODO SLOT {report['slot']:02d} {report['slug']}: {report['selectionStatus']} selected={report['selectedCandidateId']}")
    reports.sort(key=lambda report: int(report["slot"]))
    manifest = _record_run.remote(run_id, profile, mode, reports)
    print("KIMODO RUN:", json.dumps(manifest, indent=2))


@app.local_entrypoint()
def generate_presenter_motions(mode: str = "canary", slots: str = "", run_id: str = "", profile_path: str = "") -> None:
    profile = _load_presenter_motion_profile(profile_path)
    selected_slots = _select_slots(profile, slots)
    if not run_id:
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        run_id = f"presenter-motion-{mode}-{stamp}-{_profile_digest(profile)[:8]}"
    run_id = _safe_run_id(run_id)
    cache_status = _predownload_models.remote()
    print("MODEL CACHE:", json.dumps(cache_status, indent=2))
    if cache_status.get("status") != "READY":
        raise RuntimeError(
            f"KIMODO_DEPENDENCY_NOT_READY: {cache_status.get('status')} "
            f"{cache_status.get('repository', '')}"
        )
    generator = MotionGenerator()
    profile_sha256 = _profile_digest(profile)
    reports = _load_existing_slot_reports.remote(run_id, profile_sha256, mode, selected_slots)
    reports_by_slot = {int(report["slot"]): report for report in reports}
    for slot in selected_slots:
        if int(slot["slot"]) in reports_by_slot:
            report = reports_by_slot[int(slot["slot"])]
            print(
                f"KIMODO PRESENTER {report['slot']:02d} {report['slug']}: "
                f"REUSED {report['selectionStatus']} selected={report['selectedCandidateId']}"
            )
            continue
        report = generator.generate_slot.remote(run_id, profile, slot, mode)
        reports.append(report)
        print(f"KIMODO PRESENTER {report['slot']:02d} {report['slug']}: {report['selectionStatus']} selected={report['selectedCandidateId']}")
    reports.sort(key=lambda report: int(report["slot"]))
    manifest = _record_profile_run.remote(run_id, profile, mode, reports)
    print("KIMODO PRESENTER RUN:", json.dumps(manifest, indent=2))


@app.local_entrypoint()
def bake_authoring_v3_candidate(run_id: str) -> None:
    print(json.dumps(_bake_candidate_run.remote(_safe_run_id(run_id)), indent=2))


@app.local_entrypoint()
def bake_presenter_motion_candidate(run_id: str, profile_path: str = "") -> None:
    profile = _load_presenter_motion_profile(profile_path)
    print(json.dumps(_bake_profile_candidate_run.remote(_safe_run_id(run_id), profile), indent=2))


@app.local_entrypoint()
def download_authoring_v3(run_id: str, destination: str = "", selected_only: bool = False) -> None:
    run_id = _safe_run_id(run_id)
    payload = _download_run.remote(run_id, selected_only)
    if destination:
        destination_path = Path(destination).expanduser().resolve()
    else:
        destination_path = (WORKER_ROOT / "mocap" / "authoring-v3" / "kimodo-runs" / f"{run_id}.zip").resolve()
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    destination_path.write_bytes(payload)
    print(json.dumps({
        "runId": run_id,
        "destination": str(destination_path),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "selectedOnly": selected_only,
    }, indent=2))


@app.local_entrypoint()
def download_presenter_motions(run_id: str, destination: str = "", selected_only: bool = False) -> None:
    run_id = _safe_run_id(run_id)
    payload = _download_run.remote(run_id, selected_only)
    if destination:
        destination_path = Path(destination).expanduser().resolve()
    else:
        destination_path = (WORKER_ROOT / "mocap" / "presenter-motion" / "kimodo-runs" / f"{run_id}.zip").resolve()
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    destination_path.write_bytes(payload)
    print(json.dumps({
        "runId": run_id,
        "destination": str(destination_path),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "selectedOnly": selected_only,
    }, indent=2))
