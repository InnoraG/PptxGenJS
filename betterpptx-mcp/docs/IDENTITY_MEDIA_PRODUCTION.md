# Identity media in production: custom personas and talking heads

Private maintainer notes. Both features run wherever `generate_from_spec phase:"resolve"` executes, which is normally the queued worker (`betterpptx-worker`). The release workflow therefore gives the gateway and the worker the same settings (`IDENTITY_MEDIA_ENV` / `IDENTITY_MEDIA_SECRETS` in `.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml`).

## Custom personas (Meshy)
- Secret `betterpptx-meshy-api-key` is bound as `BETTERPPTX_MESHY_API_KEY`.
- `BETTERPPTX_NATIVE3D_MODE=production` and `BETTERPPTX_NATIVE3D_OWNER_CLEARANCE=approved` are set.
- The built model is stored in the GCS gen-asset store (it falls back to `BETTERPPTX_LOCKED_ASSET_STORE=gcs` and `BETTERPPTX_GCS_BUCKET`), so the gateway can commit what the worker built.

## Talking heads (LivePortrait → MuseTalk on Modal)
- Provider: `liveportrait-musetalk-commercial`. Switch it off with the repository variable `BETTERPPTX_AVATAR_PROVIDER=disabled`, then redeploy.
- Endpoints and tokens: secret `betterpptx-avatar-worker-credentials`, a credential-store bundle under provider `avatar-worker-commercial`. It is bound whole as `BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL`. Accounts with `enabled:false` are skipped.
- Rotation: `deterministic` (keyed by the idempotency key), with failover to the next account.
- The rotation accounts are the Modal profiles `telcomgapp`, `betterpptx-fluxworkerai`, `betterxavatar2`, `betterxavatar1`, `betterpptx` and `betterpptx-flux` (workspace `innorag`). Each runs the app `betterpptx-avatar-commercial-production`, which scales to zero.

### $29.50 per Modal account per month (owner hard rule)
- `storage/avatar-worker-budget-store.mjs` is a Firestore gate (`betterpptx_avatar_worker_budget`) checked before every worker call.
  - Effective spend = the account's real billed month-to-date spend, plus this runtime's renders that are not yet billed (and any open reservation).
  - An account that cannot fit the next render's estimate under $29.50 − $1.50 reserve drops out of rotation.
  - An account whose billing figure is missing or older than 6 h also drops out.
  - When no account remains, the call fails with `AVATAR_CAPACITY_EXHAUSTED` before any GPU work. The public message says nothing was rendered, no allowance was used, and to retry later or use voice-only narration. A real worker failure on any account is reported instead.
  - In public black-box mode the failover trace (hashed account ids, worker statuses) is stripped from avatar error details, including stored durable-operation failures.
- The real billed figure comes from the Cloud Run job `betterpptx-avatar-budget-sync` (`deploy/avatar-budget-sync/`).
  - Cloud Scheduler `betterpptx-avatar-budget-sync-hourly` runs it at minute 5 of every hour.
  - It runs `modal billing report --for "this month"` per account, using the tokens in secret `betterpptx-modal-billing-tokens` (`{"accounts":[{"id","tokenId","tokenSecret"}]}`).
  - Right after a fresh deploy, run it once by hand: `gcloud run jobs execute betterpptx-avatar-budget-sync --region=us-central1 --wait`.
- Adding an account takes three steps: deploy the worker on the new Modal account, add it to both secrets, then run the sync job.
- The owner decided on 2026-10-25 not to set Modal dashboard spend limits, so this gate is the cap.
- Liveness without spend: each worker app also deploys `health`, a CPU-only GET route (`betterpptx-avatar-commercial-health`, 0.125 CPU, never a GPU). It returns the worker build, `authConfigured`, and `authorized` when called with the bearer token.
  - Each account's health URL is recorded in the bundle as `BETTERPPTX_COMMERCIAL_AVATAR_WORKER_HEALTH_URL`, because some workspaces add a `.us-east` region suffix that older lipsync URLs lack.
  - Production (`BETTERPPTX_AVATAR_WORKER_HEALTH_PRECHECK=1`) calls it before every render request. An account that is down, unreachable, or rejects our token is skipped and released, with no render call and no charge.
  - Checks: `py deploy/avatar-worker/verify_rotation_endpoints.py <bundle>` (add `--probe-lipsync-401` to also probe the render route), and `node verify-avatar-runtime.mjs --check-worker-health`.
- Worker source: `deploy/avatar-worker/modal_avatar_commercial_eval.py` (with `fetch_pinned_weights.py`, `restoreformer-models.lock.json` and `liveportrait_eye_gaze_blend_patch.py`) is the deployed production source, tag `commercial-health-20261026`.
  - The `lipsync` route is a 1-CPU coordinator; GPU stages start only after auth.
  - Deploy one account at a time with `MODAL_PROFILE=<id> py -m modal deploy modal_avatar_commercial_eval.py --tag <tag>`.
  - Keep LF line endings in the patch file, or the LivePortrait image rebuilds.
