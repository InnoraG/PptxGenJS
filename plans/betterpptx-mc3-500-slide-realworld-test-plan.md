# BetterPPTX MC3 500-Slide Real-World Test Plan

Date: 2026-06-05

Last updated: 2026-06-06

Status: Executed once in private staging, then reclassified on 2026-06-06. Aggregate `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03` is retained as infrastructure/billing stress evidence only. It is not accepted as the final product-quality autoshowcase corpus.

Correction: the next run must follow `plans/betterpptx-mc3-autoshowcase-500-slide-correction-plan.md`. The original aggregate should not be used to finalize live Dodo pricing because the decks were too repetitive/shallow, B15 narration saved notes-only files after TTS failures, and the original harness did not hard-gate feature proof and design quality across every family.

Scope: Deterministic private staging test that produces at least 100 PowerPoint files with 5 slides each, for at least 500 generated slides. The run exists to collect quality, ergonomics, speed, hosting load/cost, billing, generation, editing, repair, and reporting evidence before any live Dodo product/pricing decision.

## Non-Negotiable Rules

- Do not finalize live Dodo pricing from assumptions.
- Generate at least 100 deck files.
- Each deck must contain exactly 5 slides unless a failure is being intentionally tested and recorded.
- Total successful generated slides must be at least 500.
- Use deterministic seeds and record the harness version, private deployed revision, and input scenario for every deck.
- Use the private IAM-protected Cloud Run MCP endpoint for deployed load/cost evidence.
- Keep the public MCP endpoint disabled during this track.
- Run static package checks on every downloaded PPTX.
- Run PowerPoint/COM repair-open checks locally on every downloaded PPTX. COM is local-only and is never a Cloud Run dependency.
- Do not count a failed, missing, corrupt, or repair-required deck as successful billable value.
- Do not count a shallow/repetitive deck as product-quality autoshowcase evidence merely because it is repair-free.
- Do not count notes-only narration as narrated-deck evidence.
- Do not use tone/test audio providers for MC3 pricing data. Narration must use the approved Piper voice path from `plans/narration-tts-docker-executor-plan.md` or explicit real external audio.
- Do not create or switch live Dodo products/pricing until the final MC3 evidence report is complete and reviewed.

## Primary Questions

1. Product quality: How often do generated decks pass package, repair, validation, and visual/structural checks?
2. Ergonomics: Which tool sequences are natural, which require retries, and where do AI clients need better guidance?
3. Speed: What are p50, p90, p95, and worst-case latencies for deck generation, editing, save, download, and validation?
4. Hosting load/cost: What infrastructure cost is caused by the 100-deck run?
5. Billing quality: Are reservations, committed usage, queued usage, Dodo ingestion, balance refresh, and idempotency stable?
6. Generation stability: Which feature families fail, repair, or create invalid package output?
7. Editing stability: Do inspect, update, delete, reorder, duplicate, transform, open, and save workflows remain stable?
8. Reporting stability: Does Mission Control and telemetry provide enough non-sensitive evidence to explain each deck's cost and quality?
9. Fair pricing: What credit value would cover the hosting cost of the run with a defensible margin, without overcharging simple decks?

## Test Corpus

The corpus is 20 scenario families, 5 deck variants per family, 5 slides per deck.

Deck file naming:

```text
mc3-b<batch>-v<variant>-<slug>.pptx
```

Example:

```text
mc3-b07-v03-charts-dashboards.pptx
```

Each deck must have a deterministic scenario ID:

```text
MC3-B07-V03
```

### Scenario Families

| Batch | Decks | Slides | Scenario family | Required feature coverage |
| --- | ---: | ---: | --- | --- |
| B01 | 5 | 25 | Executive business decks | title systems, agendas, KPI cards, sectioning, restrained styles |
| B02 | 5 | 25 | SaaS product demos | hero slide, feature flows, pricing/plan visuals, callouts, hyperlinks |
| B03 | 5 | 25 | Operations dashboards | dense layout, metrics, status tables, risk panels, repeated components |
| B04 | 5 | 25 | Data storytelling | native charts, chart updates, combo data, labels, legends, annotations |
| B05 | 5 | 25 | Table-heavy reports | tables, conditional formatting, merged cells, borders, image-filled cells where supported |
| B06 | 5 | 25 | Brand/theme systems | custom palettes, gradients, typography, slide masters/layout policy where available |
| B07 | 5 | 25 | Image/media composition | safe remote image fetch, crop/cover/contain, masks, transparency, shadows |
| B08 | 5 | 25 | Icon/vector/freeform decks | icons, SVG/vector shapes, custGeom/freeform, connectors, grouped objects |
| B09 | 5 | 25 | Advanced text/WordArt | rich text, bullets, spacing, Text3D, WordArt transforms, text effects |
| B10 | 5 | 25 | Shape/effect showcase | preset shapes, gradients, line styles, glow, reflection, soft edges, shadows |
| B11 | 5 | 25 | SmartArt/diagrams | native SmartArt where suitable, shape-built diagrams, hierarchy, process, matrix |
| B12 | 5 | 25 | Equations/technical decks | native equations, symbols, code-like text, precise alignment, fallback policy |
| B13 | 5 | 25 | Animation basics | entrance, emphasis, exit, staggered sequences, animation validation |
| B14 | 5 | 25 | Motion/transition flows | motion paths, Morph-by-object, slide transitions, autoplay timing |
| B15 | 5 | 25 | Narrated decks | narration synthesis, notes, audio embedding, captions/cues where available |
| B16 | 5 | 25 | 3D/model decks | generated/curated 3D model use, native 3D animation, poster/fallback policy |
| B17 | 5 | 25 | Existing deck editing | open existing/uploaded fixture, inspect, update, duplicate, reorder, save |
| B18 | 5 | 25 | Correction/edit loops | repeated AI-style corrections, idempotent retries, transform_shapes, delete/reorder |
| B19 | 5 | 25 | Boundary and failure cases | low balance, idempotency conflict, invalid media, safe-fetch denial, recovery |
| B20 | 5 | 25 | Mixed real-world finals | end-to-end multi-feature decks combining charts, images, animations, notes, save |

