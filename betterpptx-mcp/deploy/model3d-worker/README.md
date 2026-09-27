# BetterPPTX rigged-3D worker (TRELLIS.2 + DRTK + UniRig on Modal L40S — PoC only)

Self-hosted **image → rigged, animation-ready GLB** pipeline. Sibling of
[`../flux-worker`](../flux-worker/README.md); same black-box + scale-to-zero + metering doctrine.

```
[image] --Generator (TRELLIS.2, L40S)--> [textured GLB] --Rigger (UniRig, L40S)--> [rigged GLB]
                        \_____ spawned CPU pipeline chains both; a submit/poll endpoint returns b64 GLB ____/
```

- **TRELLIS.2** (`microsoft/TRELLIS.2-4B`) — MIT. Image→textured mesh.
- **UniRig** (`VAST-AI/UniRig`) — MIT (code **and** weights). Auto-skeleton + skin weights.
- TRELLIS.2 + DRTK + UniRig is a **permissive PoC/flow-test route only** in the product. The upstream
  license records are pinned, but this route is not production/resale-cleared. Production personalized
  native 3D is exclusively the ordered multi-view **Meshy → Mixamo** path, enforced by
  `betterpptx-mcp/ir/native3d-policy.mjs`. No Hunyuan / RigNet paths exist. See
  `assets/model3d-gen-providers.mjs` and the release-safety route decision.

## Why two GPU classes (not one)

TRELLIS.2 (torch 2.6 / CUDA 12.4 + flash-attn/nvdiffrast/cumesh/flexgemm custom kernels) and UniRig
(torch 2.4 + spconv/torch_scatter + its own flash-attn) have **conflicting CUDA stacks**. Cramming both
into one image is fragile, so each is its own `@app.cls` with its own image; a light CPU orchestrator
`@modal.fastapi_endpoint` chains `Generator.generate.remote()` → `Rigger.rig.remote()`. Each GPU class
scales to zero independently.

## Memory snapshot (cold-start)

Unlike `flux_app.py` (plain `@modal.enter`, reloads weights to GPU every cold start), each GPU class here
uses **Modal memory snapshot**: `enable_memory_snapshot=True` + `@modal.enter(snap=True)` loads weights to
CPU RAM (snapshot captures the heavy imports + deserialized weights), `@modal.enter(snap=False)` moves them
to CUDA on restore. Cold start becomes a snapshot restore + host→device copy instead of a full model load.
(UniRig runs its rig via subprocess launch scripts, so its per-run model load is inside the scripts; the
snapshot still saves the Python/torch import and warms the HF-cache handle. Weights persist on the Volume.)

> **Audit note (memory snapshot across our Modal workers):**
> - **flux** (`../flux-worker/flux_app.py`): **NO snapshot** — plain `@modal.enter()`, reloads ~24 GB
>   schnell to VRAM every cold start. Candidate for the same `snap=True/False` treatment.
> - **LPMT / avatar** (LivePortrait+MuseTalk): the model worker is **not in this repo** (private image;
>   `docs/avatar-generation-architecture.md` says so). Snapshot usage there can't be audited from source
>   and must be checked in the private worker repo. Cloud Run (its other deploy path) can't do
>   Modal-style GPU snapshots at all.
> - **model3d** (this worker): snapshot **enabled** on both GPU classes (the reference for retrofitting flux).

## PPT optimization

`quality: "ppt-lite"` (default) runs TRELLIS.2 at 512³ with aggressive decimation (~40k faces) and a 1024
webp texture → a few-MB GLB that imports fast and renders smoothly in a deck. `quality: "standard"` raises
the budget for hero assets. Keep GLBs small; PowerPoint 3D import is happiest with low-poly single-texture
models. (Whether PowerPoint preserves the UniRig skeleton/animation through its glTF import is **untested**
— verify with the COM oracle before promising animated 3D scenes; static rigged GLBs embed regardless.)

## Deploy — run on BOTH profiles (rotation)

