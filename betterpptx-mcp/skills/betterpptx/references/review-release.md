# Review and release once

Treat first-time-right as a release property, not a ban on private iteration. Read the deployment-selected verification policy before choosing the final gate. Iterate through dry-run, resolve when required, locked dry-run, commit, and all applicable validation without saving. Under `release-powerpoint`, add the complete frozen-package preview; under `production-non-rendering`, do not require hosted PowerPoint for a conforming public save. The first `betterpptx.deck.save` after internal approval and freeze is the first public artifact and must be near-perfect without routine user refinement.

## Run every applicable gate

1. Run `betterpptx.deck.validate` for package and structural integrity.
2. Run `betterpptx.deck.validate_design` for deterministic design risks.
3. Run `betterpptx.deck.validate_accessibility` for reading order, summaries, contrast, and other accessibility requirements.
4. Run `betterpptx.deck.validate_narration` when narration is present, plus the avatar-narration validator only when that distinct representation is present.
5. Run `betterpptx.deck.validate_quality` as the aggregate quality gate for the selected verification policy.

Treat objective findings as evidence to fix, not as permission for the engine to choose aesthetics. A zero finding count does not replace visual judgment.

Require the aggregate result to be bound to the current `deckVersion`. Any
semantic mutation invalidates that evidence; rerun the applicable validators
before creating a new preview freeze.

## Inspect every slide at full size when release policy requires it

First inspect `help.capabilities.releaseInfrastructure.verificationPolicy` and
`authoritativePreview`. Under `release-powerpoint`, if the preview reports
`external-infrastructure-required`, keep the candidate unsaved, report the
blocker, and do not claim release readiness. Never replace the authoritative
PowerPoint render with package-only evidence. Under `production-non-rendering`,
PowerPoint preview is intentionally not a save dependency: run the applicable
deterministic checks, keep `renderPerformed:false`, and do not claim that the
exact production package was opened or reviewed in PowerPoint.

When the policy is `release-powerpoint`, use `betterpptx.deck.preview` with explicit zero-based slide indexes and inspect each slide individually, not only a contact sheet. A preview call renders at most 12 slides. Continue with `remainingSlideIndexes` until `complete:true`; require every batch to report the same `packageSha256` and `validationEvidenceSha256` for the current deck version. Judge all ten lenses:

1. Communication: one clear message, accurate claims, useful payoff.
2. Composition: hierarchy, balance, spacing, alignment, and intentional negative space.
3. Typography: readable size, consistent family, strong contrast, clean wrapping.
4. Colour and lighting: coherent World, legible native surfaces, no accidental defaults.
5. Data proof: correct chart/table meaning, labels, units, summaries, and source truth.
6. Native objects: complete SmartArt topology, editable tables/charts/models, correct static state.
7. Motion and timing: authored purpose, cue alignment, reduced/static completeness, no orphan playback.
8. Accessibility: alt text or data summaries, reading order, colour-independent meaning.
9. Technical integrity: no missing assets, corruption, clipping, overlap, overflow, or silent substitution.
10. Beauty: polished, cohesive, audience-appropriate, and free of placeholder or feature-catalog aesthetics. Fail the slide if the audience would describe it as “a few letters on empty canvas.” Quiet Worlds still show the product, the numeral, the chart, or the diagram.

Inspect motion-heavy or native-object slides in the actual PowerPoint render when the release policy requires and the public preview provides it; a package-only or cached poster check is insufficient for release visual/playback claims. This does not turn release evidence into a claim that every future production package has been individually rendered.

Keep a designer loop, not a one-shot score:

- Open the actual PPTX as well as the full-size renders. PNGs are for lenses; the file is what the audience receives.
- If three consecutive slides share the same silhouette—same card row, same gold module, same presenter weight—change the spec's medium or `layoutIntent` and regenerate. Do not freeze that candidate.
- If the presenter could be cropped away without changing the argument, give it a rhetorical job or reduce it.
- After a composition or beauty FAIL, rewrite the semantic spec, regenerate a fresh package in a new folder, and inspect the new PPTX. Skill or spec changes that are not followed by a new file are unfinished.
- If live narration cannot be synthesized, do not freeze. Keep the candidate unsaved, or generate a labeled visual-only inspection package that still carries the spoken script in notes. That package is composition evidence only; it is not narration, timing, or first-save proof.

## Fix, freeze, save

Fix integrity, missing assets, clipping, overlap, text fit, contrast, accessibility, and data-truth defects first. Then correct story, composition, typography, native treatment, motion, and beauty. Recommit and repeat all applicable checks across the whole deck.

Under `release-powerpoint`, freeze only when the exact committed spec, locked plan, asset handles, selection manifest, current-version validators, and full-slide previews agree, `remainingSlideIndexes` is empty, `complete:true`, and no mutation remains pending. Under `production-non-rendering`, freeze the exact committed spec, locked plan, asset handles, selection manifest, and current-version deterministic evidence; preview completion is not required. Create one stable release `idempotencyKey` and call `betterpptx.deck.save` exactly once. Require the delivered `packageSha256` to remain bound to the selected policy's evidence; release responses include `previewVerification`, while production responses include non-rendering `verification` with `renderPerformed:false`. Return only the public download URL or opaque artifact handle.

If the save response is lost or uncertain, stop first-time-right certification and report the ambiguity. An operational recovery may repeat only the identical request with the same `idempotencyKey`, but the recovered run is non-certifying. A different key is a different logical publication and is forbidden.

If that first saved artifact later proves defective, report the failure plainly. Any corrected save is a revision and cannot be relabelled first-time-right.
