# BetterPPTX 1.9.1 live handoff — 21 September 2026

## Responding release

- Endpoint: the named BetterPPTX MCP endpoint.
- MCP server version: `1.9.1+2026-09-21.7`.
- Semantic version: `1.9.1`.
- Tool schema: `2026-09-21.7`.
- Build identity: `bpptx_build_c5a4ff3f7546201c3aaa1f86da5e9ac4da9f3ced434a8d5dad36e1fc553c2e9a`.
- Advertised public tools: 52 (37 read-only, 15 write-capable).
- Advertised tool-schema digest: `7d44aba6a1e2ff9aa255a88e6ff4bac74a3aa4f9c1f3e3a5eb468f06d3c42dfb`.
- Raw `tools/list` digest from the verifier: `eb5162f4ee070366ff774b99205b94a6606edb36e7e8fe1d8374a9eb4481e2a9`.
- Capability digest: `4ce2f5d6b185f2573ccdcf206eae332886093be40186c5fb8025708947a43f2d`.
- Control digest: `cc113eb6d3d97baa73a86e7519e0fcb203ab30263f75c308c7db40af991a242f`.
- Source identity remains honestly `not-attested`; the public build identity binds public contract/capability content, not the complete runtime source tree.

## Exposure diagnosis

The historical 35-action projection was exactly the set whose MCP annotation said `readOnlyHint:true`. The service registry itself advertised 52 actions. The missing authoring, upload, generation, and save actions were write-capable actions omitted by that host projection.

The release now supplies truthful annotations and complete schemas. Raw live discovery exposes all 52 actions and contains every required workflow action: upload, estimate, generate, validate, native audit, source export, and save. Annotation metadata remains advisory; server-side authorization and quota enforcement remain authoritative.

A previously connected client can retain an older schema. That was reproduced when it rejected the issued `quoteSchemaVersion` before reaching the server. A newly connected supported-client run remains the final host-cache/exposure acceptance gate.

## Implemented outcomes

| Requirement | Public evidence | Result | Limitation |
|---|---|---|---|
| Registry-to-client workflow exposure | `tools/list` plus `live-tool-exposure-1.9.1-final` | Raw live boundary passes; no required workflow action is missing | Fresh ChatGPT connection still required to prove host projection |
| Complete issued quote roundtrip | `live-quote-contract-1.9.1-final` | Issuer/consumer schemas match; unchanged binding accepted; protected mutation rejected; inline/upload identities match | Already-connected cached client still has the older quote schema |
| AI geometry sovereignty | `live-creative-contract-1.9.1-final` | Sovereign and Director-assisted dry-runs both report AI-owned geometry and zero engine placement; legacy engine placement rejects | None observed on the tested exact route |
| Intent and exclusions | Live creative verifier and intent tests | Coordinated exclusions, literal query versus semantic intent, stop-word removal, exact material lookup, and filtered catalog behavior pass | Broader multilingual benchmark remains open |
| Teaching contracts | Live creative verifier | Dimensional typography and chart-emphasis lessons execute through strict public paths | Full visual atlas qualification remains open |
| Renderer-free production | Live VELA publication and production test | Save records `renderPerformed:false`; no hosted PowerPoint production gate | Appearance, reopen, and watched playback are separate and unperformed for VELA |
| Free publication | VELA save/replay/re-download | Customer charge 0; one saved artifact replayed with stable bytes and no second publication on retry | Concurrent/expiry/exhaustion fixtures are isolated tests, not long-term elapsed-time evidence |
| Durable source and operation recovery | Cross-process verifier plus VELA restart readback | Cold rehydrate, mutation, current-source export, and operation recovery pass | Current named deployment is single-host local durability, not multi-worker cloud durability |
| Honest evidence | Native audit, design readback, series-coherence tests | Zero-sample coherence is `not-applicable`; heuristic design scores declare no appearance/playback verification | PowerPoint qualification remains separate |
| Compact discovery | Live VELA-style help call | 15,986 bytes and 2,497 estimated tokens, inside configured 16,384-byte/2,500-token proxy budgets | Exact host token count is still host-measured evidence |

