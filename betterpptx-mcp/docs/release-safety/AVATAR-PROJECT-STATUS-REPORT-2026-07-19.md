# BetterPPTX Avatar Presenter — Project Status Report

Date: 2026-07-19 16:14 Africa/Nairobi  
Status: **Private R&D / controlled maintainer demo only — not production-ready**  
Scope: **PowerPoint-native narration-recording avatar**

## Executive decision

The LivePortrait + MuseTalk lane is operational as a private research capability and can produce a PowerPoint-safe talking-head MP4 through the complete `render_job → job_status → attach_result → validate → save` path. The paired Modal worker rotation and the staging Cloud Run deployment are healthy. Both Modal images now use the pinned MediaPipe Face Landmarker mask adapter and pass fresh authenticated 200/MP4 canaries.

Public model-backed rendering must remain disabled by owner policy. The product owner’s commercial model/license approval is recorded for the LivePortrait+MuseTalk talking-head scope. The legacy InsightFace detector and BiSeNet face-parser checkpoints are absent; the worker uses pinned YuNet for crop detection and pinned MediaPipe Face Landmarker for the MuseTalk mask. MuseTalk’s official README grants commercial use for its trained model. The license ledger, 65-component SBOM, immutable pins, and both deployed images now pass the licensing/provenance checks. Provider invoice coverage and independent cross-representation identity/lip-sync quality remain separate production gates.

## Product boundary and alignment

“Avatar” in this project means the presenter used by PowerPoint narration recording. LivePortrait + MuseTalk produces a rendered talking-head video that is embedded into the PPTX. It is not an editable PowerPoint 3D object.

Native 3D is a separate presenter representation. The target product is one `PresenterIdentity` and one narration/timeline contract that can deliberately select talking-head video, native 3D, hybrid, poster, audio-only, or no presenter per slide. The production 3D implementation is exclusively Meshy → Mixamo; the self-hosted TRELLIS.2/UniRig/DRTK path is PoC/flow-test evidence only.

Official provider-term research is recorded at `research-demos/2026-07-18-meshy-avatar/visual-artifacts/release-gates/meshy-mixamo-commercial-terms-review-20260719.json`. Meshy documents paid-plan commercial output use, while its general Terms still require input rights/consent, prohibit service resale, and contain training/retention language that must be reconciled with the API page. Adobe’s Mixamo FAQ supports commercial project use, but the Mixamo Additional Terms prohibit AI/ML training use and Adobe’s general Content Files terms require an integrated end-use boundary rather than standalone raw asset redistribution. Production therefore permits only an integrated PowerPoint end use and keeps the owner decision open until the exact account/order and input-consent record are attached.

## Current readiness

| Readiness view | Current assessment | Meaning |
|---|---:|---|
| Public production | **74/100** | Do not launch; billing, identity-quality, and Meshy → Mixamo native-3D clearance gates remain open. |
| Controlled maintainer demo | **80/100** | Suitable for bounded private synthetic demonstrations with pinned tooling. |
| Unified 2D/3D presenter | **45/100** | Contract/lowering and local talking-head plus native-3D playback evidence pass; cross-representation identity review and owner gates remain open. |
| Automated readiness aggregate | **30 PASS / 3 OPEN / 0 BLOCKED** | 33 checks total; public enablement remains false. The alpha-only, public black-box, native-3D owner-clearance runtime gate, and 22-check presenter release corpus contracts are PASS; Meshy → Mixamo production clearance is explicitly open. |

### Presenter asset ingestion

The ingestion contract is intentionally tolerant. A preferred submission contains up to four consistent full-body views plus one dedicated face image. A dedicated face image is recommended but optional; without it, the front body view can produce a deterministic fallback crop. A/T pose, mild blur, uneven lighting, complex backgrounds, and even an incomplete body frame generate warnings rather than automatic rejection; the face branch can proceed while the Meshy branch is marked lower confidence. Only unreadable media, unresolved multiple subjects, absent usable body/face evidence, or severe ambiguity block processing.

Original uploads are immutable and hashed. The body branch sends either the original pixels or an alpha-only background-removed derivative to Meshy, with the provider request contract forcing `image_enhancement:false`, `remove_lighting:false`, body-only references, and no Meshy-to-lip-sync path. A new fixture-level alpha-only probe passes: RGB pixels, the identity ROI, and the authoritative source hash remain unchanged while alpha varies; evidence is `betterpptx-mcp/outputs/presenter-alpha-only-identity-preservation-report.json`. The face branch permits only crop, pad, and resize before LivePortrait/MuseTalk; it forbids generative restyling, beautification, face repair, and Meshy texture round-trips. The expanded 10-scenario synthetic-identity corpus is recorded at `betterpptx-mcp/outputs/presenter-ingestion-corpus-report.json` and explicitly exercises framing, pose, lighting, segmentation confidence, and cross-view consistency as warning-only signals. The pinned MediaPipe multi-view probe detects 9/12 angles from the consented face sheet, preserves the source hash, and classifies the rear/near-profile misses as body-only evidence (`betterpptx-mcp/outputs/mediapipe-consented-multiview-report.json`). The original-vs-alpha-only request dry-run contract passes at `betterpptx-mcp/outputs/presenter-meshy-ab-dryrun-report.json`; no live Meshy task was attempted because no credential is configured. Broader consented-upload corpus testing and live Meshy A/B remain open.

