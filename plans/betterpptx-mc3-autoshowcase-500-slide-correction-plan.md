# BetterPPTX MC3 Autoshowcase 500-Slide Correction Plan

Date opened: 2026-06-06

Status: In progress

Related files:

- Prior infra-only run: `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/`
- Prior tracker: `plans/betterpptx-mc3-500-slide-test-tracker.md`
- TTS executor: main workspace plan `C:\MyDoc\PptxGenJS_Claude\plans\narration-tts-docker-executor-plan.md`
- Progress tracker: `plans/betterpptx-mc3-autoshowcase-test-tracker.md`

## Purpose

Produce a corrected 100-file / 500-slide evidence corpus that is valid for billing and product-quality decisions.

The prior aggregate remains useful for infrastructure stress, repair checks, downloads, idempotent saves, Cloud Run timing, and Dodo plumbing. It is not accepted as product-quality evidence because the decks were too repetitive/shallow and the narrated batch saved notes-only files after failed TTS calls.

## Non-Negotiable Correction Rules

- Generate at least 100 PPTX files, exactly 5 slides each, for at least 500 successful slides.
- Every deck must be a real autoshowcase presentation, not a report row, placeholder, feature inventory, or repetitive template.
- Every feature family must prove the intended capability in the saved PPTX package, not only in tool-call intent.
- Narration must use the approved Piper voice implementation from `plans/narration-tts-docker-executor-plan.md`, or explicit real external audio. Tone/test providers are forbidden.
- Narrated decks must embed audio media, speaker notes, captions where required, `showNarration=1`, `useTimings=1`, and sane slide timings.
- The run must call `betterpptx.deck.validate`, `betterpptx.deck.validate_design`, and `betterpptx.deck.validate_narration` where narration is present.
- Every downloaded deck must pass static package validation.
- Every downloaded deck must pass local desktop PowerPoint COM open-without-repair validation. COM remains local-only and is not a Cloud Run dependency.
- Generic fetch stays blocked. Remote fetch remains allowed only for safe media/image workflows.
- Pricing analysis must use clean Dodo before/after evidence from a fresh test customer or explicit provider ledger snapshots.

## TTS Requirement

The approved TTS path already exists and should be preserved:

- `docker-compose.yml` runs `mcp-server` plus isolated `piper-tts`.
- `mcp-server` talks to Piper only through `BETTERPPTX_TTS_URL=http://piper-tts:5000`.
- Approved runtime voices are mounted from `betterpptx-mcp/narration/voices/runtime`.
- Current approved voices include `en_US-ljspeech-high` and `fr_FR-gilles-low`.
- The voice manifest is `betterpptx-mcp/narration/voices/runtime/runtime-manifest.json`.

Before the corrected full run, one of these must be true:

- Run the strict autoshowcase pilot against local Docker compose with the approved Piper sidecar.
- Or deploy an equivalent private staging TTS runtime so the Cloud Run MCP endpoint can reach Piper and approved voices.

Do not run the corrected full autoshowcase corpus against an endpoint that cannot synthesize approved speech.

## Corrected Harness Gates

`betterpptx-mcp/run-mc3-realworld-harness.mjs --full-run` now enables strict autoshowcase gates by default.

Strict mode must fail a deck when:

- `deck.validate` returns `ok=false`.
- `deck.validate_design` returns `ok=false`.
- Required feature proof is missing from the saved package.
- Required narration is missing, notes-only, or fails `deck.validate_narration`.
- Unsafe localhost/private-network image fetch unexpectedly succeeds.
- Static package validation is skipped.

Saved-package counters must be captured per deck:

- charts
- tables
- image media
- audio media
- model/3D media
- notes slides
- custom geometry/freeform
- equations
- transitions
- animation timing
- gradients
- shadows
- WordArt/text warp
- Text3D
- `showNarration`
- `useTimings`

Design metrics must be captured per deck:

- design score
- gradient/depth coverage
- visual proof objects
- animated slides
- diagram slides
- narrated slides
- captioned slides
- model/3D objects
- average objects per slide

