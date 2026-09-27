# Avatar provider billing reconciliation policy

Status: `POLICY_READY_OWNER_APPROVAL_REQUIRED`

Scope: the PowerPoint-native narration avatar lane on the two rotated Modal accounts. The final production identifier is `liveportrait-musetalk-commercial`; `liveportrait-musetalk` is the explicit resale-safe rollback lane. The same redacted metrology and provider-cost rules apply to either identifier, and the final production window must be tagged with the commercial identifier.

## Why this policy exists

Modal's billing export is App/object + resource + time-interval scoped. It does not expose a per-request FunctionCall ID in the billing row. The worker can still return an opaque FunctionCall ID for private metrology, but that ID must never be presented as an invoice key unless the provider supplies an explicit join.

## Authoritative inputs

1. A private metrology event for every first provider execution: account id, stable App tags, UTC start/end interval, opaque FunctionCall ID, GPU type, `X-Gpu-Seconds`, `X-Render-Seconds`, pipeline, idempotency state, and output digest. Replay/conflict/cancelled terminal responses contribute zero provider compute.
2. An owner-authenticated Modal billing export for the same UTC interval, filtered to the stable `product=betterpptx`, `service=avatar-worker`, one of the explicit pipeline tags (`liveportrait-musetalk-commercial` for final production or `liveportrait-musetalk` for rollback), and account tags, retaining the redacted App/object identifier and A10G cost row.
3. A coverage record proving that the metrology ledger contains every first execution for the App/object and interval. Missing or late events fail the reconciliation; they are not silently allocated.

## Aggregate allocation rule

When the provider does not offer request-level invoice attribution, the owner may approve interval allocation:

`allocationRateUsdPerGpuSecond = providerA10GCostUsd / sum(firstExecutionGpuSeconds)`

`requestAllocatedCostUsd = allocationRateUsdPerGpuSecond * requestGpuSeconds`

The sum of allocated request costs must equal the exported A10G cost (within one cent after rounding), the event count and GPU-second total must be complete for the interval, and the export tags/object must match the worker account. This reconciles the provider invoice at the App/hour level without pretending that the provider assigned a per-request price.

## Fail-closed rules

- A shared App with unknown activity, missing events, late billing rows, or mismatched tags is `PARTIAL`, never `PASS`.
- An isolated one-request App may prove a bounded FunctionCall-ID → billed-object join, but it does not prove shared-App coverage.
- Public MCP responses never expose FunctionCall IDs, App/object IDs, provider endpoints, or billing internals.
- The owner must approve this policy (or provide a native provider request-attributed export) before `provider-billing-reconciliation` can become a release PASS.

Current evidence: two isolated canaries have complete bounded joins for the earlier resale-safe worker window; the final commercial lane is serving on Cloud Run revision `betterpptx-mcp-staging-00083-b4h`, and current commercial App/hour exports are observed for both rotated profiles with stable production-candidate tags. The gate remains open because the exports are not request-attributed and owner approval has not been recorded; historical resale-safe rows are still not used as proof of commercial production coverage.

## Owner export handoff

The maintainer verifier accepts only a redacted export with schema
`betterpptx.avatar-provider-billing-export.v1`, a UTC `window`,
`coverage.complete=true`, stable BetterPPTX/avatar/pipeline/account tags, and
each captured provider execution ID joined to exactly one billed row with
matching GPU seconds. Supply the file through
`BETTERPPTX_AVATAR_PROVIDER_BILLING_EXPORT` and run:

```powershell
node D:\PptxGenJS_Claude\betterpptx-mcp\verify-avatar-provider-billing-coverage.mjs
```

Without that file the verifier returns `OPEN_OWNER_EXPORT_REQUIRED`; it never
allocates costs or infers invoice coverage.

## Bounded paid-canary safety

### Cost policy (owner decision, 2026-07-19)

Production does not use an artificial daily GPU cap. It uses an explicit
`unbounded-metered` mode (`BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS=unlimited`):
the worker still reserves, settles, and records GPU seconds per account, while
the ledger and provider reconciliation expose spend and allow alerting. A
missing value remains fail-closed so unbounded operation can never happen by
accident. The current redacted isolated observations imply approximately
$0.0287-$0.0380 of Modal GPU time for the reviewed 120-GPU-second talking-head
render; Cloud Run, storage, Firestore, TTS, egress, and margin are additional.

Production profile rotation remains enabled for redundant working service and
must preserve profile-level attribution during failover. The $15-per-profile
credit floor is a development-only Modal rotation rule: it keeps the two
authenticated development profiles usable and is not a customer budget, a
production quota, or a cost estimate.

The isolated billing helper at
`betterpptx-mcp/deploy/run-isolated-avatar-billing-canary.ps1` deploys a
temporary Modal app and therefore requires two explicit owner inputs before it
can execute: `-OwnerApprovalRef <recorded-owner-reference>` and
`-ConfirmPaidRequest`. The helper stops the temporary app in its `finally`
path, records only redacted billing evidence, and never treats the isolated
join as proof of shared-App coverage. Omitting either parameter fails before
any provider deployment or request.
