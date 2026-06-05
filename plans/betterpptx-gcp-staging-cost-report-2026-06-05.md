# BetterPPTX GCP Staging Cost Report

Date: 2026-06-05

Project: `betterpptx-mcp-staging`

Project number: `860007156914`

Billing account: `011A6D-91F65E-353AE9`

Region: `us-central1`

Report type: resource/configuration cost review, not an invoice or billing export.

## Executive Summary

Private staging is deployed and validated. The expected idle cost is still approximately zero because both Cloud Run services use `min-instances=0`.

The current cost posture after cleanup is acceptable for private staging:

- MCP service remains IAM-private with no public invoker binding.
- Webhook service is public only for Dodo webhook ingress and has no MCP routes.
- MCP is pinned to one max instance for process-local edit-state safety.
- Old Cloud Run revisions and old image tags were pruned.
- Webhook image was slimmed from a full MCP runtime image to an approximately `81.9 MB` image.
- Artifact Registry now lists only two current `b2642b9` image tags.
- Secret Manager active versions were reduced to `5`, below the `6` active-version free threshold.
- Project-scoped budget alert remains at `$5/month`.

The only cost caveat is Artifact Registry's repository-size metadata. Immediately after image deletion it still reported about `3.17 GB`, even though the visible current images total only about `242 MB`. Treat this as lagging metadata or retained-layer accounting and recheck before heavy stress testing.

## Current Deployed Footprint

### Cloud Run: MCP

- Service: `betterpptx-mcp-staging`
- Current revision: `betterpptx-mcp-staging-00026-zpf`
- Image: `us-central1-docker.pkg.dev/betterpptx-mcp-staging/betterpptx-mcp/betterpptx-mcp-staging:b2642b9`
- IAM: private; no `allUsers` invoker binding
- CPU: `1`
- Memory: `1Gi`
- Concurrency: `20`
- Min instances: `0`
- Max instances: `1`
- Timeout: `300s`
- Edit-state guard: `BETTERPPTX_MCP_MAX_INSTANCES=1`, `BETTERPPTX_EDIT_STATE_MODE=process-local`, `BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED=1`

Cost interpretation:

- Idle Cloud Run compute should be `$0` because no minimum instance is kept warm.
- Authenticated active request time is billable.
- IAM-denied unauthenticated requests should not reach the container.
- Current max-instance cap limits both cost and edit-state risk.

### Cloud Run: Dodo Webhook

- Service: `betterpptx-dodo-webhook-staging`
- Current revision: `betterpptx-dodo-webhook-staging-00015-9pw`
- Image: `us-central1-docker.pkg.dev/betterpptx-mcp-staging/betterpptx-mcp/betterpptx-dodo-webhook-staging:b2642b9`
- IAM: public invoker binding for webhook ingress
- Routes: `/health` and `/webhooks/dodo`; `/mcp` is not exposed
- CPU: `1`
- Memory: `512Mi`
- Concurrency: `20`
- Min instances: `0`
- Max instances: `2`
- Timeout: `60s`

Cost interpretation:

- Idle compute should be `$0`.
- Active cost is driven only by webhook request volume and processing time.
- Public exposure is intentionally narrow; arbitrary MCP usage cannot hit this service.

### Artifact Registry

Repository:

- `us-central1-docker.pkg.dev/betterpptx-mcp-staging/betterpptx-mcp`

Current listed images:

- `betterpptx-mcp-staging:b2642b9`: `160,289,060` bytes
- `betterpptx-dodo-webhook-staging:b2642b9`: `81,857,613` bytes
- Visible listed total: `242,146,673` bytes, about `242 MB`

Cleanup:

- Old no-traffic Cloud Run revisions were deleted.
- Old image tags/digests were deleted.
- Cleanup policy remains active: delete images older than `1d`, keep one most recent image.

Cost interpretation:

- At visible listed image size, Artifact Registry storage should be inside the `0.5 GB` free storage band.
- Repository metadata still reported `3173.006 MB` immediately after deletion. If that whole amount were billed for a full month, the rough over-free storage cost at `$0.10/GB-month` would be about `$0.27/month`.
- Recheck this number after cleanup metadata settles.

### Cloud Build

Current observed build minutes from listed regional builds:

- Finished builds total: `69.13` minutes
- Successful builds: `66.73` minutes
- Latest build: `cc300644-38ab-43a8-8e35-a3c996060904`, commit `b2642b9`, `4.53` minutes

