# Author pictures with native Picture Format controls

Treat Picture Format as a parameterized authoring surface, not as a gallery of thumbnails. Presets are useful starting points, but they are never the capability ceiling. Prefer explicit native controls whenever the live catalog says they are executable. Do not flatten a slide merely to reproduce a picture treatment.

## Discover the live picture contract

Call `betterpptx.options.catalog` only for the surface needed by the design:

- `surface:"imageAdjustments"` for the combined correction, colour, transparency, recolour, and Artistic Effect surface;
- `surface:"corrections"` for brightness, contrast, and real sharpen/soften;
- `surface:"artisticEffect"`, `format:"full"` for every available effect type and the exact slider names, ranges, defaults, units, and aliases for each type;
- focused surfaces such as `recolor`, `duotone`, `shadow`, `glow`, `reflection`, `softEdge`, `blur`, `fillOverlay`, `shape3D`, or `pictureStylePreset` when the design uses them.

Read `capabilityMode`, `capabilityStatus`, `overrideFields`, `componentOwnership`, and `resetBehavior`. `parameterized` or `preset-plus-parameters` means the advertised controls can be authored explicitly. `preset-only`, `preserve-only`, `partial`, or `missing` is a truthful limit; do not invent a hidden slider or claim decomposition that the catalog does not advertise.

The live Artistic Effect catalog currently exposes 23 persistent PowerPoint effect types and every slider that survives in the saved presentation. Discover the exact type and parameter contract at authoring time rather than memorizing it, because the public catalog is the executable authority.

## Author gradient stops as real controls

Gradient fills are not limited to the two-stop gallery examples. Discover `surface:"fill"` or `surface:"background"` with `format:"full"`; the returned `parameters` expose independent `gradientStopPosition`, `gradientStopColor`, and `gradientStopTransparency` controls for every stop, plus the full geometry contract: `gradientDirection`, `gradientAngle`, `gradientFlip`, `rotateGradientWithShape`, `fillToRect.l/t/r/b`, and `tileRect.l/t/r/b`. The canonical stop position is `0..100` percent (0.001-point step), colour is a required six-digit hex value, and stop transparency is `0..100` percent (0.001-point step). Positions serialize to `a:gradFill/a:gsLst/a:gs/@pos` and transparency to the stop colour's `a:alpha`; the values remain native and editable rather than becoming a raster overlay. A nested `gradient.stops` authoring form may use normalized `0..1` positions, while nested `gradient.type|direction|path`, `angleDeg`, `flip`, `rotateWithShape`, `focusRect`, `fillToRect`, and `tileRect` map to the same canonical controls.

### Author gradient geometry as real controls

Use `gradientDirection:"linear"` with `gradientAngle:0..360` degrees (0.001 step) for `a:lin/@ang`; use `circle`, `rect`, or `shape` for the native `a:path/@path` selector. `gradientFlip` is the typed `none|x|y|xy` value serialized to `a:gradFill/@flip`, and `rotateGradientWithShape` is a real boolean serialized to `a:gradFill/@rotWithShape` (default `true`). For path gradients, `fillToRect` is a four-leaf 0..100-percent focus rectangle serialized under `a:path/a:fillToRect`; `tileRect` is the same four-leaf range serialized as `a:tileRect`. Each leaf is independently editable, null-resettable, and preserved when unrelated fill components are patched. These controls are native DrawingML, not screenshots or preset replays. `fillToRect` is applicable to path gradients; the compiler reports applicability rather than silently applying it to linear gradients.

### Author pattern and texture placement as real controls

