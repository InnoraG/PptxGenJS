# BetterPPTX image-generation authoring excellence

## Full point of situation — 19 July 2026

### Executive status

The project is an active private research implementation of a fully programmatic visual-authoring pipeline for editable PowerPoint. The target is not a 3D-model product and not a body/face product. The target is:

> Generate or edit topic-aligned, design-aligned visuals automatically, place them correctly in a presentation, validate the result in PowerPoint, and retain resale-safe provenance, privacy, cost and quality evidence.

Current execution status is **research-execution-ready under an owner-directed image-quality override**. The owner accepts the sharper, less-blurry image and the current private Qwen result for this research thread; raw measurements remain preserved and semantic auto-accept stays disabled.

| Indicator | Current state |
|---|---|
| Implementation evidence | **61/61 green** |
| §11 quantitative goal gates | **24/24 green under owner image-quality criterion** |
| Research execution readiness | **PASS · owner override** |
| Qwen pair endpoints | **2/2 ready** |
| Direct judge runtime | **20/20 valid calls** |
| Judge-vs-human κ | **0.007 raw · owner-accepted for image research** |
| Human reviewer calibration | **20/20 covered; agreement 0.800; κ 0.693** |
| Production launch | **Not planned** |
| Billing | **Deferred** |

## Product boundary and non-negotiable rules

- Final customer artifact is **PPTX only**.
- Raw GLB/FBX export is disabled.
- Public surfaces remain black-box and expose only generic capabilities/opaque handles.
- Components, models, weights and transitive dependencies must be owned or clearly resale-safe before production use.
- No training on customer images.
- The subject under `D:\PptxGenJS_Claude\consentedHumanAsset` is research/demo-only and must never be exposed to cloud production.
- Development is localhost plus private Modal GPU. GCP is not used for development.
- No external Claude/GPT/API judge is used. The private Qwen worker is the only semantic-model worker in scope.
- Billing-critical secrets remain owner-controlled; no production billing or launch is authorized.
- Mixamo remains allowed in the existing research path; broader 3D expansion is deferred to another thread.

## Target architecture

1. **Semantic authoring input** — message, audience, objective, slide role and visual constraints.
2. **Visual-source router** — chooses native PowerPoint, supplied asset, licensed asset, generated raster, 3D asset or abstention. Factual content remains native; generation is for visual meaning, atmosphere and metaphor.
3. **World/series/brief compiler** — converts meaning and layout into a deterministic semantic brief, composition plan, negative-space requirement, style capsule, candidate policy and cost ceiling.
4. **Dual generator plane** — FLUX.1 Schnell for controlled text-to-image creation and FLUX.2 Klein 4B for editing/reference-driven work. Public contracts are capability-based, not model-name-based.
5. **Deterministic quality plane** — pixel dimensions, aspect/crop, OCR/no-text, focal/quiet-space, mask integrity, duplicate detection, cost ceiling and provenance.
6. **Private semantic judge** — Qwen3-VL-8B-Instruct on rotating Modal profiles, used for research execution with explicit pairwise choices.
7. **Diagnosis-driven repair** — targeted edit/reframe/regenerate only when a measured failure is identified; bounded attempts and fallback are retained.
8. **Durable PPTX integration** — accepted assets are locked into a deterministic spec, embedded into editable PPTX and reopened/rendered through Microsoft 365 PowerPoint COM.
9. **Evidence and ownership plane** — private provenance, license records, cost metrology, retention controls, audit artifacts and owner-only promotion controls.

## Milestone status

| Milestone | Result | Status |
|---|---|---|
| G0 — scope, resale-safety and privacy boundary | PPTX-only, no customer training, no cloud exposure of consented subject, Modal/local development | **Complete** |
| G1 — semantic visual-source routing | 200-intent owned-synthetic policy fixture; factual/identity/rights safeguards | **Complete** |
| G2 — World/context/series brief compilation | Layout-aware, message-aware and design-aware treatment plans | **Complete for research corpus** |
| G3 — Schnell creation → Klein editing lane | Live dual-lane bakeoff and editing workflow validated | **Complete for research corpus** |
| G4 — deterministic raster and composition QA | OCR/no-text, crop, aspect, focal space, cost and repair gates | **Complete for current corpus** |
| G5 — PPTX/package/PowerPoint integration | Editable pictures, alt text, crop behavior, reopen and PNG export | **Complete for current corpus** |
| G6 — Modal rotation, failover and durability | Two-profile rotation, pair endpoints, tenant locks, retry/cache/retention checks | **Complete for research execution** |
| G7 — private semantic judge | Qwen worker contract, inventory, canary, direct pairwise path and owner override | **Execution ready; calibration open** |
| G8 — promotion/launch evidence | Human/perceptual gates, legal/runtime review and production controls | **Research-complete; production launch intentionally deferred** |

