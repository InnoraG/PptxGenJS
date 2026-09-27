# G4 — Owner-Secret Inventory (names + locations ONLY; never values)

Status: **LOCAL CONTROL 8/9 GREEN / LIVE CLEAN-SHA DEPLOYMENT BLOCKED BY OWNER BILLING 2026-08-15**. The inventory and owner-only
Mission Control registration/rotation contract are implemented and locally verified; production Secret Manager,
live rotation, rollback/break-glass, and final deployment evidence remain open. Every read-site below was originally
code-verified 2026-07-14 at HEAD `dea5ccf4d`; the current gate evidence is recorded in the re-audit below.

## Clean release-candidate preflight — 2026-08-15

The integrated source was frozen in the isolated release worktree at clean SHA
`d3d40d8cb9d336396dac49d64ae5f782fc97f0b9`; strict provenance, G1, and G5 passed there. The documented staging
project is authenticated, and its current MCP service is Ready on one immutable image digest with 100% traffic and
the owner-controlled credential bundle mounted from Secret Manager. The read-only deployed-revision verifier remains
blocked because that revision lacks the three production-only talking-head settings for route lock, motion profile,
and mouth profile.

The external stop is explicit: Cloud Billing is disabled for the staging project, and Artifact Registry returns
`BILLING_DISABLED`. Therefore the clean-SHA image cannot be built/pushed through Cloud Build or deployed as a new
revision. Local Docker was also unavailable during the preflight, so no local image proof substitutes for that
missing deployed revision. No service, route, traffic, secret, or billing mutation was attempted. The sanitized
machine record is `G4-LIVE-DEPLOYMENT-PREFLIGHT-2026-08-15.json`.

Owner action is narrow: enable billing for the existing staging project, then build and deploy the exact canonical
clean SHA, verify the production-only settings and active 100% revision, perform a two-phase Secret Manager
credential rotation with authenticated canary, exercise rollback/break-glass, and record the final no-raw-secret
audit. Only then may `G4-DEPLOYMENT-EVIDENCE.json` be written with `status:"PASS"`.

The final evidence is fail-closed and must be bound to facts, not only approval booleans. Schema
`betterpptx.g4-deployment-evidence.v1` requires the 40-character clean source commit, clean-tree and ship PASS,
Ready revision, immutable image digest, 100% traffic, Secret Manager backing, the production-only talking-head route,
an authenticated post-rotation canary with the old credential revoked/disabled, a successful rollback canary followed
by restoration of the approved revision, and a public black-box leak scan with `rawSecretsPrinted:false`.

## Re-audit — 2026-08-01

The local owner-control implementation is now present and verified: `verify-mission-control-secrets.mjs`
and `verify-mission-control-secret-routes.mjs` both pass, covering redacted fingerprints, owner-only reveal,
update, rotate, test, route authentication, and raw-value non-leak behavior. This closes the local control
contract, but does **not** claim production Secret Manager wiring or a production rotation/break-glass audit.
Those deployment-backed proofs remain required before G4 is green.

The checked-in deployment boundary is now machine-checked by
`verify-g4-deployment-secret-gate.mjs` (7/7 local template/control checks pass in report-only mode). It
verifies Secret Manager refs/volumes for the Piper/MCP and avatar-worker Cloud Run templates, rejects literal
secret-like env values, and confirms the overlay/promotion scripts do not print raw credentials. This is a
template guard only: strict release mode remains fail-closed until the owner records
`G4-DEPLOYMENT-EVIDENCE.json` for a live deployment, rotation, rollback/break-glass exercise, and no-raw-secret
audit.

## Core generation/worker secrets

