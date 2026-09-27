# BetterPPTX 1.6 live handoff — 2026-09-21

Public endpoint: `https://betterpptx.tail070c3a.ts.net/mcp`

Live identity:

- Semantic version: `1.6.0`
- Tool contract: `2026-09-21.1`
- Build identity: `bpptx_build_838f35e18f41cc70b6cd57f8f587d3a5e9eb6804ae15c3441fde2243f593fdf0`
- Advertised tool-schema digest: `62f3eba54337bf9a6b4b12346171556af83772edaa540491d52e6f5ffdcc582b`
- Capability-content digest: `89ef969c33beaa2c92cdd46c45ad5cac171823baf79f8ccf042b2b75545e9b39`
- Capability-control digest: `648d2a685711e8d9b99e4f26e1c5bf8ee6e23991ade5ff7e99979c1a6cadbd77`
- Source identity: honestly reported as `not-attested`; no source digest is claimed.

| Requirement | Implementation | Public invocation | Verification | Observed result | Evidence/artifact | Remaining limitation |
|---|---|---|---|---|---|---|
| Issuer/consumer quote schema | `billing/premium-quote-contract.mjs`, `tools.mjs` | estimate → unchanged generate binding | `live-quote-contract.v1` | PASS 4/4 | `.codex-tmp/live-quote-contract-v1-v6/report.json` | Payment settlement was not exercised. |
| Inline/uploaded source parity | shared source normalization in `engine.mjs` | estimate with inline spec and uploaded handle | `inline-uploaded-estimate-parity` | Matching spec and binding digests | quote report above | Tenant/provider recovery beyond this deployment remains a separate operational qualification. |
| Clause-aware intent and atomic controls | authoring control registry and baseline catalog | `betterpptx.authoring.catalog` | `live-creative-contract.v1` | Negations and `text3DShape.material` resolve correctly | `.codex-tmp/live-creative-contract-v1-v4/report.json` | Multilingual intent breadth is not claimed as exhaustive. |
| Equivalent Text3D angles | validation engine and option registry | strict dry-run/commit | `equivalent-angle-strict-dry-run` | `-10` accepted and recorded as effective `350` | creative report above | Appearance is not inferred without rendering. |
| Native feature-realization ledger | package audit in `engine.mjs` | `betterpptx.deck.validate_native_visuals` | `honest-native-feature-realization` | Requested/normalized/effective Text3D values reported; no fake perceptual score | creative report above | Ledger coverage is implemented for selected high-value controls, not every atomic control yet. |
| Chart point emphasis | chart-part semantic audit in `engine.mjs` | chart lesson commit → native visual validation | `native-chart-point-realization` | Points 0–2 `64748B`; point 3 `22C55E` | creative report above | Structural XML proof, not a per-artifact visual judgment. |
| Atomic revisions | mutation response alignment in `engine.mjs` | replaceDeck and summary | `atomic-replace-revision` | One advancing revision used in all readbacks | creative report above | Distributed multi-worker stale-write stress remains to be expanded. |
| No silent downgrade | bound alternative authorization in `engine.mjs` and `tools.mjs` | generate unsupported/entitlement-sensitive request | `no-silent-downgrade` | Explicit refusal or unchanged native execution | creative report above | Provider-specific alternatives still depend on caller readiness. |
| First-class animated table and presenter synergy | typed component, compiler lowering and synergy resolver | discovery → dry-run → commit → validation → save | `live-animated-table-public.v1` | PASS 12/12; native editable composite and stable target timing | `.codex-tmp/live-animated-table-v6/report.json`; package SHA-256 `513f9abf40f35f9bdd535d1c8f9647f13aca651ff3f85e3f275dd37f8aeca8fe` | Playback evidence is release qualification, not claimed for this renderer-free production artifact. |
| Renderer-free production truth | validation/readback guidance | validate, validate_quality, save | production non-rendering test | PASS | local focused test | No per-artifact perceptual approval is claimed. |
| Public cache/version visibility | manifest, MCP discovery, `/health`, `/tools` | initialize/discovery and health | live reports | Contract, build and capability digests published | live health and reports above | Source attestation remains explicitly incomplete. |

## Qualification boundary

The deployed contract fixes the reproduced P0 failures and the targeted P1 discovery/evidence failures. It does not claim completion of the broader P2 architecture, three-model/two-host cold-start benchmark, blinded human design review, complete atomic-control ledger coverage, or an attested immutable source digest. Those remain release-program work rather than hidden successes.