## Delivered MCP specimen

- Artifact: `C:\Users\SafeUser\Downloads\VELA-1.9.1-public-proof.pptx`
- Size: 36,129 bytes.
- SHA-256: `018476E4E8A035F629890FA1E75F69B1BA8B7F086944D8D9BAE5916D1B527FAF`.
- Re-download was byte-identical.
- Structural evidence includes 19 authored objects, two classified non-visible accessibility title carriers, native chart point D/index 3 serialized as `BA782D`, muted other points, canonical equivalent Text3D angle, authored gradient stops, a slide-2 fade transition, and native wipe/pulse timing targets.
- This proves compilation, serialization, validation, delivery, replay, and byte recovery. It does not prove visual appearance, PowerPoint reopen/editability, or watched playback.

## Evidence files

- `evidence/live-tool-exposure-1.9.1-final/report.json` — SHA-256 `610512C62327170DF831260E0364D374A24A7565960DFB1566125F2397DDE88C`.
- `evidence/live-quote-contract-1.9.1-final/report.json` — SHA-256 `B1ACEC0EC76A152898871741AF88DDDB3FBEFF4AF083A79A18CA8BEA48F273F8`.
- `evidence/live-creative-contract-1.9.1-final/report.json` — SHA-256 `4B1BEEC9C896F96B25C8A108342A2F5310703A3A43611D5BD856B1A29671FD30`.

## Test results

- Authoring augmentation suite: 42/42 passed.
- Additional discovery, CORS, source, production-save, and evidence suite: 18/18 passed.
- Live creative contract: 13/13 passed.
- Live quote contract: 6/6 passed.
- Live tool exposure: passed with 52 advertised tools and no required workflow omission.
- Cross-process deck rehydrate/mutate/verify: passed.

## Remaining acceptance gates

### Fresh ChatGPT supported-client check — 22 September 2026

- A new ChatGPT conversation exposed 53 callable BetterNamedPPTXv1 actions, not the historical 35-action read-only projection.
- The required workflow actions were all callable: upload, estimate, generate-from-spec, validate, native-visual validation, source export, and save.
- The client reported BetterPPTX `1.9.1`, tool schema `2026-09-21.7`, build `bpptx_build_c5a4ff3f7546201c3aaa1f86da5e9ac4da9f3ced434a8d5dad36e1fc553c2e9a`, and production-non-rendering policy.
- A mutation-free sovereign inline dry-run passed with one author-positioned object and zero engine-positioned objects.
- A fresh estimate issued `quoteId:bpptx_quote_a6a87ad2804d806a7c8151245467000b` and a complete binding containing both `schemaVersion:"betterpptx.quote-binding.v1"` and `quoteSchemaVersion:"betterpptx.premium-quote.v1"`.
- Returning that binding unchanged was rejected by the ChatGPT-side input validator because its installed `generate_from_spec.quoteBinding` schema omits `quoteSchemaVersion`; the request did not reach server verification.
- ChatGPT's plugin manager independently confirms the mismatch: it lists all 53 actions but the displayed `generate_from_spec` input schema omits `quoteSchemaVersion`. It also shows plugin display version `1.0.0`, connection version name `dev mode`, and Version Id `asdk_app_v_6aadf7ed50c08191a1215420b256f45f`.
- No commit, save, publication reservation, media generation, or charge occurred. The allowance stayed `used=2`, `reserved=0`, `remaining=1`.

The 35-action exposure blocker is therefore closed for the tested fresh client. The remaining executable-contract blocker is the installed ChatGPT connector schema projection for `quoteBinding`. The plugin manager exposes a dedicated Refresh action; refreshing it requires an explicit owner decision because the earlier reconnect authorization was conditional on the 35-action projection persisting.

1. Refresh the installed BetterNamedPPTXv1 connector schema, then repeat the unchanged-binding mutation-free call.
2. Confirm the refreshed client-side schema includes `quoteSchemaVersion` and reaches the server verifier without changing the issued object.
3. Perform separately scoped PowerPoint appearance, reopen/editability, and watched-playback qualification if release-level visual evidence is desired.
4. Configure an attested runtime source digest if complete source identity is required in addition to the existing public-contract build identity.

