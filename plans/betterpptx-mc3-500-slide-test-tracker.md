# BetterPPTX MC3 500-Slide Test Tracker

Date opened: 2026-06-05

Last updated: 2026-06-06

Plan: `plans/betterpptx-mc3-500-slide-realworld-test-plan.md`

Report: `plans/betterpptx-mc3-pricing-quality-cost-report-2026-06-06.md`

Status: MC3 core private-staging aggregate is complete. Live Dodo pricing remains blocked until owner approval and final billing-pricing calibration.

Current owner gate: none for continued private hardening. Owner approval is required only before public endpoint/domain or live Dodo product/pricing.

## Status Key

- Pending: not started.
- In progress: implementation or run active.
- Done: completed and evidence recorded.
- Done with caveat: completed, but follow-up is required before live launch.
- Failed: completed but failed acceptance.

## Milestones

| Milestone | Status | Evidence |
| --- | --- | --- |
| MC3.0 plan and tracker | Done | Plan, tracker, and report files exist under `plans/`. |
| MC3.1 harness implementation | Done | `betterpptx-mcp/run-mc3-realworld-harness.mjs`; `node --check` passed. |
| MC3.2 baseline snapshots | Done | Snapshot-gated smoke `mc3-gcp-snapshot-smoke-20260605-04` captured health, Mission Control, Cloud Run, Cloud Build, and GCS evidence. |
| MC3.3 pilot run | Done | `mc3-pilot-20260605-01`: 5 decks / 25 slides; static and local COM repair passed. |
| MC3.4 full sequential run | Done | Final selected aggregate `mc3-aggregate-20260605-03`: 100 decks / 500 slides. |
| MC3.5 controlled concurrency run | Done with caveat | Current launch posture intentionally keeps MCP max instances at 1. The aggregate used sequential private staging; broader concurrency above 1 remains blocked by shared edit-state work. |
| MC3.6 editing/roundtrip run | Done with caveat | B17/B18 repair-safe edit, duplicate, reorder, delete, save, and idempotent replay paths passed. Repair-risky chart/table semantic edits are gated off pending a serialization fix. |
| MC3.7 billing reconciliation | Done with caveat | Reconciler job image drift fixed; execution `betterpptx-billing-reconcile-once-v7hhv` reported `attempted=0`. Dodo test ledger shows deductions, but the reused customer prevents an exact MC3-only provider debit denominator. |
| MC3.8 cost analysis | Done | Report calculates host-only Cloud Run cost band `$0.0395` to `$0.0852`. |
| MC3.9 pricing recommendation | Done with caveat | Test-mode recommendation drafted. Live Dodo pricing/product remains owner-gated. |

## Batch Tracker

| Batch | Scenario family | Deck IDs | Status | Notes |
| --- | --- | --- | --- | --- |
| B01 | Executive business decks | MC3-B01-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B02 | SaaS product demos | MC3-B02-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B03 | Operations dashboards | MC3-B03-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B04 | Data storytelling | MC3-B04-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B05 | Table-heavy reports | MC3-B05-V01..V05 | Done | Final aggregate uses replacement passes for transient session failures. |
| B06 | Brand/theme systems | MC3-B06-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B07 | Image/media composition | MC3-B07-V01..V05 | Done | Safe media/image fetch posture retained; generic fetch remains blocked. |
| B08 | Icon/vector/freeform decks | MC3-B08-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B09 | Advanced text/WordArt | MC3-B09-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B10 | Shape/effect showcase | MC3-B10-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B11 | SmartArt/diagrams | MC3-B11-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B12 | Equations/technical decks | MC3-B12-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B13 | Animation basics | MC3-B13-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B14 | Motion/transition flows | MC3-B14-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B15 | Narrated decks | MC3-B15-V01..V05 | Done with caveat | Decks pass repair, but optional narration calls failed because the tone provider is unavailable in production mode. |
| B16 | 3D/model decks | MC3-B16-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |
| B17 | Existing deck editing | MC3-B17-V01..V05 | Done with caveat | Repair-safe edit run passed. Risky chart/table semantic edits remain gated. |
| B18 | Correction/edit loops | MC3-B18-V01..V05 | Done | Edit/retry/correction loop decks passed. |
| B19 | Boundary and failure cases | MC3-B19-V01..V05 | Done | Failure-oriented scenarios produced valid final artifacts. |
| B20 | Mixed real-world finals | MC3-B20-V01..V05 | Done | Final aggregate includes 5 repair-free decks. |

## Current Run Ledger

