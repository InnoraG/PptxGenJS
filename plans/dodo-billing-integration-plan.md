# BetterPPTX Dodo Billing Integration - Definitive Executor Plan

Date: 2026-06-04
Status: definitive executor plan for the billing track before MC1 and the deployed staging stress harness

This plan replaces the earlier granular billing draft. It incorporates the Claude review and the verified runtime shape in `betterpptx-mcp/`.

## Executive Decision

Implement BetterPPTX billing as:

```text
granular local metering
+ coarse credit gates
+ Firestore transactional reservations
+ batched Dodo usage ingestion
+ Dodo webhooks as financial reconciliation authority
```

Do not send one Dodo usage event for every small MCP tool call. Do not balance-check every cheap authoring call. That would be slow, noisy, expensive to operate, and unfair to AI edit loops.

The runtime should compute granular cost locally, but it should gate and ingest at checkpoints:

- `deck.save`
- expensive irreversible/heavy operations
- periodic background flush when a session crosses a configured credit/time threshold

## MC1 Dependency

MC1 plus the deployed staging stress harness is blocked until this billing executor reaches at least:

- Firestore billing ledger implemented.
- Dodo customer mapping implemented.
- Dodo webhook signature/idempotency path implemented.
- Billing rate card running in dry-run mode.
- Reservation gates active for `deck.save` and heavy tools.
- Test-mode Dodo usage ingestion verified.
- Billing stress cases added to the staging harness.

The public MCP endpoint does not need to be open for this. Dodo webhooks do need an externally reachable receiver, but that receiver must not expose the MCP tool surface.

## Current State

Already done:

- Dodo test API key is saved privately.
- Dodo live API key verifies.
- Dodo test activation path works after the Secret Manager correction.
- Test subscription product and top-up product were bootstrapped previously.
- Cloud Run staging is private/IAM-protected.
- Firestore entitlement storage exists and is verified.
- GCS artifact storage exists and is verified.
- Public black-box MCP checks pass.
- legacy local deploy env-prefix usage has been corrected to `BETTERPPTX_*` in the main workspace and private deploy checkout.

Not done yet:

- No production-grade billing ledger.
- No Dodo webhook endpoint.
- No Dodo usage ingestion from MCP usage.
- No Dodo customer-id backed runtime balance lookup.
- No transactional credit reservation.
- No dry-run rate-card telemetry.
- No billing stress harness.
- No live Dodo products should be considered launch-ready.

## Non-Negotiable Invariants

1. Dodo is the financial source of truth for checkout, subscription lifecycle, credit grants, credit deductions, customer portal, and credit ledger.
2. Firestore is the BetterPPTX operational source of truth for pending reservations, local usage accrual, idempotency, webhook processing, and reconciliation state.
3. Local JSON files and in-memory counters are allowed only for local development, never as staging/production billing authority.
4. The MCP public tool surface must remain a black box. Billing tools may return plan, balance, pending credits, usage summary, and top-up links, but never Dodo customer IDs, subscription IDs, license IDs, API details, source paths, dependency names, logs, or implementation internals.
5. No raw activation keys, API keys, or webhook secrets may be stored in Firestore or logs. Store fingerprints and private provider IDs only where needed for operations.
6. Billing-critical owner secrets must be manageable from private Mission Control before live launch. Default dashboard views show redacted status/fingerprint/version/last rotation; explicit owner-only controls can reveal, update, rotate, and test values. Public surfaces, telemetry, normal logs, and Firestore billing records must never expose raw secret values.
7. Generic HTTP fetch stays disabled. Media/image fetches may remain available through the safe media path and are billable only when a media asset is actually imported, generated, or attached.
8. Overage is disabled for the first production pass. When usable credits are exhausted, checkpoint/heavy operations are blocked with a public-safe `INSUFFICIENT_CREDITS` result.
9. Live billing is not enabled until the test-mode gates pass.

## Product Model