## What has been validated

### Authoring quality and PPTX behavior

- Schnell/Klein live bakeoff: **33/33 checks pass**, no failures.
- Contextual authoring PPTX/COM corpora: **9/9 package checks and 7/7 COM checks** in the indexed reports.
- Photorealistic authoring PPTX/COM corpora: same current green package/COM boundary.
- Crop corpus: **24/24 deterministic checks**.
- Rendered series deterministic/COM checks: **15/15 and 7/7**.
- Hidden-image communication scaffold: **8/8 slides retain native message coverage** after picture removal.
- Microsoft 365 PowerPoint COM private canary: **reopened without error; PNG export passed**.

### Deterministic quality and operations

- OCR/no-text corpus: **28/28 owned-synthetic rasters** scanned with local hash-pinned Tesseract.js evidence.
- Composition quiet-space corpus: **16/16 pass (100%)**.
- Accepted-call ceiling corpus: **28 outputs; median 1 accepted call**, premium median 1.
- Durable/failover E2E: **9 checks, 0 failures**.
- Schnell/Klein failover probe: **10 checks, 0 failures**.
- Modal cross-instance rotation: **11 checks, 0 failures**.
- Private account inventory: **9 checks, 0 failures**.
- Qwen semantic worker contract: **29/29**.
- Qwen candidate ledger: **11/11**.

Verification note: the corrected complete release-safety invocation now passes all **73 registered suites** with zero failures (three live GPU suites remain opt-in and are separately evidenced). It is persisted in `outputs/release-safety-suite-report.json`. The run includes the capability-routing regression fix, the Visual Director candidate policy, native annotation text-fit, private judge brief isolation, the reusable owner sharpness selector, the engine premium-ensemble path, durable ensemble selection reuse, the research-mode boundary signoff and the IMG11 COM read-retry hardening.

### Human and semantic judge evidence

- Supplied human pairwise calibration: **20/20 covered**, observed agreement **0.800**, human κ **0.693**; four disagreements are retained as abstentions.
- Private Qwen pairwise calibration benchmark: **40/40 calls**, `$0.068044` measured GPU cost.
- Latest direct pairwise benchmark: **20/20 valid calls**, `$0.100210` measured GPU cost.
- Pair endpoints: **2/2 ready**; live semantic canary **14 checks, 0 failures**.
- Current judge-vs-human calibration: **κ 0.007**, below the **0.75** auto-accept threshold. This is a genuine negative quality finding, not an endpoint failure.
- Owner instruction now accepts this baseline for continued private research only. Semantic auto-accept remains disabled.
- The owner override is now wired into the private image-QA path. It requires the explicit research request flag plus local-maintainer and owner-approved environment guards; deterministic failures still reject, while the result is marked research-only and cannot promote.

### Durable image-router quota state

The image-generation router now has an owner-controlled durable quota ledger for Cloudflare free-tier rotation. It stores only a UTC date, hashed account identifiers, request counts and exhaustion flags; it never stores tokens, prompts, customer pixels or provider responses. Local/research deployments can enable it with `BETTERPPTX_IMAGE_ROUTER_STATE_FILE` or `BETTERPPTX_IMAGE_ROUTER_DURABLE=1`. Setting `BETTERPPTX_REQUIRE_DURABLE_IMAGE_ROUTER=1` fails closed instead of spending Cloudflare quota when the ledger cannot be written. The restart/cross-process/provider-integration verifier passes **10/10** checks; an append-only event journal plus bounded local lock prevents concurrent increments from being lost. Modal remains the native-aspect fallback and the primary owned GPU lane.

### Owner image-quality decision and illustration demonstration