| Run ID | Type | Status | Decks selected | Slides selected | Repair-free decks | Estimated credits | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| mc3-smoke-20260605-01 | Harness smoke | Done | 2 | 10 | 2 | TBD | Initial private staging smoke passed local COM repair. |
| mc3-pilot-20260605-01 | Pilot | Done | 5 | 25 | 5 | TBD | 5-deck pilot passed static and local COM repair. |
| mc3-gcp-snapshot-smoke-20260605-04 | Snapshot smoke | Done | 1 | 5 | 1 | 10.26 | Baseline/postrun snapshots captured staging metadata. |
| mc3-b06-b10-smoke-20260605-06 | Sequential subset | Done | 25 | 125 | 25 | 241.3 | Tool failures 0. |
| mc3-b11-b15-smoke-20260605-01 | Sequential subset | Done with caveat | 25 | 125 | 25 | 255.0 | 25 optional narration-provider failures; saved decks are repair-free. |
| mc3-b16-b20-clean-20260605-01 | Sequential subset | Done with caveat | 20 | 100 | 20 | 194.3 | B17 from this run was replaced because risky chart/table edits caused repair failures. |
| mc3-b17-repair-safe-20260605-01 | Replacement subset | Done | 5 | 25 | 5 | 51.3 | Repair-safe B17 replacement passed COM. |
| mc3-b01-b05-clean-20260605-01 plus replacements | Sequential subset | Done with caveat | 25 | 125 | 25 | 259.2 | Transient session invalidation replacements selected for B05. |
| mc3-aggregate-20260605-03 | Final aggregate | Done | 100 | 500 | 100 | 1,000.8 | `PUBLIC GALLERY REPAIR VERIFY: PASS decks=100 com=required`. |
| betterpptx-billing-reconcile-once-tqc62 | Billing reconciler | Done | N/A | N/A | N/A | N/A | Post-deploy Cloud Run Job on private commit `216e964`: `attempted=0 ingested=0 skipped=0 failed=0`. |

## Evidence Files

| File | Status | Notes |
| --- | --- | --- |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/aggregate-summary.json` | Done | Aggregate metrics. |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/aggregate-deck-results.jsonl` | Done | 100 selected deck rows. |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/aggregate-tool-results.jsonl` | Done | 4,120 selected tool rows. |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/decks/` | Done | 100 selected PPTX artifacts. |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/repair/repair-results.txt` | Done | Static plus local COM repair verifier output. |
| `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/report/mc3-pricing-quality-cost-report.md` | Done | Detailed evidence report. |
| `plans/betterpptx-mc3-pricing-quality-cost-report-2026-06-06.md` | Done | Plan-level report pointer and summary. |

## Acceptance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| At least 100 deck files attempted/selected | Done | Final aggregate selected 100 passed decks. |
| At least 500 slides saved in valid PPTX files | Done | Final aggregate selected 500 slides. |
| Every selected deck static package check passes | Done | 100/100. |
| Every selected deck opens in PowerPoint without repair | Done | 100/100 local COM repair pass. |
| No public black-box leakage in tested public tool outputs | Done | Reused deployed black-box guard and aggregate public-safe output posture. |
| Dodo usage event ingestion works | Done | Dodo ledger shows credit deductions; reconciler queue is empty. |
| Exact Dodo debit isolated to MC3 aggregate | Done with caveat | Not cleanly isolated because the same test customer covered smoke, pilot, failed, replacement, and aggregate runs. |
| Failed/invalid decks not counted as successful billable value | Done with caveat | Final aggregate selects passed decks only; separate Dodo provider ledger includes adjacent run deductions. |
| Idempotent retries do not double-mutate saves | Done | Each selected deck had two `deck.save` calls with the same key; replay returned `idempotentReplay=true`. |
| Cost report separates generation hosting cost from engineering/deploy cost | Done | Report uses host-only Cloud Run compute band and calls out exclusions. |
| Break-even credit price calculated from measured run data | Done | Report calculates host-only cost per credit and per slide. |

## Known Constraints

- COM/PowerPoint repair checks are local-only. Cloud Run will not run COM.
- MCP service remains max instances 1 until shared edit/session/idempotency state exists.
- Public MCP endpoint remains disabled.
- Live Dodo product/pricing remains owner-gated.
- Remote fetch is allowed only for safe media/image workflows and must continue to block generic fetch and private networks.

## Next Actions

1. Run a clean Dodo billing calibration with a fresh test customer or explicit before/after Dodo snapshots.
2. Configure a production-safe TTS provider and rerun B15.
3. Fix the B17 chart/table semantic edit serialization path before enabling those edits publicly.
4. Sync the MC3 harness, billing snapshot utility, reports, and deploy-job image guard to the private GitHub deploy repo.
5. Continue private hardening until only public endpoint/domain and live Dodo product/pricing remain.