## Harness Architecture

### Inputs

- Private staging MCP URL.
- Cloud Run IAM identity token.
- Dodo test activation key loaded from the private local env file.
- Deterministic seed prefix.
- Scenario manifest version.
- Optional concurrency level.
- Optional local-only COM requirement for repair verification.

### Outputs

All output paths are private maintainer artifacts and must not be returned by public tools.

```text
outputs/mc3-500-slide-run/<run-id>/
  manifest.json
  per-deck-results.jsonl
  per-tool-results.jsonl
  billing-results.jsonl
  cost-snapshots/
  decks/
  repair/
  report/
```

### Required Harness Behavior

- Start with a baseline snapshot:
  - Cloud Run service revision/image/maxScale.
  - Artifact Registry visible image sizes and repository metadata.
  - GCS artifact bucket size.
  - Firestore database metadata and known billing collections.
  - Secret Manager active versions.
  - Dodo test customer credit balance and ledger position when available.
  - Mission Control telemetry baseline.
- Generate decks through the private deployed MCP endpoint.
- Record every MCP tool call:
  - tool name
  - scenario ID
  - deck ID
  - slide index if applicable
  - start/end timestamp
  - latency
  - ok/error code
  - retry/idempotency key
  - public billing estimate/result fields
  - non-sensitive output metrics
- Save and download every deck.
- Run local static package validation for every downloaded PPTX.
- Run local COM repair-open validation for every downloaded PPTX.
- Run edit workflows on the designated editing/correction batches.
- End with a post-run snapshot using the same fields as the baseline.
- Produce an analysis report that converts observed infrastructure usage into cost bands and compares that cost with consumed credits.

## Required Metrics

### Per Deck

- runId
- scenarioId
- batch
- variant
- seed
- deployedRevision
- deckTitle
- slideCount
- requestedSlides
- savedBytes
- downloadedBytes
- packageStaticOk
- packageXmlIssues
- danglingRelationshipCount
- repairCheckAvailable
- repairOk
- repairSlideCount
- generationStart
- generationEnd
- totalGenerationMs
- saveMs
- downloadMs
- toolCallCount
- retryCount
- idempotentReplayCount
- recoverableErrorCount
- unrecoverableErrorCount
- editOperationCount
- editSuccessCount
- billingEstimatedCredits
- billingReservedCredits
- billingCommittedCredits
- billingQueuedCredits
- dodoUsageEventCount
- dodoBalanceBefore
- dodoBalanceAfter
- dodoReconciliationLagMs
- missionControlToolCallsDelta
- missionControlDownloadDelta
- artifactUrlReturned
- notes

### Per Tool

- toolName
- category: read, draft, checkpoint, heavy
- featureFamily
- callCount
- successCount
- failureCount
- p50Ms
- p90Ms
- p95Ms
- maxMs
- totalEstimatedCredits
- totalCommittedCredits
- idempotentReplayCount
- retryWithoutIdempotencyCount

### Per Scenario Family

- decks attempted
- decks saved
- decks repair-free
- static package pass rate
- COM repair pass rate
- average deck bytes
- average generation time
- average save time
- average committed credits
- average hosting cost estimate
- cost per slide
- credits per slide
- failures by error code
- qualitative issue summary

## Quality Gates

### Hard Fail

Any of these fail the MC3 run:

- fewer than 100 deck files attempted
- fewer than 500 successful slides
- any successful/billable deck fails static package validation
- any successful/billable deck opens with PowerPoint repair
- any successful/billable deck is missing a download artifact
- any public tool response leaks private implementation/source/provider internals
- any idempotent retry double-bills or double-mutates
- any Dodo usage event is duplicated for the same successful deck save
- any failed save commits billable usage as if it delivered valid value

### Warning

These do not automatically fail the run, but must be analyzed:

- p95 deck generation time above the target threshold selected before the run
- repair check unavailable for a deck because COM was unavailable
- Dodo balance reconciliation delay above the selected threshold
- queued usage not flushed by the end of the run
- GCS artifact lifecycle not cleaning old artifacts
- Artifact Registry repository-size metadata remains materially above visible images
- feature family pass rate below 95 percent

