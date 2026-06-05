# BetterPPTX MC3 500-Slide Test Tracker

Date opened: 2026-06-05

Plan: `plans/betterpptx-mc3-500-slide-realworld-test-plan.md`

Status: Snapshot gate passed; full MC3 run not yet started.

Current owner gate: none. Live Dodo pricing remains blocked until MC3 data is complete and reviewed.

## Status Key

- Pending: not started.
- In progress: implementation or run active.
- Blocked: cannot continue without external action.
- Done: completed and evidence recorded.
- Failed: completed but failed acceptance.

## Milestones

| Milestone | Status | Evidence |
| --- | --- | --- |
| MC3.0 plan and tracker | Done | Plan and tracker created under `plans/`; rollout and Dodo trackers now point to MC3 as the required pre-pricing evidence track. |
| MC3.1 harness implementation | Done | Added `betterpptx-mcp/run-mc3-realworld-harness.mjs`. Syntax check passed, help output works, 2-deck deployed smoke `mc3-smoke-20260605-01` passed, 5-deck pilot passed, and post-snapshot-refactor code smoke `mc3-harness-code-smoke-20260605-01` passed. |
| MC3.2 baseline snapshots | Done | `mc3-gcp-snapshot-smoke-20260605-04` wrote baseline and postrun snapshots with health=200, Mission Control=200, Cloud Run service metadata, recent Cloud Build metadata, and GCS bucket sizes. Baseline GCS size: 948,629 bytes; postrun GCS size: 988,023 bytes. |
| MC3.3 pilot run | Done | `mc3-pilot-20260605-01` generated 5 decks / 25 slides / 197,024 downloaded bytes; static checks and local COM repair checks passed for all 5 decks. |
| MC3.4 full sequential run | Pending | 100 decks / 500 slides through private Cloud Run MCP with concurrency 1. |
| MC3.5 controlled concurrency run | Pending | Representative subset or full run under controlled concurrency while MCP max instances remains 1. |
| MC3.6 editing/roundtrip run | Pending | B17/B18 inspect/update/duplicate/reorder/delete/open/save scenarios pass. |
| MC3.7 billing reconciliation | Pending | Local ledger, Firestore, Dodo usage events, balance and queued usage reconcile. |
| MC3.8 cost analysis | Pending | Hosting cost caused by the run calculated and separated from one-time engineering costs. |
| MC3.9 pricing recommendation | Pending | Break-even and recommended credit model drafted from measured data. |

## Batch Tracker

| Batch | Scenario family | Deck IDs | Status | Notes |
| --- | --- | --- | --- | --- |
| B01 | Executive business decks | MC3-B01-V01..V05 | Pending | 5 decks, 25 slides. |
| B02 | SaaS product demos | MC3-B02-V01..V05 | Pending | 5 decks, 25 slides. |
| B03 | Operations dashboards | MC3-B03-V01..V05 | Pending | 5 decks, 25 slides. |
| B04 | Data storytelling | MC3-B04-V01..V05 | Pending | 5 decks, 25 slides. |
| B05 | Table-heavy reports | MC3-B05-V01..V05 | Pending | 5 decks, 25 slides. |
| B06 | Brand/theme systems | MC3-B06-V01..V05 | Pending | 5 decks, 25 slides. |
| B07 | Image/media composition | MC3-B07-V01..V05 | Pending | 5 decks, 25 slides; remote fetch limited to safe media/image paths. |
| B08 | Icon/vector/freeform decks | MC3-B08-V01..V05 | Pending | 5 decks, 25 slides. |
| B09 | Advanced text/WordArt | MC3-B09-V01..V05 | Pending | 5 decks, 25 slides. |
| B10 | Shape/effect showcase | MC3-B10-V01..V05 | Pending | 5 decks, 25 slides. |
| B11 | SmartArt/diagrams | MC3-B11-V01..V05 | Pending | 5 decks, 25 slides. |
| B12 | Equations/technical decks | MC3-B12-V01..V05 | Pending | 5 decks, 25 slides. |
| B13 | Animation basics | MC3-B13-V01..V05 | Pending | 5 decks, 25 slides. |
| B14 | Motion/transition flows | MC3-B14-V01..V05 | Pending | 5 decks, 25 slides. |
| B15 | Narrated decks | MC3-B15-V01..V05 | Pending | 5 decks, 25 slides. |
| B16 | 3D/model decks | MC3-B16-V01..V05 | Pending | 5 decks, 25 slides. |
| B17 | Existing deck editing | MC3-B17-V01..V05 | Pending | 5 decks, 25 slides; must exercise open/inspect/update/save. |
| B18 | Correction/edit loops | MC3-B18-V01..V05 | Pending | 5 decks, 25 slides; must exercise idempotent retries and correction loops. |
| B19 | Boundary and failure cases | MC3-B19-V01..V05 | Pending | 5 decks, 25 slides; failures must not be counted as successful billable value. |
| B20 | Mixed real-world finals | MC3-B20-V01..V05 | Pending | 5 decks, 25 slides. |

## Current Run Ledger