| Secret | Protects | Read in code | Stored today | Dependents | Rotation path |
|---|---|---|---|---|---|
| `BETTERPPTX_MODEL3D_GEN_TOKEN` | rigged-3D worker auth (client side) | `assets/model3d-gen-providers.mjs:50,:55` (credential-store account env + env fallback) | `config/credential-store.json` (gitignored; hard-excluded from docker/gcloud build contexts 2026-07-14) | engine generate_rigged3d; kinetic pipeline base-gen | edit credential store (param-store UI) + update worker secret; no redeploy needed client-side |
| `MODEL3D_ENDPOINT_TOKEN` | rigged-3D worker auth (worker side) | `deploy/model3d-worker/model3d_app.py:1620` | Modal secret (per profile: betterpptx, betterxavatar) | model3d worker endpoints | `modal secret update` per profile + rotate the matching client token, then `modal deploy` |
| `BETTERPPTX_MODAL_FLUX_TOKEN` | Flux image worker auth (client side) | `assets/image-gen-providers.mjs:65,:70` | `config/credential-store.json` (multiple accounts, round-robin) | engine generate_image; rigged-3D prompt path | as above (client store + worker pair) |
| `FLUX_ENDPOINT_TOKEN` | Flux worker auth (worker side) | `deploy/flux-worker/flux_app.py:115` | Modal secret | flux worker endpoints | `modal secret update` + client pair rotate |
| `BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN` | reference-aware image worker auth (client side) | `assets/image-gen-providers.mjs` (`modal-image-edit` credential accounts + env fallback) | `config/credential-store.json` (multiple approved Modal endpoints, round-robin) | engine `generate_image` edit/reference capabilities | owner edits the private param-store account then rotates the paired worker secret; public surfaces never expose it |
| `IMAGE_EDIT_ENDPOINT_TOKEN` | reference-aware image worker auth (worker side) | `deploy/image-edit-worker/image_edit_app.py` | Modal secret `betterpptx-image-edit-token` per approved profile | opaque private edit/reference endpoint | `modal secret update betterpptx-image-edit-token` per profile + rotate matching client token; no production use before private canary |
| `BETTERPPTX_SEMANTIC_JUDGE_TOKEN` | private Qwen semantic-judge auth (client side) | private worker client + `config/credential-store.json` | `config/credential-store.json` (two redacted paired entries, round-robin) | IMG5 private judge callback | owner rotates paired Modal secret `betterpptx-semantic-judge-token` per profile and matching credential entry; calibration remains required |
| `SEMANTIC_JUDGE_ENDPOINT_TOKEN` | private Qwen semantic-judge auth (worker side) | `deploy/semantic-judge-worker/semantic_judge_app.py` | Modal secret `betterpptx-semantic-judge-token` per approved profile | opaque private semantic-judge endpoint | `modal secret update betterpptx-semantic-judge-token` per profile + forced recreate deployment; never public |
| `HF_TOKEN` | gated model downloads (FLUX.1-schnell, DINOv3) | injected via `modal.Secret.from_name('huggingface-token')` — `flux_app.py:84-86`, `model3d_app.py:1023`; consumed implicitly by huggingface_hub | Modal secret `huggingface-token` | worker cold-start weight loads | rotate on HF + `modal secret update huggingface-token` |
| `BETTERPPTX_CLOUDFLARE_ACCOUNT_ID` / `BETTERPPTX_CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI image route | `assets/image-gen-providers.mjs:46-53` (multi-account store + env fallback) | `config/credential-store.json` | image generation (square/free-tier route) | CF dashboard token rotate + store edit |
| `BETTERPPTX_AVATAR_WORKER_TOKEN` | LivePortrait+MuseTalk worker auth (client side) | `avatar/providers/musetalkHttp.mjs:10-24` (credential-store account env + env fallback) | `config/credential-store.json` (multiple `avatar-worker` accounts, round-robin) | avatar render provider and async avatar jobs | owner rotates each paired worker secret, then updates the matching credential-store account; health verifier checks every enabled account |
| `AVATAR_WORKER_TOKEN` | LivePortrait+MuseTalk worker auth (worker side) | private Modal worker `avatar-metrology/modal_avatar_endpoint.py:33` | Modal secret `betterpptx-avatar-auth` (per deployment profile) | `/healthz` and `/v1/avatar/lipsync` | two-phase rotation: add new secret, update all client accounts, authenticated canary, revoke old secret; no public exposure |
| `AVATAR_FORCE_MUSETALK_ONLY` | Avatar pipeline mode/rollback control | private Modal worker `avatar-metrology/modal_avatar_endpoint.py:34,228` | Modal secret/config `avatar-config` | worker mode selection and emergency rollback | owner-only config change, authenticated canary, audit record, rollback value retained |

## Risk notes (verified)

1. **FIXED 2026-07-14:** NOT_CONFIGURED error messages leaked secret env NAMES to public clients —
   now generic client messages; operator hints go to the server log only
   (`model3d-gen-providers.mjs`, `image-gen-providers.mjs`).
2. **FIXED 2026-07-14:** `config/credential-store.json` (live values, gitignored) was uploadable
   into docker/gcloud build contexts — now hard-excluded in `.dockerignore` + `.gcloudignore`.
3. The credential store holds live values in plaintext on the dev box. Acceptable for local R&D;
   the G4 gate requires Secret Manager + Mission Control for anything deployed.

## Additional secret families to inventory before F1 (TODO — sweep not exhaustive)

- URL/auth for the deployed metrology service (`BETTERPPTX_PUBLIC_MCP_URL`, `BETTERPPTX_URL_SECRET`,
  `BETTERPPTX_AUTH` — read by `verify-blackbox-public.mjs` from `deploy/production.env`, which is
  ignored in both build contexts).
- PayRam gateway keys, activation/licensing signing keys, webhook secrets (billing modules).
- GCP service-account credentials used by deploy scripts (gcloud auth context, GCS artifact bucket).
- Sketchfab / stock-provider API keys (`stock-providers.mjs` account envs).

## G4 closure checklist (current state)

- [ ] Raw values moved to Secret Manager (client-side store becomes a fetch-through cache or dev-only)
- [x] Private Mission Control: redacted status, fingerprint, source, active version, last rotation,
      dependents; audited owner-only reveal/update/rotate/test actions
- [x] Local rotation/control contract passes without raw-value logging or public leakage
- [ ] Break-glass + rollback documented and audited
- [x] Public paths proven unable to reveal values by the current black-box/adversarial suites

Original ledger measurement: 2026-07-14 · historical HEAD at record time: dea5ccf4d. Current 2026-08-01 re-audit is recorded above; this historical SHA is not a clean release provenance SHA, and live Secret Manager/rotation/break-glass evidence remains open.