Pattern fills expose the complete native selector domain through `patternPreset` plus independent `patternForeground` and `patternBackground` hex colors. The selector is serialized to `a:pattFill/@prst`, with colors in `a:fgClr` and `a:bgClr`; a gallery tile is only a convenience for choosing the selector. Texture/picture fills expose `textureMode` (`tile|stretch`), `textureScaleX/Y` (`0..2` multipliers, 0.00001 step), `textureOffsetX/Y` (`-100..100` inches, 0.0001 step), `textureAlignment` (`tl|t|tr|l|ctr|r|bl|b|br`), `textureFlip` (`none|x|y|xy`), `textureRotateWithShape`, and `textureTransparency` (`0..100` percent). These map to native `a:tile`/`a:stretch`, `a:tile/@sx`, `@sy`, `@tx`, `@ty`, `@algn`, `@flip`, `a:blipFill/@rotWithShape`, and the blip alpha. Use an opaque public asset handle, generated recipe, or native preset source; the pixels remain asset-editable while placement remains independently UI-editable. Every leaf has null/reset semantics, sparse patches preserve omitted leaves, and the same controls apply to a slide background without using a screenshot.

Gradient stop arrays are the atomic combination boundary: sparse re-editing replaces the array while preserving unrelated fill, line, effect, and 3-D components. Set `style.fill:null` (or `type:"none"`) to reset the complete shape fill, and set `slides[].background:null` to restore the native/theme background. A stop transparency of `0` removes the authored alpha child; do not infer a reset from a preset tile. Always validate at least two stops and keep positions/colors/transparency within the catalog ranges.

## Use a native image object

Author a semantic `kind:"image"` object with a stable `name`, semantic `region`, and accurate `altText`. Supply image bytes through a public-safe source advertised by the live schema: an uploaded opaque asset handle, an HTTPS URL, or inline image data. Never send a server filesystem path through the public endpoint.

Put Picture Format controls on `imageAdjustments`. This example keeps the photograph editable while combining corrections, colour, transparency, and a parameterized Artistic Effect:

```json
{
  "kind": "image",
  "name": "customer-proof-photo",
  "region": "hero",
  "data": "data:image/png;base64,...",
  "altText": "Customer using the product in a bright studio",
  "imageAdjustments": {
    "brightness": 0.06,
    "contrast": 0.12,
    "sharpness": 0.35,
    "saturation": 1.25,
    "temperature": 5400,
    "transparency": 12,
    "artisticEffect": {
      "type": "paintStrokes",
      "intensity": 8,
      "transparency": 0.2
    }
  }
}
```

The two transparency scales are deliberately different: picture transparency is `0..100` percent, while an Artistic Effect's `transparency` slider is normalized `0..1` when that effect advertises it.

Current continuous correction and colour ranges are:

| Field | Range | Default | Meaning |
| --- | ---: | ---: | --- |
| `brightness` | `-1..1` | `0` | native picture brightness |
| `contrast` | `-1..1` | `0` | native picture contrast |
| `sharpness` | `-1..1` | `0` | soften through sharpen |
| `saturation` | `0..4` | `1` | colour saturation multiplier |
| `temperature` | `1500..11500` | `6500` | colour temperature in kelvin |
| `transparency` | `0..100` | `0` | whole-picture transparency percent |

Use the catalog's per-effect parameters exactly. For example, Paint Strokes currently advertises `intensity:0..10` and normalized `transparency:0..1`; another Artistic Effect may expose a different control such as `brushSize`, `pressure`, `detail`, `scaling`, or `radius`. Omitted parameters use the PowerPoint-authored default for that effect. Never reuse Paint Strokes parameters on another effect without checking its contract.

Theme-aware recolour endpoints preserve the complete DrawingML scheme domain advertised by the live `recolor` surface: `tx1`, `tx2`, `bg1`, `bg2`, `dk1`, `lt1`, `dk2`, `lt2`, `accent1` through `accent6`, `hlink`, `folHlink`, and `phClr`. Use the returned `valueDomains.scheme` list rather than substituting a resolved RGB value. Each endpoint may independently add `tint:0..1`, `shade:0..1`, `saturation:0..4`, and `opacity:0..1`.

## Author borders and Picture Effects without a preset

