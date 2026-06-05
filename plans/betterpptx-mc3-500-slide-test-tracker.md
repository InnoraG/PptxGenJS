# BetterPPTX MC3 500-Slide Test Tracker

Date opened: 2026-06-05

Plan: `plans/betterpptx-mc3-500-slide-realworld-test-plan.md`

Status: Planned, not yet run.

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
| MC3.1 harness implementation | Pending | Add deterministic 100-deck deployed harness with JSONL metrics and local repair verifier integration. |
| MC3.2 baseline snapshots | Pending | Capture Cloud Run, GCS, Artifact Registry, Firestore, Secret Manager, Dodo, and Mission Control baseline before generation. |
| MC3.3 pilot run | Pending | 5 decks / 25 slides, download, static validation, COM repair check. |
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
| TBD | Pilot | Pending | 0 | 0 | 0 | 0 | 0 | TBD | Awaiting harness. |
| TBD | Sequential full | Pending | 0 | 0 | 0 | 0 | 0 | TBD | Awaiting pilot pass. |
| TBD | Controlled concurrency | Pending | 0 | 0 | 0 | 0 | 0 | TBD | Awaiting sequential run. |

## Evidence Files To Produce

| File | Status | Notes |
| --- | --- | --- |
| `outputs/mc3-500-slide-run/<run-id>/manifest.json` | Pending | Full scenario manifest and deployed revision. |
| `outputs/mc3-500-slide-run/<run-id>/per-deck-results.jsonl` | Pending | One line per deck. |
| `outputs/mc3-500-slide-run/<run-id>/per-tool-results.jsonl` | Pending | One line per tool call. |
| `outputs/mc3-500-slide-run/<run-id>/billing-results.jsonl` | Pending | Billing events, reservations, Dodo usage and balance reconciliation. |
| `outputs/mc3-500-slide-run/<run-id>/cost-snapshots/baseline.json` | Pending | Pre-run GCP/Dodo/MC snapshot. |
| `outputs/mc3-500-slide-run/<run-id>/cost-snapshots/postrun.json` | Pending | Post-run snapshot. |
| `outputs/mc3-500-slide-run/<run-id>/repair/repair-results.jsonl` | Pending | Local COM repair results. |
| `outputs/mc3-500-slide-run/<run-id>/report/mc3-pricing-quality-cost-report.md` | Pending | Final evidence report. |

## Acceptance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| At least 100 deck files attempted | Pending | 0/100. |
| At least 500 slides saved in valid PPTX files | Pending | 0/500. |
| Every successful deck static package check passes | Pending | No run yet. |
| Every successful deck opens in PowerPoint without repair | Pending | No COM run yet. |
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

1. Implement the deterministic MC3 harness.
2. Add syntax checks and a 2-deck smoke mode.
3. Run a 5-deck pilot through private staging.
4. Run local static and COM repair checks on the pilot decks.
5. Review pilot telemetry before the full 100-deck run.