A real consented local/private-research subject (`local-research-demo-subject-001`) was also tested without production or public processing: the pinned MediaPipe model produced 478 landmarks on each of 9 detected angles, the source hash remained unchanged after deterministic cropping, and both private rotated workers returned HTTP 200 MP4s. Evidence: `betterpptx-mcp/outputs/mediapipe-consented-subject-crop-report.json`, `betterpptx-mcp/outputs/mediapipe-consented-multiview-report.json`, and `betterpptx-mcp/outputs/consented-subject-avatar-canary-report.json`. This is one-subject evidence, not a completed multi-user corpus or independent visual sign-off.

The separate native-3D authoring gate is not being conflated with the talking-head gate: local Joe/Louise GLB/poster/PowerPoint evidence passes only as self-hosted PoC/flow testing. Production authoring is exclusively Meshy → Mixamo; no live Meshy provider credential is configured here and the native-3D owner decision worksheet remains open. No live Meshy task is claimed.

The provider-neutral runtime director now has a six-lane corpus report at `betterpptx-mcp/outputs/presenter-contract-report.json`: talking-head, native 3D, hybrid, poster fallback, audio-only fallback, and absent presenter all lower deterministically; active lanes require the matching PowerPoint-native operation, while inactive fallbacks remain explicit and fail-closed. The companion `betterpptx-mcp/outputs/presenter-media-playback-corpus-report.json` now proves the embedded talking-head MP4 and both product-owned native-3D playback paths.

The consolidated private release corpus at `betterpptx-mcp/outputs/presenter-release-corpus-report.json` passes 22/22 checks covering cold worker canaries, warm/cache replay, retry reclaim, timeout/cancellation fencing, both worker accounts, language/timing tests, the native-3D production-route guard, PowerPoint playback, the embedded talking-head plus native-3D media-playback corpus, all six presenter lanes, tolerant ingestion, alpha-only preservation, the consented angle probe, restoration fail-closed behavior, the Real-ESRGAN core-only/GFPGAN-disabled policy, the identity-preserving Meshy request contract, the frozen resale-safe baseline decision, fail-closed reviewer-decision validation, fail-closed billing-coverage import validation, paid-canary owner confirmation, independent-review packet readiness, and owner closure checklist integrity. It is mutation-free and makes no paid provider call.

Mouth-region restoration is deliberately excluded from the resale-safe baseline. The optional-candidate artifact remains useful for future experiments: Real-ESRGAN core is recorded as a BSD-3-Clause candidate only when `--face_enhance` is disabled (therefore no GFPGAN import/download), but its checkpoint/provenance and mouth-masked temporal tests are not required for the frozen baseline. No restoration stage is present in the worker.

The final engineering decision is recorded in `betterpptx-mcp/docs/release-safety/AVATAR-RESALE-SAFE-PIPELINE-DECISION-2026-07-19.json` and verified again by `betterpptx-mcp/outputs/avatar-resale-safe-pipeline-report.json`: use the frozen YuNet → LivePortrait → MediaPipe → MuseTalk talking-head path, and reserve production native 3D exclusively for Meshy → Mixamo. The self-hosted TRELLIS.2 → UniRig → DRTK path is only PoC/flow-test evidence. Face enhancers remain disabled; Meshy/Mixamo production clearance remains an explicit owner/provider gate.

The runtime policy is now fail-closed in code: production mode rejects the single-image self-hosted route and requires the ordered multi-view Meshy → Mixamo route. Production personalized native 3D additionally requires explicit owner clearance and a configured Meshy provider; otherwise the request fails closed. The Cloud Run template and active staging revision `betterpptx-mcp-staging-00073-b4n` set `BETTERPPTX_NATIVE3D_MODE=production` plus `BETTERPPTX_NATIVE3D_OWNER_CLEARANCE=required`; the deployed-revision verifier passes at 100% traffic with `/health` HTTP 200.

The focused native-3D route test was re-run on 2026-07-19 and passes 8/8: production requests require ordered multi-view Meshy → Mixamo input even when the caller omits the production flag under the deployed production environment, plus explicit owner clearance and a configured Meshy provider; single-image self-hosted requests remain explicitly PoC/flow-test only. The mutation-free presenter release corpus was re-run after the boundary audit and remains 22/22 PASS.

