# BetterPPTX Flux worker — self-hosted FLUX.1 [schnell] on Modal, scale-to-zero L40S.
#
# Runs on the DEDICATED `betterpptx-flux` Modal profile (workspace `innorag`) — deliberately
# SEPARATE from the avatar worker (workspace `telcomgapp`). Every command below MUST pass
# `--profile betterpptx-flux` so it never touches the avatar account.
#
# Why self-host: FLUX.1 [schnell] the MODEL supports arbitrary width/height; only Cloudflare's
# basic wrapper hardcodes 1024². Here we pass width/height straight to the pipeline → NATIVE
# aspect, no cropping. Owning the GPU also removes the per-image vendor fee at volume.
#
# LICENSE: FLUX.1 [schnell] is Apache-2.0 (ungated — no HF token) and PINNED here; dev/pro are
# non-commercial and never referenced. Generated output is commercial-safe, no attribution.
#
# Deploy:
#   1) create the shared endpoint token as a Modal Secret (on the flux profile):
#        modal secret create betterpptx-flux-token FLUX_ENDPOINT_TOKEN=<random> --profile betterpptx-flux
#   2) deploy:
#        modal deploy betterpptx-mcp/deploy/flux-worker/flux_app.py --profile betterpptx-flux
#   3) copy the printed *.modal.run URL → BETTERPPTX_MODAL_FLUX_URL, and the token → BETTERPPTX_MODAL_FLUX_TOKEN.
#
# HTTP contract (POST JSON):
#   { "token": "<shared>", "prompt": "...", "width": 1280, "height": 768, "steps": 4, "seed": 123 }
#   -> { "image": "<base64 png>", "contentType": "image/png", "width", "height", "model", "seconds" }
import base64
import io
import os
import time

import modal

APP_NAME = "betterpptx-flux"
MODEL_ID = "black-forest-labs/FLUX.1-schnell"  # Apache-2.0, PINNED (never dev/pro)
CACHE_DIR = "/cache"
# OBFUSCATED endpoint label → https://<workspace>--<label>.modal.run. Set FLUX_ENDPOINT_LABEL to a
# per-endpoint OPAQUE token (like the avatar worker's e3b56934) so the URL never reveals it's a flux/
# image worker (black-box doctrine). Keep the SAME label on redeploy to keep the URL stable. Read at
# deploy time from the LOCAL env (Modal builds the app graph on the deploying machine).
FLUX_ENDPOINT_LABEL = (os.environ.get("FLUX_ENDPOINT_LABEL") or "").strip() or "a7f2c918"

image = (
    modal.Image.debian_slim(python_version="3.11")
    # PINNED, mutually-compatible Flux-schnell set (late-2024). Do NOT float diffusers/transformers
    # to latest against this torch — newer diffusers register a torch custom-op that torch 2.4.1's
    # infer_schema rejects ("Parameter q has unsupported type"), crashing the pipeline import.
    .pip_install(
        "torch==2.4.1",
        "torchvision==0.19.1",
        "diffusers==0.31.0",
        "transformers==4.44.2",
        "accelerate==0.34.2",
        "huggingface_hub==0.25.2",
        "sentencepiece==0.2.0",
        "protobuf==4.25.5",
        "pillow>=10.0.0",
        "fastapi[standard]>=0.115.0",
    )
    # HF weights cache to the persistent Volume (fast transfer via bundled hf-xet).
    .env({"HF_HOME": CACHE_DIR})
)

app = modal.App(APP_NAME)
hf_cache = modal.Volume.from_name("betterpptx-flux-hf-cache", create_if_missing=True)
GPU_PREFERENCE = ["L40S", "A100-40GB"]

# Aspect presets mirror the Node provider (assets/image-gen-providers.mjs). All divisible by 16.
ASPECTS = {
    "square": (1024, 1024),
    "landscape": (1280, 768),
    "portrait": (768, 1280),
    "wide": (1280, 768),
    "tall": (768, 1280),
}