Cost interpretation:

- Google lists `2,500` free default-pool build minutes per billing account per month and `e2-standard-2` at `$0.006/min`.
- Paid-equivalent value of the observed `69.13` minutes is about `$0.41`, but it should remain inside the free build-minute band if the billing account has no large build load elsewhere.
- Repeated deploy loops are the main avoidable build cost driver.

### Cloud Storage

Bucket:

- `gs://betterpptx-mcp-staging-artifacts-860007156914`
- Location: `US-CENTRAL1`
- Current stored bytes: `530,980`
- Public access prevention: enforced
- Lifecycle: delete objects older than `3` days

Cost interpretation:

- Current storage is effectively zero.
- Cost becomes material only during large deck/media stress runs, large downloads, or if lifecycle deletion is disabled.

### Firestore

Database:

- `(default)`
- Location: `us-central1`
- Type: Firestore Native
- Edition: Standard
- Free tier: enabled
- PITR: disabled

Cost interpretation:

- Firestore has free daily read/write/delete quota and `1 GiB` stored data free for one database per project.
- Current staging use is entitlement, billing ledger, webhook idempotency, and customer mapping data.
- Stress testing can consume document reads/writes; normal private staging should stay comfortably small.

### Secret Manager

Active secrets:

- `betterpptx-dodo-test-api-key`: version `3` enabled; versions `1` and `2` destroyed
- `betterpptx-dodo-webhook-custom-token`: version `1` enabled
- `betterpptx-dodo-webhook-secret`: version `1` enabled
- `betterpptx-github-github-oauthtoken-6310b5`: version `1` enabled
- `betterpptx-mission-control-admin-token`: version `1` enabled

Current active versions in this project: `5`.

Cost interpretation:

- Google lists `6` active secret versions and `10,000` access operations free per month per billing account.
- Current project is below the active-version free threshold.
- Heavy cold-start testing or frequent owner-secret tests can increase access-operation count, but current private staging should remain small.

### Budgets

Project-scoped budget:

- Name: `BetterPPTX MCP Staging`
- Amount: `$5/month`
- Scope: `projects/860007156914`
- Thresholds: `50%`, `80%`, `100%`

Unscoped legacy budget still present:

- Name: `InotilusGcpAlwaysFreeBudget`
- Amount: `$5/month`
- Scope: whole billing account
- Threshold: `80%`

Do not delete the unscoped legacy budget without explicit owner approval because it is not limited to the BetterPPTX project.

## Monthly Cost Bands

### Idle Private Staging

Expected: approximately `$0/month`.

Assumptions:

- No public MCP endpoint.
- No minimum Cloud Run instances.
- No repeated build loop.
- Firestore/Secret Manager stay inside free quotas.
- Artifact Registry metadata settles near the visible current image size.
- GCS artifacts remain small and expire after `3` days.

### Light Development

Expected: approximately `$0` to low cents.

Cost drivers:

- Cloud Build if deploy frequency becomes high.
- Artifact Registry if many image versions accumulate.
- Cloud Run active request time during manual smoke tests.
- GCS/Firestore operations during test deck saves.

### Harness / Stress Testing

Expected: variable but bounded by current scaling caps.

Cost drivers:

- Cloud Run active CPU/memory seconds.
- Webhook public request volume.
- Firestore reads/writes for billing and entitlement checks.
- GCS saved deck bytes, operations, and download egress.
- Cloud Logging ingestion if stress logs are noisy.
- Repeated Cloud Build deploys.

Practical guardrails:

- Keep MCP `max-instances=1` until shared edit state exists.
- Keep `min-instances=0`.
- Keep the artifact bucket lifecycle rule enabled.
- Keep Artifact Registry cleanup policy enabled.
- Recheck Artifact Registry repository size after metadata settles.
- Watch the `$5/month` BetterPPTX project budget during stress runs.

## Pricing Sources Checked

- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud Build pricing: https://cloud.google.com/build/pricing
- Artifact Registry pricing: https://cloud.google.com/artifact-registry/pricing
- Cloud Storage pricing: https://cloud.google.com/storage/pricing
- Firestore pricing: https://cloud.google.com/firestore/pricing
- Secret Manager pricing: https://cloud.google.com/secret-manager/pricing
