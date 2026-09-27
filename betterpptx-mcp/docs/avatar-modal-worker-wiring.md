# BetterPPTX Avatar — Modal Worker Wiring

Last verified: 2026-07-18 (worker canary and serving-template recheck).

This is the **concrete Modal implementation** of the avatar worker HTTP contract, and the exact
steps to wire it to the BetterPPTX MCP server. It is the companion to
[`avatar-generation-architecture.md`](./avatar-generation-architecture.md) — that doc defines the
provider-agnostic contract and the MCP-side topology; **this** doc records the actual Modal worker
(app, GPU functions, secrets, URL) and the env vars that connect it.

Private implementation documentation — do not copy verbatim to public docs (it names the GPU class,
model providers, secret names, and worker internals that public endpoints must keep black-box).

## Status (2026-07-18)

| Piece | State |
| --- | --- |
| Engine-side avatar subsystem (spec kind `avatarNarration`, `avatar.render_job`, 4 providers, cache, consent, billing) | **fully wired** |
| Modal worker image (LivePortrait + MuseTalk, A10G) | **built + benchmarked** |
| Modal worker deployment | **deployed** — app `svc-e3b56934` (`ap-IpS5JLCxo3AamSQMZUBxtW`), `telcomgapp` workspace, scale-to-zero, since 2026-06-28 |
| **MCP → worker wiring** | **Local credential-store wiring verified; Cloud Run template now mounts a Secret Manager credential bundle. Deployed revision still requires verification.** |
| Avatar job metadata | **Opt-in local/Firestore metadata store now persists hashed ownership and opaque video/poster handles; Cloud Run template declares Firestore. Durable worker dispatch/recovery still requires deployment proof.** |
| ffmpeg/ffprobe in the MCP serving image | **Dockerfile and Cloud Run template declare `/usr/bin/ffmpeg` + `/usr/bin/ffprobe`; deployed revision still requires verification.** |
| Auth token rotation | **owner-controlled staging rotation complete** — both paired credentials, the Cloud Run bundle, and Modal redeploys were reverified; repeat the runbook before each production promotion |

Modal App deployments carry stable, non-secret billing tags: `product=betterpptx`,
`service=avatar-worker`, `pipeline=liveportrait-musetalk`, and the product account id.
These tags improve account/lane reconciliation, but Modal billing remains app/hour scoped;
they are not request-level attribution.

Avatar is **always `liveportrait-musetalk`** by owner decision (2026-07-03); the `musetalk`-only path
is a cost-fallback lever, not the default.

## Worker topology (Modal)

Source of truth: `avatar-metrology/modal_avatar_endpoint.py` (currently in the metrology worktree
`D:\PptxGenJS_Claude_betterpptx_mcp_metrology`; promote into `betterpptx-mcp/deploy/` when productionized).

A cheap **CPU orchestrator** (the web endpoint) fans work out to **two independent GPU functions**,
each in its own image (avoids the transformers 4.38-vs-4.39 dependency clash):

```text
POST /v1/avatar/lipsync  (fastapi_app, CPU, scaledown_window=300, concurrent max_inputs=8)
  ├─ mode=liveportrait-musetalk → lp_animate (A10G) → mt_render (A10G)      [lively presenter]
  └─ mode=musetalk              → mt_render (A10G)                          [frozen head, cheap]
```

| Function | Role | Config |
| --- | --- | --- |
| `lp_animate` | LivePortrait: still portrait → 25fps head-motion plate (audio stripped) | `gpu="A10G"`, `timeout=900`, `scaledown_window=60`, `max_containers=3`, own `lp_image` |
| `mt_render` | MuseTalk: image **or** video + audio → lip-synced MP4 | `gpu="A10G"`, `timeout=900`, `scaledown_window=60`, `max_containers=3`, own `mt_image` |
| `fastapi_app` | CPU orchestrator / web endpoint (`@modal.asgi_app(label="e3b56934")`) | `debian_slim` + `fastapi[standard]` + `python-multipart`, `scaledown_window=300`, **no explicit `timeout=`** → Modal default (~300s) |

