# Native slide-background fill

Treat a slide background as a native fill carrier, not as a screenshot or an
engine-injected rectangle. Author it through `slides[].background` in the
portable JSON spec and discover exact fields through `betterpptx.options.catalog`
with `surface:"background"` and `format:"full"`.

The portable carrier uses `type`, `color`, and `transparency`. The catalog names
`fillType`, `fillColor`, and `fillTransparency` are also accepted as aliases and
export as the canonical fields; both spellings must agree if supplied together.
It exposes the same typed families as a native fill: solid/none controls; gradient stops
and geometry (`gradientDirection`, `gradientAngle`, `gradientFlip`,
`rotateGradientWithShape`, `fillToRect`, and `tileRect`); pattern
`preset`/foreground/background; and asset-backed `texture.source` plus its
`texture.placement` scale, offset, alignment, flip, rotation, and transparency
leaves. Transparency is a percentage in the closed range 0–100 with 0.001
precision; gradient/tile rectangles use 0–100 percent at 0.001 precision.
Omit or set a leaf to `null` to remove only that authored override; set the
complete background to `null` to restore the inherited slide/master/theme
background.

For a public client, `texture.source` is an opaque `asset://locked/...` handle
returned by `betterpptx.assets.upload`; never put a local path or server
filesystem detail in a shared JSON spec. The durable schema definitions
`backgroundFill`, `patternFill`, `textureFill`, `texturePlacement`,
`fillSource`, and `percentRect` make these nested controls inspectable and
versionable without making presets the authoring ceiling.

Keep precedence explicit: an authored slide background wins over a master or
World default; an omitted or reset background reveals the inherited carrier.
Use a native gradient, pattern, or governed texture when it improves the
message. Never flatten the full slide into an image merely to imitate a
background effect. After editing, export the current JSON spec and inspect a
full-size preview so the client verifies retained values, contrast, and visual
interference rather than trusting a preset label.

The catalog currently classifies the complete background family as
`structured-partial` because texture/picture generation and broader master
inheritance remain bounded lanes. The solid carrier slice is executable and
must not be described as global background or universal catalog closure.
