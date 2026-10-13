# Choose from public catalogs

Use catalogs as factual, unranked inventories. The AI chooses; the engine filters, validates exact IDs, and executes them. Never delegate aesthetic selection or ranking back to the engine.

When the surrounding teaching release includes the public capability atlas,
use it to narrow discovery by communication function. Use the casebook only
for accepted, evidence-bound transferable lessons; a planned lane is not an
example. See [capability-atlas-and-casebook.md](capability-atlas-and-casebook.md).

## Discover only what the story needs

1. Call `betterpptx.help.capabilities` and `betterpptx.help.workflow` with the user's intent and `detail:"summary"`.
2. Query the relevant family of `betterpptx.authoring.catalog`, the relevant surface of `betterpptx.options.catalog`, or a capability-specific public catalog. Page or filter when needed instead of loading unrelated inventories.
3. Inspect factual fields such as exact executable ID, native/editable status, supported data shape, topology, applicability, and entitlement.
4. Compare viable entries using the audience, story function, explicit World, density, and editability requirements. Make the aesthetic choice yourself.
5. Preserve each chosen ID and its `coherenceReason` in `selectionManifest`. For a custom representation, also state the specific `customReason` why native PowerPoint cannot express the intent.

Focused public routes that actually return selectors:

- Worlds: call `betterpptx.authoring.catalog` with `family:"art-direction"` and bind `selection.executableValue` to `styleIntent.artDirection`. The live inventory is the named World set (including editorial, blueprint, brutalist, mist, atelier, meridian, chalkline, playbook, pulse, collage, observatory, storybook, candy, horizon, mono, botanical, luxe, aurora) plus bespoke axes. Help `artDirections.worlds` is the same unranked list. Do not start from `luxe` unless the brief is actually premium or fundraising.
- Layout intents: call `betterpptx.authoring.catalog` with `family:"layout-intents"` and bind `selection.executableValue` to `slides[].layoutIntent`. Use `hero`, `pull-quote`, `comparison`, `process-flow`, `timeline`, `dense-appendix`, `sidebar-left`, `three-column`, `title-only`, and the other advertised intents when they fit. `title-body` is one option, not the template. `title-only` is for a true one-word poster, not for a product, a count, or a mechanism that still needs a proof object on stage.
- Product chrome and room cards: author `kind:"textShape"` with fill, radius, and the visible label. A checkout Pay pill, a device bezel, or a named room is a `textShape`, not a sentence in a body block. Prefer to design that chrome first in 16:9 HTML (`button.pill`, `.room`, `.n`) and let the engine lower it.
- Column headlines: if the headline lives beside the proof, set `kind:"title"` with `region:"left"` or `"right"` (or put the HTML `h1` in that grid column). The engine places large type in the column and collapses the unused title band. Use a region-less `kind:"title"` only when the headline should sit above the body.
- Mechanism drawings: author `kind:"customGeometry"` with `svg`, or an HTML `<svg>` in the design original. Do not screenshot the diagram.
- Use PowerPoint niceties (`spec.niceties`) whenever an authored slide benefits from an explicit native enhancement: charts, tables, SmartArt, equations, 3D, media, ink/laser annotations, custom geometry, motion-bearing objects, or transitions. They work after an HTML original, on semantic slides, in AI-authored exact-geometry mode, and in visual-reference pixel mode. The AI chooses every nicety; omission means none. Do not rewrite an HTML original into a data-kind dialect to get a catalog feature.
- A single numeral: author `kind:"stat"` or `kind:"kpi"`. Do not hide a giant count inside body copy when the count is the proof.
- Charts: query `betterpptx.authoring.catalog` with `family:"charts"`, page or filter the factual inventory, and choose an implemented row whose data shape and communication role fit the story. Copy its exact `selection.executableId` as `chartPresetId` in `selectionManifest.selections[].selectors`. Put the selected row's `chartType` on the `chart-panel` content block; `chartType` is execution data, not a selector.
- Tables: query `betterpptx.authoring.catalog` with `family:"tables"`, compare implemented rows yourself, and copy the chosen `selection.executableId` as `tableStylePresetId` in selectors. Header and row values stay on the `table-panel`.
- SmartArt: call `betterpptx.smartart.catalog` with a topology `query` such as `cycle`, `process`, or `list`, then copy `layoutId`, `quickStyleId`, and `colorStyleId` from that response into selectors.
- Presenter motion: call `betterpptx.authoring.catalog` with `family:"presenter-motion"` and page until the exact `motion.*` id appears. The `query` string is not a precise filter.
- Picture Format: read [picture-format-native-authoring.md](picture-format-native-authoring.md), then query only the needed `betterpptx.options.catalog` surface. Treat Picture Styles and Artistic Effects as starting selectors only when the catalog says so; bind every separately advertised slider or expanded option explicitly when the design depends on it.