Launch the test-mode product model first:

- `BetterPPTX Starter`
  - subscription
  - USD 5/month
  - grants 500 BetterPPTX credits per billing cycle
  - license key enabled for MCP activation

- `BetterPPTX Credit Top-Up`
  - one-time purchase
  - USD 5
  - grants 500 BetterPPTX credits
  - attaches to the same customer credit balance

This matches the desired product philosophy: the monthly 5 USD subscription is directly useful quota/credit, and the same 5 USD amount can be added again as pay-as-you-go top-up.

Do not add multiple live tiers yet. Add Pro/Team only after dry-run telemetry proves the credit economics.

## Dodo Configuration

### Credit entitlement

Create or migrate to:

- name: `BetterPPTX credits`
- type: custom unit
- unit: `credits`
- precision: `2` if Dodo accepts it in test mode
- fallback: if an existing test entitlement is locked at precision `0`, create `BetterPPTX credits v2`
- rollover: disabled for launch
- overage: disabled for launch
- low balance threshold: 20%

### Primary usage meter

Create one primary meter:

- name: `BetterPPTX Weighted Usage`
- event name: `betterpptx.usage`
- aggregation: `Sum`
- summed field: `credit_cost`
- unit: `credits`
- bill usage in credits: enabled
- credit entitlement: `BetterPPTX credits`
- meter units per credit: `1`
- free threshold: `0`

The first implementation must verify in test mode whether Dodo expects `credit_cost` as a top-level event field or inside metadata. Use the exact location required by the Dodo meter configuration and lock it in the usage-event helper.

### Usage event shape

Use aggregated events, not per-tool-call events:

```json
{
  "event_id": "bpptx_usage_<stable_hash>",
  "customer_id": "cus_xxxxx",
  "event_name": "betterpptx.usage",
  "timestamp": "2026-06-04T12:00:00.000Z",
  "metadata": {
    "credit_cost": "23.45",
    "billing_mode": "checkpoint",
    "rate_card_version": "2026-06-04.shadow.1",
    "session_hash": "s_ab12",
    "deck_hash": "d_cd34",
    "operation_group": "deck.save",
    "tool_count": "84",
    "slide_count": "12",
    "final_object_count": "146",
    "output_mb": "4.2",
    "status": "success"
  }
}
```

The maximum Dodo ingest batch is 1000 events. The BetterPPTX implementation should normally send one event per checkpoint, but the usage-event client must still support batch flush and retry.

Usage event IDs must be artifact/version deterministic and rate-card independent. Do not include `rate_card_version` in `event_id`; keep it in metadata only. A `deck.save` retried across a rate-card deployment must not mint a new event ID for the same delivered artifact/version.

## Environment Contract

Use the existing BetterPPTX/Dodo names. Do not introduce another env namespace.

Required for Dodo-backed staging:

- `BETTERPPTX_BILLING_PROVIDER=dodo`
- `BETTERPPTX_DODO_ENVIRONMENT=test` or `live`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `BETTERPPTX_DODO_VALIDATE_URL`
- `BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID`
- `BETTERPPTX_DODO_USAGE_EVENT_NAME=betterpptx.usage`
- `BETTERPPTX_DODO_STARTER_PRODUCT_ID`
- `BETTERPPTX_DODO_TOPUP_PRODUCT_ID`
- `BETTERPPTX_CHECKOUT_URL`
- `BETTERPPTX_PORTAL_URL`
- `BETTERPPTX_BILLING_DRY_RUN=1` during shadow mode
- `BETTERPPTX_BILLING_LEDGER_STORE=firestore`
- `BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX=betterpptx_billing`

Existing local config can keep using `DODO_PAYMENTS_WEBHOOK_SECRET`; the SDK helper can receive that value as its webhook key internally if needed.

## Billing Policy

### Free/control tools

Do not bill:

- auth status
- activation
- billing explanation
- portal/checkout URL lookup
- capability/help/options catalogs
- chart/table recommendation
- public-safe inspections
- validation checks unless abuse or heavy package work requires a later change

These tools remain rate-limited for abuse control.

### Draft-accrual tools

Most authoring/editing tools accrue local telemetry but do not immediately gate or call Dodo:

- add/update text
- add/update shapes
- add/update ordinary images
- add/update tables
- add/update charts
- add/update SmartArt
- slide creation
- slide deletion
- slide reorder
- style changes
- transitions
- animations

These operations write successful tool facts into the local billing ledger. They become billable mainly through the next checkpoint calculation.

### Checkpoint-billed tools

`betterpptx.deck.save` is the primary checkpoint.

At save time:

1. Compute net-output cost from the final deck.
2. Add any unflushed heavy-operation charges already committed to the session.
3. Reserve credits transactionally.
4. Save/validate/upload the artifact.
5. Create one durable aggregated usage event.
6. Attempt Dodo ingest.
7. Return the artifact if billing event durability is secured.

The final deck is the value delivered to the customer. Billing should favor the final delivered output over the raw count of intermediate edits.

### Immediate-reserved heavy tools

Reserve before execution:

- uploaded deck open/import
- existing deck open/import when it consumes server resources
- narration synthesis
- native 3D/model generation or import
- large media generation/import
- large batch transforms
- any future external-cost operation

These operations can be charged when a reusable result is produced, even before `deck.save`, but the initial launch policy is conservative:

- failed heavy operation before usable output: release reservation, no charge
- heavy operation returns reusable asset/handle: charge immediately or mark committed for next checkpoint
- downstream deck save fails after reusable asset exists: do not double charge; the committed asset charge remains once only

### Edit-loop fairness

Do not bill every correction as a new full unit. AI clients naturally add, inspect, update, and retry.

Rules:

- Do not charge directly for ordinary updates in v1.
- Bill final retained deck complexity at save.
- Keep operation-count telemetry for abuse and future tuning.
- Cap edit-complexity surcharge to 20% of net output cost if enabled later.
- Never charge both a draft operation and the same final object as separate full value unless it was an immediate-reserved heavy operation.

### Slide double-charge policy

Do not charge both `slide.add` and `deck.save perSlide` as independent full charges.

In v1:

- `slide.add` is telemetry only.
- final slide count is charged at save.
- export/package work is charged through the save base cost and output size.

### Predictability and caps

Before any checkpoint/heavy operation:

- estimate required credits
- compare against effective balance
- if the comparison would return `INSUFFICIENT_CREDITS`, perform one live Dodo balance refresh first
- return `INSUFFICIENT_CREDITS` before doing expensive work
- include top-up/checkout guidance

If estimated cost exceeds the effective confirmation threshold from the rate-card config, return a public-safe confirmation-needed result instead of proceeding. The client can retry with a confirmation token/estimate ID.

Balance-refresh rule:

- if cached effective balance is enough, proceed without a hot Dodo call
- if cached effective balance is not enough, fetch live Dodo balance once, update Firestore, and recompute
- if live balance is enough after a recent top-up, proceed
- if live balance is still not enough, return `INSUFFICIENT_CREDITS`
- if the live refresh fails and cached balance is not enough, return `BILLING_TEMPORARILY_UNAVAILABLE` rather than wrongly claiming the customer has no credits

## Rate Card v0

Create:

- `betterpptx-mcp/billing/rate-card.mjs`

Use a versioned, config-driven rate card. Initial values are for test-mode shadow calibration, not final economics.