Use `style.line` for a preset-free native picture border and `style.effects` for the structured Picture Effects list. The line accepts colour, width, dash, and transparency independently. Each effect uses the exact fields advertised by its focused catalog surface:

```json
{
  "kind": "image",
  "name": "native-effect-photo",
  "region": "hero",
  "data": "data:image/png;base64,...",
  "style": {
    "line": {
      "color": "EC4899",
      "width": 5.25,
      "dash": "dashDot",
      "transparency": 30
    },
    "effects": [
      { "type": "glow", "color": "22D3EE", "opacity": 0.72, "radiusPt": 18 },
      { "type": "reflection", "blurPt": 4, "distancePt": 9, "directionDeg": 75, "startOpacity": 0.55, "endOpacity": 0.08, "startPosition": 0.1, "endPosition": 0.72 },
      { "type": "softEdge", "radiusPt": 8 },
      { "type": "blur", "radiusPt": 6, "growBounds": true },
      { "type": "fillOverlay", "blendMode": "screen", "fill": { "type": "solid", "color": "FDE68A", "transparency": 45 } }
    ]
  }
}
```

`glow`, `softEdge`, `blur`, `reflection`, and `fillOverlay` are exact structured surfaces: discover their current radius, opacity, distance, direction, fade, grow-bounds, blend-mode, fill, colour, and transparency contracts before authoring. Glow and soft-edge radius are continuous `0..100` points with a `1/12700`-point serializer step; glow opacity is continuous normalized `0..1` with alpha serialized as `round(opacity*100000)`. Reflection exposes typed `blurPt` (`0..100` points, `a:reflection/@blurRad`), `distancePt` (`0..200` points), `directionDeg` (`0..359` degrees), start/end opacity (`0..1` normalized), and start/end position (`0..1` normalized, `0.01` step, serialized as `round(value*100000)` in `a:reflection/@stPos` and `@endPos`). The shape compiler also accepts legacy `fadeStart`/`fadeEnd` percentage aliases and normalizes them to this same native contract. PowerPoint may omit zero-radius glow, soft-edge, or reflection attributes as canonical resets; its fully opaque reflection start-opacity endpoint can also omit `stA` on SaveCopyAs/reopen, which is an explicit Office boundary while native XML remains exact. The current discrete controls are `blur.growBounds` (`false|true`, default `true`; false serializes as `a:blur/@grow="0"`, while true may be omitted by PowerPoint as the markup default) and `fillOverlay.blendMode` (`over|multiply|screen|darken|lighten`, default `multiply`; `multiply` serializes as OOXML `mult`). `blur.radiusPt` is continuous `0..100` points with a `1/12700`-point serializer step. Fill-overlay transparency is normalized `0..1` (percent inputs up to `100` are accepted for compatibility) and serializes to DrawingML alpha. To re-edit one effect, replace that typed entry. To remove one effect while preserving the others, submit the revised array without that entry. Set `style.effects:null` or `[]` only when the complete structured effect list should be removed. Set `style.line:null` to remove the border in a replacement/recompile revision. These controls remain separate from `imageAdjustments`, so resetting colour or transparency does not implicitly discard a border, glow, reflection, soft edge, blur, or overlay.

Picture 3-D uses the separate `style.effect3D` component:

```json
{
  "kind": "image",
  "name": "native-three-d-photo",
  "region": "hero",
  "data": "data:image/png;base64,...",
  "style": {
    "effect3D": {
      "bevel": { "type": "circle", "width": 9, "height": 4.5 },
      "extrusion": 10,
      "extrusionColor": "F97316",
      "material": "plastic",
      "lightRig": "soft",
      "rotationX": 24,
      "rotationY": -15,
      "rotationZ": 7
    }
  }
}
```