- Every other Ribbon or Format Pane family follows the same rule: a preset is only a starting state, never proof of authoring coverage. Query the full public surface, bind each continuous or discrete parameter with its unit, domain, default, serializer step, and reset behavior, and require fresh-client dry-run/readback evidence. Preserve documented Office canonicalization (for example, a zero-valued effect may be removed on SaveCopyAs) instead of treating it as a silent mismatch.

Each specialized catalog returns `selectionManifestContract.selectorKeys`. Only those keys are legal in `selectionManifest.selections[].selectors`. Extra catalog facts (`chartType`, `dataShape`, `useWhen`, node copy) are not selectors. Preset `optionDefaults` such as `showTitle` are executable starting values, not taste; override them when they would leave a placeholder title, a redundant legend, or unreadable labels. A generic baseline-catalog row that only names a semantic kind is a route, not a selector. Follow the specialized catalog before composing.

## Bind exact choices

- Select `styleIntent.artDirection` explicitly for a first-time-right candidate. An omitted World may receive a legacy compatibility fallback, but that fallback is non-certifying and must never be presented as a recommendation.
- Use `selectionManifest.schemaVersion:"betterpptx.ai-selection-manifest.v1"`, `enforcement:"required"`, and `authoringContract.selectionManifestPolicy:"required-for-release-candidates"` for a release candidate.
- Choose exact selectors for each semantic target. Copy only keys from that capability's `selectionManifestContract`. Never ask the engine to choose the best, rank alternatives, infer taste from the World, or silently substitute a nearby variant.
- Treat layout or geometry feasibility readback only as a constraint check. It may say whether a selected treatment fits; it may not select, rank, or recommend a treatment.
- If dry-run rejects an ID or reports it as non-executable, return to the public catalog and make a new explicit choice. Do not drop the selector and accept a default.
- Verify dry-run, commit, export/readback, and final validation preserve the exact selected IDs and AI-authored reasons.

Do not query source files, private registries, filesystem locations, logs, or implementation details to make a choice.

## Built-in presenter source motions

The presenter-motion family also contains shared built-in source reviews. They expand the product library; a customer does not need a private candidate registry to discover or reuse them. A review ID is an evidence and discovery selector, not an executable motion ID. Use the ordinary catalog's motion requirements and motion-comparisons view to inspect action, hand, body movement, measured intervals, uncertainty, and exact target compatibility. An honest no-qualified-match result is valid; a name or sampled quiet interval does not prove pointing or a continuous hold.

Use an advertised compatibleTargetModels handle with betterpptx.motion.preparation_profiles.list and an explicit original or skeletal-mirrored variant. A profile marked preparationMode:"reuse-only" belongs to the published library: inspect it until preparedOutput.state is "prepared", then use that output's modelAsset on a model3d block and its preparedVariantId in scene.preparedVariantId. Choose length and loop deliberately using the returned sourceClock. Do not submit a reuse-only profile to motion.prepare_variant or author a raw clip index. Unavailable targets or variants must remain no-match. Built-in asset reuse does not grant access to other customers' scenes or exports.
