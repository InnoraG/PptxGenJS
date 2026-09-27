# Native connector effects

Editable straight, elbow and curved connectors support `style.glow`, `style.shadow`, `style.reflection` and `style.softEdges`, including inside nested groups. Effect dimensions are in points, independently of a slide's pixel coordinate system. Opacity is from 0 to 1. These effects do not change the connector's line gallery selection, arrows, endpoint bindings or frame.

For example, a connector can use `style: { line: { color: "31CFFF", width: 1.25 }, glow: { color: "17B5EF", radiusPt: 10, opacity: 0.25 }, shadow: null }`. The resulting halo is a native editable effect, not an image.

Use `shadow: { type: "outer", color: "000000", blurPt: 5, distancePt: 2, angleDeg: 90, opacity: 0.3 }`, `reflection: { startOpacity: 0.3, endOpacity: 0, endPosition: 0.6 }`, or `softEdges: { radiusPt: 1.5 }` when appropriate. The direct connector tool accepts the same components in `options`.

Set one component to `null` to clear it; omitted components remain unchanged during a patch. `effects: null` or `effects: []` clears all four connector effects. A nonempty typed `effects` array can combine `glow`, `outerShadow`, `innerShadow`, `reflection` and `softEdges`; its entries override the corresponding component fields. Later component edits remove the superseded array entry so it cannot reappear after export and replay. Unsupported effects and private payloads are rejected rather than silently discarded.