- **URL:** `https://<workspace>--<label>.modal.run` → **`https://telcomgapp--e3b56934.modal.run`**.
  The `telcomgapp--` prefix can only be removed via a custom domain (CNAME) or by migrating to the
  `betterpptx` Modal workspace (blocked on `py -m modal token new --profile betterpptx`).
- **Scale-to-zero, $0 idle.** Cold start pays the model-load tax (~59s, ~$0.018) once per container.

## HTTP contract (matches `betterpptx-mcp/avatar/providers/musetalkHttp.mjs`)

```text
POST /v1/avatar/lipsync
Authorization: Bearer <AVATAR_WORKER_TOKEN>
Accept: video/mp4, application/json
Content-Type: multipart/form-data
```

| Field | Required | Meaning |
| --- | --- | --- |
| `image` | yes | Presenter portrait PNG/JPEG (**a real face** — the stylized default-presenter.png has no detectable face and will fail) |
| `audio` | yes | Narration WAV/M4A/MP3 |
| `quality` | yes | `fast` \| `default` \| `quality` |
| `mode` | yes | `musetalk` or `liveportrait-musetalk` (the MCP passes the provider id here) |
| `durationMs` | no | Expected audio duration (ms) |
| `motionProfile` | no | `default`, `low`, `natural`, `mouth-only`, `balanced`, or `static`; private allowlisted LivePortrait motion profile. `natural` is the narration default candidate with centered gaze and controlled blinking. |
| `mouthProfile` | no | `default`, `raw`, experimental `lower`/`aligned`, or experimental `warp`; private MuseTalk blending profile |

**Response:** raw `video/mp4` bytes, plus headers `X-Render-Seconds`, `X-Frames`, and private
`X-Provider-Execution-Ids` (opaque Modal FunctionCall IDs for the final GPU execution),
`X-Pipeline` (`liveportrait-musetalk` | `musetalk`). `401` if the bearer token is wrong; `400` if
image/audio missing; `500` on render failure. The MCP adapter also accepts JSON
`{videoBase64|mp4Base64|videoDataUri}` and (only with `BETTERPPTX_AVATAR_WORKER_ALLOW_RESULT_URLS=1`)
`{downloadUrl|videoUrl}`.

**Health:** `GET /` → `{"ok":true,"authRequired":<bool>}` · `GET /healthz` → `{"ok":true}`.

## Modal account, secrets, deploy

- **Profile/workspace:** `telcomgapp`. The CLI is invoked as `py -m modal` (not on PATH). Every command needs the UTF-8 prelude or cp1252 crashes on the ✓ glyphs:
  ```powershell
  $env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"; $env:MODAL_PROFILE="telcomgapp"
  ```
- **Secrets (Modal):**
  - `betterpptx-avatar-auth` → key **`AVATAR_WORKER_TOKEN`** (the bearer token the MCP must send).
  - `avatar-config` → key **`AVATAR_FORCE_MUSETALK_ONLY`** (default `0`). Set to `1` to force the cheap MuseTalk-only path for ALL requests **with no redeploy**:
    ```powershell
    py -m modal secret create avatar-config AVATAR_FORCE_MUSETALK_ONLY=1 --force
    ```
- **Deploy / redeploy:**
  ```powershell
  $env:AVATAR_ACCOUNT_ID='telcomgapp' # product id; paired authenticated profile is betterpptx-fluxworkerai
  py -m modal deploy "D:\PptxGenJS_Claude_betterpptx_mcp_metrology\avatar-metrology\modal_avatar_endpoint.py"
  ```
- **Liveness:**
  ```powershell
  curl https://telcomgapp--e3b56934.modal.run/    # -> {"ok":true,"authRequired":true}
  ```

## MCP-side wiring

Set these on the **BetterPPTX MCP** runtime (Cloud Run service / container env). The production template
mounts a Secret Manager JSON bundle containing the enabled `avatar-worker` accounts, so account rotation
does not require copying a raw token into the deployment manifest:

