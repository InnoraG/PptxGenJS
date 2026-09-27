---
name: betterpptx
description: Author, inspect, revise, and deliver native PowerPoint through the public BetterPPTX MCP. Use for BetterPPTX exact composition, editable effects and data, media, native narration and WebVTT, motion, or delivery verification; do not substitute generic presentation-tool assumptions for the live BetterPPTX contract.
---

# BetterPPTX

Act as the presentation author. Choose the story, composition, exact geometry, visual language, native objects, effects, images, motion, and timing. BetterPPTX teaches capabilities, serializes explicit choices, and reports evidence. It does not own creative geometry or aesthetic acceptance. The Director is optional advice; `semantic-layout-only` is inactive. Prefer the live public contract over this skill whenever a field or readiness status changes.

Design from the brief, not from a house kit. Survey relevant controls and contrasting treatments through `betterpptx.authoring.catalog`, `betterpptx.options.catalog`, and focused lessons. Choose exact catalog variants deliberately, when useful. A World or preset is optional; custom or neutral styling is valid. Select effects for a communicative purpose, not a quota. Premium may call for rich combinations, while a restrained brief may call for none. Omit the presenter when it does not serve the story.

When the user requires a narrated self-playing premium deck, set `deliveryExperience:{mode:"narrated-autoplay",requireMotion:true}` and author `autoplay:{enabled:true,...}` plus native narration on each slide. Pace beats across the spoken story, ensure each timed slide advances after its audio and last beat, and verify native narration/timing in final bytes. Treat WebVTT as a separate explicit requirement. This is a fulfillment gate for that brief, not a universal effect quota: honor exclusions and never start paid synthesis without authorization. A click-only deck or a package with animation tags but no observed playback is not proof of narrated autoplay.

A finished slide has something the audience can **see**, not only read. Completeness `minimal` removes decorative chrome; it does not remove proof. A title on empty canvas is not a slide. If the story is a checkout button, put a `textShape` pill on the stage. If the story is a count, put the numeral on the stage. If the story is a comparison of rates, put a native chart on the stage. If the story is a mechanism, put a diagram, process, or equation on the stage. Describe the object in copy only after it is already visible.

For an original deck, use AI-authored slide-inch geometry with `geometryAuthority:"ai"` and `placementPolicy:"ai-authored-geometry-v1"`; give ordinary visible objects exact native frames. Do not invent a visual reference to unlock positioning. If the user supplies an actual designed reference, use the separate `spec.visualReference` route and authored pixel frames/paths with truthful provenance. Prefer native editable PowerPoint for ordinary text, shapes, diagrams, charts, tables, and motion. Images, video, audio, and genuine detailed artwork may remain media. A generated illustration may enrich a conceptual slide when the host permits image generation and BetterPPTX can ingest the authorized asset; never present generated imagery as a real screenshot or evidence.

BetterPPTX also supports an explicit secondary automatic conversion route through `spec.htmlConversion`. Use it only when the user specifically asks for automatic HTML conversion. Do not silently switch an AI reconstruction request to this route, do not combine both routes in one compile, and never use an htmlConversion artifact as proof that the AI reconstruction workflow passed.

Name every visual original and native PPTX with the story it carries. The basename may remain the pairing key, but HTML is only an external visual oracle. Infer the native construction from the composition — a two-track grid, filled capsule, giant numeral, room cards, vector drawing, or plot — and author the corresponding PowerPoint objects explicitly.

## Route through the public contract

