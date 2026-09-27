# Author a new deck

## Establish the brief

Resolve the audience, decision or outcome, single remembered message, factual boundaries, and available proof before designing slides. Ask for missing facts, assets, rights, consent, or payment approval; do not invent them.

Before drafting slides, inspect relevant live controls and treatments. A World is optional; custom/neutral styling and original exact composition remain available. Do not begin from a recurring house style, presenter, cycle, or metric-grid unless the communication job needs it.

Every slide except a true one-word poster must carry a visible native proof object. Completeness `minimal` means no extra frames or gradient chrome, not an empty stage. Do not author `layoutIntent:"title-only"` with only a `kind:"title"` block for a product, a count, a decision, or a mechanism. Put the thing on the slide.

Design the visual proof before compiling. For original work, author exact native slide-inch frames without fabricating a reference. If the brief supplies HTML, pixels, screenshots, or another designed reference, read [visual-reference-reconstruction.md](visual-reference-reconstruction.md), inspect the reference, and author native objects against its real pixel viewport. Upload only true media assets. Use `pixelFrame`, `pixelPoints`, or `pixelPaths` only through `spec.visualReference`. Use `spec.htmlConversion` only when automatic HTML conversion was explicitly requested.

Write an AI-authored handshake with `audience`, `promise`, `proof`, and `bar`. Use it to keep precommit facts consistent, but never treat a matching handshake as first-time-right proof by itself.

Define a story arc. Give every slide a stable `id`, a role, one message, and a payoff in the larger narrative. Mark representative, illustrative, estimated, or sourced data truthfully.

## Declare the authoring contract

Build one `betterpptx.deck-spec.v1` around these invariants:

```json
{
  "schemaVersion": "betterpptx.deck-spec.v1",
  "title": "...",
  "handshake": {
    "audience": "...",
    "promise": "...",
    "proof": ["..."],
    "bar": "..."
  },
  "authoringContract": {
    "workflow": "ai-sovereign-v1",
    "creativeAuthority": "ai",
    "directorMode": "off",
    "verificationMode": "complete",
    "geometryAuthority": "ai",
    "placementPolicy": "ai-authored-geometry-v1",
    "coordinateSystem": "inches",
    "opaqueNativePolicy": "forbidden-in-public-spec",
    "nativePreference": "native-when-available",
    "selectionManifestPolicy": "required-for-release-candidates"
  },
  "styleIntent": {
    "artDirection": "<optional World or custom direction>",
    "tone": "...",
    "density": "..."
  },
  "contentStory": {
    "audience": "...",
    "outcome": "...",
    "remember": "..."
  },
  "visualDesign": {
    "world": "<optional World or custom direction>",
    "framing": "...",
    "tone": "..."
  },
  "motionTime": {
    "masterClock": "...",
    "timingSource": "...",
    "syncPolicy": "..."
  },
  "selectionManifest": {
    "schemaVersion": "betterpptx.ai-selection-manifest.v1",
    "enforcement": "required",
    "selections": []
  },
  "validation": {
    "previewBeforeSave": true,
    "validateBeforeSave": true,
    "requireAccessibility": true
  },
  "slides": []
}
```

AI-sovereign is the recommended workflow. It disables Director planning,
creative rewriting, and mandatory Content/Story, Visual/Design, and Motion/Time
domain gates while retaining complete compiler, package, accessibility, media,
timing, selection, and current-version validation. Director assistance remains
available by selecting `workflow:"authoring-excellence-director-v1"`; only that
assisted workflow requires all three Director domains.

When the AI needs complete control of native slide composition, select the explicit pair
`geometryAuthority:"ai"` and `placementPolicy:"ai-authored-geometry-v1"`.
That mode accepts finite positive slide-inch `rect`/`bbox` or `x`/`y`/`w`/`h`
on native content blocks (and named `regionPlan` rectangles), preserves the
authored values, and still runs fit, overlap, off-slide, accessibility, package,
and native-editability validation. Raw PowerPoint XML, opaque-native
preservation payloads, and private motion maps remain forbidden in both modes.

Use the live public schema and workflow response for exact optional fields. Do not copy an example mechanically.

In AI-sovereign mode, the three Director domains are optional descriptive metadata. In Director-assisted mode, populate Content/Story, Visual/Design, and Motion/Time, including a deliberate static or visual-only Motion/Time declaration. Populate the selection manifest with every exact choice before treating the spec as a release candidate. Copy only the selector keys advertised by each catalog's `selectionManifestContract`; put semantic fields such as `chartType` on the content block.

## Author semantic content

- Choose an explicit World only if it helps the brief; otherwise author a custom/neutral direction. Select exact catalog-backed variants deliberately and inspect defaults that would affect the result.
- Use stable, descriptive `slides[].id` and `content[].name` values. Anchor notes, narration, motion, interactions, selection-manifest entries, and future revisions to those identities.
- Describe intent with slide roles, regions, arrangement, hierarchy, and presenter stage, then author finite positive slide-inch rectangles for every visual object under `geometryAuthority:"ai"` and `placementPolicy:"ai-authored-geometry-v1"`. Director assistance may advise but never places or repositions objects. For visual-reference reconstruction, declare `spec.visualReference` and use `pixelFrame`, `pixelPoints`, or `pixelPaths` instead. `semantic-layout-only` is deactivated.
- Keep shape geometry separate from text. Use the semantic text-bearing kind advertised by the live workflow.
- Put a column headline in the column: `kind:"title"` plus `region:"left"` or `"right"`. In visual-reference mode, its pixel frame is the authority. A region-less semantic title still occupies the title band when the headline should sit above a row of cards or steps.
- Give charts, tables, SmartArt, equations, pictures, models, and other meaningful visuals an accurate accessibility summary. Preserve speaker notes.
- Prefer native/editable objects. Do not add a feature merely to demonstrate coverage.
- Choose a restrained or minimal completeness treatment only when it is a deliberate AI decision with a reason, not an engine shortcut.

## Compile without saving

Run `betterpptx.deck.generate_from_spec` with `phase:"dryRun"` and `commitMode:"createNew"`. Resolve only when public readback requires assets, billing approval, narration, or timing locks. Run `lockedDryRun` on the accepted locked spec, then commit that exact spec. Do not call `betterpptx.deck.save` during development or visual iteration.

Continue with [review-release.md](review-release.md).
# Native PowerPoint niceties

`spec.niceties` is a first-class optional overlay for deliberate native PowerPoint depth. Each entry targets a slide with `slideId` (preferred), `slideIndex`, or `htmlWorld`, then may append a native block, replace a named `htmlSketch`, add a transition, and record an exact catalog selection. Supported families include native charts, tables, SmartArt, equations, 3D, media, ink/laser annotations, custom geometry, groups, text effects, animations, and transitions.

Niceties preserve the selected geometry authority: use `region` in semantic mode, `rect` in `ai-authored-geometry-v1`, or `pixelFrame`/`pixelPoints`/`pixelPaths` in visual-reference mode. The engine does not invent or rank niceties; the AI selects them for communicative value.