The current legacy routing pair is **betterpptx** and **betterxavatar**. The requested production target for
the personalized presenter is **betterxavatar1** and **betterxavatar2**; the same file must be deployed under
those owner-approved profiles before the credential store is switched. Deploy the same file under each, with a **stable, opaque** per-profile endpoint label (black-box: the URL must not
reveal it's a 3D worker; keep the label constant across redeploys so the stored URL stays valid).

```bash
# --- production target: PROFILE ∈ { betterxavatar1, betterxavatar2 } ---
# 1) shared endpoint token (once per profile)
$env:MODAL_PROFILE='PROFILE'
python -m modal secret create betterpptx-model3d-token MODEL3D_ENDPOINT_TOKEN=<owner-generated-token>

# 2) deploy with STABLE opaque labels, pinned upstream commits, and pinned deploy metadata (different values per profile)
$env:MODAL_PROFILE='PROFILE'
$env:DRTK_GIT_REF='<40-hex-commit>'
$env:TRELLIS_GIT_REF='<40-hex-commit>'
$env:UNIRIG_GIT_REF='<40-hex-commit>'
$env:TRELLIS_MODEL_REVISION='<40-hex-snapshot>'
$env:TRELLIS_SS_DECODER_REVISION='<40-hex-snapshot>'
$env:DINOV3_MODEL_REVISION='<40-hex-snapshot>'
$env:BIREFNET_MODEL_REVISION='<40-hex-snapshot>'
$env:UNIRIG_MODEL_REVISION='<40-hex-snapshot>'
$env:MODEL3D_ENDPOINT_LABEL='<opaque-hex>'
$env:MODEL3D_HEALTH_ENDPOINT_LABEL='<opaque-health-hex>'
$env:MODEL3D_DEPLOYMENT_REVISION='<immutable-revision>'
$env:MODEL3D_SOURCE_DIGEST='<source-sha256>'
python -m modal deploy betterpptx-mcp/deploy/model3d-worker/model3d_app.py
# → prints the POST submit/poll URL and the separate GET health/identity URL
```

The worker carries reviewed 40-character defaults for DRTK, TRELLIS.2, and UniRig, plus independent 40-character
Hugging Face snapshot revisions for every downloaded model. Any override must also be an exact SHA; a moving branch
or floating model snapshot fails closed before the Modal image graph is built.

First deploy builds the TRELLIS.2 custom kernels (slow, minutes) and, on the first request per profile,
downloads the model weights to the `betterpptx-trellis-cache` / `betterpptx-unirig-cache` Volumes (cached
thereafter). `min_containers=0` + `scaledown_window=300` → **$0 when idle**.

## Dev vs go-live (keep-warm — the only cost timer)

**Keep-warm is the only timer that costs money**: how long the GPU container stays alive idle after a
request. In dev we don't want to pay for that idle GPU, so `MODEL3D_DEV_MODE=1` scales to zero as fast as
Modal allows. **Go-live is the default** (flag unset) → a 5-min warm window so repeat requests skip the
cold start.

| Keep-warm timer | Dev (`MODEL3D_DEV_MODE=1`) | Go-live (unset) | Explicit override |
|---|---|---|---|
| `scaledown_window` (idle before scale-to-zero) | ~0 (2 s floor → `$0` idle) | 300 s warm | `MODEL3D_SCALEDOWN_WINDOW` (s) |
| `min_containers` (always-warm floor) | 0 | 0 | `MODEL3D_MIN_CONTAINERS` |

```bash
# DEV: deploy with no keep-warm ($0 idle)
$env:MODAL_PROFILE='PROFILE'
$env:MODEL3D_DEV_MODE='1'
$env:MODEL3D_ENDPOINT_LABEL='<opaque>'
python -m modal deploy betterpptx-mcp/deploy/model3d-worker/model3d_app.py

# GO-LIVE: leave the flag unset (300 s warm window). Optionally add one always-warm container: MODEL3D_MIN_CONTAINERS=1
```

`MODEL3D_DEV_MODE` is read at **deploy time** (Modal builds the app graph on the deploying machine). It is a
worker/deploy flag only — there is nothing to set on the MCP process.

The separate GET health/identity Web Function is intentionally non-mutating and returns only generic
`status`, native-3D scope, and the deploy-supplied immutable `revision`/`sourceDigest`. It does not invoke
TRELLIS.2, UniRig, GPU work, or the POST job queue. The owner must record both URLs and verify this response
before registering the POST endpoints in Mission Control.

> Not a cost timer: the provider's 120 s **failed-endpoint cooldown** is client-side failover (skip a
> broken endpoint, then retry). Nothing stays warm, so it costs nothing — it is deliberately a plain
> constant, not tied to dev mode.

