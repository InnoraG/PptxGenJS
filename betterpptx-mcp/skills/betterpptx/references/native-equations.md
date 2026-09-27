# Native equation authoring

Equations are a native Office Math family, not a screenshot lane. Discover `betterpptx.equation.catalog` before authoring: the public contract exposes 230 Ribbon presets, 33 semantic structures, source formats `plain`, `unicodeMath`, `omml`, and `template`, and the full template-kind vocabulary.

Use `kind:"equation"` with a stable semantic name, an exact `equationGalleryPresetId` or semantic `source`, typed parameters, and alt text. Presets select the native structure; parameters fill its slots. Keep source format and semantic slots authoritative through compile, patch, save, reopen, and readback. Invalid preset IDs must fail before mutation; do not rasterize a formula as a substitute for editable Office Math.

The proof boundary is fresh public discovery, JSON-spec upload, mutation-free dryRun, commit, quality, preview, save, invalid-selector rejection, package MathML/OMML inspection, PowerPoint reopen/render, and sparse JSON-spec patch editing. Public clients receive opaque handles and URLs only; private implementation paths never belong in a spec or result.