The live `shape3D` catalog currently labels this surface `structured-partial`. Its typed top/bottom bevel width and height, extrusion depth/color, contour width/color, material, light-rig, light-direction degrees, and X/Y/Z rotation fields are executable native controls. The measured Office bounds are `0..1000` points for bevel/contour leaves, `0..5000` points for extrusion, and `0..359` degrees for light direction; camera field of view and Z position remain explicit boundaries, not hidden sliders. Discover the `parameters` array and bind each needed leaf instead of treating a 3-D gallery tile as the ceiling. Set `style.effect3D:null` to remove only the structured 3-D component while preserving unrelated effects.

For shared text and shape 3-D, `options.text3D.material` and `options.effect3D.material` expose the complete fifteen-value native domain (`legacyMatte`, `legacyPlastic`, `legacyMetal`, `legacyWireframe`, `matte`, `plastic`, `metal`, `warmMatte`, `translucentPowder`, `powder`, `dkEdge`, `softEdge`, `clear`, `flat`, `softmetal`) as a typed discrete parameter. Native serialization retains every `a:sp3d/@prstMaterial` value; PowerPoint/SaveAs may omit `warmMatte`, which is recorded as an explicit Office roundtrip boundary rather than silently treated as exact retained readback.

The adjacent `options.text3D.lightRig` and `options.effect3D.lightRig` selectors expose all 27 DrawingML light-rig names as a typed discrete domain (`balanced`, `brightRoom`, `chilly`, `contrasting`, `flat`, `flood`, `freezing`, `glow`, `harsh`, `legacyFlat1`–`legacyFlat4`, `legacyHarsh1`–`legacyHarsh4`, `legacyNormal1`–`legacyNormal4`, `morning`, `soft`, `sunrise`, `sunset`, `threePt`, `twoPt`). `lightDirection` remains an independent 0..359-degree control; choosing a rig never limits that degree override.

Bevel shape selectors are independently typed as well: `options.text3D.bevel.type` / `options.effect3D.bevel.type` and `bevelBottom.type` each expose all 12 native presets (`angle`, `artDeco`, `circle`, `convex`, `coolSlant`, `cross`, `divot`, `hardEdge`, `relaxedInset`, `riblet`, `slope`, `softRound`). Width and height remain separate continuous point controls; selecting a bevel tile does not cap either slider.

The 3-D surface is composable and resettable. A sparse JSON-spec patch may combine `bevel`, `bevelBottom`, `extrusion`, `extrusionColor`, `contourWidth`, `contourColor`, `material`, `lightRig`, `lightDirection`, and rotations; omitted fields remain unchanged. Set one owned component to `null` to remove it and restore its PowerPoint default, or set the complete `text3D`/`effect3D` object to `null` to reset the whole 3-D surface. Re-edit by submitting only the changed nested component through `betterpptx.deck.generate_from_spec`; do not replace unrelated 3-D controls or infer a reset from a gallery preset.

## Separate presets from expanded controls

The live `pictureStylePreset` surface exposes all 28 native Picture Styles as `preset-plus-parameters` with `executable-exact-structured` status. Each catalog row contains `expandedOptions.pictureStyle`, a public recipe made from five editable components:

- `geometry`: preset geometry and named adjustment handles;
- `fill`: none or a structured solid colour;
- `line`: border type, width in points, cap, compound style, alignment, dash, join, miter limit, and colour;
- `effects`: ordered outer/inner shadow, reflection, and soft-edge parameters;
- `threeD`: camera, perspective, rotation, light rig, material, extrusion, contour, and bevel parameters.

The `pictureStyle.threeD.lightRig.direction` field is an independent discrete native control, not a preset-only hint. Its complete public domain is `topLeft`, `top`, `topRight`, `left`, `none`, `right`, `bottomLeft`, `bottom`, and `bottomRight`; these map to the native DrawingML tokens `tl`, `t`, `tr`, `l`, `none`, `r`, `bl`, `b`, and `br`. The native serializer and public validator accept exactly this domain and reject arbitrary strings. PowerPoint accepts all nine direction enum values, but SaveAs/reopen canonicalizes the semantic `none` value to `top`; keep that as a visible structured-partial Office boundary rather than silently substituting a preset.