- Use only MCP-advertised public tools, uploaded bytes, HTTPS or data assets, and opaque handles. Do not seek source, paths, logs, dependencies, private assets, process metadata, or endpoint internals.
- Start with `betterpptx.auth.status`, then call `betterpptx.help.capabilities` with the user's intent and `detail:"summary"`, followed by `betterpptx.help.workflow` with `detail:"summary"`. Ask focused catalog or recipe questions only when the task needs them.
- If authentication is unavailable, ask the user to connect or authorize access. Never guess, request, or expose credentials.
- Author and revise through `betterpptx.deck.generate_from_spec`. Do not use private builders, opaque native payloads, or package post-processing. Original exact composition uses slide-inch frames; reference reconstruction uses pixels only with a real declared reference. Director assistance never grants the engine geometry authority.
- Treat a BetterPPTX JSON spec as portable presentation source. When the user attaches a `.json` or `.betterpptx-spec.json` file, read [portable-json-spec.md](references/portable-json-spec.md), upload it as `kind:"jsonSpec"`, and pass the returned opaque `specHandle` through the ordinary dry-run/resolve/commit workflow. Do not rebuild it from prose or paste a large file into repeated calls.
- Prefer editable native PowerPoint. Use freeform/customGeometry only when a preset cannot express the visual and record a specific semantic reason for the custom representation. Raster is allowed only for a declared true media asset; an unsupported ordinary visual must be reinterpreted natively or reported as a blocker.
- Ask only for genuinely missing facts, assets, consent, or payment approval. Never invent them.
- Treat `betterpptx.deck.save` as the publication boundary, never as a preview tool. Inspect stage entitlement and quote before chargeable work. Under `production-non-rendering`, deterministic package/media/timing/accessibility/selection checks permit save without hosted PowerPoint. PowerPoint appearance, reopen, pause/resume, and playback are separate release-qualification evidence; do not claim them from package validity. Iterate and correct drafts before save; a later correction is a revision, not proof the first result was flawless.
- For delivery, use the owner-scoped `betterpptx.operation.read_file` with the original save operationId and default `mode:"link"`, then give the user the actual clickable browser URL. A large deck must not be embedded in ChatGPT context: even an explicit `mode:"resource"` falls back to a link above the conservative client-safe size. `operation.status` refreshes the short-lived link while the artifact remains retained; it does not extend file retention. Bounded chunks are for explicit programmatic recovery, not a practical chat default for large decks. Retrieval is not a new publication or a replacement generator.

## Read the relevant guide before acting

For creative judgment:

- Read [story-and-medium.md](references/story-and-medium.md) before shaping the narrative arc or choosing what each idea should become on screen.
- Read [art-direction-and-typography.md](references/art-direction-and-typography.md) before choosing a World, visual grammar, palette, or type system.
- Read [data-storytelling.md](references/data-storytelling.md) when claims depend on quantitative evidence, comparisons, trends, distributions, or exact values.
- Read [accessibility-and-native-composites.md](references/accessibility-and-native-composites.md) before combining editable native objects or making accessibility decisions.

For public execution:

- Read [catalog-choice.md](references/catalog-choice.md) before selecting a World, layout, chart, table, SmartArt, transition, presenter motion, or other catalog-backed variant.
- Read [picture-format-native-authoring.md](references/picture-format-native-authoring.md) before authoring, revising, or porting pictures that use corrections, colour controls, transparency, Artistic Effects, Picture Effects, borders, crops, or Picture Styles.
- Read [native-object-transforms.md](references/native-object-transforms.md) before authoring or porting object rotation, flips, or other common transform controls; use the live catalog for exact typed bounds and Office reset behaviour.
- Read [native-model3d-view.md](references/native-model3d-view.md) for native 3-D camera/view controls or opt-in selected-motion framing; keep automatic motion framing separate from manual view ownership.
- Read [native-image-framing.md](references/native-image-framing.md) before authoring or porting picture fit/crop behavior; use the live `imageFraming` catalog for the exact typed mode, null reset, and source-relative crop boundary.
- Read [native-image-adjustments.md](references/native-image-adjustments.md) before authoring or porting picture corrections, colour/recolour controls, Artistic Effects, Picture Effects, or other picture-format slider families; use the live catalog for every applicable typed leaf, exact range, default, step, reset, and Office readback behavior.
- Read [native-image-color-artistic.md](references/native-image-color-artistic.md) when the image treatment uses grayscale, duotone, recolour endpoints, theme transforms, or Artistic Effects; inspect the nested live parameter catalog rather than selecting a preset-only approximation.
- Read [native-shape-connector-line.md](references/native-shape-connector-line.md) before authoring or porting shape or connector line styling; use the live `line` catalog for exact width, transparency, dash, arrow-type, independent arrow width/length, reset, and alias-boundary behavior.
- Read [native-shape-effect-overrides.md](references/native-shape-effect-overrides.md) before combining a shape-effect gallery tile with independent effect or 3-D values; presets are bases, not authoring ceilings.
- Read [native-background-fill.md](references/native-background-fill.md) before authoring or porting slide backgrounds; use the live `background` catalog for the fill carrier, solid colour, transparency, gradient geometry, pattern, texture, reset, and retained-editability boundaries.
- Read [native-theme-master-layout.md](references/native-theme-master-layout.md) before authoring or porting themes, custom layouts, slide masters, placeholder bindings, or inheritance policy; use the live `layouts-themes-masters` catalog for exact typed selectors, precedence, reset, and template-specific boundaries.
- Read [capability-atlas-and-casebook.md](references/capability-atlas-and-casebook.md) when public capability evidence or an accepted communication-problem case can improve medium selection without prescribing an aesthetic.
- Read [visual-reference-reconstruction.md](references/visual-reference-reconstruction.md) before reconstructing HTML, screenshots, pixels, or another designed visual reference.
- Read [html-slide-design.md](references/html-slide-design.md) only when the user explicitly requests the secondary automatic HTML conversion route.
- Read [new-authoring.md](references/new-authoring.md) for a new deck or a full semantic rebuild.
- Read [portable-json-spec.md](references/portable-json-spec.md) whenever the user provides, requests, exports, shares, or republishes a finalized JSON spec.
- Read [revision-preservation.md](references/revision-preservation.md) before changing an uploaded or existing deck.
- Read [motion-narration.md](references/motion-narration.md) when the deck uses native narration, WebVTT, audio, animation, transitions, or a presenter. Do not equate embedded sound bytes with ordinary click-to-play audio: inspect narration markers and timing, then test slideshow pause/resume in PowerPoint when making that claim.
- Read [presenter-performance.md](references/presenter-performance.md) for multiple body actions, blended poses, 3-D keyframes, travel, entry/exit, and interactions by one presenter on the same slide.
- Always read [review-release.md](references/review-release.md) before approving or saving a candidate.

Read every guide that applies. Use the live help response and public schemas for exact fields when they differ from an example.

## Follow the common execution loop

1. Discover the live workflow and only the relevant unranked catalog families.
2. Compose one `betterpptx.deck-spec.v1` with stable slide/object IDs, AI-authored exact frames, explicit selections, notes, accessibility summaries, and validation intent.
3. Run `betterpptx.deck.generate_from_spec` with `phase:"dryRun"`. Correct every blocking finding and follow factual `next_actions` without treating them as aesthetic recommendations.
4. If the response requires assets, cost, narration, or timing resolution, run `phase:"resolve"`, accept the returned locked spec deliberately, then run `phase:"lockedDryRun"`.
5. Run `betterpptx.deck.generate_from_spec` with `phase:"commit"` on the accepted or locked spec without saving. Validate all applicable deterministic gates. Under `release-powerpoint`, preview explicit zero-based slide indexes in batches of at most 12, continue from `remainingSlideIndexes` until `complete:true`, require one `packageSha256`, and inspect every rendered slide at full size. Under `production-non-rendering`, do not defer a conforming save solely because preview is unavailable; retain `renderPerformed:false` and the non-rendering evidence binding. Revise and recommit whenever a gate or review finds a defect.
6. Freeze the exact candidate and its locked handles. Create one stable release `idempotencyKey`, call `betterpptx.deck.save` exactly once with it, and require the response to identify the selected policy and bind the delivered `packageSha256` to its evidence. An identical retry uses the same key and must not consume another publication. Report only the validation actually performed; return the authorized artifact handle or download route. If an outcome is uncertain, recover by the documented operation path before attempting another publication.

## Preserve entitlement and certification truth

- On `REQUIRES_UPGRADE`, explain the blocked capability and let the user activate access or choose a truthful free-safe alternative. Never simulate gated behaviour.
- Cold certification must use only the public environment and information available through this skill, public help, public schemas, and public readback. Do not rely on developer-only knowledge or hidden rescue.
- If the first saved artifact proves defective, report that honestly and label any corrected artifact as a revision, not first-time-right success.
