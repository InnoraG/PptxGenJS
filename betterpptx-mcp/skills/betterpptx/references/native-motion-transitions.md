# Native motion, transitions, and Morph with typed controls

Treat Animation Pane effects and slide transitions as semantic native operations, not decorative presets. Discover `animationPreset` and `transitionPreset` before authoring; the catalog is the source of truth for effect names, parameter ranges, applicability, and the explicit structured-partial boundaries.

Animation controls include effect/type, duration, delay, trigger, direction, sequence, repeat count, auto-reverse, motion-path selection/data, scale, rotation, color, shape type, spokes, amount, media command, and visibility. Transition controls include type, speed/duration, advance-on-click, advance-after-time, direction, through-black, split direction, pattern, spokes, clockwise, zoom origin, Morph option, and the native `p14dur` duration alias. Use milliseconds in semantic JSON specs where the schema advertises `durationMs`/`delayMs`; the compiler lowers them to native timing attributes.

Morph is a transition family: keep stable semantic object names across adjacent slides and use the catalog's matching policy rather than rasterizing a slide. Unmatched objects follow the documented fade/warn policy unless the spec explicitly requires strict pairs.

Precedence is deterministic: the selected native effect/transition is applied first, then explicit typed timing and effect options override only their named fields. Omitted fields retain the selected base. Set the animation or transition object to `null` to reset the carrier; rerun dryRun after every reset or re-edit. Office may canonicalize timing defaults, so proof must include package inspection, PowerPoint Open2007/SaveCopyAs/reopen, and retained native XML—not only a catalog screenshot.

The public proof protocol is fresh discovery, semantic JSON-spec upload, mutation-free dryRun, commit, quality, preview, save, upper-bound rejection, and no-private-leakage inspection. A structured-partial status is an honest Office or effect-specific boundary, not permission to invent unsupported sliders.
