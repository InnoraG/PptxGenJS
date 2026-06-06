# BetterPPTX MC3 Pricing, Quality, and Cost Report

Date: 2026-06-06

Status: **Reclassified on 2026-06-06.** The prior MC3 aggregate is valid as private staging infrastructure/billing stress evidence, but it is **not** accepted as the product-quality autoshowcase corpus and must **not** be used to finalize live Dodo pricing.

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
