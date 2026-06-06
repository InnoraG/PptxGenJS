# BetterPPTX MC3 Autoshowcase Test Tracker

Date opened: 2026-06-06

Plan: `plans/betterpptx-mc3-autoshowcase-500-slide-correction-plan.md`

Status: Corrected local corpus complete; private Cloud Run cost/load rerun pending.

Current owner gate: none for private testing. Owner approval is required only before public endpoint/domain or live Dodo product/pricing.

## Status Key

- Pending: not started.
- In progress: implementation or run active.
- Done: completed and evidence recorded.
- Failed: completed but failed acceptance.
- Blocked: cannot proceed without a technical dependency or owner action.

## Milestones

| Milestone | Status | Evidence |
| --- | --- | --- |
| MC3C.0 reclassify prior aggregate | Done | Prior `mc3-aggregate-20260605-03` marked infrastructure/billing stress only in tracker and reports. |
| MC3C.1 remove tone/test provider from active path | Done | Local corrected run used production Piper HTTP TTS; no tone/test narration was accepted as evidence. |
| MC3C.2 preserve approved Piper voice path | Done | Existing Docker compose and runtime voice manifest confirmed. Superseded 2026-06-06 by 24-language approved Piper runtime bundle; see `plans/betterpptx-multilingual-tts-voice-expansion-2026-06-06.md`. |
| MC3C.3 strict harness gates | Done | `mc3c-full-500-realworld-20260606-01` passed strict autoshowcase gates for 100/100 decks. |
| MC3C.4 approved-TTS smoke | Done | Local Piper container recreated with the current `betterpptx-mcp/narration/voices/runtime` mount; `/voices` returned `en_US-ljspeech-high` and `fr_FR-gilles-low`; `node .\betterpptx-mcp\smoke-narration.mjs` passed with real Piper speech and `deck.validate_narration ok=true`. |
| MC3C.5 strict autoshowcase pilot | Done | Representative pilots across business/data/table/vector/SmartArt/equation/motion/narration/3D/edit/boundary/mixed batches passed after B16 3D pose/motion, B17 duplicate-chart repair, and B19 safe-fetch fixes. |
| MC3C.6 clean Dodo baseline snapshot | Partial | Corrected run has matching local committed credits and Dodo provider debit total, but the customer was reused. A fresh isolated Dodo calibration remains required before live pricing. |
| MC3C.7 corrected 100-file / 500-slide corpus | Done | `mc3c-full-500-realworld-20260606-01`: 100/100 decks passed strict gates; 500/500 slides; local PowerPoint COM repair passed 100/100. |
| MC3C.8 final pricing-quality-cost report | Partial | Corrected local quality/billing report recorded in `plans/betterpptx-mc3-pricing-quality-cost-report-2026-06-06.md`; private Cloud Run host-cost run remains pending. |

## Current Decisions

- Prior 100 files are not deleted, but they are not final product-quality evidence.
- Tone/test narration is removed and forbidden for billing evidence.
- Approved Piper voices from `plans/narration-tts-docker-executor-plan.md` remain the intended TTS implementation.
- Cloud Run COM repair is impossible by design; COM verification stays local after downloads.
- Public endpoint remains disabled until owner approval.

## Open Technical Dependencies

| Dependency | Status | Notes |
| --- | --- | --- |
| Approved local TTS path | Verified | Docker compose mounts `betterpptx-mcp/narration/voices/runtime` and runs `piper-tts`. The stale old-name mount was fixed by recreating the container; `/voices` now lists the two approved runtime voices. |
| Approved deployed TTS path | Pending | Current private Cloud Run MCP is single-container. The corrected full run needs either local Docker endpoint testing for TTS or a private staging equivalent with Piper/voices reachable by MCP. |
| Clean Dodo test denominator | Partial | Actual committed local billing for corrected run was 1,833.60 credits; Dodo test ledger over the widened run window also reported 1,833.60 credit deductions. Fresh-customer calibration still needed. |
| B17 duplicate/reorder/delete repair safety | Verified | Fixed duplicate content-type override plus shared chart target repair issue. B17 V01-V05 passed strict gates and COM repair in the full run. |

## Corrected Run Ledger

