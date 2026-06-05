# BetterPPTX Rollout Progress Tracker

Updated: 2026-06-05

Scope: Track A private implementation hardening for `betterpptx-mcp`, aligned to `betterpptx-ultimate-aligned-rollout-plan.md`, `betterpptx-executor-alignment-rollout-plan.md`, and `betterpptx-private-track-a-executor-plan-claude.md`.

## Status Key

- Done: implemented and locally verified.
- In progress: implementation started, more code or verification remains.
- Pending external: needs production account, cloud project, DNS, registry, or deployment input.
- Pending: not started.

## Completed

| Area | Status | Evidence |
| --- | --- | --- |
| Dodo test API setup | Done | Local setup saves private test key in `betterpptx-mcp/.betterpptx-mcp-runtime/dodo-local.env`; file is ignored by git. |
| Dodo live API setup launcher | Done | `betterpptx-mcp/run-dodo-live-setup.cmd` writes live-mode values to `betterpptx-mcp/.betterpptx-mcp-runtime/dodo-live.env` and uses the live validation host. |
| Dodo live API-key verification | Done | `dodo-live-verify.mjs` verified the live key read-only against Dodo live mode; no live products were present yet, activation skipped because no live customer license key is saved. |
| Dodo live product bootstrap guard | Done | `dodo-live-product-bootstrap.mjs` can discover/reuse a live BetterPPTX product and refuses creation until an explicit positive live price is configured. |
| Cloud Run Git-based process entry | Done locally | Root `Procfile` runs `node betterpptx-mcp/server-http.mjs` for source-based Cloud Run deploys. |
| Cloud Run production env template | Done locally | `betterpptx-mcp/deploy/cloud-run.env.example` captures Dodo live, GCS, Firestore, black-box, and abuse-control env names for private deployment setup. |
| Dodo product/customer/license bootstrap | Done | `betterpptx-mcp/dodo-admin-bootstrap.mjs` creates/reuses test product, customer, and license; freemium verifier passed. |
| Dodo test subscription/credit bootstrap | Done | `dodo-test-billing-bootstrap.mjs` created/reused a test-mode credit entitlement, `$5/month` subscription product, `$5` top-up product, and checkout session. Product payload shape is verified against Dodo test mode before live use. |
| GitHub private repositories | Done | `https://github.com/betterpptx/betterpptx` and `https://github.com/betterpptx/betterpptx-mcp` exist and are private. |
| Private MCP deploy repo push | Done | Curated private deploy copy pushed to `betterpptx/betterpptx-mcp` on `main`; dirty convergence workspace was not pushed wholesale. |
| GCP staging project | Done | Created `betterpptx-mcp-staging`, linked billing account, enabled required Cloud Run/Build/Artifact Registry/GCS/Firestore/Secret Manager/IAM APIs. |
| GCS staging artifact bucket | Done | Created private bucket `betterpptx-mcp-staging-artifacts-860007156914` with public access prevention and 3-day lifecycle deletion. |
| Firestore staging entitlement database | Done | Created Firestore Native `(default)` database in `us-central1`; runtime service account has datastore user access. |
| Dodo test key in Secret Manager | Done | Stored Dodo test API key in Secret Manager as `betterpptx-dodo-test-api-key`; no API key committed to Git. |
| Cloud Run direct staging deploy path | Done | `deploy/cloudbuild.mcp.yaml` plus `deploy/gcp/deploy-mcp-staging.ps1` build and deploy the MCP image through Cloud Build and Cloud Run. Latest deployed image is `us-central1-docker.pkg.dev/betterpptx-mcp-staging/betterpptx-mcp/betterpptx-mcp-staging:billing-20260605065302`. |
| Cloud Run Git-based deployment pipeline | Trigger present; root config added | GitHub connection `betterpptx-github`, repository mapping `betterpptx-mcp`, and trigger `betterpptx-mcp-staging-main` exist. Added root `cloudbuild.yaml` so pushes to `main` can build/deploy both the private MCP service and the public webhook-only receiver. |
| Cloud Run private staging deployment | Done | Service `betterpptx-mcp-staging` is Ready in `us-central1` on revision `betterpptx-mcp-staging-00008-bp4`, IAM-protected with unauthenticated `/health`, `/`, and `/webhooks/dodo` returning `403`; authenticated `/health` returns generic BetterPPTX OK. |
| Cloud Run black-box/download smoke | Done | Auth-injected deployed MCP verification passed on revision `00003`: `BLACKBOX VERIFY: PASS`; `DOWNLOAD VERIFY: PASS`; signed GCS download returned a valid PPTX ZIP. |
| Deployed Dodo activation smoke | Done | `verify-freemium-gate.mjs` passed against private Cloud Run: slide-3 gate returned structured `REQUIRES_UPGRADE`, Dodo test activation succeeded, and premium retry succeeded. |
| Deployed Dodo billing webhook smoke | Done | Authenticated signed synthetic `credit.added` webhook reached private Cloud Run `/webhooks/dodo`, returned `200`, and wrote Firestore billing webhook/customer records with balance snapshot `498`. Real Dodo delivery still needs an externally reachable receiver. |
| Dodo public webhook-only receiver | Done | Separate public Cloud Run service `betterpptx-dodo-webhook-staging` exposes only `/health` and `/webhooks/dodo`, rejects unsigned/missing-custom-token requests, uses Secret Manager + Firestore, and has no MCP routes. |
| Billing secret owner controls | Scripted; dashboard pending | Dodo webhook custom header name/token are owner-configurable via `deploy/gcp/update-dodo-webhook-custom-header.ps1`. Mission Control must add owner-only reveal/update/rotate/test controls for all billing-critical user-defined secrets before live launch. |
| Deployed Firestore entitlement persistence | Done | Firestore collection `betterpptx_entitlements` contains a fingerprinted entitlement document after deployed Dodo activation; raw license key is not stored. |
| GCP project cost guard | Done | Created project-scoped budget alert `BetterPPTX MCP Staging` for `$5/month` with 50%, 80%, and 100% thresholds; deleted obsolete GitHub OAuth secret, destroyed stale Dodo secret version, pruned old images, and applied Artifact Registry cleanup policy. |
| Freemium activation path | Done | `verify-freemium-gate.mjs` passed with Dodo test-mode activation. |
| A1 safe fetch / SSRF hardening | Done | `betterpptx-mcp/net/safe-fetch.mjs`; generic fetch blocked by default; remote media fetch validates protocol, DNS, private IPs, redirects, size, timeout, and image content type. |
| Public black-box leak checks | Done | `verify-blackbox-public.mjs` now checks generic fetch is not exposed and metadata/private media URLs are refused. |
| A2 request controls | Done | HTTP token bucket, JSON/body limit handling, service kill switch, read-only mode, deck quota, upload cap, and per-tool timeout implemented. |
| A2 verifier | Done | `verify-a2-controls.mjs` reports `A2 VERIFY: PASS`. |
| A5 local artifact-store boundary | Done | `betterpptx-mcp/storage/artifact-store.mjs`; `deck.save` writes through the adapter and public downloads remain opaque `/files/<token>/<name>` URLs. |
| A5 GCS artifact adapter boundary | Done locally | `BETTERPPTX_ARTIFACT_STORE=gcs` prepares temp saves, uploads validated PPTX artifacts to GCS, and returns short-lived V4 signed download URLs. Requires real bucket/signing permissions for live verification. |
| A6 local entitlement-store boundary | Done | `betterpptx-mcp/auth/entitlement-store.mjs`; persisted key state is fingerprint-based and strips raw key-like fields before saving. |
| A6 Firestore entitlement adapter boundary | Done locally | `BETTERPPTX_ENTITLEMENT_STORE=firestore` stores fingerprinted entitlement state in Firestore. Requires real Firestore project/database for cross-instance live verification. |
| A7 first idempotent mutators | Done | `betterpptx.slide.add` and `betterpptx.deck.save` accept `idempotencyKey`; replay returns the original result and conflicts are structured. |
| A7 broader deck-local idempotency | Done | Dispatch-level replay protection covers slide update/duplicate/delete/reorder, common object/media add tools, deck section/layout/autoplay/transition mutations, narration mutations, and shape update/delete/reorder tools when `deckId + idempotencyKey` are provided. |
| A7 retry-safe correction | Done | Mutating tool timeouts without `idempotencyKey` no longer claim retry-safe behavior. Exact idempotent replays are checked before entitlement/quota gates so a replay does not get blocked by changed deck state. |
| A7 session-level idempotency | Done | Session replay covers `auth.activate_key`, `deck.new`, `deck.open_existing`, `deck.open_uploaded`, `io.write_file`, and `narration.synthesize` when `idempotencyKey` is provided. |
| A7 final mutating-tool audit | Done | All 79 handlers were classified as read-only or covered by deck/session idempotency. `deck.dispose` is session-idempotent because the deck-local record is removed when the deck is deleted. |
| A5/A6/A7 verifier | Done | `verify-a5-a7-reliability.mjs` reports `A5/A6/A7 VERIFY: PASS`, including activation, deck.new, add_text, duplicate, update, transition, reorder, delete, save, download, and uploaded-open replay checks. |
| A9 privacy-safe logging posture | Done | Logger redacts raw keys, payloads, prompts/text/notes/content/data, and private paths by default. Full payload/path logging now requires explicit local opt-in env flags. |
| A9 aggregate telemetry | Done | `telemetry.mjs` records in-memory counters for tool calls, failures, idempotent replays/conflicts, artifact saves/downloads, auth activation outcomes, and byte buckets without raw args or paths. Public health stays generic. |
| Track A local harness | Done | `verify-track-a-local-harness.mjs` drives multiple local MCP sessions through create/edit/save/download/idempotency flows and verifies aggregate telemetry. |
| Track A failure-injection harness | Done | `verify-track-a-failure-injection.mjs` verifies quota replay bypass, structured idempotency conflict, structured rate-limit failure, missing-artifact telemetry, and failure counters. |