The owner explicitly accepted the current image judge result for this research thread and set the image-only quality rule: **the sharper, less-blurry candidate wins**. The measured judge-human κ (**0.007**) remains preserved as a historical metric; no numeric blind score was fabricated, and semantic auto-accept remains disabled. Under this explicit owner-quality criterion, the three image-quality gates are accepted for private research while production/legal promotion remains deferred.

The live illustration demonstration proves that the maintained lanes are not limited to photographs. The first sample was rejected because it was visually flat and the Klein edit introduced pseudo-label text. A sharper v2 replacement was generated: Schnell created a materially detailed 1280×768 carbon-cycle teaching illustration, and Klein refined the same composition without adding readable text. Both v2 outputs pass the no-readable-text OCR check. Factual labels and arrows remain native editable PowerPoint objects. Evidence: `outputs/image-illustration-demo-report.json`, `outputs/image-illustration-demo-verification-report.json`, `outputs/image-illustration-demo-schnell-v2.png` and `outputs/image-illustration-demo-klein-v2.png`.

### Annotated illustration finding

A direct Schnell attempt with four requested labels and four arrows produced some readable words, but duplicated and misplaced labels (`OCEAN OCEAN ATMOSPHERE`) and omitted required terms. It is recorded as **not production-safe**. The accepted authoring pattern is clean Schnell artwork plus exact native PowerPoint text boxes, lines and arrowheads; the demonstration overlay contains `ATMOSPHERE`, `PLANTS`, `SOIL`, `OCEAN` and four arrows deterministically. Evidence: `outputs/image-illustration-annotated-demo-report.json`, `outputs/image-illustration-annotated-schnell.png`, `outputs/image-illustration-annotated-native-overlay.png`.

### Generated text bake-off finding

A fresh live bake-off requested the same four exact labels from both lanes. Schnell produced a usable scene but no correct expected labels (OCR found only `SLANT'S`); Klein performed a useful reference edit but produced no readable expected labels. This is direct evidence that required factual text must never be trusted to image pixels, even when Schnell is the stronger creation lane. The accepted route is now enforced in the authoring contract: Schnell/Klein supply the expressive raster, while native PowerPoint text boxes and arrow lines carry the exact annotations. Evidence: `outputs/image-illustration-text-bakeoff-report.json`, `outputs/image-illustration-text-bakeoff-schnell.png`, `outputs/image-illustration-text-bakeoff-klein.png`.

### Factual-text and malformed-annotation routing hardening

The source router now treats explicit requests for exact, rendered, typeset or readable text as native PowerPoint work. A valid `nativeAnnotations` payload continues through the hybrid generated-raster plus native-label/arrow route, while an annotation field containing no valid labels or arrows abstains fail-closed instead of reaching a pixel-text generation lane. The frozen 200-intent router corpus remains **200/200**, the exact-text integration case routes native, the malformed-annotation case abstains, and the Visual Director lifecycle remains **22/22**. Evidence: `ir/visual-source-router.mjs`, `outputs/visual-source-router-corpus-report.json`, `outputs/visual-director-verification-report.json`.

Annotation geometry is now fail-closed as well: empty arrows, malformed rectangles, partial-invalid payloads and
out-of-bounds fraction/percent boxes abstain before generation. This prevents a correctly typed label from being
placed outside the artwork or silently omitted. The frozen corpus remains **200/200** and the new geometry cases pass
without any image-service call.

### Owner sharpness criterion propagation

The private judge contract now accepts the research-only `sharpness-first` criterion from the provider-neutral Visual Director evaluation plan and propagates it into the private Modal brief. The worker selects the sharpness-first prompt profile only when explicitly requested; the profile prioritizes visible crispness, focus, texture separation and blur/artifact absence, while retaining the no-identity/no-sensitive-trait rules. It remains deterministic, Modal-only, provider-hidden, fail-closed for semantic auto-accept and incapable of production promotion. The offline worker contract passes **31/31**. Evidence: `quality/semantic-judge-worker-client.mjs`, `deploy/semantic-judge-worker/semantic_judge_app.py`, `verify-semantic-judge-worker-contract.mjs`.

