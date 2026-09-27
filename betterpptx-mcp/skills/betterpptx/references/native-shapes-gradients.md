# Native shapes, fills, gradients, and effects

Use this family as a parameterized authoring surface, not as a list of visual presets. A JSON spec may combine a shape/connector geometry, a solid/gradient/pattern/texture/picture fill, line controls, effects, overlays, and optional 3-D formatting in one object. Presets are starting recipes; explicit fields always win.

## Fills and gradients

`style.fill` supports `none`, `solid`, `gradient`, `pattern`, `texture`, and `picture`. Gradient stops are independently editable (`position`, `color`, `transparency`) and the gradient geometry is independent: `gradientDirection`, `gradientAngle`, `gradientFlip`, `rotateGradientWithShape`, `fillToRect`, and `tileRect`. On an existing shape, use `null` on one leaf to remove that authored override while retaining the rest of the fill, or set the fill component to `null` to restore the selected preset/native base. In an initial deck spec, `style.line: null` retains its compatibility meaning of an explicitly authored native no-line.

Pattern and texture fills expose the actual placement controls rather than a single preset: pattern preset/foreground/background; texture mode, scale, offset, alignment, flip, and rotate-with-shape. Picture fills require an opaque public asset handle. Do not embed server paths or private filesystem locations.

## Lines, geometry, and effects

`style.line` exposes width, color, transparency, dash type, begin/end arrow type, and independent arrow width/length. `fillOverlay` exposes blend mode and fill transparency. The structured effects surface covers shadow, glow, reflection, soft edge, blur, and composed effect arrays. Shape-style and shape-effect presets may be overridden leaf-by-leaf and reset component-by-component.

Shape geometry remains native and editable: preset geometry, adjustments, connector routing, rotation, flip, and transform are separate controls. `effect3D` carries bevel, extrusion, contour, material, light rig, light direction, and X/Y/Z rotation. The generated shape-formatting contract validates the executable geometry/preset domains and applies one deterministic order: native/default base, Shape Style preset, ordered Shape Effects presets, then explicit authored overrides. Add, update, and exported semantic readback share this state, so replacing or removing a preset cannot leave stale expanded recipe fields behind.

## Lifecycle contract

For a release or consolidated certification campaign, use the same sequence: discover the typed catalog, create or import a spec, dry-run without mutation, commit, patch/re-edit, set one component to `null`, validate/preview, export the authored spec, save, and read back. Native proofs include package integrity and PowerPoint open/SaveCopyAs/reopen where the Office surface is writable. Public proofs are black-box only and must verify no private paths, source, or implementation metadata leak.

The current 607-row `shapes-gradients` implementation inventory is executable-exact-structured. That is implementation truth, not a claim that the separate formal Office/public/visual certification denominator is complete. Preserve imported-only and approved procedural-effect boundaries, and archive consolidated certification evidence without rerunning broad UI/Office proof for every generated catalog leaf.