The actual public tool dispatch was also exercised in production mode by `betterpptx-mcp/verify-rigged3d-gen.mjs`: 2/2 integration guards pass, rejecting both a single-image self-hosted call and an uncleared personalized call before provider work. The full offline rigged-3D verifier is 67/67 PASS.

The latest local safety refresh also passes weighted worker selection 4/4 (stable idempotency plus the configured 3:1 distribution contract), the offline rigged-3D verifier 67/67, the 22/22 presenter release corpus, the 16/16 serving-image contract, and the deployed public black-box scan. These checks do not close the separate distributed quota/cost, provider billing, independent-review, or Meshy/Mixamo owner gates.

The current completion audit was re-run after these changes: the automated aggregate remains **30 PASS / 3 OPEN / 0 BLOCKED**, while the requirement audit remains **12/15 PASS** with provider billing, independent identity review, and Meshy→Mixamo production authoring still intentionally open. The native-3D-specific goal audit separately reports **8 PASS_LOCAL / 4 OPEN_OWNER / 1 BLOCKED_OWNER** because it includes requested-profile deployment, live health/rollback, provider operations, and rights/consent decisions. The Meshy release gate reports no configured provider and no live submission; this is an expected fail-closed owner state, not an engine failure.

The rotating-worker path now also has a local weighted-selection contract at `betterpptx-mcp/outputs/avatar-weighted-rotation-report.json`: 4/4 checks pass, the same idempotency key is stable, and a 3:1 owner-configured weight produces a 315:85 distribution without starving the lower-weight account. This improves future-proof rotation behavior; distributed quota/cost state remains a separate production gate and is not overstated as closed.

The quota/cost engineering gap now has a bounded secret-free ledger at `betterpptx-mcp/storage/avatar-worker-quota-state.mjs`: local reservation, idempotent replay, settlement/release, account isolation, and pre-fetch quota rejection pass 9/9 plus a mocked worker integration pass 5/5. Firestore deployment, owner-configured daily budgets, and provider-invoice reconciliation remain required before this can become a production gate.

The reviewed Cloud Run template and overlay now declare Firestore quota state, the quota collection, fail-closed enforcement, and a 120-second GPU estimate; the static serving-image contract passes 16/16. The pure production-config validator passes 5/5, rejecting local state, missing budgets, and undersized finite budgets while accepting explicit unbounded-metered mode. A production promotion still requires the owner to choose and deploy that explicit mode; accidental omission remains unable to render.

The read-only drift verifier reports the expected current state: template contract PASS, active staging revision quota settings missing/unverified, status `OPEN_OWNER_MODE_AND_REDEPLOY_REQUIRED`. No redeploy was attempted. The native-3D goal audit was rerun after correcting the release-corpus snapshot distinction and is back to **8 PASS_LOCAL / 4 OPEN_OWNER / 1 BLOCKED_OWNER** with tracker integrity PASS.

Fresh post-change checks pass: rotation preflight 6/6 with no mutation, local worker-state contract 5/5, the 30/33 readiness aggregate, and the live public MCP black-box scan. No public handle, customer image, or training artifact was created.

The native-3D public license response is also fail-closed: personalized Meshy → Mixamo results now return a provider-gated conditional license record until the owner plan/order, input-consent, integrated-end-use, and live acceptance gates are recorded; self-hosted results return the PoC-only record. This prevents a conditional provider output from being mislabeled as universally resale-cleared.

The independent-review handoff is now executable: the local review page exports a reviewer packet and `betterpptx-mcp/verify-avatar-identity-review-decision.mjs` rejects missing, incomplete, or inferred decisions. Current state remains `OPEN_REVIEWER_FILE_REQUIRED`, which is the intended fail-closed result until an independent reviewer submits PASS or FAIL.

The review page now explicitly identifies the primary synthetic decision target by source/poster/GLB/frame/package digests and tells the reviewer to inspect the repair-free PowerPoint narration playback for lip-sync; the supplemental consented-subject clips remain clearly labeled as non-substituting research evidence.

The billing handoff is likewise executable: `betterpptx-mcp/verify-avatar-provider-billing-coverage.mjs` validates a redacted owner export against captured execution IDs, GPU seconds, stable tags, and an explicit complete-window attestation. Current state remains `OPEN_OWNER_EXPORT_REQUIRED`; no cost allocation is inferred.

A fresh read-only Modal export now covers the same 2026-07-18 22:00–23:00 UTC canary window for both authenticated sessions (`telcomgapp` and the configured local profile `betterpptx-fluxworkerai`). The exporter now resolves the owner-facing `fluxworkerai` alias deterministically. Both A10G rows and stable product/service/pipeline/account tags are present; request-level invoice attribution and complete-hour coverage remain open, so billing is still fail-closed.