```js
export const RATE_CARD_VERSION = '2026-06-04.shadow.1'

export const BILLING_RATE_CARD = {
  checkpoint: {
    deckSaveBase: 5.00,
    perFinalSlide: 0.60,
    perFinalObject: 0.06,
    perRichObject: 0.50,
    perOutputMb: 0.80,
    maxEditComplexitySurchargeRatio: 0.20,
  },
  heavy: {
    openUploadedBase: 4.00,
    openUploadedPerMb: 0.75,
    narrationBase: 2.00,
    narrationPer1000Chars: 0.80,
    model3dBase: 5.00,
    model3dPerMb: 1.00,
    mediaImportBase: 1.00,
    mediaImportPerMb: 0.50,
    batchTransformBase: 2.00,
    batchTransformPerObject: 0.05,
  },
  thresholds: {
    minCharge: 0.01,
    confirmationRequiredAbove: 150.00,
    hardBlockAboveWithoutExplicitOverride: 300.00,
  },
}
```

Dry-run telemetry must produce histograms before these values become real charges.

## Firestore Billing Ledger

Create:

- `betterpptx-mcp/billing/ledger-store.mjs`
- `betterpptx-mcp/billing/reservations.mjs`

Required collections:

```text
betterpptx_billing_customers/{customerHash}
betterpptx_billing_sessions/{sessionHash}
betterpptx_billing_decks/{deckHash}
betterpptx_billing_operations/{operationId}
betterpptx_billing_reservations/{reservationId}
betterpptx_billing_usage_events/{eventId}
betterpptx_billing_webhook_events/{webhookId}
betterpptx_billing_rate_cards/{rateCardVersion}
```

Required guarantees:

- all reservations use Firestore transactions
- no two concurrent checkpoint/heavy operations can overspend the same effective balance
- webhook processing is idempotent by `webhook-id`
- usage events are idempotent by `event_id`
- session/deck IDs are stored as hashes in billing records
- raw license keys are never stored
- Dodo provider IDs are private fields and never returned publicly

Contention note:

- `betterpptx_billing_customers/{customerHash}` is the per-customer transaction hotspot.
- This is acceptable for launch because gates are coarse and draft operations do not write balance transactions.
- Do not add per-tool-call balance writes for cheap draft operations.
- If one heavy customer later exceeds Firestore's practical per-document write rate, shard reservation counters by customer/time bucket and reconcile into the customer summary asynchronously.

Effective balance:

```text
effectiveAvailable =
  lastKnownDodoAvailableBalance
  - pendingReservedCredits
  - durableQueuedUsageCreditsNotYetReflectedByDodo
```

Dodo deducts metered credit usage asynchronously, so this local operational balance is required for real-time gating.

## Customer Identity

Dodo usage events require `customer_id`. This is not optional.

Extend persisted entitlement state with:

- `providerCustomerId`
- `providerProductId`
- `providerSubscriptionId`
- `providerPaymentId`
- `providerLicenseId`
- `creditEntitlementId`
- `lastKnownCreditBalance`
- `lastBalanceSyncedAt`
- `billingCustomerHash`
- `billingStatus`

Sources, in order:

1. License validation response, if it includes customer/product/subscription fields.
2. Dodo webhook payloads.
3. Synchronous Dodo API lookup/backfill during activation using license/product/payment data.
4. Explicit activation-incomplete error if no customer mapping can be resolved during activation.

Hard rule:

- no `providerCustomerId`, no paid usage event ingestion.
- paid activation must not report fully activated premium access until `providerCustomerId` is resolved.
- if the license is valid but the billing customer cannot be resolved, return a public-safe `BILLING_SETUP_INCOMPLETE` activation result with retry guidance; do not put the customer in an "unlocked but cannot save" state.

## Webhooks

Add:

- `betterpptx-mcp/billing/webhooks.mjs`
- `POST /webhooks/dodo`

Signature requirements:

- verify with `DODO_PAYMENTS_WEBHOOK_SECRET`
- use exact raw request body
- verify `webhook-id`
- verify `webhook-signature`
- verify `webhook-timestamp`
- enforce timestamp freshness
- store/process `webhook-id` idempotently in Firestore

