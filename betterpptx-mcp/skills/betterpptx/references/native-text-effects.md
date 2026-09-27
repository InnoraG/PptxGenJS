# Native text effects: independent sliders

Text-character effects are native authoring surfaces, not screenshots of the
WordArt or Text Effects gallery. Use the public option catalog to discover the
exact contract, then author the effect on the text run (`style.textShadow` or
`style.textReflection`) independently of the text-box panel effects.

## Shadow

`textShadow` applies to ordinary text and WordArt. It exposes the complete
editable contract: `type` (`outer`, `inner`, or `none`), theme/hex `color`,
normalized `opacity` (`0..1`), `blurPt` (`0..100` points), `distancePt`
(`0..200` points), `angleDeg` (`0..359` degrees), `scaleX`/`scaleY`
(`0..2`), `skewXDeg`/`skewYDeg` (strictly `-90..90` degrees), and
`rotateWithShape`. Each field is typed and serialized to the native text-run
DrawingML effect; omitted fields retain the current value in a sparse patch.

## Reflection

`textReflection` applies to ordinary text and WordArt and exposes
`blurPt` (`0..100` points), `distancePt` (`0..200` points), `directionDeg`
(`0..359` degrees), `startOpacity`/`endOpacity` (`0..1` normalized), and
`startPosition`/`endPosition` (`0..1`, `0.01` step), plus `scaleY`
(`-1000..1000` percent; negative values flip vertically). These are text-run
reflection controls, separate from a shape/picture reflection.

## Precedence and reset

Preset selectors are only starting recipes. Explicit text-effect components
override the named leaves without flattening the rest of the preset. Set one
component to `null` to remove that override, set `style.textShadow` to `null`
or `type:"none"` to remove the text shadow, and set `style.textReflection`
to `null` to remove the reflection. Do not use a raster fallback for a
supported text effect. PowerPoint may canonicalize neutral/default attributes
on SaveCopyAs/reopen; record the native package and Office readback result
instead of silently treating a normalized default as a missing capability.

## Client procedure

1. Call `betterpptx.options.catalog` with `surface:"textShadow"` or
   `surface:"textReflection"`, `format:"full"`.
2. Bind the typed fields to the text or WordArt object in the JSON spec.
3. Run `dryRun`, commit, read back the semantic values, and validate the
   rendered result. For revisions, patch or replace only the effect component
   that changed and verify null-reset/re-edit behavior.
4. Keep public responses semantic: never send repository paths, XML, or
   implementation details to the authoring client.