The same light-rig object exposes independent continuous `rotation.xDeg`, `rotation.yDeg`, and `rotation.zDeg` controls over `-180..180` degrees (0.1-degree authoring step). They serialize to the light-rig `a:rot/@lat`, `@lon`, and `@rev` attributes and are retained through native package SaveCopyAs/reopen. PowerPoint's COM object exposes only `Shape.ThreeD.RotationX/Y/Z`, which rotate the camera rather than the light rig; there is no writable Office light-rig rotation endpoint. The public catalog therefore exposes all three sliders as `structured-partial` with an explicit Office-authored UI boundary, rather than falsely presenting them as preset-only or silently mapping them to camera rotation.

`pictureStyle.threeD.format.material` is likewise an independent discrete native control over all fifteen DrawingML material names: `legacyMatte`, `legacyPlastic`, `legacyMetal`, `legacyWireframe`, `matte`, `plastic`, `metal`, `warmMatte`, `translucentPowder`, `powder`, `dkEdge`, `softEdge`, `clear`, `flat`, and `softmetal`. PowerPoint's `PresetMaterial` accepts all fifteen ordinals, but ordinal 8 (`warmMatte`) is canonically saved without `a:sp3d/@prstMaterial`; native serialization and the public validator retain the requested `warmMatte` value, so this is an explicit `structured-partial` Office boundary rather than a missing capability.

The catalog also reports `pictureStyle.threeD.position.z` explicitly as `unsupported`, rather than silently omitting or pretending to serialize it. Deterministic PowerPoint surface probing found no writable `PositionZ`, `CameraZ`, translation, or offset member, and DrawingML has no independent camera/shape position-Z attribute. A client that submits this field is rejected with a precise boundary message; use the supported camera preset, perspective, rotations, extrusion depth, or model3D camera controls instead.

Use a preset as a starting recipe, then author only the override you need. Omitted components and nested fields inherit the selected preset:

```json
{
  "kind": "image",
  "name": "framed-customer-photo",
  "region": "hero",
  "data": "data:image/png;base64,...",
  "pictureStylePresetId": "picture-style-001",
  "pictureStyle": {
    "line": {
      "widthPt": 3.25
    }
  }
}
```

The example changes one real border slider while keeping the preset's geometry, fill, remaining border settings, shadow, and 3-D treatment. The catalog's `overrideFields` lists every supported path and `expandedOptions` supplies the complete recipe when the AI wants to edit an effect array or design a preset-free treatment.

Reset ownership is explicit:

- set `pictureStyle.effects:null` to remove only the Picture Style effect stack;
- use the same component-level null for `geometry`, `fill`, `line`, or `threeD`;
- set `pictureStyle:null` to remove the complete Picture Style treatment;
- use `imageAdjustments` resets separately; they control the picture's correction/colour/artistic layer rather than its frame style.

When revising an imported picture, patch the smallest owned component. A structured edit replaces the matching imported or preset component while preserving unrelated picture content. Never request or carry raw XML in a public JSON spec, and never silently substitute a rasterized look.

## Verify the authored result

1. Dry-run the spec and correct every unsupported type, field, range, or asset finding.
2. Commit without saving, validate, and—when the deployment policy is `release-powerpoint` or the caller explicitly requests preview—preview every affected slide at full size. Under `production-non-rendering`, retain deterministic package/media/timing evidence and do not defer a conforming save solely for the unavailable renderer.
3. Use public export/readback evidence to confirm the chosen native controls and exact parameter values survived generation.
4. If the workflow exposes save-and-reopen or native-editability evidence, require it for claims about PowerPoint editability.
5. Save the frozen, fully previewed candidate only once through the normal release boundary.

If a needed Ribbon control is absent or only preset-level, keep a minimal portable JSON spec, the intended public control and value, the relevant public catalog response, and the opaque generated-artifact evidence. Report that as a teaching-and-engine gap for the builder loop without requesting source code, paths, logs, or implementation details.
