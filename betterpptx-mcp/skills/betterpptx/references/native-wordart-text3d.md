# Native WordArt and text 3-D

Treat WordArt and text 3-D as editable parameter surfaces, not gallery screenshots. A style or bevel preset is a starting recipe; explicit typed overrides are the authoring contract.

## WordArt

`wordArtTransform` is one exhaustive 41-value native selector contract. Thirty-two transforms expose one integer `adjustment0` guide from 0 through 100000; nine are discrete-only and reject invented guide XML. `textDoubleWave2` normalizes to `textWave4`, and `textChevronDown` normalizes to `textChevronInverted`; aliases are accepted inputs, not additional catalog rows. Set `wordArt.adjustments` to null or an empty array to reset the guide while retaining the transform, or set `wordArt` to null to remove the complete warp.

`wordArtStyle`/text-effect gallery selections remain selectable, but fill, outline, shadow, glow, reflection, soft edge, blur, overlay, and transform overrides must be authored independently where the carrier supports them. The precedence chain is WordArt style base, ordered text-effect preset bases, then explicit `wordArt.transform`/`adjustments`. Use the catalog's applicability and precedence rules rather than copying a preset's captured XML.

## Text 3-D

`text3DShape` exposes 16 independent leaves: top and bottom bevel preset/width/height, extrusion depth and color, material, light rig and direction, X/Y/Z rotation, contour width, and contour color. Values have typed ranges, units, steps, and explicit null/component reset behavior. A structured-partial status means the native OOXML is retained and editable while PowerPoint may normalize a neutral default or expose a narrower Office setter; it is not an exact-parity claim.

## Lifecycle and boundaries

Discover the public catalog, create or import a JSON spec, dry-run, commit, patch/re-edit, null-reset one component, validate/preview, export authored source, save, and read back. Native proof must include package integrity and PowerPoint open/SaveCopyAs/reopen where available. Public proof must use a fresh black-box client and check for no private paths or implementation metadata. Preserve failed attempts and explicit Office/provider/license boundaries; never replace a missing native capability with a rasterized text image.

The 200-row family inventory is a coverage ledger. It currently contains 197 executable-exact rows and three deliberately separate structured-partial aggregate rows: the operation route, the Text3D aggregate, and the WordArt/Text3D family rollup. Do not use an aggregate fallback to downgrade the 41 concrete transform selectors or to overstate the separate Text3D surface.