Mount `/webhooks/dodo` before the generic JSON parser using `express.raw({ type: 'application/json' })`. Treat raw-body parsing as the default implementation, not a fallback. Verify the exact raw request bytes/string Dodo signed; do not verify against `JSON.stringify(req.body)` or any parsed/mutated payload.

Handle at minimum:

- `payment.succeeded`
- `payment.failed`
- `subscription.active`
- `subscription.updated`
- `subscription.on_hold`
- `subscription.renewed`
- `subscription.plan_changed`
- `subscription.cancelled`
- `subscription.expired`
- `license_key.created`
- `credit.added`
- `credit.deducted`
- `credit.balance_low`
- `credit.expired`
- `credit.rolled_over`
- `credit.rollover_forfeited`
- `credit.overage_charged`
- `credit.manual_adjustment`

If Dodo emits entitlement-grant events for the configured products, handle those too, but do not depend on names that are not observed in test mode.

Webhook receiver deployment:

- The MCP service may remain private/IAM-protected.
- Dodo cannot call an IAM-protected Cloud Run endpoint unless a separate auth bridge is built.
- Therefore deployed staging needs one of:
  - a separate minimal public Cloud Run webhook receiver with no MCP routes, Dodo signature required, and Firestore write permissions only; or
  - local/tunnel webhook forwarding for test mode before deployed webhook validation.

Preferred for MC1:

- create `betterpptx-dodo-webhook-staging` as a separate minimal public receiver.
- do not expose `/mcp` there.
- do not expose private health/config/log routes there.

## Usage Ingestion

Create:

- `betterpptx-mcp/billing/dodo-client.mjs`
- `betterpptx-mcp/billing/usage-events.mjs`

Flow:

1. Checkpoint/heavy operation succeeds.
2. Durable usage event is written to Firestore with state `queued`.
3. Runtime attempts Dodo ingest.
4. On success, state becomes `ingested`.
5. On failure, state remains `queued` with retry metadata.
6. A reconciler retries queued events with exponential backoff.
7. If queued usage exceeds a configured customer/session cap, block new checkpoint/heavy work until Dodo recovers.

Dodo ingestion failure must not create free unlimited usage. It may allow the already completed request to return only when a durable reservation/queued event exists.

## Integration Point

Modify `betterpptx-mcp/engine.mjs` inside `callBetterPptxTool`.

Correct location:

1. keep existing idempotency replay first
2. keep existing deck creation quota
3. keep existing `requireEntitlement`
4. after `requireEntitlement` returns no gate, run billing preflight
5. then run existing heavy-tool queue and handler execution
6. after success, finalize billing
7. then call `recordSuccessfulUse`

Do not wrap `callBetterPptxTool` from the outside. Auth gating is inside the function, so an outer wrapper would run too early.

Billing preflight behavior:

- free tool: no-op
- draft-accrual tool: create operation context only
- checkpoint tool: estimate and reserve
- heavy tool: estimate and reserve
- idempotent replay: no new billing

Billing finalize behavior:

- failed before value: release reservation
- successful draft operation: record operation facts
- successful heavy operation: finalize/queue charge
- successful checkpoint: compute net deck cost and queue aggregated Dodo event

## Idempotency

Build on the existing runtime idempotency functions:

- `hasIdempotencyKey(args)`
- `replayDeckIdempotentIfPresent`
- `replaySessionIdempotentIfPresent`
- `runDeckIdempotent`
- `runSessionIdempotent`

Rules:

- replayed tool result must not create a second reservation or usage event
- same idempotency key plus same args maps to the same billing operation
- idempotency conflict returns an error without billing
- checkpoint save for the same artifact/version does not double bill
- billing `event_id` is derived from customer/session/deck/artifact/checkpoint identity, not from rate-card version
- missing client idempotency key is allowed, but only durable server-generated operation IDs protect server-side retries
- public docs should recommend stable idempotency keys for clients

## MCP Public Billing Tools

Update existing tools:

- `betterpptx.auth.status`
- `betterpptx.billing.explain_plan`
- `betterpptx.billing.portal`