The owner-authorized read-only export was re-run during this verification and stored at `betterpptx-mcp/outputs/avatar-modal-billing-snapshot-reverify-telcomgapp-20260719.json` and `betterpptx-mcp/outputs/avatar-modal-billing-snapshot-reverify-fluxworkerai-20260719.json`. Both exports observed A10G rows and stable tags, emitted no secrets/customer data, and correctly report `perRequestAttribution:false`; they do not close the shared-App coverage or owner-approval gate.

The completion audit now covers 15 requirements: **12 PASS / 3 OPEN**. The three open gates are provider billing approval, independent identity review, and the required Meshy → Mixamo production native-3D authoring/clearance gate.

The upstream Real-ESRGAN documentation confirms that the general-purpose path is distinct from the optional face-enhance path: the repository is BSD-3-Clause, `--face_enhance` is optional/default-off, and enabling it invokes GFPGAN. That verifies the proposed *implementation policy*, not blanket clearance of the downloaded checkpoint. The selected weight still needs an auditable license/provenance record, and any experiment must be mouth-masked, temporally stable, and pixel-preserving outside the mask before deployment.

### Independent identity-quality review

The automated evidence packet `betterpptx-mcp/outputs/avatar-identity-quality-review-packet.json` now has a versioned rubric and linked visual review artifact. Automated lineage, both worker canaries, video-frame extraction, PPTX packaging, and PowerPoint open checks pass. The independent reviewer fields remain intentionally blank and the decision remains OPEN; no automated metric is being treated as a substitute for human identity/lip-sync judgment.

The packet-readiness verifier now reports `READY_FOR_INDEPENDENT_REVIEW` with 8/8 checks at `betterpptx-mcp/outputs/avatar-identity-review-readiness-report.json`. This confirms the evidence and rubric are complete; it deliberately does not infer or record the human PASS/FAIL decision.

The owner closure checklist at `betterpptx-mcp/docs/release-safety/AVATAR-OWNER-CLOSURE-CHECKLIST-2026-07-19.json` consolidates the exact actions for billing, independent review, required Meshy → Mixamo production authoring, production-mode redeployment, and optional restoration. It now records the separate native-3D-specific audit (`8 PASS_LOCAL / 4 OPEN_OWNER / 1 BLOCKED_OWNER`) alongside the aggregate readiness (`30/3/0`), and lists quota accounting as an operational prerequisite (`OPEN_OWNER_MODE_AND_REDEPLOY_REQUIRED`) without conflating it with the three primary public-release gates. Public model-backed rendering remains fail-closed until the required decisions are recorded.

The requirement-level audit at `betterpptx-mcp/outputs/avatar-goal-completion-audit.json` is explicit: 12/15 requirements pass, while provider billing, independent identity review, and required Meshy → Mixamo production authoring remain open. Goal completion is intentionally withheld.

## Evidence that is currently verified

### Worker and rotation

- Modal profiles `telcomgapp` and `fluxworkerai` are configured, authenticated, and healthy on `/healthz` (2/2 HTTP 200).
- Paired rotation, per-account credentials, deterministic idempotency routing, failover, and all-down behavior pass the focused rotation contracts.
- The owner-authorized rotation sequence replaced the paired Modal secrets, redeployed both workers, advanced the Google credential bundle to Secret Manager version 3, and revoked superseded Modal rollback copies.
- No raw secret values were printed, committed, or placed in evidence artifacts.

### Cloud Run and runtime

- Target: service `betterpptx-mcp-staging`, region `us-central1`.
- Active revision: `betterpptx-mcp-staging-00073-b4n` with `BETTERPPTX_NATIVE3D_MODE=production`, `BETTERPPTX_NATIVE3D_OWNER_CLEARANCE=required`, and the same immutable image digest.
- Traffic: 100% on the active revision.
- Immutable image digest: `sha256:746f8583a39b54142b977161988725feea899fd6b0a85e7f50ccbce9a9a4752f6`.
- Sixteen avatar/deployment settings are audited, including Firestore job state, worker state, GCS artifacts, credential bundle reference, required provider metrology, production native-3D mode, and the explicit owner-clearance gate.
- Cloud Run `/health` and both worker `/healthz` probes pass.

### End-to-end PowerPoint path

- Exact synthetic Meshy fixture canary: `research-live-pass`.
- Workflow: render job, completion, attach, validation, save.
- PPTX digest: `691eb32d977f522f490359af00a9fdfbb11a3045f53ae19e27409520f9531ecb`.
- Embedded MP4/media relationships, timing, poster, and PowerPoint COM open pass.
- No public handle, customer image, or training asset was created.

### Durability and safety

- Firestore/GCS job and artifact rehydration, TTL/retention, duplicate-write rejection, tenant isolation, lease/fencing/retry semantics, and shared-store fail-closed behavior pass their available evidence contracts.
- Cross-account worker idempotency, conflict rejection, cancellation terminal state, and terminal MP4 replay pass.
- The local provider-metrology store passes first write, idempotent replay, conflict rejection, cross-process read, interval filtering, and expiry purge.
- The result-fetch path is SSRF- and size-bounded; public responses remain black-box and provider-generic.