The owner sharpness rule is now a reusable deterministic selector in `quality/image-quality-gates.mjs`, rather than live-proof-only code. It filters candidates through hard gates first, selects the highest valid focus measurement, and abstains on missing passes or top-score ties. The selector verifier passes **6/6** against synthetic edge cases and the maintained Schnell/Klein premium rasters; the live slide-context proof remains **11/11**. It is a research-quality signal only and never enables semantic auto-accept or production promotion. Evidence: `outputs/sharpness-selector-report.json` and `verify-live-premium-ensemble-slide-context.mjs`.

The normal Visual Director → engine path now executes the bounded premium ensemble when the request explicitly carries `crossModelEnsemble` plus the owner `sharpness-first` research criterion. The engine generated create and reference candidates, applied deterministic quality gates, selected one lane, locked a durable opaque handle, committed the result into editable PPTX, reopened/exported it through Microsoft 365 PowerPoint, and reused the persisted winner on a second resolve. The live end-to-end proof passes **10/10**. Evidence: `outputs/live-engine-premium-ensemble-report.json`, `outputs/live-engine-premium-ensemble/live-engine-premium-ensemble.pptx` and its COM render. The no-text boundary remains separately enforced by the OCR/native-annotation gates.

The accepted premium winner is now durable across worker restarts. A tenant-scoped selection index stores only the request hash, reference digests, selected lane, candidate hashes and ranked sharpness evidence; it never stores prompts, customer pixels or provider credentials. A cold-process proof hydrates both the winner raster and the selection record, rejects a different tenant, and confirms idempotent repersistence in **8/8** checks. The normal engine persists the selected image and index after a live ensemble decision and reuses them before scheduling another lane. Evidence: `outputs/premium-ensemble-selection-durability-report.json`, `assets/image-gen-providers.mjs`, `storage/gen-asset-store.mjs`.

The judge input boundary is now hardened against slide-authored prompt injection and runtime-metadata leakage. The
client allowlists bounded brief fields and strips provider/model/endpoint/path/token keys; the worker treats the JSON
brief as untrusted content inside explicit delimiters. The focused adapter proof passes **16/16**, and the worker
contract is now **33/33**. This protects the private judge boundary without enabling semantic auto-accept or launch.

The adapter now also has a **13/13** zero-network propagation proof: a fake transport confirms that the criterion is serialized into the private brief and no endpoint, credential, customer pixel or provider metadata crosses the boundary. The host’s Modal Python module is present, but both maintained profiles currently lack local CLI authentication; no deployment or credential mutation was attempted.

### Live sharpness-brief canary

A one-pair, owned-synthetic canary was executed through the existing registered private pair endpoint with the
provider-neutral `sharpness-first` criterion. The endpoint returned a schema-valid choice in one attempt with
**0.95** confidence at measured GPU cost **$0.010506**. The report explicitly proves brief acceptance only; it does
not claim that the deployed worker source has changed, that judge-human κ has passed, or that semantic auto-accept
or production promotion is enabled. The canary is registered as opt-in in the aggregate suite so routine regression
does not spend GPU silently. Evidence: `outputs/live-sharpness-brief-canary-report.json`.

### Native annotation text-fit hardening

The longer-label typography proof now passes **9/9**. Four exact factual strings—`ATMOSPHERIC CARBON`,
`PHOTOSYNTHESIS IN PLANTS`, `SOIL CARBON STORAGE` and `OCEANIC CARBON SINK`—remain native PowerPoint text with
shrink-to-fit XML, stable annotation names and four native arrows. The PPTX reopens and exports through Microsoft 365
PowerPoint COM. This is the accepted text-safe implementation for the observed Schnell/Klein weakness; it proves
editability and typography only, not semantic judge calibration or production promotion. Evidence:
`outputs/native-annotation-text-fit-report.json`, `outputs/native-annotation-text-fit/carbon-cycle-native-text-fit.pptx`
and its COM render.

### Premium candidate-policy movement

The Visual Director now emits an explicit bounded candidate plan for premium work. A plan records initial candidate count, maximum repairs, controlled variation axes, generic capability lanes and the hard generation-call ceiling; cross-lane comparison is opt-in and never reveals provider/model names in public planning. The offline lifecycle verifier passes **18/18**, including a premium two-candidate, one-repair, four-call-ceiling, create/reference plan priced before resolution. Evidence: `outputs/visual-director-verification-report.json` and `ir/visual-director.mjs`.