## Current Work Queue

| Phase | Item | Status | Notes |
| --- | --- | --- | --- |
| A5 | Production object-store adapter | Staging verified | Local adapter is verified. Deployed Cloud Run saved a deck to the staging GCS bucket and returned a browser-fetchable signed PPTX URL. |
| A6 | Production shared entitlement store | Staging verified | Firestore adapter boundary is implemented. Deployed Dodo test activation persisted a fingerprinted entitlement document in Firestore. |
| A7 | Retry semantics | Done locally | All current handlers are classified. Further changes only if new mutating tools are added. |
| A7.1 | Cross-instance deck/session/idempotency state | Pending | GCS artifacts and Firestore entitlements are shared, but live editable deck/session state remains process-local. Keep Cloud Run max instances at 1 until this is implemented and verified. |
| A9 | Telemetry/harness | Done locally | Aggregate telemetry, local harness, and failure-injection harness pass. Longer cross-instance stress requires shared stores. |
| Billing | Firestore-backed private staging billing | Staging synthetic verified | Dodo usage-credit checkout and real Dodo deduction are verified in test mode. Private Cloud Run synthetic webhook writes to Firestore. Real Dodo external callback remains intentionally blocked by IAM until a public webhook-only receiver or tunnel is approved. |

## Pending Production Inputs