## Scenario Family Acceptance

| Batch | Family | Minimum acceptance |
| --- | --- | --- |
| B01 | Executive business decks | Distinct executive storyline, KPI proof, hierarchy, polished theme, design score pass. |
| B02 | SaaS product demos | Product story, feature flow, pricing/plan or value proof, clear CTA. |
| B03 | Operations dashboards | Dense but readable metrics, status/risk panels, repeated operational components. |
| B04 | Data storytelling | Native chart evidence, labels/legends/annotations, at least two chart parts. |
| B05 | Table-heavy reports | Real table XML, table styling, structured comparison, not plain placeholder grids. |
| B06 | Brand/theme systems | Palette, gradients, typography hierarchy, consistent style system. |
| B07 | Image/media composition | Safe image/media embedding with crop/contain/cover decisions and visual treatment. |
| B08 | Icon/vector/freeform decks | Custom/freeform geometry or vector proof in the saved package. |
| B09 | Advanced text/WordArt | WordArt/text effect or Text3D proof, readable and purposeful. |
| B10 | Shape/effect showcase | Gradients/shadows/effects used in a real slide story, not a catalog matrix. |
| B11 | SmartArt/diagrams | Process, hierarchy, architecture, or matrix visual proof. |
| B12 | Equations/technical decks | Native equation XML or accepted technical fallback with alignment proof. |
| B13 | Animation basics | Animation coverage across the story with validation evidence. |
| B14 | Motion/transition flows | Transitions on all slides and timing/motion proof. |
| B15 | Narrated decks | Approved-voice audio embedded on every slide; narration validation pass. |
| B16 | 3D/model decks | Model/3D proof or explicit recorded limitation; expressive design validation where model is present. |
| B17 | Existing deck editing | Inspect/update/duplicate/reorder/save path; risky chart/table edits stay gated until fixed. |
| B18 | Correction/edit loops | Idempotent retries plus meaningful repeated corrections. |
| B19 | Boundary/failure cases | Expected failures recorded, unsafe fetch denial proved, final artifact valid. |
| B20 | Mixed real-world finals | End-to-end multi-feature customer-style decks. |

## Run Sequence

1. Verify approved local TTS:

```powershell
$env:BETTERPPTX_TOKEN='replace-me'
docker compose up --build
node .\betterpptx-mcp\smoke-narration.mjs
```

2. Run one strict pilot against the endpoint that has approved TTS:

```powershell
node .\betterpptx-mcp\run-mc3-realworld-harness.mjs <mcp-url> --strict-autoshowcase --max-decks 2 --env-file .\betterpptx-mcp\.betterpptx-mcp-runtime\dodo-local.env --require-activation --run-id mc3-autoshowcase-pilot-YYYYMMDD-01
```

3. Verify pilot repair locally:

```powershell
node .\betterpptx-mcp\verify-public-gallery-repair.mjs --deck-dir <pilot-run>\decks --decypher-index C:\MyDoc\PptxGenJS_Claude\dist\node\pptx-decypher\index.js --require-com
```

4. Capture clean Dodo before snapshot with a fresh test customer or explicit ledger timestamp.

5. Run corrected full corpus:

```powershell
node .\betterpptx-mcp\run-mc3-realworld-harness.mjs <mcp-url> --full-run --env-file .\betterpptx-mcp\.betterpptx-mcp-runtime\dodo-local.env --require-activation --run-id mc3-autoshowcase-full-YYYYMMDD-01
```

6. Run local COM repair verification on all 100 decks.

7. Capture Dodo after snapshot and reconcile queued usage.

8. Produce final pricing-quality-cost report that separates:

- Cloud Run host cost
- approved-voice TTS cost/load
- storage/download cost
- Dodo/payment fees
- media/AI external costs, if any
- failed/retried/blocked operations
- estimated revenue per credit and per slide

## Owner Gates

No owner action is required to continue private testing.

Owner approval remains required only for:

- public endpoint/domain
- live Dodo product/pricing creation or switch
