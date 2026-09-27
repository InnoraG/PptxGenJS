# Native shape and connector line controls

Use the live `betterpptx.options.catalog` surface with `id:"line"` as the
authoritative contract. This is a typed native line component for `shape` and
`connector` objects, not a preset-only shortcut.

The authored path is `style.line` (or the lowered `options.line`). The current
contract exposes:

- `type`: `solid` or `none`.
- `color`: a hex or theme color.
- `transparency`: 0–100 percent, step 0.001, default 0.
- `width`: 0–1584 points, native DrawingML step 1/12700 point, default 1.
- `dashType`: `solid`, `dash`, `dashDot`, `lgDash`, `lgDashDot`,
  `lgDashDotDot`, `sysDash`, or `sysDot`.
- `beginArrowType` and `endArrowType`: `none`, `arrow`, `diamond`, `oval`,
  `stealth`, or `triangle`.
- `beginArrowWidth`, `beginArrowLength`, `endArrowWidth`, and
  `endArrowLength`: independently `sm`, `med`, or `lg`, matching the native
  PowerPoint 3×3 arrow-size grid. These fields are applicable when the
  corresponding arrow type is present; PowerPoint may normalize a size on a
  `none` arrow.

`style.line: null` or `{type:"none"}` is an explicit reset that removes the
authored line component. Omission means the generated-shape default remains in
force. Re-read the committed/exported spec to confirm the intended state after
resetting.

`beginArrowSize` and `endArrowSize` remain rejected aliases. Use the four
independent width/length fields so changing one dimension does not overwrite
the other. Nulling one field restores that end's native medium/default
dimension without resetting the arrow type or the opposite dimension.

For proof, discover the live surface from a fresh public session, dry-run a
shape and connector using independent line values, commit and preview them,
then reset one line to `null` and re-edit another. Verify the saved package and
readback, and include invalid-range/enum rejection in the evidence. Public
responses must contain only the advertised capability and opaque artifact
handles, never private paths or implementation details.
