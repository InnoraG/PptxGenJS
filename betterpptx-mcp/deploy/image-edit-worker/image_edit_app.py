"""Private reference-aware image worker for BetterPPTX Authoring Excellence.

This worker is a separate scale-to-zero family from ordinary text creation. It accepts only
single-reference edit/reference or multi-reference requests from the authenticated MCP backend.
Input images are decoded in memory, never written to disk, never retained, and never used for
training. The public product surface exposes capabilities and opaque handles, not this model.
"""

import base64
import binascii
import hashlib
import io
import json
import os
import time

import modal


APP_NAME = "betterpptx-image-edit"
MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
MODEL_REVISION = "e7b7dc27f91deacad38e78976d1f2b499d76a294"
CACHE_DIR = "/cache"
ENDPOINT_LABEL = (os.environ.get("IMAGE_EDIT_ENDPOINT_LABEL") or "").strip() or "e91c3a70"
# Production default is a dedicated owner-controlled secret. A research-only deployment may set
# IMAGE_EDIT_MODAL_SECRET_NAME=betterpptx-flux-token to reuse an existing private worker credential
# without creating an untracked secret; the HTTP handler accepts that secret's FLUX_ENDPOINT_TOKEN.
MODAL_SECRET_NAME = (os.environ.get("IMAGE_EDIT_MODAL_SECRET_NAME") or "").strip() or "betterpptx-image-edit-token"
MAX_REFERENCES = 4
MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_INPUT_PIXELS = 25_000_000
MAX_REFERENCE_EDGE = 2048

# Keep the proven L40S path first, but let Modal schedule the same container on
# a compatible backup when L40S capacity is temporarily exhausted. Modal 1.5.x
# accepts an ordered GPU list and selects the first available type.
GPU_PREFERENCE = ["L40S", "A10G"]

# Direct runtime pins are mirrored in dependency-lock.json. The Diffusers commit is the audited
# implementation revision that exposes Flux2KleinPipeline. Do not float any entry at deploy time.
image = (
    modal.Image.debian_slim(python_version="3.12")
    # Modal's slim base currently carries protobuf 6.x metadata. Remove it before installing the
    # audited 7.35.1 pin so the resolved inventory has exactly one runtime distribution record.
    .run_commands("python -m pip uninstall -y protobuf")
    .pip_install(
        "torch==2.8.0",
        "torchvision==0.23.0",
        "https://github.com/huggingface/diffusers/archive/55ae46db619223625c2ab5debcbb5131f1094129.tar.gz",
        "transformers==5.14.1",
        "accelerate==1.14.0",
        "huggingface_hub==1.23.0",
        "tokenizers==0.22.2",
        "safetensors==0.8.0",
        "sentencepiece==0.2.2",
        "protobuf==7.35.1",
        "pillow==12.3.0",
        "fastapi[standard]==0.139.2",
    )
    .env({"HF_HOME": CACHE_DIR})
)

app = modal.App(APP_NAME)
model_cache = modal.Volume.from_name("betterpptx-image-edit-hf-cache", create_if_missing=True)