Add if needed:

- `betterpptx.billing.estimate`
- `betterpptx.billing.usage_summary`

Public-safe response fields:

- plan name
- billing provider label: `Dodo Payments`
- credit balance
- pending reserved credits
- estimated cost for requested checkpoint/heavy operation
- recent usage summary
- renewal/reset hint when known
- pricing/top-up/portal URLs
- public-safe error code

Never return:

- Dodo customer ID
- Dodo subscription ID
- Dodo license ID
- webhook IDs
- raw activation key
- internal Firestore paths
- API URLs beyond public checkout/portal/pricing URLs
- stack traces
- local paths

## Implementation Phases

### Phase 0 - Already completed: env prefix cleanup

Acceptance:

- a repository search confirms no active legacy env-prefix matches remain under `betterpptx-mcp`.
- PM2/local/tunnel config uses `BETTERPPTX_*`.
- Billing plan no longer treats this as pending setup.

### Phase 1 - Dodo test product and meter finalization

Files:

- `betterpptx-mcp/dodo-test-billing-bootstrap.mjs`
- `betterpptx-mcp/dodo-live-product-bootstrap.mjs`
- `betterpptx-mcp/setup-dodo-local.ps1`
- `betterpptx-mcp/deploy/cloud-run.env.example`

Tasks:

- create/reuse `BetterPPTX credits v2` with precision 2 if needed
- create/reuse weighted usage meter
- create/reuse $5/month Starter product
- create/reuse $5 top-up product
- attach credit entitlement correctly
- store product/meter/credit IDs in private env/status files
- keep live product creation disabled until test gates pass

Acceptance:

- test bootstrap prints credit entitlement, meter, subscription product, top-up product, and checkout session IDs
- no raw API key or activation key appears in status output
- existing activation verification still passes

### Phase 2 - Firestore billing ledger

Files:

- `betterpptx-mcp/billing/ledger-store.mjs`
- `betterpptx-mcp/billing/reservations.mjs`
- `betterpptx-mcp/verify-billing-ledger.mjs`

Tasks:

- implement collection prefix config
- implement transaction helpers
- implement reservation create/commit/release
- implement queued usage event storage
- implement webhook event idempotency store
- implement customer/session/deck hash helpers

Acceptance:

- local emulator/mock tests pass if available
- deployed Firestore write/read works
- concurrent reservation test cannot overspend the same effective balance

### Phase 3 - Customer identity and entitlement extension

Files:

- `betterpptx-mcp/auth/entitlements.mjs`
- `betterpptx-mcp/auth/entitlement-store.mjs`
- `betterpptx-mcp/billing/customer-map.mjs`

Tasks:

- persist Dodo customer/product/subscription/payment fields
- fingerprint public activation key only
- implement customer mapping upsert
- implement synchronous customer backfill from license/payment data during activation where API allows
- add activation-incomplete state if no Dodo customer can be resolved

Acceptance:

- activated test key maps to a Dodo customer or returns explicit setup failure
- paid activation does not report fully activated premium access without a Dodo customer mapping
- `auth.status` remains public-safe
- Firestore entitlement document contains no raw activation key

### Phase 4 - Webhook receiver

Files:

- `betterpptx-mcp/billing/webhooks.mjs`
- `betterpptx-mcp/server-http.mjs`
- optional separate receiver entrypoint for `betterpptx-dodo-webhook-staging`

Tasks:

- verify Standard Webhooks signatures
- mount the Dodo route with raw-body parsing before generic JSON parsing
- enforce timestamp freshness
- store `webhook-id` idempotently
- process subscription/payment/license/credit events
- update customer mapping and balance snapshots
- add synthetic signed webhook tests
- decide deployed receiver shape: separate public webhook service is preferred

Acceptance:

- invalid signature rejected
- replayed webhook acknowledged but not reprocessed
- out-of-order webhook does not corrupt current state
- test `credit.added` updates balance snapshot
- public MCP remains private/IAM-protected