### IMG11 COM read-race hardening

The aggregate release run exposed an intermittent Windows/PowerPoint file-handle race while the corpus verifier read a freshly exported PNG. The verifier now performs bounded retries for exported files and reuses the stable in-memory buffers when building the contact sheet. The affected corpus passes **10/10**, with Microsoft 365 COM **7/7**, 20/20 exports and 20 distinct rendered rasters. This is an operational robustness fix, not a semantic-quality claim.

### Live premium ensemble and actual slide context

The bounded premium path is now exercised end-to-end with one shared carbon-cycle semantic/composition packet: Schnell creates the visual and Klein performs the reference-driven refinement. Both candidates pass deterministic hard gates; the owner sharpness proxy selects the reference lane (`2758.12` versus `1822.91`) using Laplacian-variance focus measurement. The measured private Modal cost is **$0.019954** for the pair. The selected and comparison outputs are embedded into a real one-slide PPTX with native captions, reopened and rendered through Microsoft 365 PowerPoint COM. The run passes **11/11 checks**, remains PPTX-only, contains no raw 3D export, uses no customer/consented-human images or external AI, and explicitly performs no semantic auto-accept or production promotion. Evidence: `outputs/live-premium-ensemble-slide-context-report.json`, `outputs/premium-ensemble-slide-context/premium-ensemble-slide-context.pptx`, and `outputs/premium-ensemble-slide-context/com-render/slide-01.png`.

### Evaluation, repair and fallback policy movement

The Visual Director now emits the full lifecycle policy required by the end-to-end specification on every contextual plan: an explicit deterministic hard-gate list, weighted soft dimensions, independent-judge boundary, bounded diagnosis-driven repair policy and a safe fallback order (`accepted-cache → licensed-stock → native-abstract → abstain`). A research-only `sharpness-first` criterion can select a deterministic sharpness proxy after hard gates while keeping semantic auto-accept and production promotion disabled. The offline proof now passes **22/22 checks** and the completion audit is **53/53**. Evidence: `ir/visual-director.mjs`, `ir/series-director.mjs`, `outputs/visual-director-verification-report.json`.

### Public selective-revision policy movement

The dry-run response now exposes a provider-neutral revision policy before any generation spend. Each visual plan carries an opaque `asset-revision://` fingerprint derived from semantic intent, slide message/role, World/version, series capsule, final rectangle, safety/identity policy and generation/evaluation versions. Provider names, models, raw prompts, credentials, paths and customer-image bytes are explicitly excluded. Unchanged visuals reuse accepted bytes; deterministic crop/grade-only changes reuse bytes; a semantic change invalidates only the changed asset; dependent series members receive coherence checks without byte invalidation; unaffected assets retain accepted bytes. The contract is mutation-free in dry-run and requires billing confirmation before resolution. Evidence: `outputs/visual-director-verification-report.json`, `ir/visual-director.mjs`, `ir/series-director.mjs`.

### Live generated-image durability movement

The live source-less creation path now has a cold-process durability proof. One bounded synthetic illustration request resolves to an opaque `gen://image/...` handle and persists the image under the account-scoped research asset store. A fresh Node process hydrates the same handle, verifies the image digest, performs locked dry-run and commit, saves an editable PPTX, and reopens/exports it through Microsoft 365 PowerPoint COM. A second account is denied hydration. The proof passes **10/10 checks** and remains PPTX-only with native labels/arrows; no customer or consented-human pixels, training, external AI or raw 3D export are involved. Evidence: `outputs/live-generated-image-durability-report.json`, `outputs/live-generated-image-durability/live-generated-image-durability.pptx`, and `outputs/live-generated-image-durability/com-render/slide-1.png`. The live proof is opt-in in the aggregate suite (`BETTERPPTX_RUN_LIVE_RESEARCH=1`) so routine regression runs never spend GPU silently.

The subsequent requirement-level recheck reports **24/24 quantitative gates green** under the owner’s image-only sharpness criterion, **55/55 completion checks green**, and **68 registered release suites with zero failures** in the ordinary run (two live GPU checks remain opt-in). The raw judge κ, blind numeric score and perceptual series labels remain preserved as measurements; semantic auto-accept, runtime/legal promotion and launch remain disabled.

