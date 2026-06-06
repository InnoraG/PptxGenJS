# BetterPPTX MC3 Pricing, Quality, and Cost Report

Date: 2026-06-06

Status: **Updated on 2026-06-06 after corrected local autoshowcase corpus.** The prior MC3 aggregate is valid as private staging infrastructure/billing stress evidence, but it is **not** accepted as the product-quality autoshowcase corpus. The corrected local corpus below is accepted for quality/package/billing-logic evidence. It is **not** accepted as final hosting-cost evidence because GCP snapshots were intentionally skipped and the run used the local MCP endpoint with local PowerPoint COM repair.

## Corrected Local Corpus Result

Run ID: `mc3c-full-500-realworld-20260606-01`

Artifacts:

- Decks: `C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\decks`
- Summary: `C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\summary.json`
- Per-deck data: `C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\per-deck-results.jsonl`
- Per-tool data: `C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\per-tool-results.jsonl`
- Billing events: `C:\MyDoc\PptxGenJS_Claude\outputs\mc3-500-slide-run\mc3c-full-500-realworld-20260606-01\billing-results.jsonl`

Quality/package result:

- 100/100 decks passed strict autoshowcase gates.
- 500/500 slides were generated.
- 100/100 decks passed static package checks.
- 100/100 decks passed local desktop PowerPoint COM open-without-repair verification.
- Downloaded PPTX bytes: 15,635,633.
- Average design score: 74.95; minimum design score: 71.
- B15 narrated decks used real Piper TTS, embedded 25 audio media parts, and passed narration validation.

Feature coverage from saved packages:

| Feature counter | Count |
| --- | ---: |
| Charts | 265 |
| Tables | 60 |
| Images | 55 |
| Audio media | 25 |
| 3D/model media | 5 |
| Notes slides | 500 |
| Custom/freeform geometry | 25 |
| Equations | 60 |
| Transitions | 615 |
| Animation timing parts | 105 |
| Gradient fills | 815 |
| Shadows | 3,800 |
| Text warp | 25 |
| Text 3D | 50 |

Runtime/load result:

- Wall elapsed: 6,630.862 seconds / 110.51 minutes.
- Deck wall total: 6,630.599 seconds.
- Deck latency p50/p90/p95/max: 69.087 s / 76.015 s / 84.852 s / 593.271 s.
- B15 narration was the dominant load: 25 `slide.add_narration` calls totaled 2,093.23 seconds, average 83.73 seconds, p95 139.90 seconds.
- B16 3D/model load: 25 `slide.add_model3d` calls totaled 174.74 seconds; 25 `assets.catalog` calls totaled 153.48 seconds.
- Tool calls: 8,715.
- Unexpected tool failures: 0.
- Expected failures: 5, all from B19 unsafe image fetch denial tests.
- Tool retries: 51; these mostly reflect transient local endpoint waits around long-running operations.

Billing result:

| Metric | Credits |
| --- | ---: |
| Pre-save `betterpptx.billing.estimate` total | 1,422.70 |
| Actual committed local billing total | 1,833.60 |
| Actual Dodo test ledger deduction total over widened run window | 1,833.60 |
| Difference actual minus pre-save estimate | 410.90 |

Actual committed billing breakdown:

| Billing source | Count | Credits |
| --- | ---: | ---: |
| `betterpptx.deck.save` | 100 | 1,655.60 |
| `betterpptx.slide.add_narration` immediate-heavy | 25 | 53.00 |
| `betterpptx.slide.add_model3d` immediate-heavy | 25 | 125.00 |

Credit economics from actual committed billing:

- Actual credits per deck: 18.336.
- Actual credits per slide: 3.6672.
- If pricing were `$5 / 1,000 credits`, this 100-deck run would correspond to `$9.17` revenue, `$0.0917` per deck, and `$0.0183` per slide.
- If pricing were `$5 / 500 credits`, this 100-deck run would correspond to `$18.34` revenue, `$0.1834` per deck, and `$0.0367` per slide.

Billing finding:

- The pre-save estimate under-reported actual committed billing by 410.90 credits.
- Cause class: pre-save estimates do not fully include output-size-aware save charges and immediate-heavy narration/3D charges in the same way the committed billing ledger does.
- Pricing decisions must use actual committed credits for now.
- Product fix needed before live launch: billing UX should either show the final committed estimate before charge, or clearly separate pre-save estimate from immediate-heavy and output-size charges.

Dodo finding:

- Widened Dodo test snapshot from `2026-06-06T09:47:38Z` to `2026-06-06T11:59:59Z` matched the local committed billing total: 1,833.60 credits deducted.
- Dodo provider ledger row count is not expected to be one-to-one with local reservations/events, so the accepted consistency check is total credit deduction over the run window.
- The Dodo test customer was reused across pilots and stress runs. Use a fresh test customer for the final live-pricing calibration.