### Public interface

- A remote staging spec-first dry run recognizes `avatarNarration`, queues and completes durably, returns a premium estimate of 6.66 credits, and reports `REQUIRES_UPGRADE` without rendering media or creating a public handle.
- This proves the public safety/entitlement boundary, not a paid production render.
- The deployed Streamable HTTP `/mcp` endpoint also passes the public black-box scan: 10 adversarial checks plus 13 fixture checks, with zero implementation-leak failures. Evidence is `betterpptx-mcp/outputs/g1-blackbox-adversarial-report.json` and `betterpptx-mcp/outputs/g1-blackbox-fixtures-report.json`.

### Identity-quality evidence

- The exact synthetic Meshy portrait fixture is now used for the full MCP canary; the verifier rejects a mismatched default Apose subject.
- Native poster, native GLB, source portrait, rendered video frame, and repair-free PPTX evidence are hash-linked.
- Automated lineage, frame extraction, worker canaries, and PowerPoint checks pass.
- Independent visual/lip-sync review is still explicitly open; pixel MAE is diagnostic only and is not an acceptance threshold.

## Release gates that remain open or blocked

### 1. Licensing and model provenance — CLOSED FOR THIS WORKER RELEASE

The license ledger verifier is PASS (8/8 entries cleared), the immutable provenance verifier is PASS (7 pinned artifacts, 65-component reviewed SBOM), and both deployed Modal images verify the MediaPipe task SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. The frozen worker path is: YuNet → LivePortrait → MediaPipe mask adapter → MuseTalk. Legacy InsightFace, BiSeNet face parser, and ResNet18 checkpoints are excluded. This closes licensing for this exact worker image; any future model, parser, restoration, or dependency change reopens the gate.

Closure evidence is complete for this exact worker image: the reviewed SBOM, immutable image/source pins, model hashes, detector replacement, and owner approval record are frozen. Any future model, dependency, restoration, or image change reopens this gate; the owner approval record is not treated as an upstream license grant.

### 2. Provider billing reconciliation — OPEN

The system captures first-execution GPU/render metrology, suppresses compute usage on replay/conflict, records opaque FunctionCall IDs, and proves two isolated FunctionCall-to-billed-App/object joins. Stable App tags and A10G rows are visible.

The shared production App hour also contains earlier activity not represented by the latest canary events. Therefore the aggregate allocation policy is mathematically ready but coverage is fail-closed. The deployed Firestore metrology collection is reachable but empty because no remote paid model-backed render was submitted during the probe.

Required closure: either run one owner-approved remote staging render and prove complete per-App/hour metrology coverage, or supply a native provider request-attributed export; then record owner approval of the reconciliation policy.

### 3. Cross-representation identity quality — OPEN

The exact synthetic fixture now produces visually coherent source-portrait and rendered-video evidence, and the native 3D asset/poster lineage is recorded. However, the packet still requires an independent reviewer to judge identity continuity, lip-sync, temporal stability, framing, poster handoff, captions, and timing.

Required closure: independent reviewer records identity, organization, date, evidence references, and an explicit PASS decision. Do not self-sign this gate from automated lineage or MAE.

### 4. Production native 3D authoring clearance — OPEN

The production native-3D route is fixed to `multi-view body inputs → Meshy → Mixamo → native PowerPoint 3D`. The self-hosted `TRELLIS.2 → UniRig → DRTK` route is PoC/flow-test only and is rejected by the production route guard. The local Meshy owner preflight and native-3D visual tracker integrity now pass; the Cloud Run runtime still requires `BETTERPPTX_NATIVE3D_OWNER_CLEARANCE=approved` and a configured Meshy provider before a personalized production request can run.

Required closure: attach the exact Meshy account/plan/order, input-consent record, Mixamo integrated-end-use decision, no-AI-training acknowledgement, and a live Meshy→Mixamo A/B acceptance result; then record owner clearance and redeploy the approved staging configuration. Until then, personalized native-3D production remains fail-closed.

## Principal engineering risks

1. **Provider billing coverage:** interval-scoped provider exports can hide unrelated activity; fail-closed allocation is required until coverage is complete.
2. **Future model changes:** the frozen worker release is cleared for its recorded scope, but any restoration stage, dependency, parser, detector, or weight change requires a new SBOM/provenance/license review before release.
3. **Long synchronous worker request:** the private GPU call remains a long HTTP request behind an asynchronous MCP job; timeout and callback/queue behavior need continued hardening for long clips.
4. **Unified runtime execution:** the director now lowers talking-head, native 3D, hybrid, poster, audio-only, and absent lanes; the six-lane and media-playback corpora pass. Cross-platform playback and independent identity-quality acceptance remain release work.
5. **Distributed account policy:** Firestore health state and recovery evidence exist; the local weighted quota reservation ledger and mocked integration now pass, but Firestore quota deployment, owner budgets, cost-aware selection, and complete cross-instance policy coverage remain unfinished.
6. **Platform variability:** the Windows maintainer host requires an explicit FFmpeg/FFprobe bundle; unverified PowerPoint platforms need a declared static/poster/audio fallback.
7. **Native-3D provider clearance:** Meshy account/order terms, consent, integrated-use boundaries, and live A/B evidence are not present; the production route is intentionally disabled.

