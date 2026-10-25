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
- Endpoint check without a GPU: every endpoint route is the GPU function, so even an unauthenticated request cold-starts an A10G. Verify deployments instead with a CPU-only Modal probe. It compares `modal.Function.from_name("betterpptx-avatar-commercial-production", "lipsync").get_web_url()` with the bundle URL, and the sha256 fingerprint of the account's `betterpptx-avatar-commercial-auth` token with the bundle token.