def _round16(value, lo=256, hi=1536):
    n = int(value or 0)
    n = max(lo, min(hi, n))
    return (n // 16) * 16  # Flux requires dimensions divisible by 16


@app.cls(
    image=image,
    gpu=GPU_PREFERENCE,          # primary L40S; A100-40GB backup for transient L40S scarcity
    volumes={CACHE_DIR: hf_cache},
    secrets=[
        modal.Secret.from_name("betterpptx-flux-token"),   # FLUX_ENDPOINT_TOKEN (our shared endpoint auth)
        modal.Secret.from_name("huggingface-token"),       # HF_TOKEN — schnell is a GATED HF repo (accept + token)
    ],
    scaledown_window=300,       # scale to zero after 5 min idle
    min_containers=0,           # true scale-to-zero ($0 when idle)
    timeout=600,
)
class FluxWorker:
    @staticmethod
    def _actual_gpu_type(torch):
        name = str(torch.cuda.get_device_name(0) or '').upper()
        if 'A100' in name:
            return 'A100-40GB'
        if 'L40' in name:
            return 'L40S'
        if 'H100' in name:
            return 'H100'
        return name[:64] or 'unknown'

    @modal.enter()
    def load(self):
        import torch
        from diffusers import FluxPipeline

        _lt0 = time.time()
        self.pipe = FluxPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=CACHE_DIR
        ).to("cuda")
        hf_cache.commit()  # persist the first-run weight download for future cold starts
        # Cold-start bookkeeping: load() runs once per fresh container and its GPU time IS billed, so the
        # first (cold) request adds it to its active GPU-seconds; warm requests do not. This makes the
        # per-op cost WEIGHT reflect real billed GPU time (keep-warm idle stays covered by Modal billing).
        self._load_seconds = round(time.time() - _lt0, 2)
        self._cold = True

    # label → obfuscated short URL https://<workspace>--<opaque>.modal.run (avatar-worker style)
    @modal.fastapi_endpoint(method="POST", label=FLUX_ENDPOINT_LABEL)
    def generate(self, item: dict):
        import torch
        from fastapi import HTTPException  # deferred import — container has fastapi, deploy host need not

        expected = os.environ.get("FLUX_ENDPOINT_TOKEN", "")
        if not expected or item.get("token") != expected:
            raise HTTPException(status_code=401, detail="unauthorized")

        prompt = str(item.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt required")

        aspect = str(item.get("aspect") or "").lower()
        if aspect in ASPECTS:
            width, height = ASPECTS[aspect]
        else:
            width = _round16(item.get("width", 1024))
            height = _round16(item.get("height", 1024))
        steps = max(1, min(8, int(item.get("steps") or 4)))
        seed = int(item.get("seed") or 0)

        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        torch.cuda.reset_peak_memory_stats()
        generator = torch.Generator("cuda").manual_seed(seed)
        result = self.pipe(
            prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=0.0,        # schnell is guidance-distilled
            max_sequence_length=256,
            generator=generator,
        )
        buf = io.BytesIO()
        result.images[0].save(buf, format="PNG")
        torch.cuda.synchronize()
        gen_seconds = round(time.time() - t0, 2)
        return {
            "image": base64.b64encode(buf.getvalue()).decode("ascii"),
            "contentType": "image/png",
            "width": width,
            "height": height,
            "model": MODEL_ID,
            "seconds": gen_seconds,   # legacy: inference time only
            # Full active GPU-seconds = inference + model-load on cold containers — the per-op cost WEIGHT
            # the MCP records; the billed L40S total distributes across it during reconciliation.
            "gpuSeconds": round(gen_seconds + (getattr(self, "_load_seconds", 0.0) if cold else 0.0), 2),
            "coldStart": cold,
            "gpuType": self._actual_gpu_type(torch),
            "gpuPreference": "L40S|A100-40GB",
            "peakAllocatedBytes": int(torch.cuda.max_memory_allocated()),
            "peakReservedBytes": int(torch.cuda.max_memory_reserved()),
        }

    # ---- TRELLIS-prep: Flux-schnell IMG2IMG. Redraw a realistic photo into a CLEAN reference optimized as a
    # TRELLIS.2 image->3D input: front-facing full-body subject, plain seamless background, soft even lighting,
    # square-framed. Apache-2.0 (schnell) → resale-clean. Reuses the already-loaded model (no extra weights).
    @modal.method()
    def prep_for_trellis(self, image_b64: str, prompt: str = "", strength: float = 0.55, steps: int = 6,
                         seed: int = 0, size: int = 1024):
        import torch
        from diffusers import FluxImg2ImgPipeline
        from PIL import Image

        if getattr(self, "_i2i", None) is None:
            # Build the img2img pipeline from the SAME loaded components (transformer/vae/text encoders) — no reload.
            self._i2i = FluxImg2ImgPipeline(**self.pipe.components)

        init = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
        # Letterbox onto a square light-grey canvas so the WHOLE subject stays in frame, then resize to `size`.
        s = max(init.size)
        canvas = Image.new("RGB", (s, s), (244, 244, 246))
        canvas.paste(init, ((s - init.width) // 2, (s - init.height) // 2))
        init = canvas.resize((size, size), Image.LANCZOS)

        p = (str(prompt or "").strip() or
             "a clean full-body studio portrait of the same person, standing upright facing the camera, "
             "arms relaxed slightly away from the torso, entire body visible head to toe, plain seamless "
             "light-grey background, soft even studio lighting, sharp focus, photorealistic, no props, no text")
        cold = getattr(self, "_cold", False)
        self._cold = False
        t0 = time.time()
        gen = torch.Generator("cuda").manual_seed(int(seed or 0))
        out = self._i2i(
            prompt=p,
            image=init,
            strength=float(strength),                     # 0=keep input, 1=full redraw. ~0.5-0.65 cleans while preserving identity.
            num_inference_steps=max(2, min(12, int(steps))),
            guidance_scale=0.0,                           # schnell is guidance-distilled
            max_sequence_length=256,
            generator=gen,
            height=size, width=size,
        )
        buf = io.BytesIO()
        out.images[0].save(buf, format="PNG")
        secs = round(time.time() - t0, 2)
        return {
            "image": base64.b64encode(buf.getvalue()).decode("ascii"),
            "contentType": "image/png", "size": size, "strength": float(strength),
            "seconds": secs, "gpuSeconds": round(secs + (getattr(self, "_load_seconds", 0.0) if cold else 0.0), 2),
            "coldStart": cold, "model": MODEL_ID,
        }

    # Plain text->image (same core as the POST `generate` endpoint) exposed for CLI use via gen_image below —
    # e.g. to synthesize a clean SYNTHETIC portrait as a resale-safe TRELLIS input (no real-person likeness).
    @modal.method()
    def txt2img(self, prompt: str, width: int = 768, height: int = 1280, steps: int = 4, seed: int = 0):
        import torch
        cold = getattr(self, "_cold", False)
        self._cold = False
        gen = torch.Generator("cuda").manual_seed(int(seed or 0))
        out = self.pipe(prompt, width=int(width), height=int(height), num_inference_steps=max(1, min(8, int(steps))),
                        guidance_scale=0.0, max_sequence_length=256, generator=gen)
        buf = io.BytesIO()
        out.images[0].save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")


# ---- Standalone script entrypoint: realistic photo -> TRELLIS-ready reference image. ----------------
# `modal run flux_app.py::prep_image --image-path photo.jpg --out-path ready.png [--strength 0.6] --profile betterpptx-flux`
# Feed the OUTPUT to make-presenter.ps1 / perform_from_image. Higher --strength = more cleanup, more identity drift.
@app.local_entrypoint()
def prep_image(image_path: str, out_path: str = "", strength: float = 0.55, steps: int = 6, seed: int = 0,
               size: int = 1024, prompt: str = ""):
    import os
    b64 = base64.b64encode(open(image_path, "rb").read()).decode("ascii")
    print(f"prep_for_trellis: {image_path}  strength={strength} steps={steps} size={size} ...")
    r = FluxWorker().prep_for_trellis.remote(image_b64=b64, prompt=prompt, strength=strength, steps=steps, seed=seed, size=size)
    out = out_path or (os.path.splitext(image_path)[0] + ".trellis-ready.png")
    with open(out, "wb") as f:
        f.write(base64.b64decode(r["image"]))
    print("PREP:", {k: v for k, v in r.items() if k != "image"})
    print("SAVED TRELLIS-ready image:", out)


# ---- Standalone: text -> image (synthesize a clean SYNTHETIC portrait as a resale-safe TRELLIS input). ----
# `modal run flux_app.py::gen_image --prompt "..." --out-path portrait.png --profile betterpptx-flux`
@app.local_entrypoint()
def gen_image(prompt: str, out_path: str, width: int = 768, height: int = 1280, steps: int = 4, seed: int = 0):
    print(f"gen_image: '{prompt[:60]}...'  {width}x{height} steps={steps} seed={seed}")
    b64 = FluxWorker().txt2img.remote(prompt=prompt, width=width, height=height, steps=steps, seed=seed)
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))
    print("SAVED image:", out_path)