@app.function(image=image, timeout=120)
def resolved_dependency_inventory():
    """CPU-only build attestation: exact installed distributions, no secrets or environment values."""
    import importlib.metadata

    rows = []
    for distribution in importlib.metadata.distributions():
        name = distribution.metadata.get("Name") or distribution.name
        classifiers = distribution.metadata.get_all("Classifier") or []
        license_classifiers = [value for value in classifiers if value.startswith("License ::")]
        declared_license = distribution.metadata.get("License-Expression") or distribution.metadata.get("License")
        rows.append({
            "name": str(name),
            "version": str(distribution.version),
            "declaredLicense": str(declared_license).strip() if declared_license else None,
            "licenseClassifiers": license_classifiers,
            "projectUrl": distribution.metadata.get("Home-page") or distribution.metadata.get("Project-URL"),
            "location": str(distribution.locate_file("")),
        })
    names = sorted({row["name"] for row in rows}, key=str.lower)
    selected = {}
    for name in names:
        try:
            selected[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            pass
    return {"packages": sorted(rows, key=lambda row: row["name"].lower()), "selectedVersions": selected}


def _round16(value, default=1024, lo=256, hi=1536):
    n = int(value or default)
    n = max(lo, min(hi, n))
    return max(lo, (n // 16) * 16)


def _decode_reference(encoded):
    from PIL import Image

    value = str(encoded or "").strip()
    if value.startswith("data:"):
        value = value.split(",", 1)[-1]
    if not value:
        raise ValueError("empty reference image")
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalid reference image encoding") from exc
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("reference image exceeds the input limit")
    Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS
    try:
        source = Image.open(io.BytesIO(raw))
        source.load()
        if source.width * source.height > MAX_INPUT_PIXELS:
            raise ValueError("reference image exceeds the pixel limit")
        # Copy into a fresh RGB image to strip file metadata and detach from the encoded buffer.
        clean = source.convert("RGB")
        clean.thumbnail((MAX_REFERENCE_EDGE, MAX_REFERENCE_EDGE), Image.Resampling.LANCZOS)
        return clean.copy()
    except Exception as exc:
        raise ValueError("reference image could not be decoded") from exc


@app.cls(
    image=image,
    gpu=GPU_PREFERENCE,
    volumes={CACHE_DIR: model_cache},
    secrets=[modal.Secret.from_name(MODAL_SECRET_NAME)],
    scaledown_window=60,
    min_containers=0,
    max_containers=1,
    timeout=300,
)
class ImageEditWorker:
    @staticmethod
    def _actual_gpu_type(torch):
        name = str(torch.cuda.get_device_name(0) or '').upper()
        if 'A10' in name:
            return 'A10G'
        if 'L40' in name:
            return 'L40S'
        if 'A100' in name:
            return 'A100-40GB'
        if 'H100' in name:
            return 'H100'
        return name[:64] or 'unknown'

    @modal.enter()
    def load(self):
        import torch
        from diffusers import Flux2KleinPipeline

        started = time.time()
        self.pipe = Flux2KleinPipeline.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            torch_dtype=torch.bfloat16,
            cache_dir=CACHE_DIR,
        ).to("cuda")
        model_cache.commit()
        self._load_seconds = round(time.time() - started, 3)
        self._cold = True

    def _perform(self, item: dict):
        import torch

        capability = str(item.get("capability") or "").strip().lower()
        if capability not in {"edit", "reference", "multi-reference"}:
            raise ValueError("unsupported capability")
        prompt = str(item.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("prompt required")
        encoded_images = item.get("images")
        if not isinstance(encoded_images, list) or not encoded_images:
            raise ValueError("reference image required")
        if len(encoded_images) > MAX_REFERENCES:
            raise ValueError("too many reference images")
        if capability == "multi-reference" and len(encoded_images) < 2:
            raise ValueError("multiple reference images required")

        references = [_decode_reference(value) for value in encoded_images]

        width = _round16(item.get("width"))
        height = _round16(item.get("height"))
        steps = max(1, min(8, int(item.get("steps") or 4)))
        seed = int(item.get("seed") or 0)
        cold = bool(getattr(self, "_cold", False))
        self._cold = False
        started = time.time()
        try:
            generator = torch.Generator("cuda").manual_seed(seed)
            torch.cuda.reset_peak_memory_stats()
            output = self.pipe(
                prompt=prompt,
                image=references[0] if len(references) == 1 else references,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=1.0,
                max_sequence_length=512,
                generator=generator,
            ).images[0]
            buffer = io.BytesIO()
            output.save(buffer, format="PNG")
            torch.cuda.synchronize()
            inference_seconds = round(time.time() - started, 3)
            peak_allocated_bytes = int(torch.cuda.max_memory_allocated())
            peak_reserved_bytes = int(torch.cuda.max_memory_reserved())
            return {
                "image": base64.b64encode(buffer.getvalue()).decode("ascii"),
                "contentType": "image/png",
                "width": width,
                "height": height,
                "model": MODEL_ID,
                "modelRevision": MODEL_REVISION,
                "capability": capability,
                "seconds": inference_seconds,
                "gpuSeconds": round(
                    inference_seconds + (getattr(self, "_load_seconds", 0.0) if cold else 0.0), 3
                ),
                "peakAllocatedBytes": peak_allocated_bytes,
                "peakReservedBytes": peak_reserved_bytes,
                "coldStart": cold,
                "gpuType": self._actual_gpu_type(torch),
                "gpuPreference": "L40S|A10G",
            }
        finally:
            # Best-effort early release of user-provided pixel buffers; nothing is persisted.
            references.clear()

    @modal.fastapi_endpoint(method="POST", label=ENDPOINT_LABEL)
    def generate(self, item: dict):
        from fastapi import HTTPException

        expected = os.environ.get("IMAGE_EDIT_ENDPOINT_TOKEN", "") or os.environ.get("FLUX_ENDPOINT_TOKEN", "")
        if not expected or item.get("token") != expected:
            raise HTTPException(status_code=401, detail="unauthorized")
        try:
            return self._perform(item)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @modal.method()
    def research_canary(self, image_b64: str, prompt: str, width: int = 1024, height: int = 1024,
                        steps: int = 4, seed: int = 0):
        """Authenticated CLI-only canary; bypasses the HTTP token but not input/resource bounds."""
        return self._perform({
            "capability": "reference",
            "prompt": prompt,
            "images": [image_b64],
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed,
        })

    @modal.method()
    def research_multi_canary(self, image_b64s: list[str], prompt: str, width: int = 1024,
                              height: int = 1024, steps: int = 4, seed: int = 0):
        """CLI-only multi-reference canary through the same bounded inference path."""
        return self._perform({
            "capability": "multi-reference",
            "prompt": prompt,
            "images": image_b64s,
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed,
        })

    @modal.method()
    def research_repair_canary(self, image_b64: str, diagnosis: str, repair_prompt: str,
                               width: int = 512, height: int = 512, steps: int = 1, seed: int = 0):
        """CLI-only bounded diagnosis→repair pair; both candidates use the same reference and bounds."""
        if not str(diagnosis or '').strip() or not str(repair_prompt or '').strip():
            raise ValueError("diagnosis and repair_prompt required")
        baseline = self._perform({
            "capability": "reference", "prompt": str(diagnosis).strip(), "images": [image_b64],
            "width": width, "height": height, "steps": steps, "seed": seed,
        })
        repaired = self._perform({
            "capability": "reference", "prompt": str(repair_prompt).strip(), "images": [image_b64],
            "width": width, "height": height, "steps": steps, "seed": seed,
        })
        return {"baseline": baseline, "repaired": repaired, "attempts": 1, "bounded": True}


@app.local_entrypoint()
def canary(reference_path: str, output_path: str, prompt: str, width: int = 1024, height: int = 1024,
           steps: int = 4, seed: int = 0):
    """Run one owned-synthetic private canary and write only the generated result locally."""
    with open(reference_path, "rb") as source:
        encoded = base64.b64encode(source.read()).decode("ascii")
    result = ImageEditWorker().research_canary.remote(
        image_b64=encoded,
        prompt=prompt,
        width=width,
        height=height,
        steps=steps,
        seed=seed,
    )
    with open(output_path, "wb") as target:
        target.write(base64.b64decode(result.pop("image")))
    print(result)
    print(f"saved synthetic canary output: {output_path}")


@app.local_entrypoint()
def repair_canary(reference_path: str, baseline_output_path: str, repaired_output_path: str,
                  diagnosis: str, repair_prompt: str, width: int = 512, height: int = 512,
                  steps: int = 1, seed: int = 0):
    """Run one bounded diagnosis→repair pair on an owned synthetic reference."""
    with open(reference_path, "rb") as source:
        encoded = base64.b64encode(source.read()).decode("ascii")
    result = ImageEditWorker().research_repair_canary.remote(
        image_b64=encoded, diagnosis=diagnosis, repair_prompt=repair_prompt,
        width=width, height=height, steps=steps, seed=seed,
    )
    records = []
    for label, output_path in (("baseline", baseline_output_path), ("repaired", repaired_output_path)):
        payload = dict(result[label])
        raw = base64.b64decode(payload.pop("image"))
        with open(output_path, "wb") as target:
            target.write(raw)
        records.append({"label": label, "outputPath": output_path, "sha256": hashlib.sha256(raw).hexdigest(), **payload})
    report_path = f"{os.path.splitext(repaired_output_path)[0]}.json"
    total_gpu_seconds = round(sum(float(record.get("gpuSeconds", 0)) for record in records), 3)
    with open(report_path, "w", encoding="utf-8") as target:
        json.dump({
            "schemaVersion": "betterpptx.image-edit-worker-repair-canary.v1",
            "referenceKind": "owned-synthetic",
            "diagnosis": diagnosis,
            "boundedRepairPrompt": repair_prompt,
            "attempts": 1,
            "records": records,
            "totalGpuSeconds": total_gpu_seconds,
            "gpuPortionUsdAtRecordedRate": round(total_gpu_seconds * 0.000542, 5),
            "costCeilingUsd": 0.02,
            "costCeilingPassed": total_gpu_seconds * 0.000542 <= 0.02,
            "customerImages": False,
            "trainingEnabled": False,
        }, target, indent=2, sort_keys=True)
        target.write("\n")
    print({"records": records, "totalGpuSeconds": total_gpu_seconds, "report": report_path})


@app.local_entrypoint()
def export_dependency_inventory(output_path: str):
    inventory = resolved_dependency_inventory.remote()
    with open(output_path, "w", encoding="utf-8") as target:
        json.dump({
            "schemaVersion": "betterpptx.image-edit-worker-resolved-dependencies.v1",
            "modelRevision": MODEL_REVISION,
            "diffusersRevision": "55ae46db619223625c2ab5debcbb5131f1094129",
            "packages": inventory["packages"],
            "selectedVersions": inventory["selectedVersions"],
        }, target, indent=2, sort_keys=True)
        target.write("\n")
    print(f"saved resolved dependency inventory: {output_path} ({len(inventory['packages'])} distributions)")


@app.local_entrypoint()
def benchmark(reference_path: str, output_prefix: str, prompt: str, width: int = 1024, height: int = 1024,
              steps: int = 4, seed: int = 0):
    """Two sequential calls in one app lifetime: cached-cold then true warm, same deterministic input."""
    with open(reference_path, "rb") as source:
        encoded = base64.b64encode(source.read()).decode("ascii")
    records = []
    for label in ("cached-cold", "warm"):
        result = ImageEditWorker().research_canary.remote(
            image_b64=encoded,
            prompt=prompt,
            width=width,
            height=height,
            steps=steps,
            seed=seed,
        )
        output = base64.b64decode(result.pop("image"))
        output_path = f"{output_prefix}-{label}.png"
        with open(output_path, "wb") as target:
            target.write(output)
        records.append({
            "label": label,
            "outputPath": output_path,
            "sha256": hashlib.sha256(output).hexdigest(),
            **result,
        })
    report_path = f"{output_prefix}.json"
    with open(report_path, "w", encoding="utf-8") as target:
        json.dump({
            "schemaVersion": "betterpptx.image-edit-worker-benchmark.v1",
            "referenceKind": "owned-synthetic",
            "records": records,
            "identicalOutputDigest": records[0]["sha256"] == records[1]["sha256"],
        }, target, indent=2, sort_keys=True)
        target.write("\n")
    print({
        "records": [{key: value for key, value in record.items() if key not in {"model", "modelRevision", "outputPath"}} for record in records],
        "identicalOutputDigest": records[0]["sha256"] == records[1]["sha256"],
        "report": report_path,
    })


@app.local_entrypoint()
def multi_canary(reference_paths: str, output_path: str, prompt: str, width: int = 1024,
                 height: int = 1024, steps: int = 4, seed: int = 0):
    """Run one two-to-four-image owned-synthetic private canary and retain its evidence."""
    paths = [value.strip() for value in reference_paths.split(",") if value.strip()]
    if len(paths) < 2 or len(paths) > MAX_REFERENCES:
        raise ValueError("multi-reference canary requires two to four paths")
    encoded = []
    input_records = []
    for source_path in paths:
        with open(source_path, "rb") as source:
            raw = source.read()
        encoded.append(base64.b64encode(raw).decode("ascii"))
        input_records.append({"path": source_path, "sha256": hashlib.sha256(raw).hexdigest()})
    result = ImageEditWorker().research_multi_canary.remote(
        image_b64s=encoded,
        prompt=prompt,
        width=width,
        height=height,
        steps=steps,
        seed=seed,
    )
    output = base64.b64decode(result.pop("image"))
    with open(output_path, "wb") as target:
        target.write(output)
    report_path = f"{os.path.splitext(output_path)[0]}.json"
    with open(report_path, "w", encoding="utf-8") as target:
        json.dump({
            "schemaVersion": "betterpptx.image-edit-worker-multi-canary.v1",
            "referenceKind": "owned-synthetic",
            "inputs": input_records,
            "outputPath": output_path,
            "outputSha256": hashlib.sha256(output).hexdigest(),
            "metrics": result,
        }, target, indent=2, sort_keys=True)
        target.write("\n")
    print({
        "inputCount": len(input_records),
        "outputSha256": hashlib.sha256(output).hexdigest(),
        "metrics": {key: value for key, value in result.items() if key not in {"model", "modelRevision"}},
        "report": report_path,
    })
