# Cloud Run Avatar/TTS Deployment

For the full implemented avatar narration architecture, provider boundary,
Modal-compatible worker contract, billing/cache behavior, and verification
ladder, read
[`../docs/avatar-generation-architecture.md`](../docs/avatar-generation-architecture.md)
first.

BetterPPTX uses two Cloud Run services for narrated avatar generation:

1. `betterpptx-mcp`: public MCP/product service plus a Piper TTS sidecar.
2. `betterpptx-avatar-worker`: private GPU lipsync worker service.

This keeps the public endpoint small, black-box, and horizontally scalable while
the GPU worker remains private, concurrency-limited, and billable at render time.

## Why The Split Exists

- Piper TTS is a local HTTP sidecar. In Cloud Run sidecars share the service
  localhost network, so MCP calls `http://127.0.0.1:5000`.
- `ffmpeg` and `ffprobe` are installed in the MCP image. MCP normalizes every
  returned video to PowerPoint-safe H.264/yuv420p/AAC and extracts the PNG
  poster frame before inserting the media.
- Model-backed lipsync is isolated behind `BETTERPPTX_AVATAR_WORKER_URL`.
  This avoids bundling model code/checkpoints in the public MCP image and lets
  the worker use GPU resources only when needed.
- GPU is not required for the `test-static` packaging verifier. GPU is required
  or strongly expected for production MuseTalk/LivePortrait/SadTalker quality
  and latency. CPU-only model-backed lipsync should be treated as an offline
  maintainer experiment, not a public product path.
- Cloud Run GPU services can scale to zero, so there is no intended idle GPU
  cost. Avatar is still premium/credit-only because every accepted render
  consumes paid compute while the worker instance is active.

## Build Images

From the repository root:

```bash
docker build -f deploy/docker/Dockerfile.mcp \
  -t REGION-docker.pkg.dev/PROJECT_ID/betterpptx/betterpptx-mcp:TAG .

docker build -f deploy/docker/Dockerfile.piper \
  -t REGION-docker.pkg.dev/PROJECT_ID/betterpptx/piper-tts:TAG deploy/docker
```

The Piper sidecar expects approved runtime voices mounted at `/voices`. For
Cloud Run, upload `betterpptx-mcp/narration/voices/runtime` to a private Cloud
Storage bucket and set `BETTERPPTX_PIPER_VOICES_BUCKET` in
`cloud-run-mcp-piper.yaml`.

The model-backed avatar worker image is intentionally separate:

```bash
REGION-docker.pkg.dev/PROJECT_ID/betterpptx/betterpptx-avatar-musetalk:TAG
```

That image must provide the worker contract documented in
`avatar-worker/README.md`: `POST /v1/avatar/lipsync` accepts multipart
`image`, `audio`, `quality`, `mode`, and optional `durationMs`, then returns MP4
bytes or JSON containing MP4 data.

## Deploy

Replace placeholders in the YAML files:

- `PROJECT_ID`
- `REGION`
- `TAG`
- `BETTERPPTX_PIPER_VOICES_BUCKET`
- `BETTERPPTX_AVATAR_MODELS_BUCKET`
- `BETTERPPTX_AVATAR_WORKER_URL`
- service-account names if they differ

Create secrets:

```bash
gcloud secrets create betterpptx-avatar-worker-token --replication-policy=automatic
gcloud secrets versions add betterpptx-avatar-worker-token --data-file=token.txt

gcloud secrets create betterpptx-payram-api-key --replication-policy=automatic
gcloud secrets versions add betterpptx-payram-api-key --data-file=payram-key.txt
```

Deploy the private worker first:

```bash
gcloud run services replace betterpptx-mcp/deploy/cloud-run-avatar-worker.yaml \
  --region REGION
```

Deploy the public MCP service after setting `BETTERPPTX_AVATAR_WORKER_URL` to
the private worker URL:

```bash
gcloud run services replace betterpptx-mcp/deploy/cloud-run-mcp-piper.yaml \
  --region REGION
```

## Verification

Inside the MCP image:

```bash
node betterpptx-mcp/verify-avatar-runtime.mjs --render-test-static
```

For local Docker runtime testing from a freshly built host `dist`:

```bash
docker build -f deploy/docker/Dockerfile.mcp \
  --build-arg BUILD_DIST=0 \
  -t betterpptx-mcp-avatar-runtime-smoke .

docker run --rm \
  -e BETTERPPTX_AVATAR_PROVIDER=test-static \
  -e BETTERPPTX_AVATAR_DEVELOPMENT_MODE=1 \
  betterpptx-mcp-avatar-runtime-smoke \
  node betterpptx-mcp/smoke-avatar-narration.mjs
```

For local real lipsync testing, Docker must expose an NVIDIA GPU to containers:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Then run compose with the model-backed worker image:

```bash
BETTERPPTX_AVATAR_PROVIDER=musetalk \
BETTERPPTX_MUSETALK_WORKER_IMAGE=REGION-docker.pkg.dev/PROJECT_ID/betterpptx/betterpptx-avatar-musetalk:TAG \
docker compose --profile musetalk up --build
```

Against a deployed MCP endpoint:

```bash
node betterpptx-mcp/verify-blackbox-public.mjs https://YOUR-MCP-URL/mcp
```

For production talking-head verification, use only the owner-frozen commercial
profile. Provider selection is deployment-owned and cannot be supplied by an
authoring request:

```bash
BETTERPPTX_AVATAR_PROVIDER=liveportrait-musetalk-commercial
BETTERPPTX_AVATAR_PRODUCTION_ONLY=1
BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE=blink
BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE=jaw
BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL=https://PRIVATE-WORKER-URL
BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE=/v1/avatar/lipsync
BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN=...
```

Then run a spec `phase:"resolve"` or `betterpptx.avatar.render_job` smoke with
`BETTERPPTX_FORCE_PLAN=premium` in a private verifier environment.

## Production boundary

The paid, tested commercial worker and reviewed profile are the sole production
talking-head route. Local/static and alternate model workers remain explicit
development fixtures only; they are never silent fallbacks. A new release still
requires a fresh image/revision deployment and the normal immutable provenance,
PowerPoint, visual, and black-box evidence gates.