## Register both endpoints for rotation

The MCP routes by the **credential store** (`config/credential-store.json`, hot-reloaded), NOT `.modal.toml`.
Add ONE account per deployed production target profile under the `model3d-gen` provider via the param-store UI
(`tools/betterpptx-mcp-param-store.mjs` → localhost), or by hand:

For this Meshy personalized-presenter goal, the target account IDs are `betterxavatar1` and `betterxavatar2`.
Do not point those IDs at the current legacy `betterxavatar`/`betterpptx` endpoints; register only after the
requested profiles have their own immutable deployments and bounded canary evidence.

```jsonc
"model3d-gen": {
  "label": "Modal rigged-3D worker (TRELLIS.2 + UniRig, self-hosted L40S)",
  "category": "model3d",
  "envKeys": ["BETTERPPTX_MODEL3D_GEN_URL", "BETTERPPTX_MODEL3D_GEN_TOKEN", "BETTERPPTX_MODEL3D_GEN_HEALTH_URL"],
  "activeAccountId": "betterxavatar1",
  "accounts": [
    { "id": "betterxavatar1", "enabled": true, "env": { "BETTERPPTX_MODEL3D_GEN_URL": "https://<ws1>--<label1>.modal.run", "BETTERPPTX_MODEL3D_GEN_TOKEN": "<token1>", "BETTERPPTX_MODEL3D_GEN_HEALTH_URL": "https://<ws1>--<health-label1>.modal.run" } },
    { "id": "betterxavatar2", "enabled": true, "env": { "BETTERPPTX_MODEL3D_GEN_URL": "https://<ws2>--<label2>.modal.run", "BETTERPPTX_MODEL3D_GEN_TOKEN": "<token2>", "BETTERPPTX_MODEL3D_GEN_HEALTH_URL": "https://<ws2>--<health-label2>.modal.run" } }
  ]
}
```

The provider (`assets/model3d-gen-providers.mjs`) round-robins across both endpoints and fails a broken
endpoint over to the healthy one (120 s cooldown). Single-endpoint fallback: set
`BETTERPPTX_MODEL3D_GEN_URL` + `BETTERPPTX_MODEL3D_GEN_TOKEN` env (no rotation).

## HTTP contract — SUBMIT + POLL (single endpoint, two modes)

A rigged-3D job runs for minutes, but a Modal web endpoint hard-caps one HTTP response at **~150 s** (past
that it 303-redirects to a poll URL — which safe-fetch caps at 5 hops, so a long single call would die).
So the endpoint is **spawn + poll**: submit returns a `jobId` fast; the provider polls until the GLB is
ready. Every HTTP call is short, so the 150 s cap is never hit. The provider handles both calls
transparently — callers of `betterpptx.assets.generate_rigged3d` just await one result.

```
SUBMIT  POST { "token", "image": "<b64>", "rig": true, "quality": "ppt-lite"|"standard", "seed": 123,
               "perform": true, "empirical_clip_timelines": { "probe": { "x", "y", "w", "h", "m" }, "timelines": { "0".."17": [["videoMs", "xIn", "yIn"], ...] } } }
        ->   { "status": "pending", "jobId": "<id>" }
POLL    POST { "token", "jobId": "<id>" }
        ->   { "status": "pending", "jobId" }                       # still running
        ->   { "status": "done", "glb": "<b64 GLB>", "glbBytes", "rigged", "model",
               "gpuSeconds", "genSeconds", "rigSeconds", "coldStart", "gpuType": "L40S", "meshResolution",
               "manifest": { "clipMap", "contacts", "clipTimelines", "timelineProfileDigest" } }
```