Repair fixes discovered by the corpus:

- B17 exposed duplicate chart content-type override and shared-chart-target repair risk after slide duplicate/reorder/delete.
- Fixed `src/gen-xml.ts` to dedupe content-type overrides.
- Fixed `betterpptx-mcp/engine.mjs` duplicate-slide handling so cloned chart slides get fresh chart package parts.
- Added static gates in `betterpptx-mcp/run-mc3-realworld-harness.mjs` and `betterpptx-mcp/verify-public-gallery-repair.mjs` for duplicate content-type overrides and shared chart relationship targets.

Hosting-cost status:

- This corrected corpus does **not** prove Cloud Run hosting cost because it ran against `http://127.0.0.1:3345/mcp` and used `--skip-gcp-snapshot`.
- Local run data is useful for feature quality, billing behavior, TTS load shape, and package integrity.
- Final cost/revenue decision still requires the same strict 100-file run against private Cloud Run staging with GCP cost/load snapshots enabled.

Current pricing posture:

- Do not finalize live Dodo product/pricing yet.
- Use 1,833.60 credits as the corrected local denominator for product-quality billing analysis.
- Next hard data requirement is private Cloud Run staging cost/load for the same workload, not more local deck generation.

Reason for reclassification:

- The 100 files are too repetitive/shallow to prove real BetterPPTX autoshowcase quality across all feature families.
- B15 narration generated notes-only decks because the deployed service still carried a stale `BETTERPPTX_TTS_PROVIDER=tone` setting and did not run the approved Piper voice path.
- The aggregate lacks strict feature-proof counters and design-quality gates across the saved PPTX packages.

Detailed evidence report:

- `outputs/mc3-500-slide-run/mc3-aggregate-20260605-03/report/mc3-pricing-quality-cost-report.md`

Infrastructure evidence retained:

- 100 PPTX files generated for infrastructure stress.
- 500 slides generated for infrastructure stress.
- 20 scenario families covered.
- 100/100 selected decks passed static package checks.
- 100/100 selected decks passed local desktop PowerPoint COM open-without-repair verification.
- Aggregate estimated credits: 1,000.8.
- Average credits per deck: 10.008.
- Average credits per slide: 2.0016.
- Tool latency total: 1,491.037 seconds.
- Deck wall elapsed total: 3,213.808 seconds.
- Deck p50/p90/p95/max: 31.367 s / 37.219 s / 37.850 s / 41.016 s.

Hosting-cost conclusion for the infrastructure run:

- Using the official Cloud Run us-central1 gross request-based rates for 1 vCPU + 1 GiB, the MC3 core run cost band is about `$0.0395` to `$0.0852`.
- Host-only cost per estimated credit is about `$0.0000395` to `$0.0000851`.
- Host-only cost per slide is about `$0.0000790` to `$0.0001703`.
- This excludes Dodo/payment fees, AI provider cost, real TTS cost, media provider cost, support, abuse headroom, tax, refunds, and engineering/deploy overhead.

Billing conclusion for the infrastructure run:

- Dodo test-mode credit deduction is working.
- The Firestore queued-usage reconciler is fixed and currently reports no queued usage left. Post-deploy execution `betterpptx-billing-reconcile-once-tqc62` on private commit `216e964` returned `attempted=0 ingested=0 skipped=0 failed=0`.
- Dodo ledger snapshots show provider-side credit deductions and a remaining test balance, but the current test customer was reused across smoke, pilot, failed, replacement, and aggregate runs. Therefore the aggregate should use the harness estimate as the clean pricing denominator.
- Added `betterpptx-mcp/dodo-test-billing-snapshot.mjs` for clean future before/after provider snapshots.

Required follow-ups before live pricing:

- Rerun the full corrected 100-file / 500-slide autoshowcase corpus with strict feature, design, package, narration, repair, billing, and reporting gates.
- Use the approved Piper voice implementation from `plans/narration-tts-docker-executor-plan.md` for narration; no tone/test provider is allowed.
- Fix or keep disabled the B17 repair-risky chart/table semantic edit path.
- Run a clean billing calibration with a fresh Dodo test customer or before/after Dodo provider snapshots.
- Keep MCP max instances at 1 until shared edit/session/idempotency state exists.

Recommended pricing posture:

- Continue test-mode experimentation with subscription credits plus top-ups.
- Compare `$5` for 500 credits versus `$5` for 1,000 credits in test mode.
- Do not create or switch live Dodo products/pricing until the corrected autoshowcase data exists and the owner explicitly approves the live step.