| Run ID | Type | Status | Decks | Slides | Repair-free | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- |
| narration-smoke-real-tts / outputs\narration-smoke | Approved-TTS smoke | Done | 1 saved smoke deck + 3 validation artifacts | 12 | 4 | Real `en_US-ljspeech-high` Piper speech embedded; `validate_narration` passed; local COM repair verifier passed 4/4 PPTX files. |
| mc3c-b15-strict-pilot-20260606-01 | Strict B15 pilot | Failed | 1 | 5 | N/A | Five `slide.add_narration` calls succeeded with real Piper speech; failed before save at `deck.validate_design`: low gradient/depth/accent/hierarchy/visual-proof coverage. |
| mc3c-b15-strict-pilot-20260606-02 | Strict B15 pilot | Failed | 1 | 1 attempted | N/A | Improved visuals started correctly but first narration call hit the 120s tool timeout. This established the need for 300s narration/tool timeout during real TTS runs. |
| mc3c-b15-strict-pilot-20260606-03 | Strict B15 pilot | Done | 1 | 5 | 1 | Passed strict harness: designScore 100, `featureGateOk=true`, `narrationOk=true`, package audio=5, notes=5, charts=5, gradients=5, shadows=45, `showNarration=true`, `useTimings=true`, estimated credits 17.2. Local COM repair passed 1/1. |
| mc3c-full-500-realworld-20260606-01 | Full corrected autoshowcase | Done | 100 | 500 | 100 | Passed strict feature/design/narration/package gates and local COM repair. Actual committed billing denominator: 1,833.60 credits. |

## Acceptance Checklist

| Check | Status | Evidence |
| --- | --- | --- |
| Prior aggregate reclassified | Done | `plans/betterpptx-mc3-500-slide-test-tracker.md`; pricing reports updated. |
| No tone/test provider accepted | Done | Corrected B15/full corpus used production Piper HTTP TTS and embedded real audio parts. |
| Approved voices available | Done | Runtime files under `betterpptx-mcp/narration/voices/runtime`; local Piper `/voices` returns 24 approved working languages. Chinese remains candidate-only pending offline CJK phonemizer/runtime-cost decision. |
| Feature proof recorded from saved package | Done for B15 | Passing B15 pilot recorded saved-package feature counts including audio=5, notes=5, charts=5, gradients=5, shadows=45. |
| Design validation recorded | Done for B15 | Strict B15 pilot failed shallow content at score 53, then passed after generator fix with score 100. |
| Narration validation hard-gated for B15 | Done for B15 | Passing B15 pilot recorded `narrationOk=true`, audio media on every slide, `showNarration=true`, and `useTimings=true`. |
| Approved-TTS smoke narration package | Done | `smoke-narration.mjs` returned `ok=true`; media parts `ppt/media/media-1-1.wav` through `media-3-1.wav`; `showNarration/useTimings` validation passed. |
| Approved-TTS smoke COM repair | Done | `node .\betterpptx-mcp\verify-public-gallery-repair.mjs --deck-dir C:\MyDoc\PptxGenJS_Claude\outputs\narration-smoke --decypher-index C:\MyDoc\PptxGenJS_Claude\dist\node\pptx-decypher\index.js --require-com` returned `PUBLIC GALLERY REPAIR VERIFY: PASS decks=4 com=required`. |
| Clean Dodo snapshots | Partial | Widened provider snapshot `2026-06-06T09:47:38Z` to `2026-06-06T11:59:59Z` matched local committed total: 1,833.60 credits. Customer was reused, so this is not final live-pricing calibration. |
| Local COM repair for B15 strict pilot | Done | `node .\betterpptx-mcp\verify-public-gallery-repair.mjs --deck-dir C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-b15-strict-pilot-20260606-03\decks --decypher-index C:\MyDoc\PptxGenJS_Claude\dist\node\pptx-decypher\index.js --require-com` returned `PUBLIC GALLERY REPAIR VERIFY: PASS decks=1 com=required`. |
| Local COM repair for corrected corpus | Done | `node .\betterpptx-mcp\verify-public-gallery-repair.mjs --deck-dir C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\decks --decypher-index C:\MyDoc\PptxGenJS_Claude\dist\node\pptx-decypher\index.js --require-com` returned `PUBLIC GALLERY REPAIR VERIFY: PASS decks=100 com=required`. |

## Next Actions

1. Sync the deploy-affecting changes to the private GitHub deploy repo and push.
2. Run the same strict 100-file harness against private Cloud Run staging, with GCP cost/load snapshots enabled and no public endpoint/domain.
3. Fix the billing UX/estimator gap: pre-save estimate was 1,422.70 credits, but actual committed billing was 1,833.60 credits.
4. Run a fresh-customer Dodo test calibration before final live product/pricing.
