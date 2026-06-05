# BetterPPTX Dodo Billing Progress Tracker

Date started: 2026-06-04
Executor plan: `plans/dodo-billing-integration-plan.md`

## Current Milestone

Next milestone: MC1 plus private deployed staging stress harness. True external Dodo webhook delivery is held for the separate public webhook receiver decision.

Local implementation through the billing stress harness is complete. Dodo test checkout authorization and real credit deduction are verified. Firestore-backed private Cloud Run staging is now deployed and synthetic signed webhook processing writes to Firestore. Real Dodo-to-Cloud-Run webhook delivery is intentionally not opened because the staging service is IAM-private; the executor plan's preferred next design is a separate minimal public webhook receiver with no MCP routes.

## Phase Status

| Phase | Status | Notes |
|---|---|---|
| Phase 0 - env/package-name cleanup | Done | Local/PM2/tunnel config standardized on `BETTERPPTX_*`; active MCP package path is `betterpptx-mcp/`; verified no active old-name source/config/text references. |
| Phase 1 - Dodo test product and meter finalization | Done | Test-mode v2 fractional-credit entitlement, weighted usage meter, paid usage-based starter product with meter-credit linkage, legacy credit subscription product, top-up product, and checkout session created/reused by bootstrap. |
| Phase 2 - Firestore billing ledger | Deployed staging verified | Billing ledger store, reservation transactions, queued usage event store, webhook idempotency store, and verifier are implemented. Local concurrency verifier passes. Cloud Run workload identity wrote synthetic webhook/customer records to Firestore. Local direct verifier still needs ADC if run from the workstation. |
| Phase 3 - customer identity extension | Done | Dodo activation now resolves/persists private customer/product/subscription/payment/license fields, writes hashed billing customer mapping, and returns setup-incomplete instead of unlocked paid access when no customer can be resolved. |
| Phase 4 - webhook receiver | Deployed staging verified synthetically | Raw-body Dodo signature verification, idempotency, safe event summaries, customer mapping updates, and balance snapshot handling are implemented and verified on private Cloud Run with an authenticated signed synthetic webhook. Real Dodo external delivery needs an externally reachable receiver. |
| Phase 5 - dry-run rate card telemetry | Done | Versioned shadow rate card, tool classifier, checkpoint/heavy estimator, dry-run ledger operation facts, public-safe summary, and calibration verifier are implemented locally. |
| Phase 6 - reservation gates | Done | Inline engine preflight/finalize hook, checkpoint/heavy reservations, one-shot live balance refresh before insufficient-credit block, release on pre-value failure, and queued usage on success are implemented locally. |
| Phase 7 - Dodo usage ingestion | Done | Dodo usage client, `/events/ingest` batch flush, deterministic event formatting, retry metadata, reconciler, engine auto-flush, and queued-debt cap are implemented and mock-verified. Real Dodo test mode now deducts credits from the active usage-credit checkout customer. |
| Phase 8 - billing UX tools | Done | Public-safe billing URLs, Starter/top-up plan explanation, activated balance/pending/queued summary, billing estimate, usage summary, and no-provider-ID verifier are implemented locally. |
| Phase 9 - billing stress harness | Done locally | Concurrency, idempotency, outage/recovery, zero-balance block, credit-added webhook recovery, and public tool schema black-box checks are implemented and passing locally. |
| Phase 10 - live readiness | Blocked | Must not begin until MC1/deployed stress passes and real external webhook delivery is validated through the approved public receiver/tunnel shape. |

## Verification Log