### Phase 5 - Rate card and dry-run telemetry

Files:

- `betterpptx-mcp/billing/rate-card.mjs`
- `betterpptx-mcp/billing/classifier.mjs`
- `betterpptx-mcp/billing/estimator.mjs`
- `betterpptx-mcp/telemetry.mjs`

Tasks:

- classify tools into free, draft-accrual, checkpoint, heavy
- compute net-output cost for save
- compute immediate-heavy estimates
- store operation facts in ledger
- expose dry-run billing summary
- add simple/medium/heavy deck calibration runs

Acceptance:

- dry-run mode never sends Dodo usage events
- simple deck costs less than medium
- medium costs less than heavy narrated/media deck
- edit-loop deck does not multiply cost linearly with corrections
- final slide/object/output metrics are captured

### Phase 6 - Reservation gates

Files:

- `betterpptx-mcp/billing/reservations.mjs`
- `betterpptx-mcp/engine.mjs`
- `betterpptx-mcp/billing/public-errors.mjs`

Tasks:

- hook billing preflight inline after `requireEntitlement`
- reserve for `deck.save`
- reserve for heavy tools
- live-refresh Dodo balance once before returning `INSUFFICIENT_CREDITS`
- return `INSUFFICIENT_CREDITS` before expensive work
- release on non-billable failure
- commit on successful value delivery

Acceptance:

- idempotent replay does not reserve again
- insufficient balance blocks save/heavy work before handler execution
- recent top-up is recognized after live balance refresh before blocking
- failed save releases reservation
- successful save commits reservation and queues usage
- existing black-box verifiers still pass

### Phase 7 - Dodo usage ingestion

Files:

- `betterpptx-mcp/billing/dodo-client.mjs`
- `betterpptx-mcp/billing/usage-events.mjs`
- `betterpptx-mcp/billing/reconciler.mjs`

Tasks:

- send `betterpptx.usage` events
- use deterministic rate-card-independent event IDs
- batch queued events up to Dodo limit
- retry failed ingestion
- reconcile Dodo balance snapshots after webhook or balance refresh
- block further checkpoint/heavy work when queued debt exceeds cap

Acceptance:

- Dodo test meter receives usage
- Dodo credit ledger deducts after async processing
- local effective balance covers the deduction lag
- Dodo outage test queues and later flushes exactly once

### Phase 8 - Checkout, portal, and public billing UX

Files:

- `betterpptx-mcp/billing/checkout.mjs`
- `betterpptx-mcp/tools.mjs`
- `betterpptx-mcp/auth/entitlements.mjs`

Tasks:

- return Starter checkout URL
- return top-up checkout URL
- return customer portal URL if customer ID exists
- make `billing.explain_plan` explain subscription credits plus top-ups
- make `auth.status` include public-safe balance/pending/plan
- avoid public Dodo internals

Acceptance:

- unactivated user gets pricing/top-up guidance
- activated user gets plan and public-safe balance
- no provider IDs leak
- no internal URLs leak except public checkout/portal/pricing URLs

### Phase 9 - Billing stress harness

Files:

- `betterpptx-mcp/verify-billing-stress.mjs`
- `betterpptx-mcp/verify-billing-dodo-test.mjs`
- `betterpptx-mcp/verify-blackbox-public.mjs`
- staging harness plan files

Scenarios:

- simple save
- medium save
- heavy narrated/media/model deck
- concurrent saves against one customer
- concurrent heavy operations
- idempotent retry
- retry without idempotency key
- failed operation releases reservation
- Dodo ingest outage and recovery
- webhook replay
- webhook out of order
- low balance
- zero balance
- top-up purchase/credit added
- black-box leakage audit

Acceptance:

- no double billing
- no overspend under concurrency
- no leaked internals
- balance eventually reconciles with Dodo
- MC1 can run with billing assertions enabled

