# BetterPPTX authoring augmentation — 2026-09-20

## Consuming-AI guide

1. Call `betterpptx.help.capabilities` with the complete user brief. Read the transparent intent interpretation, exclusions, authority modes, production boundaries, and complete family index.
2. When a treatment is unfamiliar, call `betterpptx.authoring.catalog` with `view:"controls"` and ordinary-language `intent`. Inspect one relevant lesson with `view:"lesson"`; do not treat catalog order as an aesthetic ranking.
3. Choose the story, composition mode, visual language, exact controls, and acceptance criteria. Use `ai-sovereign-v1` by default. Director assistance is optional.
4. Use semantic placement when delegating layout, `ai-authored-geometry-v1` for original exact slide-inch composition, or `visual-reference-pixels-v1` only for reconstruction of an observed reference.
5. Record important choices in `capabilityUsePlan`. A user-required entry must be selected before compilation; optional opportunities may be declined without blocking.
6. Dry-run the complete specification. Resolve batched technical findings; advisory design opportunities are optional and are never auto-applied.
7. Prepare only authorized assets. Narration preparation validates the exact PCM waveform, measures segments, and must be reused by the final quote and compilation.
8. Accept a chargeable quote explicitly, compile the unchanged bound request, validate package/design/accessibility/media/timing, and deliver the durable artifact.

## Annotated before/after demonstration

The gallery contains contrasting ordinary-public-contract examples rather than a hard-coded xPayIT path:

- `restrained-flat` demonstrates that strong hierarchy, evidence, and whitespace remain valid without compulsory effects.
- `dimensional-typography` demonstrates an editable native headline with controlled bevel, material, light, extrusion, camera rotation, and glow.
- `chart-emphasis` demonstrates a native chart that preserves context while emphasizing one decision-relevant value.
- `layered-motion` demonstrates entrance, motion path, simultaneous emphasis, exit, and re-entry on one stable target.
- `animated-table-synergy` demonstrates an editable grouped-shape table with stable row/cell targets for native reveal timing and qualified presenter contact.

Each sample is paired with its exact JSON source, deterministic validation result, PPTX hash, PowerPoint-rendered thumbnail hash, build identity, and limitations in `public-authoring-environment/gallery/gallery-index.v1.json`. These are teaching examples, not automatic edits or previews of a current user deck.

## Requirement handoff matrix

| Requirement | Implementation | Public invocation | Evidence/test | Observed result | Remaining limitation |
|---|---|---|---|---|---|
| Compact first discovery | `engine.mjs`, `tools.mjs` | `help.capabilities {intent,detail:"summary"}` | `public-capability-discovery.test.mjs`; baseline evidence | 15,116 structured bytes; proxy estimate 2,361 tokens for the audit brief | Connector envelope and receiving-model tokens require host instrumentation |
| Individual-control registry | `authoring-control-registry.mjs` | `authoring.catalog {view:"controls"}` | `authoring-control-registry.test.mjs` | Canonical controls enriched from executable baseline rows; digest bound | Not every executable control yet has an isolated visual sample |
| Ordinary-language discovery | `authoring-control-registry.mjs` | `intent:"design niceties"`, `"more than fade"`, etc. | alias/exclusion tests | Niceties, layered motion, Text3D, screenshot, chart, Morph, and restrained queries resolve | Ambiguous language still uses transparent candidate routing, not model inference |
| Learning layer | `PUBLIC_AUTHORING_LESSONS` | `authoring.catalog {view:"lesson",lessonId}` | seven self-contained public dry-run fixtures plus one asset-dependent picture lesson | Seven self-contained lessons compile; picture lesson declares its required user asset | Picture lesson cannot execute without an authorized asset |
| Animated table + Synergy | `ir/animated-table.mjs`, `ir/synergy-compiler.mjs`, public schemas and recipes | `content[].kind:"animated-table"`; optional `slides[].interactions[].target:"<table>.row-N[.cell-M]"` | `animated-table-synergy.test.mjs` | Public commit produces editable row/cell shapes and native timing bound to real descendants; absolute nested geometry resolves for Synergy | Merged cells are unsupported in v1; presenter contact still requires a qualified empirical actor timeline |
| Visual gallery | `public-authoring-environment/gallery`, `public-gallery.mjs` | MCP `resources/list` and `resources/read` | gallery resource test; PowerPoint thumbnails | Six source/PPTX/PNG triples with hashes and model visual inspection | Static thumbnails do not prove motion playback; no short playback capture yet |
| Creative authority | deck schema, help, MCP instructions/prompts | `authoringContract.workflow:"ai-sovereign-v1"` | AI-sovereign tests | AI-sovereign is recommended; Director remains optional | Director-assisted legacy workflow remains supported |
| Exact original composition | deck schema and geometry validator | `geometryAuthority:"ai"`, `placementPolicy:"ai-authored-geometry-v1"` | AI geometry tests | Exact slide-inch frames preserved; semantic mode still rejects direct rectangles | Group-local and transformed geometry need broader property-based coverage |
| WordArt/Text3D fidelity | `layout-engine.mjs` | dedicated `wordart` / `text3d` blocks or text options | full WordArt/Text3D contract suites | Native text carrier now reports the correct WordArt/Text3D representation | Visual combinations remain target-version dependent |
| Capability-use plan | deck schema and generation readback | `spec.capabilityUsePlan` | required-entry blocking test | Required missing selection blocks; optional opportunity remains advisory | Opportunity heuristics are intentionally narrow |
| Actual-use readback | `capabilityPlanReadback` | generation response `capabilityUse` | control-registry test | Separates declared, compiled, serialized state and visual verification | Discovery/understanding is never inferred from private model state |
| Quote replay | premium quote and engine changes | unchanged returned quote binding | `visual-reference-quote-replay.test.mjs` | Complete binding replays unchanged | Multi-worker public store qualification remains pending |
| TTS crackle gate | `narration/wavQuality.mjs`, narration service | narration preparation/synthesis | `wav-quality.test.mjs` | Blocks clipping, repeated discontinuities, DC offset, silence, and unsupported PCM | Original xPayIT files were no longer present at the supplied paths, so that exact audio was not re-audited |
| MCP portability | MCP catalog/handler | tools/resources/prompts plus listChanged | resource and protocol tests | Text and PNG resource content use negotiated MCP structured content | Deployed connector census was not available in this workspace |
| Production/release separation | verification policy and gallery builder | deterministic save vs release gallery build | HTTP parity and gallery evidence | Production reports non-rendering; PowerPoint used only for release thumbnails | Playback qualification remains separate |

## Truthful release state

- Implemented and tested locally: compact discovery, control registry, aliases/exclusions, lessons, exact geometry schema, capability-use plan/readback, WordArt/Text3D representation fix, PCM TTS quality gate, gallery resources, and PowerPoint-rendered static gallery assets.
- Exercised through the local public black-box dispatcher and local HTTP boundary: yes.
- Exercised through an external deployed connector: no; no owner-authorized deployed endpoint or host census was provided.
- Deployed: not claimed.
- Known infrastructure blocker: some public preview/narration tests still encounter `ASSET_GRANT_STORE_UNAVAILABLE`; this is separate from the new authoring contracts.
- Fresh-agent benchmark: plan frozen in `evaluation/agent-augmentation-benchmark.v1.json`; multi-model/multi-host scores are not fabricated and remain to be run on supported external configurations.