| Input | Status | Why Needed |
| --- | --- | --- |
| Production Dodo API key/product | Partially done, pending product | Live API key is saved and verified. Live product creation remains blocked intentionally until test-mode billing flow is validated end-to-end. |
| Dodo test subscription/credit products | Done | Test credit entitlement, `$5/month` subscription product, `$5` top-up product, and checkout session are saved in the private local Dodo env/status files. |
| Dodo external webhook receiver | Pending owner/design approval | The MCP service remains IAM-private during harness testing. Real Dodo webhook delivery needs either a separate minimal public webhook-only Cloud Run service or a temporary tunnel. |
| Object storage bucket | Staging provisioned | GCS private bucket exists for staging with signed URL/lifecycle verification pending after Cloud Run deploy. |
| Shared datastore choice | Staging provisioned | Firestore exists for shared entitlement state. Session/idempotency/deck-state sharing remains a separate implementation milestone before max-instances > 1. |
| Public GitHub URL/repository decision | Done | Public repo target: `https://github.com/betterpptx/betterpptx`; private MCP repo target: `https://github.com/betterpptx/betterpptx-mcp`. |
| GitHub private repositories | Done | `gh` is authenticated, both target repos exist privately, and the curated private MCP deploy repo is pushed to `betterpptx/betterpptx-mcp`. Public docs repo remains empty/private until sanitized Track B content is ready. |
| Cloud Build GitHub OAuth | Done | User authorized the GitHub App for the `betterpptx` organization; connection is COMPLETE and the GitHub trigger deploys from `betterpptx/betterpptx-mcp`. |
| Public endpoint/DNS | Deferred by owner | No public endpoint during harness stress testing. Add domain and live endpoint only after validation gates pass. |