## Way-forward plan

### Phase A — legal and provenance gates — COMPLETE for frozen worker

1. **PASS:** SBOM reviewed against the exact deployed worker source/image pins.
2. **PASS:** reviewed ledger/SBOM and pinned image pair are immutable; future dependency/model changes reopen review.
3. **PASS:** frozen digest/SBOM pair and owner approval record are retained.

Detector and restoration decision: YuNet is the current commercial detector baseline and MediaPipe Face Landmarker is the shipped mouth-mask adapter. Both rotated workers returned fresh authenticated MP4s after the replacement. RestoreFormer++ remains the preferred next mouth-region experiment, but it is not deployed; CodeFormer is officially NTU S-Lab (not BSD-3-Clause), and GFPGAN is Apache-2.0 with third-party components requiring separate review. Any selected restoration stage must be mouth-masked, temporally stable, and separately cleared before entering a new resale-safe image.

### Phase B — close billing evidence

1. Use the owner-controlled staging procedure to run one bounded synthetic remote render.
2. Capture the provider metrology event in Firestore and the provider’s matching App/hour export.
3. Verify complete-hour coverage, allocation balance, duplicate/replay suppression, and cleanup.
4. Record owner approval of the reconciliation policy; retain public provider details behind private maintainer evidence.

### Phase C — close identity-quality evidence

1. Give the reviewer the contact sheet, source portrait, native poster/GLB evidence, rendered video frame/clip, and repair-free PPTX.
2. Require explicit decisions on facial identity, lip-sync, temporal stability, framing, captions, and fallback behavior.
3. Record PASS or FAIL; a missing signature keeps public enablement false.

### Phase D — close native-3D production authoring evidence

1. Record the owner-approved Meshy account/plan/order and the input-consent decision.
2. Confirm the Mixamo integrated PowerPoint end-use boundary and no-AI-training restriction.
3. Run the live Meshy→Mixamo A/B on the same multi-view identity used by the talking-head packet; inspect native PowerPoint playback and record the result.
4. Set the owner-clearance control only after the evidence packet is complete; redeploy and rerun the deployed-revision, route-guard, and release-corpus checks.

### Phase E — finish unified presenter authoring

1. Execute one identity/timeline through talking-head, native 3D, hybrid, poster, audio-only, and reduced-motion lanes.
2. Prove no duplicate presenter, no timing conflict, accessible fallback, and deterministic per-slide representation selection.
3. Add the corpus cases required by P3/P4: cold/warm, retry, timeout, cancellation, cache hit, two accounts, languages, and PowerPoint platform variants.

### Phase F — controlled promotion only after all gates

1. Rebuild from the reviewed immutable source/image/SBOM set.
2. Run the complete private acceptance corpus and direct package/PowerPoint visual checks.
3. Promote only with explicit owner/legal approval, staged traffic, monitoring, rollback, and public black-box scans.

## Authoritative evidence files

- Production readiness: `betterpptx-mcp/outputs/avatar-production-readiness-report.json`
- Deployed revision: `betterpptx-mcp/outputs/avatar-deployed-revision-report.json`
- Rotation execution: `betterpptx-mcp/outputs/avatar-rotation-execution-report.json`
- Billing reconciliation: `betterpptx-mcp/outputs/avatar-provider-billing-reconciliation-report.json`
- Aggregate billing policy: `betterpptx-mcp/outputs/avatar-provider-billing-aggregate-policy-report.json`
- Remote metrology probe: `betterpptx-mcp/outputs/avatar-provider-metrology-remote-probe.json`
- Remote public dry run: `betterpptx-mcp/outputs/avatar-remote-public-dryrun-report.json`
- Identity review packet: `betterpptx-mcp/outputs/avatar-identity-quality-review-packet.json`
- Alpha-only identity preservation: `betterpptx-mcp/outputs/presenter-alpha-only-identity-preservation-report.json`
- Identity continuity: `betterpptx-mcp/outputs/avatar-identity-continuity-report.json` (`research-pass-quality-review-open`; portable control-plane ffmpeg fallback now resolves the same reviewed media tools used by the canary)
- Native 3D Meshy owner worksheet: `research-demos/2026-07-18-meshy-avatar/visual-artifacts/release-gates/meshy-owner-decision-worksheet-20260718.json`
- Billing policy document: `betterpptx-mcp/docs/release-safety/AVATAR-PROVIDER-BILLING-RECONCILIATION-POLICY.md`
- Owner rotation runbook: `betterpptx-mcp/docs/release-safety/AVATAR-ROTATION-OWNER-RUNBOOK.md`
- Cost transparency estimate: `betterpptx-mcp/outputs/avatar-cost-estimate-report.json` (isolated redacted Modal observations; GPU-only estimate, not an invoice)