```text
BETTERPPTX_AVATAR_PROVIDER=liveportrait-musetalk
BETTERPPTX_CREDENTIAL_STORE=/var/run/secrets/betterpptx/avatar-worker-credentials.json
BETTERPPTX_AVATAR_TIMEOUT_MS=600000
BETTERPPTX_AVATAR_MAX_SECONDS=120
BETTERPPTX_AVATAR_MAX_CONCURRENCY=1
BETTERPPTX_AVATAR_JOB_STORE=firestore
BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION=betterpptx_avatar_jobs
BETTERPPTX_AVATAR_WORKER_STATE_STORE=firestore
BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION=betterpptx_avatar_worker_state
BETTERPPTX_GEN_ASSET_STORE=gcs
BETTERPPTX_GEN_ASSET_BUCKET=<owner-managed-private-bucket>
BETTERPPTX_GEN_ASSET_GCS_PREFIX=betterpptx-avatar-artifacts
```

The checked-in Cloud Run template is `deploy/cloud-run-mcp-piper.yaml`. It expects the owner-managed
Secret Manager secret `betterpptx-avatar-worker-credentials` to contain only the credential-store JSON
for the avatar-worker accounts. Do not bind the broad local development credential store to production.

The provider reads enabled `avatar-worker` accounts from `BETTERPPTX_CREDENTIAL_STORE` (with the legacy
single-account env fallback), resolves each endpoint as URL + route (route defaults to
`/v1/avatar/lipsync`), sends the multipart body above with that account's bearer token, and fails over
to the next account. Result-URL responses are disabled unless explicitly allowlisted; raw MP4 is preferred.
Do **not** put the token in code or public config — read it from the secret manager and keep it out of
logs. The MCP normalizes the returned MP4 (H.264/yuv420p/AAC/faststart) — so **ffmpeg + ffprobe must be
present in the MCP serving image** (`BETTERPPTX_FFMPEG_PATH` / `BETTERPPTX_FFPROBE_PATH`).
Each render request carries the caller idempotency key as `Idempotency-Key`; deterministic 4xx input
rejections do not fail over, while worker-side deduplication and cancellation remain required. Job
metadata is durable only when the Firestore store is configured; the media bytes remain in the shared
opaque asset store and raw local paths are never persisted in the job record.
Set `BETTERPPTX_AVATAR_ROTATION_MODE=deterministic` in a multi-instance deployment to select a stable
starting account from that durable idempotency key; no-key maintainer calls retain round-robin behavior.
The adapter also consults secret-free account health state and skips active cooldowns; if every account
is cooling down it probes the full set once. Use the Firestore state store in production so cooldown
and quota signals are shared across instances. This is still not a replacement for weighted quota
accounting or owner-controlled credential rotation.

## Timeout chain (the clip-length caveat)

The whole render returns in **one synchronous HTTP call**, so three timeouts stack:

| Layer | Limit | Note |
| --- | --- | --- |
| MCP provider (`BETTERPPTX_AVATAR_TIMEOUT_MS`) | 600s (default) | generous |
| **Modal orchestrator (`fastapi_app`)** | **~300s (Modal default — no explicit `timeout=`)** | **the binding ceiling** |
| Modal GPU functions (`lp_animate`, `mt_render`) | 900s each | but the orchestrator blocks on them within its own 300s window |

Measured: a 4s clip is ~104s cold; a 30s LP+MuseTalk clip is roughly ~2–4 min cold. So short clips
(≤~30–45s) fit the 300s orchestrator ceiling; longer clips will time out. To support longer clips,
**set an explicit `timeout=` (e.g., 900) on `fastapi_app`**, and/or keep the A10G warm, and/or extend
the provider to a worker-side job/result protocol. `BETTERPPTX_AVATAR_MAX_SECONDS=120` caps clip length
MCP-side, but a 120s LP+MuseTalk render far exceeds 300s of compute — keep avatar segments short or
raise the orchestrator timeout first. The MCP `render_job` queue keeps the *AI-facing* call async, but
it does not split the private worker's single HTTP request.

## Cost basis (A10G — for reference; see the cost docs for the model)

A10G $1.10/hr = $0.000306/GPU-second, $0 idle (scale-to-zero). Measured warm decomposition
(`modal_warm_bench.py`): model-load tax ~59s = **$0.018/cold job**; warm compute ~49s per 10.7s clip =
**~$0.0014 per audio-second**; a 30s clip ≈ **$0.042 warm / ~$0.06 cold**. Full detail:
`avatar-metrology/HANDOVER.md` §5 and `outputs/cloud-cost-metrology/avatar-cost-estimate-2026-06-25.md`.

