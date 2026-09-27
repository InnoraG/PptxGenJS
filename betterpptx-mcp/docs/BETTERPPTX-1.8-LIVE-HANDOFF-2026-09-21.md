# BetterPPTX 1.8 live handoff — 2026-09-21

This handoff records the bounded 21 September implementation and public-client verification. It is not a claim of complete product certification or visual excellence.

## Responding public contract

- Endpoint: `https://betterpptx.tail070c3a.ts.net/mcp`
- Semantic version: `1.8.0`
- Tool schema version: `2026-09-21.3`
- Build identity: `bpptx_build_5e91acfba9baa1ea65de5e7a117b0e9b97f52d11802039a86663309a46f9f7ea`
- Advertised tool-schema digest: `1268fb9c50629da5361c982cf848e3304abfaecf9049864803d35dca8639f5ee`
- Public tool count observed by the animated-table verifier: 53. This is server-advertised inventory, not proof that every host exposes all tools.
- Production verification policy: renderer-free. No per-artifact appearance or playback approval is inferred.

## Requirement and evidence matrix

| Evidence area | Implementation location | Public invocation / test | Observed result | Remaining limitation |
|---|---|---|---|---|
| Complete quote binding | `billing/premium-quote-contract.mjs`, `billing/premium-quote.mjs`, `engine.mjs`, `tools.mjs` | `verify-live-quote-contract-v1.mjs` | Issuer and consumer schemas match; complete binding validates unchanged in the connector and server dry-run; tampered `planDigest` rejects with `QUOTE_BINDING_MISMATCH`; no deck is created | Expiry rejection was not forced against live time in this run |
| Inline/upload parity | `engine.mjs`, `billing/premium-quote.mjs` | live quote verifier | Matching spec, plan, pricing, timeline, quote and binding identities | Covered for the fixture, not every transport/host |
| Stage authorization | `auth/entitlements.mjs`, `engine.mjs`, `tools.mjs` | `auth.status`, `billing.explain_plan`, workflow-stage unit fixture | Learning/planning/draft/source/audit/media/save/recovery boundaries are explicit; environment premium is not payment permission; free preview does not promise download | No owner-designated release-test entitlement was configured |
| Cost inputs | `billing/premium-quote.mjs` | `billing.estimate` | Quote exposes authored object, operation, transition, support-carrier and projected-save inputs plus higher-cost policy | No live before/after saved-package cost reconciliation because save was not authorized |
| Current semantic source | `engine.mjs` | `sovereign-current-source-inventory.test.mjs` | Ordinary ellipse remains semantic `shape`; authored timeline is returned; current geometry wins | Full LUMA current-source recompile was not run because the exact external payload was not available as a local fixture |
| Serialized inventory | `engine.mjs` native package audit | source/inventory fixture and live creative verifier | Transparent slide-title carrier is identified as non-visible accessibility support, framework-owned, regenerated from `slide.title`, and excluded from content pricing | Imported/preserved carrier coverage remains dependent on import provenance quality |
| Author identity and motion targets | `ir/spec-compiler.mjs`, generation readback `identityMap` | repeated `light-core` fixture | Same author ID may repeat on different slides; each timeline resolves in its slide without `.shape` suffix guessing | Playback qualification remains separate |
| Presenter geometry sovereignty | `ir/presenter-director.mjs`, `ir/deck-spec.v1.json`, `tools.mjs` | presenter unit suites and live animated-table synergy | No presenter placement fallback; exact `rect`/`bbox` or reference `pixelFrame` required; no automatic Morph | Existing legacy specs that delegated presenter placement must be migrated |
| Intent and exclusions | `authoring-control-registry.mjs` and discovery fixtures | live creative verifier; `discovery-intent-scope.test.mjs` | Clause-aware table/presenter/narration/paid-media exclusions pass; exact material discovery works | Multi-language exclusion coverage is not complete |
| Chart point emphasis | realization ledger and chart serializer | live creative verifier and chart lesson fixture | Intended index 3 is structurally matched to its exact color; other points remain distinct | No PowerPoint appearance qualification in this run |
| Text3D angle handling | validator and serializer | equivalent-angle fixture and live creative verifier | `-10` normalizes informationally to `350`; strict validation passes; unrelated shrink advice removed | Other selected Text3D leaves are not all property-tamper-tested against downloaded bytes |
| Animated table + 3D presenter | `ir/animated-table.mjs`, `ir/synergy-compiler.mjs`, presenter performance | live animated-table verifier | Discovery, native-composite dry-run, public commit, validators, stable cell target and measured contact timing pass | Contact is truthfully reported `stage-constrained`; watched playback not performed |
| Final delivery | save gate and workflow-stage contract | live animated-table verifier | Save was not attempted; boundary reports `fresh-quote-and-explicit-payment-or-entitlement` | No downloaded PPTX, independent byte hash, re-download, PowerPoint reopen, editability check, or watched playback in this release run |

## Evidence artifacts

- `D:\PptxGenJS_Claude\.codex-tmp\live-quote-contract-v1\report.json` — SHA-256 `d197bc934da7bec70d07a429989e11825a3c94a10ffbac53bf894a14197e3acc`
- `D:\PptxGenJS_Claude\.codex-tmp\live-creative-contract-v1\report.json` — SHA-256 `bf1a042c84ca21cbfbfd2ce42256d7fcc6f15062ea2b9ad0cdadd06d15259e7f`
- `D:\PptxGenJS_Claude\.codex-tmp\live-animated-table-public\report.json` — SHA-256 `a2d89a3d72cd04c1feda7645452cf141735d1d602ca0980ee92558112a2076ed`

The reports are selected structured acceptance evidence, not raw traces. They contain no credentials.

## Test summary

- Authoring augmentation: 41/41 passed.
- Focused P0/P1 contract suite: 34/34 passed before the final authorization distinction; the updated stage-entitlement suite then passed 3/3.
- Public named endpoint: quote 6/6, creative contract 13/13, animated-table/public boundary 12/12.

## Honest remaining release work

1. Configure an owner-authorized, non-customer-funded release-test entitlement, then run final save, retrieve bytes through each claimed client path, independently hash them, repeat the stable-key save, and test expiry/reissue.
2. Recompile a full current-source LUMA fixture and compare authored/effective/current source, semantic identities, timelines and final package carriers.
3. Expand property-specific final-byte realization/tamper checks for all selected Text3D, gradient, picture, chart and detailed timing controls.
4. Run dated PowerPoint appearance, reopen/editability and watched-playback qualification for the teaching atlas and coordinated-motion lessons.
5. Run the predeclared cold-start benchmark across at least three supported model configurations and two materially different host paths, retaining failed runs and independent design review.

No funds were spent, no customer balance or production financial setting was changed, and no identity media was generated.