## Verification Commands Last Known Good

```powershell
node --check .\betterpptx-mcp\engine.mjs
node --check .\betterpptx-mcp\net\safe-fetch.mjs
node --check .\betterpptx-mcp\server-http.mjs
node --check .\betterpptx-mcp\verify-blackbox-public.mjs
node --check .\betterpptx-mcp\verify-a2-controls.mjs
node --check .\betterpptx-mcp\dodo-admin-bootstrap.mjs
node --check .\betterpptx-mcp\dodo-live-verify.mjs
node --check .\betterpptx-mcp\dodo-live-product-bootstrap.mjs
node --check .\betterpptx-mcp\dodo-test-billing-bootstrap.mjs
node --check .\betterpptx-mcp\storage\artifact-store.mjs
node --check .\betterpptx-mcp\auth\entitlement-store.mjs
node --check .\betterpptx-mcp\verify-a5-a7-reliability.mjs
node --check .\betterpptx-mcp\telemetry.mjs
node --check .\betterpptx-mcp\verify-track-a-local-harness.mjs
node --check .\betterpptx-mcp\verify-track-a-failure-injection.mjs
node --check .\betterpptx-mcp\verify-production-store-config.mjs
node .\betterpptx-mcp\verify-a2-controls.mjs
node .\betterpptx-mcp\verify-a5-a7-reliability.mjs
node .\betterpptx-mcp\verify-track-a-local-harness.mjs
node .\betterpptx-mcp\verify-track-a-failure-injection.mjs
node .\betterpptx-mcp\verify-production-store-config.mjs
.\deploy\gcp\deploy-mcp-staging.ps1
```

Additional Dodo/private verification passed locally:

```powershell
node .\betterpptx-mcp\dodo-admin-bootstrap.mjs
node .\betterpptx-mcp\dodo-live-verify.mjs
```

## Next Planned Increment

No immediate user action is required for the next private-staging increment.

Continue with:

1. Run the private staging harness/stress path while Cloud Run remains `max-instances=1`.
2. Decide whether shared deck/session/idempotency state is required before increasing Cloud Run max instances.
3. Decide the real Dodo webhook delivery shape: preferred is a separate minimal public webhook-only receiver with no MCP routes; fallback is a temporary tunnel.
4. Recreate/enable the Git-based Cloud Run trigger if GitHub-based deployment remains a requirement.
5. Reduce container image size if Artifact Registry storage must stay comfortably below the `0.5 GB` free-tier boundary.
6. Later, after harness/stress approval: public endpoint/domain, public documentation repo content, and live Dodo product creation.

Next hard user-action milestone:

1. Before real external Dodo webhook validation, the owner must approve either a separate public webhook-only Cloud Run receiver or a temporary tunnel.
2. After private staging harness/stress passes, the owner must approve the public endpoint/domain and live Dodo product/pricing switch before any public launch.
