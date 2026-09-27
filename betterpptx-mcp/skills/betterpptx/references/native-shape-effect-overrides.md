# Native style/effect presets with typed overrides

Use `shapeStylePresetId`, `shapeEffectPresetIds`, `wordArtStylePresetId`, and `textEffectPresetIds` as native base treatments, never as ceilings on authoring. The selected gallery recipe is the starting point; independent typed overrides remain authorable in `style`:

- Shape Style: `style.fill`, `style.line`, `style.shadow`, `style.glow`, `style.reflection`, `style.softEdges`, `style.blur`, `style.fillOverlay`, `style.effects`, and `style.effect3D`.
- WordArt Style: `style.fill`, `style.line`, `style.textFill`, `style.textOutline`, `style.textShadow`, `style.textGlow`, `style.textReflection`, `style.effects`, `style.text3D`, and `style.wordArt`.
- Shape/Text Effect galleries: `style.shadow`, `style.glow`, `style.reflection`, `style.softEdges`, `style.blur`, `style.fillOverlay`, `style.effects`, and `style.effect3D`.

- `shadow`: `blurPt`, `distancePt`, `angleDeg`, `scaleX`, `scaleY`, `skewXDeg`, `skewYDeg`, `rotateWithShape`, plus color/opacity.
- `glow`: `radiusPt`, `opacity`, plus color.
- `reflection`: `blurPt`, `distancePt`, `directionDeg`, `startOpacity`, `endOpacity`, `startPosition`, `endPosition`.
- `softEdges`: `radiusPt`.
- `blur`: `radiusPt`, `growBounds`.
- `fillOverlay`: `blendMode` and `fill.transparency`.
- `effect3D`: bevel, extrusion, contour, material, light rig, light direction, and independent `rotationX`, `rotationY`, `rotationZ` axes.

The precedence contract is deterministic: the exact native gallery recipe is applied first; explicit typed fields then override only their named components. Omitted fields retain the preset base. Set an override component to `null` to remove that override while retaining the selected base treatment. Set the relevant preset selector to `null` and remove override components to reset the full treatment.

The 3-D rotation axes use degrees in the public semantic spec, range `-360..360`, default `0`, and native `1/60000`-degree serialization. PowerPoint may canonicalize neutral/default 3-D values during SaveCopyAs/reopen; proofs must report retained XML and the Office boundary rather than claiming a setter that does not exist.

For a fresh public-client proof, discover `betterpptx.options.catalog` with surfaces `shapeStylePreset`, `shapeEffectPreset`, `wordArtStylePreset`, and `textEffectPreset`; verify `capabilityMode: "preset-plus-parameters"`, `capabilityStatus: "executable-exact-structured"`, the complete `overrideFields`, and nested `parameters`. Then create, dry-run, commit, reset, re-edit, export, preview, quality-check, and save a semantic JSON spec. Do not send private file paths, raw XML, or implementation-specific handles.