## Verify end-to-end after wiring

```powershell
# 1. worker reachable + auth
node betterpptx-mcp\verify-avatar-runtime.mjs --check-worker-health

# 1b. active Cloud Run revision must actually carry the avatar contract
# (read-only; exits non-zero until the avatar-enabled revision is deployed)
node betterpptx-mcp\verify-avatar-deployed-revision.mjs

# 1c. model/checkpoint provenance must be explicitly reviewed
node betterpptx-mcp\verify-avatar-license-ledger.mjs

# 1d. queued avatar execution must wait for terminal completion and replay safely
node betterpptx-mcp\verify-avatar-durable-dispatch.mjs

# 1e. local durable-operation lease/fencing/retry contract
node betterpptx-mcp\verify-durable-operation-lease-recovery.mjs

# 1f. native talking-head/3D runtime lowering and fail-closed checks
node betterpptx-mcp\verify-presenter-contract.mjs

# 1g. package-level MP4, PowerPoint relationship, timing, and COM playback contract
node betterpptx-mcp\verify-avatar-pptx-playback-contract.mjs

# 1h. opaque metadata expiration and purge contract
node betterpptx-mcp\verify-avatar-job-retention.mjs

# 1i. local reservation/commit/release exactly-once billing contract
node betterpptx-mcp\verify-avatar-billing-exactly-once.mjs

# 1j. local rotating-worker health/cooldown contract (research evidence)
node betterpptx-mcp\verify-avatar-worker-state.mjs

# 1k. tenant-scoped durable video/poster artifact lifecycle (research evidence)
node betterpptx-mcp\verify-avatar-artifact-lifecycle.mjs

# 1l. read-only owner rotation preflight (never mutates secrets)
node betterpptx-mcp\verify-avatar-rotation-preflight.mjs

# 2. real render via the async job path (provider=liveportrait-musetalk, worker env set)
node betterpptx-mcp\smoke-avatar-job.mjs

# 3. public black-box guard (no provider/model/GPU leakage)
node betterpptx-mcp\verify-blackbox-public.mjs https://YOUR-MCP-URL/mcp
```

Expect `render_job` → `succeeded`, `attach_result` embeds the MP4, `deck.validate_avatar_narration`
returns `ok:true`, and the saved PPTX opens in PowerPoint without a repair prompt.

## Remaining ops checklist

1. Create the owner-managed `betterpptx-avatar-worker-credentials` Secret Manager value and deploy the
   updated Cloud Run template; verify the active revision reads the mounted path. The deployment audit
   must show the avatar provider, bundled ffmpeg/ffprobe, Firestore job metadata, secret-backed credential
   store, and worker-credential volume before the revision can be used for a canary.
2. Confirm **ffmpeg/ffprobe** in the active MCP serving image and run the full MCP canary.
3. **Rotate both paired worker credentials** — update the owner-managed credential bundle, run an
   authenticated canary against each enabled account, then revoke the prior worker secret versions.
4. (Optional) Raise `fastapi_app` `timeout=` for longer clips.
5. (Optional) Migrate to the `betterpptx` Modal workspace for a branded
   `https://betterpptx--…​.modal.run` URL — blocked on `py -m modal token new --profile betterpptx`
   (owner browser auth), then recreate both secrets there, redeploy, mint a fresh token, and stop
   `svc-e3b56934` in `telcomgapp`.
6. License review of the model images/weights (MuseTalk, LivePortrait, DWPose, face-parse, VAE, Whisper)
   before public production — real lip-sync stays behind the deferred provider review in
   `betterpptx-mcp/avatar/NOTICES.md`.

## Black-box reminder

Public endpoints must not leak `liveportrait`, `musetalk`, `a10g`, the worker URL, secret names, or
GPU class. Keep provider/mode as internal env config; public schemas expose only quality/mode/script/
audio/avatar-image. Worker failures map to generic `AVATAR_UNAVAILABLE`.