| Time | Check | Result |
|---|---|---|
| 2026-06-04 | Executor plan rewritten | Done. Definitive plan includes coarse gates, Firestore reservations, Dodo webhooks, and batched usage ingestion. |
| 2026-06-04 | Env prefix cleanup | Done. Main workspace and private deploy checkout use `BETTERPPTX_*` for active local deploy paths. |
| 2026-06-04 | MCP package-name cleanup | Done. Renamed active MCP package/runtime/cache paths to `betterpptx-mcp*`; text search found no active source/config references to old MCP names. One locked generated output directory under `outputs/` still has the old token in its folder name only and is not referenced by code/config. |
| 2026-06-04 | Initial current-state audit | Done. Existing local Dodo test config found; Phase 1 needs v2 fractional-credit and weighted-meter finalization. |
| 2026-06-04 | Dodo test billing bootstrap | Done. Created/reused v2 fractional credit entitlement `cde_0NgKisqyZzBwaDM5xZo0j`, weighted meter `mtr_0NgKit15aasvAtKfsdLsp`, subscription product `pdt_0NgKit9YfumYtHCGkXz5Y`, top-up product `pdt_0NgKitIFIaRaARTPU7HRE`, and checkout session. |
| 2026-06-04 | Billing ledger local verifier | Done. `node betterpptx-mcp/verify-billing-ledger.mjs` passed: 5 concurrent reservations succeeded, 3 overspend attempts blocked, usage queued/ingested, webhook replay idempotent, and raw activation key was not persisted. |
| 2026-06-04 | Billing ledger Firestore verifier | Pending external local auth. Firestore dependency repaired and imports cleanly; verifier against `betterpptx-mcp-staging` reaches Google auth but cannot run until Application Default Credentials are configured locally or the verifier runs in Cloud Run/workload identity. |
| 2026-06-04 | Billing customer-map verifier | Done. `node betterpptx-mcp/verify-billing-customer-map.mjs` passed: Dodo customer/product/subscription/payment/license extraction, hashed customer ledger upsert, setup-incomplete behavior, and raw activation-key scrubbing. |
| 2026-06-04 | Billing webhook verifier | Done. `node betterpptx-mcp/verify-billing-webhook-signature.mjs` passed: signed webhook processing, replay idempotency, invalid/stale signature rejection, customer balance snapshot update, and raw customer PII non-retention. |
| 2026-06-04 | Billing dry-run verifier | Done. `node betterpptx-mcp/verify-billing-dry-run.mjs` passed: simple < medium < heavy estimates, draft edit-loop operations record zero direct credits, and raw local paths/text are not persisted. |
| 2026-06-04 | Engine dry-run smoke | Done. `deck.new` -> `slide.add` -> `slide.add_text` -> `deck.save` with dry-run enabled returned an `auth.status` dry-run summary: 4 operations, 5.67 estimated credits, 3 draft-accrual operations, 1 checkpoint. |
| 2026-06-04 | Billing reservation-gate verifier | Done. `node betterpptx-mcp/verify-billing-reservation-gate.mjs` passed: checkpoint/heavy reservations, idempotent reservation replay, live balance refresh before blocking, insufficient-credit block after refresh, temporary-unavailable on refresh failure, release after failed pre-value work, and commit/queued usage after success. |
| 2026-06-04 | Billing balance merge regression | Fixed. Customer balance upserts now let explicit credit-balance patches override stale unit fields without breaking transaction-internal pending/queued unit updates. |
| 2026-06-04 | Billing usage-ingestion verifier | Done. `node betterpptx-mcp/verify-billing-usage-ingestion.mjs` passed: Dodo event formatting, rate-card-independent event IDs, mock ingest success, outage retry metadata, retry-delay skip, later exact-once flush, missing-customer skip, and queued-debt cap. |
| 2026-06-04 | Billing public UX verifier | Done. `node betterpptx-mcp/verify-billing-public-ux.mjs` passed: unactivated checkout/top-up guidance, Starter/top-up plan model, mock activated public balance, usage summary, estimate, and no Dodo provider ID/internal path leakage in tested responses. |
| 2026-06-04 | Billing stress harness | Done. `node betterpptx-mcp/verify-billing-stress.mjs` passed: concurrent customer reservations, overspend blocking, heavy-operation pressure, idempotent retry, failed-operation release, Dodo outage queue/recovery, zero-balance block, credit-added webhook recovery, and public tool schema leakage scan. |
| 2026-06-04 | Dodo activation bootstrap | Done. `node betterpptx-mcp/dodo-admin-bootstrap.mjs` passed after fixing activation mapping to preserve normalized Dodo customer/license IDs when the public validation response is sparse. |
| 2026-06-05 | Dodo paid usage product linkage | Fixed. Bootstrap now creates/reuses paid usage product `pdt_0NgLyns6eP6hFon24QcL9` as the starter product, with meter `mtr_0NgKit15aasvAtKfsdLsp` linked to credit entitlement `cde_0NgKisqyZzBwaDM5xZo0j` at meter-units-per-credit = 1. |
| 2026-06-05 | Real Dodo usage deduction | Done. Hosted Dodo test checkout created active usage subscription `sub_0NgM8mmcutmJyIV1g1XRk` for customer `cus_0NgM8mmMGdo5w2CFKcZzi`; `node betterpptx-mcp/verify-billing-dodo-test.mjs` passed with balance `499 -> 498` after event `bpptx_usage_dodo_test_mq0aains`. |
| 2026-06-05 | Cloud Build config for MCP image | Done. Added `deploy/cloudbuild.mcp.yaml` so Cloud Build explicitly uses `deploy/docker/Dockerfile.mcp` instead of requiring a root Dockerfile. |
| 2026-06-05 | Staging image startup fixes | Done. Fixed Cloud Run runtime startup by shadow-copying the ES bundle under `/app/.betterpptx-runtime` and preferring Cloud Run `PORT` over `BETTERPPTX_PORT`; deployed image `us-central1-docker.pkg.dev/betterpptx-mcp-staging/betterpptx-mcp/betterpptx-mcp-staging:billing-20260605065302`. |
| 2026-06-05 | Private Cloud Run billing deploy | Done. Revision `betterpptx-mcp-staging-00008-bp4` is Ready and serving 100% traffic; authenticated `/health` returns `{"status":"ok","service":"BetterPPTX"}` and unauthenticated `/health` plus `/webhooks/dodo` return Cloud Run `403`. |
| 2026-06-05 | Deployed synthetic Dodo webhook | Done. Authenticated signed synthetic `credit.added` webhook returned `200` and wrote Firestore records under `betterpptx_billing_webhook_events` and `betterpptx_billing_customers`; stored customer balance snapshot is `498`. |
| 2026-06-05 | Reusable staging deploy helper | Done. Added `deploy/gcp/deploy-mcp-staging.ps1` for repeatable build, deploy, and authenticated health verification after future changes. |
| 2026-06-05 | Dodo webhook custom header defense | Done. Public webhook receiver requires Dodo HMAC plus owner-configurable custom header token. Dodo endpoint custom header is configured, token is stored in Secret Manager, and `deploy/gcp/update-dodo-webhook-custom-header.ps1` can update/reveal/rotate it explicitly. |

## Active Risks

- Dodo webhooks require an externally reachable receiver; MCP service itself can remain private. Current staging IAM correctly blocks unauthenticated Dodo callbacks, so real external delivery is not validated yet.
- Firestore per-customer balance document is acceptable at launch scale but is the known transaction hotspot.
- Local Firestore verification requires Application Default Credentials if run from the workstation; deployed Cloud Run uses workload identity and has now written billing documents.
- Dodo API-created usage subscriptions remain pending without a saved/authorized test payment method; use hosted checkout for any future end-to-end customer billing tests.
- Live product creation remains intentionally blocked until test-mode billing gates pass.
- Mission Control must expose owner-only reveal/update/rotate/test controls for billing-critical user-defined secrets before live launch; scripts can manage these values until MC2 exists.