### Phase 10 - Live readiness

Do not start here until test-mode Phase 9 passes.

Tasks:

- create live Starter product
- create live top-up product
- create live credit entitlement/meter if not already created
- register live webhook receiver
- run one controlled live purchase
- activate live key
- create one small deck
- verify credit deduction
- verify portal
- verify cost report

Acceptance:

- live purchase can activate and consume credits
- no public MCP exposure required unless intentionally enabled later
- cost report covers Dodo, Cloud Run, Firestore, GCS, Artifact Registry, Cloud Build, Secret Manager
- user approval required before public launch

## Verification Matrix

Required commands/scripts to add or update:

```text
node betterpptx-mcp/verify-billing-ledger.mjs
node betterpptx-mcp/verify-billing-webhook-signature.mjs
node betterpptx-mcp/verify-billing-dry-run.mjs
node betterpptx-mcp/verify-billing-reservations.mjs
node betterpptx-mcp/verify-billing-dodo-test.mjs
node betterpptx-mcp/verify-billing-stress.mjs
node betterpptx-mcp/verify-blackbox-public.mjs
node betterpptx-mcp/verify-freemium-gate.mjs
node betterpptx-mcp/verify-download.mjs
```

Cloud Run deployed checks:

- private health reachable only with IAM
- MCP remains private unless explicitly changed
- webhook receiver accepts only valid Dodo signatures
- Firestore ledger has expected documents
- GCS artifact download still works
- black-box checks pass

## Failure Policy

| Situation | Policy |
|---|---|
| Cheap draft operation fails | no billing |
| Cheap draft operation succeeds but deck never saves | no Dodo billing in v1 |
| Save fails before artifact is valid | release reservation |
| Save succeeds but Dodo ingest fails | keep durable queued usage; block future checkpoint/heavy if queued debt exceeds cap |
| Heavy operation fails before reusable output | release reservation |
| Heavy operation produces reusable output | commit once, even if later save fails |
| Dodo webhook replay | acknowledge, no duplicate processing |
| Dodo usage event retry | same event ID, no duplicate billing |
| Missing Dodo customer ID | paid checkpoint/heavy billing disabled; return setup error |
| Zero balance | block checkpoint/heavy, return top-up guidance |

## Public Error Contract

Use stable public-safe codes:

- `INSUFFICIENT_CREDITS`
- `BILLING_SETUP_INCOMPLETE`
- `BILLING_CONFIRMATION_REQUIRED`
- `BILLING_TEMPORARILY_UNAVAILABLE`
- `BILLING_RETRY_LATER`
- `BILLING_IDEMPOTENCY_CONFLICT`

Each response may include:

- recoverable boolean
- retry-safe boolean
- estimated credits required
- available credits
- pending credits
- top-up URL
- portal URL
- public next action

No internal exception messages should be returned.

## Definition of Done Before MC1

The billing track is MC1-ready only when:

- test-mode Dodo credit product, top-up product, entitlement, and meter are configured
- activated test customer maps to Dodo customer ID
- Firestore billing ledger is transactional
- webhook signature/idempotency tests pass
- dry-run rate-card telemetry passes simple/medium/heavy comparisons
- save/heavy reservation gates pass
- Dodo usage ingestion deducts test credits
- Dodo async lag is handled by effective balance
- billing stress harness passes
- public black-box audit passes
- no live billing is enabled accidentally

## External References

- Dodo usage event ingestion: https://docs.dodopayments.com/api-reference/usage-events
- Dodo usage meters: https://docs.dodopayments.com/features/usage-based-billing/meters
- Dodo credit-based billing: https://docs.dodopayments.com/features/credit-based-billing
- Dodo webhooks: https://docs.dodopayments.com/developer-resources/webhooks
- Dodo checkout integration: https://docs.dodopayments.com/developer-resources/integration-guide
- Dodo subscription integration: https://docs.dodopayments.com/developer-resources/subscription-integration-guide