| Run ID | Type | Status | Decks attempted | Decks saved | Slides saved | Repair-free decks | Committed credits | Hosting cost estimate | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| mc3-smoke-20260605-01 | Harness smoke | Done | 2 | 2 | 10 | 2 | TBD | TBD | Private staging generated and downloaded 2 decks / 10 slides / 78,789 bytes; local COM repair verifier passed both decks. |
| mc3-pilot-20260605-01 | Pilot | Done | 5 | 5 | 25 | 5 | TBD | TBD | Private staging generated and downloaded 5 decks / 25 slides / 197,024 bytes; 200 tool-call rows, 5 deck rows, 5 billing estimate rows; local COM repair verifier passed all decks. |
| mc3-harness-code-smoke-20260605-01 | Harness code smoke | Done | 1 | 1 | 5 | 1 | TBD | TBD | Post-snapshot-refactor run used `--skip-gcp-snapshot`, generated 1 deck / 5 slides / 39,412 bytes, and passed local COM repair verification. |
| mc3-gcp-snapshot-smoke-20260605-03 | Snapshot smoke | Done | 1 | 1 | 5 | 1 | 10.26 estimated | Partial | Harness completed with bounded GCP snapshot behavior after the earlier timeout; postrun Cloud Run/Cloud Build metadata succeeded, but baseline metadata and GCS timed out under the first low timeout cap. |
| mc3-gcp-snapshot-smoke-20260605-04 | Snapshot smoke | Done | 1 | 1 | 5 | 1 | 10.26 estimated | Pending analysis | Harness generated 1 deck / 5 slides / 39,394 bytes; 40 tool rows and 1 billing estimate row; static package check and local COM repair passed; baseline/postrun snapshots captured health, Mission Control, Cloud Run, recent builds, and GCS byte delta. |
| TBD | Sequential full | Pending | 0 | 0 | 0 | 0 | 0 | TBD | Snapshot gate passed; ready for the 100-deck sequential run. |
| TBD | Controlled concurrency | Pending | 0 | 0 | 0 | 0 | 0 | TBD | Awaiting sequential run. |

## Evidence Files To Produce

| File | Status | Notes |
| --- | --- | --- |
| `outputs/mc3-500-slide-run/<run-id>/manifest.json` | Smoke produced | `mc3-smoke-20260605-01` wrote the manifest. |
| `outputs/mc3-500-slide-run/<run-id>/per-deck-results.jsonl` | Smoke produced | `mc3-smoke-20260605-01` wrote 2 deck rows. |
| `outputs/mc3-500-slide-run/<run-id>/per-tool-results.jsonl` | Smoke produced | `mc3-smoke-20260605-01` wrote 80 tool-call rows. |
| `outputs/mc3-500-slide-run/<run-id>/billing-results.jsonl` | Smoke produced | `mc3-smoke-20260605-01` wrote 2 pre-save estimate rows; full reconciliation still pending. |
| `outputs/mc3-500-slide-run/<run-id>/cost-snapshots/baseline.json` | Snapshot produced | `mc3-gcp-snapshot-smoke-20260605-04` wrote baseline health, Mission Control, Cloud Run, recent builds, and GCS size fields. |
| `outputs/mc3-500-slide-run/<run-id>/cost-snapshots/postrun.json` | Snapshot produced | `mc3-gcp-snapshot-smoke-20260605-04` wrote postrun health, Mission Control, Cloud Run, recent builds, and GCS size fields. |
| `outputs/mc3-500-slide-run/<run-id>/repair/repair-results.jsonl` | Pending | Local COM repair results. |
| `outputs/mc3-500-slide-run/<run-id>/report/mc3-pricing-quality-cost-report.md` | Pending | Final evidence report. |

## Acceptance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| At least 100 deck files attempted | Pending | Pilot: 5/100. |
| At least 500 slides saved in valid PPTX files | Pending | Pilot: 25/500. |
| Every successful deck static package check passes | Pilot passed | Pilot: 5/5 static package checks passed. Full run pending. |
| Every successful deck opens in PowerPoint without repair | Pilot passed | Pilot: 5/5 local COM repair checks passed with `--require-com`. Full run pending. |
| No public black-box leakage in tool schemas/results | Pending | Reuse deployed verifier plus MC3 scan. |
| Dodo usage event ingestion is exactly-once for successful billable saves | Pending | No run yet. |
| Failed/invalid decks are not counted as successful billable value | Pending | No run yet. |
| Idempotent retries do not double-bill or double-mutate | Pending | No run yet. |
| Cost report separates generation hosting cost from engineering/deploy cost | Pending | No report yet. |
| Break-even credit price calculated from measured run data | Pending | No report yet. |

## Known Constraints

- COM/PowerPoint repair checks are local-only. Cloud Run will never be expected to run COM.
- MCP service remains max instances 1 until shared edit state exists.
- Public MCP endpoint remains disabled.
- Live Dodo product/pricing remains owner-gated.
- Remote fetch is allowed only for safe media/image workflows and must continue to block generic fetch and private networks.

## Next Actions

1. Run the full sequential 100-deck / 500-slide corpus with baseline/postrun snapshots.
2. Run local static and COM repair checks on the full corpus.
3. Reconcile billing usage: local ledger, Firestore queue, Dodo usage events, and Dodo balance.
4. Produce the measured hosting-cost versus consumed-credit report.
5. Draft the data-derived pricing recommendation without creating live Dodo products.
