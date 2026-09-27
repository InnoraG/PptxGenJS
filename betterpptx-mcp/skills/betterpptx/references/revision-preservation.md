# Revise while preserving the source

Treat the supplied deck as immutable input. Never patch its package, overwrite it, or broadly reconstruct it when a bounded semantic change is possible.

## Establish a public baseline

1. Open uploaded bytes with `betterpptx.deck.open_uploaded` and retain its opaque `deckId` and `deckVersion`.
2. Inspect `betterpptx.deck.summary` and `betterpptx.deck.export_spec` at sufficient detail.
3. Record the target slide ID, stable exported object `name`, speaker notes, accessibility summary, theme/master/layout context, sections, selection manifest, and the semantic state of untouched slides.
4. Render or preview the source before changing it when visual preservation matters.

Use stable exported object identity. Avoid index-only selectors when a stable object name is available.

## Apply the smallest semantic patch

- Prefer `betterpptx.deck.generate_from_spec` with the existing `deckId`, matching `deckVersion`, `commitMode:"patch"`, and a sparse spec that targets only the intended slide or object.
- Run `phase:"dryRun"` first and inspect the public patch plan. Reject an unexpectedly broad remap, delete, or regeneration.
- Preserve names, notes, alt text, data summaries, semantic selectors, and selection-manifest state unless the requested revision changes them.
- Preserve public `nativePreservation` handles for untouched exported native objects. Do not fabricate, decode, remove, or disable a handle. Intentionally editing an object's semantic payload may regenerate that target; unrelated native objects must remain preserved.
- Keep every unchanged slide out of the sparse patch unless the live workflow explicitly requires it.
- If the public patch route cannot express the requested edit safely, stop and explain the limitation. Do not fall back to primitive edits, direct geometry, package mutation, or full-deck rebuilding without user direction.

## Prove preservation before release

After commit, export and compare public semantic readback against the baseline. The delta should contain only the intended change. Check stable identities, slide order, notes, accessibility summaries, theme/master/layout context, selections, and native-preservation state.

Under `release-powerpoint`, preview every slide, including untouched slides; a target-only preview cannot prove preservation. Under `production-non-rendering`, run the applicable deterministic preservation and package checks without treating an unavailable renderer as a save blocker. Then follow [review-release.md](review-release.md) without saving intermediate revisions.