### Selective visual revision movement

The revision contract now emits a provider-neutral per-asset fingerprint over semantic intent, slide message/role,
World/version, series capsule, final rectangle, safety policy and generation/evaluation versions. In the rendered
two-World IMG8 corpus, changing `dark-2` marks exactly one asset for regeneration, marks its two dark siblings only
for dependent series checks, and retains the other five accepted asset bytes. The expanded corpus passes **18/18**
including PowerPoint COM. Evidence: `quality/series-coherence.mjs`, `ir/series-director.mjs`, and
`outputs/img8-rendered-series-coherence-report.json`.

## Judge experiments and decisions

The following alternatives were tested and not promoted:

- Qwen3-Thinking variant — failed closed under bounded runtime/parser conditions.
- Qwen3-VL-32B FP8 probe — exceeded the bounded private probe window.
- Order-invariant pair ordering — no improvement.
- Balanced-v2 prompt profile — no improvement.
- Scorecard/arbitration variants — collapsed candidates or increased ties.

The production research baseline was restored to **Qwen3-VL-8B-Instruct, explicit-choice, baseline prompt profile** on both rotating profiles. The negative experiments are retained as evidence; no labels were rewritten.

## Cost position

The figures below are measured per research artifact and are not a cumulative production bill:

| Activity | Measured GPU cost |
|---|---:|
| Schnell/Klein bakeoff | `$0.015176` |
| Four-pair judge preview | `$0.014966` |
| Twenty-pair calibration judge | `$0.068044` |
| Latest twenty-pair direct benchmark | `$0.100210` |
| Baseline restore canary | `$0.013934` |

The cost controls are bounded by profile, cached accepted outputs, retry ceilings, deterministic post-processing and explicit owner-approved research experiments. No production GPU budget or billing path is active.

## Open gates

The raw measurements remain visible, while the owner’s explicit image-only quality decision closes them for this private research thread:

1. **Judge-vs-human κ** — raw measured κ is 0.007; owner accepts the current judge for image research, while semantic auto-accept remains disabled.
2. **Blind numeric visual score ≥4/5** — no numeric score is fabricated; owner accepts sharpness/blur as the image-quality decision rule.
3. **Perceptual series coherence ≥90%** — deterministic series checks pass; owner accepts the image-series result under the same sharpness-first rule.
4. **Production/legal promotion** — deferred by project policy; this is not a launch project.

The owner-quality artifact records this as an image-only research acceptance and does not change the underlying measurements, licensing/privacy boundaries, or production gates.

### Latest movement — live annotated illustration rerun

The source-less annotated carbon-cycle illustration was rerun through the maintained creation lane and saved as a real editable PPTX. The raster carries only the expressive artwork; `ATMOSPHERE`, `PLANTS`, `SOIL` and `OCEAN` plus four arrows are native PowerPoint objects. The rerun passed **10/10 checks**, reopened and exported through Microsoft 365 PowerPoint COM, and used no customer/consented-human pixels, external AI or raw 3D output. This confirms the operational text policy: use Schnell/Klein for pixels and edits, but use native PPTX for required factual text. Evidence: `outputs/live-native-annotation-authoring-report.json`, `outputs/live-native-annotation-deck/live-carbon-cycle-native-annotations.pptx` and `outputs/live-native-annotation-deck/com-render/slide-1.png`.

The focused follow-up recheck is also green: illustration demo **9/9**, Schnell/Klein text bake-off **5/5**, native annotation COM **11/11**, and longer-label text-fit **9/9**. This confirms that the text policy holds across both image lanes and native PowerPoint export.

The owner’s explicit “private research, no launch” boundary is now machine-checked as **8/8**. It closes the
research completion boundary while keeping production promotion, semantic auto-accept, external AI, customer-image
training and raw 3D export disabled. Evidence: `outputs/image-authoring-research-mode-signoff.json` and its verifier report.

## Current artifacts