Latest focused rerun (16:14): the redacted private Modal account inventory passes 9/9 and the avatar rotation preflight passes 6/6 with zero mutations; the identity review packet rebuild and readiness audit pass (`READY_FOR_INDEPENDENT_REVIEW`, 8/8); the mutation-free presenter corpus now passes **22/22**, including the paid-canary owner-confirmation guard; the quota overlay owner-budget input verifier passes 7/7 with no deployment/provider call; both aggregate verifiers now consume the corpus total dynamically, so the completion audit is back to **12/15 PASS / 3 OPEN** and the readiness aggregate is **30/3/0**; the native-specific audit remains **8 PASS_LOCAL / 4 OPEN_OWNER / 1 BLOCKED_OWNER**. Identity continuity still passes locally through frame extraction without manually exporting ffmpeg paths; the independent visual/lip-sync review remains explicitly OPEN. The isolated paid-canary helper is fail-closed unless an explicit owner approval reference and `-ConfirmPaidRequest` are supplied; no paid request was run. The rendered tracker preview is under 2 MB and contains the owner matrix/readiness text without escaped-markup artifacts.

### Owner policy clarification (2026-07-19)

Production rotation is intentionally enabled to maintain a redundant working
service. The active/alternate profile path must preserve health, credential
version, and provider-metrology attribution during failover. The $15 credit
floor applies only to development profile rotation; it is not a production
quota, customer budget, or cost estimate.

The owner chose no hard daily GPU cap. The reviewed Cloud Run template now
supports explicit `unbounded-metered` mode via
`BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS=unlimited`: Firestore still records
reservations and settlements and billing reconciliation remains required, but
daily exhaustion does not reject work. An omitted mode remains fail-closed.
The local cost transparency report (`betterpptx-mcp/outputs/avatar-cost-estimate-report.json`)
estimates **$0.0287–$0.0380 Modal GPU time** for the reviewed 120-GPU-second
talking-head render from isolated observations; Cloud Run, Firestore, GCS,
TTS, egress, storage, and margin are additional.

The visual tracker now includes an owner-closure input matrix for billing, independent review, Meshy → Mixamo clearance, and the separate quota deployment prerequisite. It distinguishes the three public-release gates from quota’s operational fail-closed condition and links each to a concrete release condition.

The motion comparison was corrected after identifying that the first A/B used a
full-body fixture rather than the dedicated head-talker input. The replacement
pair uses the same synthetic head-and-shoulders crop and narration on both
canaries: `liveportrait-musetalk` (103.61 GPU-seconds) versus supported static
head `musetalk` mode (73.14 GPU-seconds). Evidence is in the thread visual
artifact `avatar-motion-ab.html`; production defaults remain unchanged.

On 2026-07-20, the owner supplied a consented real-person image for a private
framing test. It was spatially cropped/resized only to a 512×512 head-talker
input; both pipelines returned valid HTTP 200 MP4s with the same narration
(`liveportrait-musetalk`: 92.54 GPU-seconds; `musetalk`: 71.84 GPU-seconds).
The original image is not embedded in the visual artifact or published; see
the private `avatar-motion-consented-ab.html` comparison.

A second consented retest preserves more of the human input: the authoritative
original remains untouched, while a longer 512×640 head-to-neck derivative is
used only for model framing. Both pipelines again returned HTTP 200 MP4s
(`liveportrait-musetalk`: 106.75 GPU-seconds; `musetalk`: 86.33 GPU-seconds).
The private worker source now exposes fail-closed product profiles `default`,
`low`, `mouth-only`, and `static`. `low` and `mouth-only` map only to the pinned
LivePortrait revision's supported multiplier/option/region/smoothing flags; MuseTalk
still owns audio lip-sync. The default path is unchanged. Source verification passes,
but the change is not live until both rotated Modal profiles are redeployed and a
paid authenticated A/B canary verifies the resulting MP4s.

That deployment and canary step is now complete for the private rotated pair:
`low` returned HTTP 200/MP4 on `telcomgapp` (108.90 GPU-seconds) and
`fluxworkerai` (95.95 GPU-seconds); `mouth-only` returned HTTP 200/MP4 on
`telcomgapp` (69.39 GPU-seconds). The owner validation artifact is the embedded
four-way comparison `avatar-motion-consented-long-motion-profiles.html`. These
profiles remain opt-in; the default production behavior is unchanged.