## Billing Fairness Method

Use Dodo test mode for credit/balance mechanics. Dodo credit-based billing supports credit entitlements, usage events, balance/ledger queries, and usage meters. The MC3 run should preserve that model but calibrate the BetterPPTX credit value from evidence.

### Revenue Side

For each deck:

```text
gross_credit_value_usd = committed_credits * assumed_usd_per_credit
```

For the run:

```text
gross_credit_value_usd_total = sum(committed_credits) * assumed_usd_per_credit
```

The break-even credit price is:

```text
break_even_usd_per_credit = measured_generation_hosting_cost_usd / total_committed_credits
```

The recommended price must include a margin band:

```text
recommended_usd_per_credit >= break_even_usd_per_credit * safety_factor
```

The safety factor must be chosen after observing variance, not before.

### Cost Side

Include costs caused by user generation:

- Cloud Run active request CPU/memory/request charges.
- GCS artifact storage, operations, and egress caused by generated decks.
- Firestore reads/writes/deletes/storage caused by entitlement, billing, telemetry, and webhook state.
- Secret Manager access operations caused by cold starts and secret-backed checks.
- Cloud Logging/Monitoring ingestion caused by the run.
- Network egress from downloads when applicable.
- Dodo/payment provider usage or processing fees if visible in the provider dashboard or export.

Report separately, but do not charge to per-generation unit economics:

- Cloud Build minutes.
- Artifact Registry image storage for engineering/deploy loops.
- Manual setup/admin operations.
- One-time project provisioning.
- Public docs repo work.

### Fairness Rules

- Failed generation before valid value delivery should not consume customer credits.
- Successful valid deck save is the primary checkpoint billing event.
- Expensive reusable work such as narration, 3D, heavy media, or long-running previews may be heavy-operation billing only when reusable output is delivered.
- Idempotent replay must never bill twice.
- Editing should not be charged linearly per small correction if the final deliverable is one deck.
- Simple decks must not subsidize pathological heavy decks without evidence.
- Heavy media/narration/model decks must not be underpriced if they create materially higher hosting cost.
- Repair-required or corrupt decks must either be zero-billed or explicitly reversed/credited in the analysis.

## Execution Phases

| Phase | Name | Exit condition |
| --- | --- | --- |
| MC3.0 | Plan and tracker | Plan and tracker exist under `plans/`; rollout and billing trackers point to MC3. |
| MC3.1 | Harness implementation | Harness can run a 2-deck dry run locally/deployed and write JSONL metrics. |
| MC3.2 | Baseline snapshot | Cost, Dodo, Mission Control, and storage baseline recorded. |
| MC3.3 | Small pilot | 5 decks/25 slides generated, downloaded, static-validated, COM repair-checked. |
| MC3.4 | Full sequential run | 100 decks/500 slides generated with concurrency 1. |
| MC3.5 | Controlled concurrency run | Same or representative subset run with selected concurrency while MCP max instances remains 1. |
| MC3.6 | Editing/roundtrip run | B17/B18 workflows complete and save/download/repair checks pass. |
| MC3.7 | Billing reconciliation | Dodo usage events, local ledger, Firestore state, and effective balance reconcile. |
| MC3.8 | Cost analysis | Hosting cost and break-even credit calculations completed. |
| MC3.9 | Pricing recommendation | Draft price/credit model proposed, with evidence and rejected alternatives. |

## Local Repair Validation

Local-only command shape:

```powershell
node .\betterpptx-mcp\verify-public-gallery-repair.mjs `
  --deck-dir C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\<run-id>\decks `
  --decypher-index C:\MyDoc\PptxGenJS_Claude\dist\node\pptx-decypher\index.js `
  --require-com
```

If COM is unavailable, the run cannot be marked repair-complete. The generated files can still be collected, but MC3 remains incomplete until local repair validation passes.

## Reporting Deliverables

The final MC3 report must include:

- executive summary
- run manifest
- deck corpus pass/fail table
- feature family pass/fail table
- static package findings
- COM repair findings
- speed percentiles
- Cloud Run/GCS/Firestore/Secret Manager/logging cost estimate
- Dodo usage and balance reconciliation
- failed-operation billing audit
- idempotency audit
- per-slide and per-deck cost estimates
- break-even credit price
- recommended test-mode price experiments
- live-pricing decision checklist

## Live Pricing Gate

Do not proceed to live Dodo product/pricing finalization until:

- MC3 generated at least 100 files and 500 repair-free slides.
- Cost report compares measured hosting cost with consumed credits.
- Billing reconciliation has no duplicate billing or unreconciled queued usage.
- Severe quality blockers are fixed or explicitly excluded from live scope.
- Owner approves the final pricing model.

## References

- Dodo credit-based billing: https://docs.dodopayments.com/features/credit-based-billing
- Dodo usage events: https://docs.dodopayments.com/api-reference/usage-events
- Existing plan: `plans/dodo-billing-integration-plan.md`
- Existing tracker: `plans/dodo-billing-progress-tracker.md`
- Rollout tracker: `plans/betterpptx-rollout-progress-tracker.md`