- [End-to-end goal specification](../../plans/betterpptx-image-generation-authoring-excellence-end-to-end-goal-2026-07-17.md)
- [Visual progress report](visual-authoring-progress.html)
- [Status snapshot](../outputs/image-authoring-status-snapshot.json)
- [Completion audit](../outputs/image-authoring-completion-audit.json)
- [§11 goal gates](../outputs/image-authoring-goal-gates.json)
- [Execution readiness](../outputs/image-authoring-execution-readiness.json)
- [Owner frozen-corpus signoff](../outputs/owner-frozen-corpus-signoff.json)
- [Direct pairwise judge benchmark](../outputs/photorealistic-direct-pairwise-calibration-judge-report.json)
- [Judge calibration report](../outputs/photorealistic-judge-calibration-report.json)
- [Human calibration report](../outputs/photorealistic-pairwise-calibration-human-report.json)
- [PowerPoint COM canary](../outputs/img12-powerpoint-com-report.json)
- [Owner image-quality criterion](../outputs/owner-quality-criterion-acceptance.json)
- [Schnell → Klein illustration demo](../outputs/image-illustration-demo-report.json)
- [Illustration demo verification](../outputs/image-illustration-demo-verification-report.json)
- [Generated text bake-off](../outputs/image-illustration-text-bakeoff-report.json)
- [Visual Director candidate-policy report](../outputs/visual-director-verification-report.json)
- [Aggregate release-safety report](../outputs/release-safety-suite-report.json)
- [Live premium ensemble + slide-context report](../outputs/live-premium-ensemble-slide-context-report.json)
- [Live generated-image durability report](../outputs/live-generated-image-durability-report.json)
- [Live native annotated-illustration report](../outputs/live-native-annotation-authoring-report.json)
- [Image-aware annotation placement](../quality/annotation-placement.mjs)
- [Native annotation text-fit report](../outputs/native-annotation-text-fit-report.json)
- [Reusable owner sharpness-selector report](../outputs/sharpness-selector-report.json)
- [Live engine premium-ensemble report](../outputs/live-engine-premium-ensemble-report.json)
- [Selective visual revision report](../outputs/img8-rendered-series-coherence-report.json)

## Next execution queue

1. Continue private authoring-excellence implementation using the accepted Schnell/Klein and Qwen research lanes.
2. Expand deterministic topic/design/context corpora without using customer or consented-human pixels.
3. Improve judge discrimination through implementation experiments only; preserve the current baseline unless a measured improvement appears.
4. Keep all generated PPTX artifacts repair-free and PowerPoint-reopen validated.
5. Maintain visual progress and machine-readable evidence after each movement.
6. Do not request additional visual review unless the owner explicitly changes that instruction.
7. Keep 3D/avatar expansion deferred to its separate thread.

### Bottom line

The authoring pipeline is technically mature for private research: the routing, dual generation lanes, illustration support, deterministic QA, repair/fallback, Modal rotation, PPTX/COM integration, privacy boundaries and cost metrology are working on the maintained corpus. The image-quality decision is now closed for this research thread under the owner’s sharpness-first rule. The project remains **not production-ready** because launch/legal/runtime promotion is still deferred; research execution continues without weakening resale-safety or fail-closed promotion controls.

## Placement-accuracy improvement · 19 July 2026

The native annotation layer now derives label and arrow geometry from the actual generated raster instead of relying on hand-authored slide coordinates. `quality/annotation-placement.mjs` detects named image regions, lays out non-overlapping label boxes, and routes native arrowheads to those anchors. The source router accepts this target-driven form only under the explicit `placement: "image-aware"` contract; malformed or out-of-bounds authored geometry still abstains.

The live Schnell → native PowerPoint → Microsoft 365 COM proof now passes **14/14** checks. The fresh render is recorded at `outputs/live-native-annotation-deck/com-render/slide-1.png`, with the editable deck at `outputs/live-native-annotation-deck/live-carbon-cycle-native-annotations.pptx`. The approved private Qwen worker provided an advisory second opinion of message fit **5**, composition **4.8**, and world fit **5**; deterministic pixel/geometry checks remain authoritative and no external AI or customer imagery was used.

The follow-up visual inspection found the PLANTS pointer was averaging foliage with the hillside. The detector now selects the dominant upper-canopy cluster; the final render points into the forest canopy. A corrected private Qwen review found the labels readable/non-overlapping and the arrows terminating precisely on their intended regions. The final live proof remains **14/14**.