## 1.9.4 sponsored-estimate closure — 22 September 2026

### Live identity

- Named endpoint: `https://betterpptx.tail070c3a.ts.net/mcp`.
- Semantic version: `1.9.4`.
- Tool schema: `2026-09-22.3`.
- Build identity: `bpptx_build_e6b9bc2ce0594851758c017e5f0bf32db2d6ae7b1ae2d3f841a456ea0158941f`.
- Public inventory: 52 tools, comprising 37 read-only annotated actions and 15 write-capable actions.
- No obsolete endpoint or funnel was changed or used.

### Corrected behavior

- `billing.estimate` for `deck.generate_from_spec` now evaluates the final-delivery portion against the same rolling `deck-publication` allowance as `deck.save`.
- Estimation remains non-mutating: it neither reserves nor consumes a publication. Successful `deck.save` remains the accounting point.
- For an eligible sponsored publication, all customer-charge amounts are zero at the top level, inside `estimate`, inside `metrics`, and inside `estimate.metrics`.
- The paid-equivalent operational amount remains available only in `unsubsidizedEstimate` and the signed `quoteBinding`, preserving estimation transparency and quote integrity.
- `auth.status.identityAssurance` exposes only safe opaque evidence: secured status, basis, allowance eligibility, and opacity. It does not expose the installation or connector identity.
- The 150/300 credit thresholds remain non-charge policy safeguards. They are not request prices and were deliberately not zeroed or removed.

### Fresh supported-client evidence

A new ChatGPT conversation used only the connected plugin and current live calls. It reported:

- secured identity: `true`, basis `connector-subject-hmac`, free-value eligible `true`, opaque `true`;
- publication allowance unchanged at `used=2`, `reserved=0`, `remaining=1` before and after estimation;
- every quoted customer-charge field zero, including both formerly leaking nested `finalSaveEstimatedCredits` paths;
- authorization `bounded-free-allowance` and charge classification `sponsored-publication`;
- operational equivalent `5.86` credits / `0.058601` USDC only under `unsubsidizedEstimate` and the complete 14-field integrity binding;
- no generation, commit, save, upload, synthesis, reservation, payment, publication consumption, or charge.

The client called its literal result `FAIL` solely because the test phrase “all monetary fields” also matched `confirmationThresholdCredits:150` and `hardBlockThresholdCredits:300`. In the same response it explicitly classified those as policy thresholds rather than charges and confirmed the intended customer-charge, identity, binding, and quota conditions passed. This is a test-wording distinction, not a billing leak.

### Verification

- Focused free-value/workflow/quote/public-schema suite: 7/7 passed.
- Authoring augmentation suite: 42/42 passed.
- Raw public exposure: passed, 52 tools and no missing required workflow action.
- Raw public quote/security contract: 8/8 passed.
- Raw public creative contract: 13/13 passed.
- Exposure report: `evidence/live-tool-exposure-1.9.4/report.json`, SHA-256 `892517CFA01D9615E3A3C61C2B615ECC802FAA17C23BEDBE12591B332D03A231`.
- Quote report: `evidence/live-quote-contract-1.9.4/report.json`, SHA-256 `4EA3CAB452216A599A819F60E4BAE48799B8661FCC51FF8697B9225A23914C19`.
- Creative-contract report: `evidence/live-creative-contract-1.9.4/report.json`, SHA-256 `4E6C74903747015CED36838CDADD62CFB9D6856897ACF02FD94BFD4A72D923D5`.

### Remaining boundaries

- The last remaining free publication was intentionally not consumed during this read-only verification.
- Final-save replay/re-download was therefore not repeated in 1.9.4; the previous VELA delivery remains historical evidence.
- PowerPoint appearance, reopen/editability, and watched playback remain separate release-qualification evidence.
- The ChatGPT plugin card may continue to display its independently published app-release version until that developer/app metadata is republished; the live MCP contract itself reports 1.9.4 correctly.