The supported middle setting is now live as `balanced` (aliases `medium` and
`full-no-mouth`): LivePortrait full-region motion at multiplier 0.60, followed by
MuseTalk as the final mouth renderer. Both rotated workers returned HTTP 200/MP4
(`telcomgapp`: 73.28 GPU-seconds; `fluxworkerai`: 89.10 GPU-seconds). The pinned
LivePortrait API does not provide an `all-except-lip` region; strict suppression of
LP's intermediate lip signal would require a separately validated mouth-mask
compositor, so the current claim is final-output mouth ownership by MuseTalk.

A third-party comparison was also completed with D-ID using the same consented
512×640 derivative and narration. D-ID's image-compatible Talks lane returned a
512×512, 25-fps, 6.16-second MP4, but the current account applies a visible
watermark. D-ID V4 Expressive was not substituted into the same-image test because
its documented create-video contract requires a pre-created `avatar_id`; the
comparison artifact and hash report are `avatar-motion-consented-long-did-comparison.html`
and `avatar-motion-consented-long-did-report.json`. The temporary talk was deleted
after download; provider upload storage remains subject to D-ID's documented
temporary-retention window.

The mouth artifact was then isolated with first-frame inspection: the same
diffuse/open upper-lip appearance was present in balanced LivePortrait + MuseTalk
and static-head MuseTalk output, while the untouched source remained crisp. This
identifies MuseTalk compositing—not LivePortrait eye/head motion—as the defect.
An opt-in `mouthProfile=raw` adapter now passes MuseTalk's supported
`parsing_mode=raw`, narrowing the pasted mouth region. Fresh authenticated
canaries passed on both rotated workers (`telcomgapp`: 106.45 GPU-seconds;
`fluxworkerai`: 100.98 GPU-seconds), with a visibly cleaner initial upper-lip
frame. It remains an experimental profile pending owner visual acceptance; the
default jaw mask and production behavior are unchanged. Evidence:
`avatar-motion-consented-mouth-blend-ab.html`.

Consecutive-frame inspection then confirmed the sharper failure mode: a shifted
generated upper-lip contour remains visible beside the source contour. An
inner-mouth-only mask removes that duplicate but makes the lips effectively
static; eroding the raw mask does not remove it. The targeted `lower` profile
therefore preserves the source upper lip and delegates only the lower lip,
mouth opening, and teeth to MuseTalk. It passed on both rotated workers
(`telcomgapp`: 137.57 GPU-seconds; `fluxworkerai`: 96.13 GPU-seconds). This is
the current leading candidate, but remains opt-in until the owner accepts its
tradeoff between upper-lip identity fidelity and full-lip expressiveness. The
eight-card decision artifact is `avatar-motion-consented-mouth-blend-ab.html`.

Because full upper-lip movement is a hard requirement, the lower-mouth profile
is not the final answer. An experimental `mouthProfile=aligned` compositor now
derives the feathered MediaPipe mask from MuseTalk's generated face crop rather
than the untouched target frame. This keeps the mask boundary and generated
upper-lip geometry in the same coordinate space. Consecutive-frame inspection
shows full upper-lip motion without the prior doubled contour. It passed on both
rotated workers (`telcomgapp`: 111.08 GPU-seconds; `fluxworkerai`: 99.98
GPU-seconds). `aligned` is the leading full-lip candidate and remains opt-in
until owner validation.

The aligned-mask candidate was strengthened into a full geometric compositor:
`mouthProfile=warp` estimates a similarity transform from stable MediaPipe face
anchors, warps MuseTalk's generated crop into the target face coordinate space,
and then applies the complete lip mask. This retains upper-lip movement instead
of masking it away. The corrected canary passed on both rotated workers
(`telcomgapp`: 110.34 GPU-seconds; `fluxworkerai`: 103.28 GPU-seconds). The
updated twelve-card bakeoff identifies `warp` as the leading full-lip candidate;
the default remains unchanged pending owner acceptance.

The follow-up "three levels of teeth" contact sheet was diagnosed as one
generated upper-teeth row plus lower-lip highlight texture leaking through the
compositor feather. `mouthProfile=warp-upper-teeth-clean` now keeps full
upper-lip/teeth motion, limits the lower transition to a short feather, and
smooths only the source lower-lip highlight mask. Fresh authenticated canaries
passed on both rotated workers (`telcomgapp`: 125.23 GPU-seconds;
`fluxworkerai`: 120.20 GPU-seconds). The comparison artifact now includes both
clean outputs; the production default remains unchanged pending owner visual
validation.

## Final project position

This is a real, privately demonstrable PowerPoint-native talking-head avatar capability with a healthy rotated worker pair and a durable staging control plane. Commercial model/license approval and the exact frozen worker SBOM/provenance closure are complete for the talking-head scope, and the synthetic cross-representation continuity packet now completes locally through frame extraction; public production is still disabled. The correct next milestone is **release-evidence closure**, not public enablement: complete provider billing coverage, independent identity-quality signoff, and Meshy → Mixamo native-3D production clearance must all be green before promotion.