`empirical_clip_timelines` is an owner-only empirical profile: it must contain exactly the
18 animation IDs `0` through `17`, with at least five numeric `[videoMs, xIn, yIn]`
samples per ID and monotonically ordered `videoMs` values. Missing, extra, malformed, or
unordered slots are rejected. `perform:true` is fail-closed until the final baked GLB has a rendered
PowerPoint-oracle timeline manifest. Contacts/apex values alone are not enough
for `slides[].interactions`. The dedicated 18-slot contract is gated separately
by `node betterpptx-mcp/verify-authoring-clipset-v3.mjs`; it remains blocked until
each licensed Mixamo source is staged, baked, and oracle-measured.

The MCP-side Meshy/Modal adapters read the owner-only profile from
`BETTERPPTX_MESHY_TIMELINES_FILE` / `BETTERPPTX_MODEL3D_TIMELINES_FILE` (or their
secret-backed JSON equivalents). These are deployment configuration, not AI
authoring fields and never belong in public tool responses.

For the dedicated interaction library, set the private
`BETTERPPTX_MODEL3D_INTERACTION_CLIPSET=authoring-v3` flag. The worker then
requires `/library/authoring-interaction-clips-v3.glb`, which is produced only
by `bake_authoring_clip_library` after all 18 contract rows have licensed FBX
sources and later oracle measurement.

Provider poll knobs (MCP-side env): `BETTERPPTX_MODEL3D_POLL_INTERVAL_MS` (default 5000),
`BETTERPPTX_MODEL3D_POLL_DEADLINE_MS` (default 1200000 = 20 min). The poll response carries the GLB, so
the provider uses a 128 MB `maxBytes` (a `standard` GLB, base64-inflated, exceeds safe-fetch's 25 MB default).

`gpuSeconds` = generation + rigging + cold model-load, i.e. the **real billed L40S time** the MCP records
(mirrors `flux_app.py`; avoids the ~4.8× undercount the avatar path has from estimating wall time instead).

## Cost metrology (owner step)

Wiring is complete (rate-card `model3dGen*`, charging-matrix optional GPU family, `model3dGenGpuSeconds` +
`model3dGenBytes` meter counters, cost-model `model3dGenGpuUsd`, estimator branch). The one **owner action**:
after measuring L40S $/GPU-second, set `external.model3dGenUsdPerGpuSecond` in the cloud-cost catalog
(`billing/cost-basis/cloud-cost-catalog-*.json`). Until then it defaults to `0` (non-breaking — attributes
$0 to model3dGen; every pre-existing catalog still validates). The GPU-fair multiplier (m=3, not the m=25
CPU margin) is applied automatically via `GPU_FAMILY_FIELDS`.

## Smoke tests

```bash
# GPU-free: provider rotation/failover, cache, tool dispatch, embed materializer, metrology, estimator
node betterpptx-mcp/verify-rigged3d-gen.mjs

# LIVE (hits a real worker; needs a deployed endpoint):
BETTERPPTX_MODEL3D_GEN_URL=https://<ws>--<label>.modal.run BETTERPPTX_MODEL3D_GEN_TOKEN=<token> \
  RIGGED3D_LIVE=1 node betterpptx-mcp/verify-rigged3d-gen.mjs
```

## MCP usage

`betterpptx.assets.generate_rigged3d` → `{ prompt | imageHandle | imageUrl | imageBase64, rig, quality }`
returns a `gen://trellis/rigged3d/{hash}` handle. Use it as the 3D source in a spec
(`slide.add_model3d` `glbFile: "gen://trellis/rigged3d/…"`). With `prompt`, a source image is generated via
Flux first (`generate_image`) then converted to 3D — the two generators compose. MIT license record rides
the deck automatically. Metered GPU compute; prefer `assets.catalog` / `generate_model3d` (free
catalog + import) when a library model fits.
