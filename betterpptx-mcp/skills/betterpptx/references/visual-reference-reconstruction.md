# Reconstruct a visual reference

The reference may be HTML, a browser render, a screenshot, a PDF page, or pixels. In this principal AI-reconstruction route it is an oracle for the client AI only; BetterPPTX receives the AI-authored native specification, not the HTML. Automatic HTML conversion is a separate, explicitly selected secondary route.

## Build the native plan

1. Inspect every reference slide at full size outside BetterPPTX.
2. Inventory the visible layers, reading order, exact pixel frames, typography, fills, lines, effects, image crops, diagrams, data objects, and motion.
3. Choose the native PowerPoint carrier for every layer: text/textShape, preset shape, connector, freeform/customGeometry, group, chart, table, SmartArt, equation, ink, animation, or transition.
4. Keep only true media as assets: photograph, detailed illustration, 3D model, video, or audio.
5. If a browser-only effect has no PowerPoint equivalent, reinterpret it with native gradients, patterns, shapes, transparency, glow, blur, shadow, or freeform geometry. Do not rasterize ordinary presentation content.

## Declare exact pixel placement

Use this contract only when exact reference composition is required:

```json
{
  "visualReference": {
    "schemaVersion": "betterpptx.visual-reference-reconstruction.v1",
    "mode": "ai-reconstructed-native",
    "coordinateMode": "pixels",
    "representationPolicy": "native-except-media",
    "viewport": { "width": 1600, "height": 900 }
  }
}
```

Author `pixelFrame:{x,y,w,h}` on framed objects and `pixelPoints` or `pixelPaths` on point/path geometry. These fields are valid only with the explicit `visualReference` contract above. All frame positions and dimensions are numbers in **source pixels**, not inches or percentages. BetterPPTX performs deterministic pixel-to-slide conversion only. Never author raw `bbox`, `rect`, `x`, `y`, `w`, or `h` outside the pixel fields.

A top-level content frame uses `visualReference.viewport`, or that slide's optional `pixelViewport:{width,height}`. A native group child's frame is local to its immediate parent frame. Ordinary frames need positive width and height; a line or connector may have one zero dimension. Do not pre-convert pixels to slide units.

## Place a native presenter precisely

Use `presenter.pixelFrame` for the deck's default presenter viewport. Use `slides[].presenter.pixelFrame` to override that rectangle on a particular slide. The deck frame is measured against the root `visualReference.viewport`; a slide override uses its own `pixelViewport` when present, otherwise the root viewport. An inherited deck frame does not change when a slide declares a different source viewport.

This fragment belongs inside a spec using the pixel contract above:

```json
{
  "presenter": {
    "id": "host",
    "identity": "louise",
    "onSlides": "all",
    "stageTreatment": "none",
    "pixelFrame": { "x": 1180, "y": 150, "w": 350, "h": 650 }
  },
  "slides": [
    { "id": "opening", "content": [] },
    {
      "id": "evidence",
      "presenter": {
        "pixelFrame": { "x": 1120, "y": 170, "w": 380, "h": 630 }
      },
      "content": []
    }
  ]
}
```

The first slide inherits the deck frame; the second overrides it. If neither level supplies a frame, normal semantic staging remains in effect. Exact placement does not acquire automatic growth, drift, receding, or a new Morph transition. Existing explicitly authored transitions and motion choices remain separate.

The native viewport rectangle is **not the visible body silhouette**: camera framing, model bounds, and the gesture determine where the head, hands, and feet appear inside it. Verify the actual PowerPoint render, including the full motion envelope, before calling the presenter aligned. Positioning a viewport does not stretch or re-bake the model, alter its materials, or change its approved motion cadence.

The presenter's approved safe idle opening pose remains unchanged. Neither `pixelFrame` nor a poster image selects a new native static pose, and this placement feature provides no animation time-offset control. A pointing or open-palm pose in an illustrated reference must not be promised merely by selecting a playback scene. Keep exact semantic motion selection in `motionTime.kineticSelection` and `slides[].presenterMotion`; read [native-presenter-motion.md](native-presenter-motion.md) for that separate contract.

## Draw editable native paths in local pixels

Use `kind:"freeform"` or `kind:"customGeometry"` with a required `pixelFrame`. Supply `pixelPoints` for a command sequence, or `pixelPaths` for an array of sequences sharing that frame. Point coordinates are local to the object, not the slide: `{x:0,y:0}` is the top-left of its frame, with X increasing right and Y increasing down. Do not add the frame's slide offset to endpoints or control points.

Commands use these exact fields:

- `{x,y,moveTo:true}` starts a new subpath without drawing a segment. Start each sequence this way.
- `{x,y}` draws a straight segment to that endpoint.
- `{x,y,curve:{type:"cubic",x1,y1,x2,y2}}` draws to the endpoint using two control points.
- `{x,y,curve:{type:"quadratic",x1,y1}}` draws to the endpoint using one control point.
- `{close:true}` closes the current subpath back to its start; it needs no coordinates.

All endpoints and Bézier control points use local source pixels. Do not use SVG command letters, a `command` field, an HTML path, or percentage coordinates. Pixel arc radii are not supported by this route; use a native preset or an explicitly authored cubic/quadratic approximation when it meets the visual requirement.

For example, this editable native contour sits at source position `(180,340)` and spans `360 × 180` pixels. Its controls stay local to that frame:

```json
{
  "kind": "freeform",
  "name": "curved-evidence-panel",
  "pixelFrame": { "x": 180, "y": 340, "w": 360, "h": 180 },
  "pixelPoints": [
    { "x": 0, "y": 80, "moveTo": true },
    { "x": 80, "y": 0, "curve": { "type": "cubic", "x1": 0, "y1": 35, "x2": 35, "y2": 0 } },
    { "x": 280, "y": 0 },
    { "x": 360, "y": 80, "curve": { "type": "quadratic", "x1": 360, "y1": 0 } },
    { "x": 360, "y": 180 },
    { "x": 0, "y": 180 },
    { "close": true }
  ],
  "style": {
    "fill": { "color": "081A2B" },
    "line": { "color": "36CFFF", "width": 1.5 }
  }
}
```

`pixelPaths` uses the same commands one array level deeper. For two closed contours in a `100 × 80` pixel frame:

```json
{
  "kind": "freeform",
  "name": "two-native-contours",
  "pixelFrame": { "x": 600, "y": 340, "w": 100, "h": 80 },
  "pixelPaths": [
    [ { "x": 0, "y": 0, "moveTo": true }, { "x": 40, "y": 0 }, { "x": 20, "y": 80 }, { "close": true } ],
    [ { "x": 60, "y": 0, "moveTo": true }, { "x": 100, "y": 0 }, { "x": 80, "y": 80 }, { "close": true } ]
  ]
}
```

Each sequence may contain 1–10,000 commands; `pixelPaths` permits 1–256 sequences. Both frames and commands remain native editable geometry. Font sizes, line widths, and other formatting controls retain their own documented units; the pixel exception applies to these placement and path coordinates only.

## Keep the representation boundary

The following are forbidden:

- direct or legacy HTML fields in this route (`spec.html`, `spec.htmlPackage`, `spec.htmlZip`, `slides[].html`). Use the separate `spec.htmlConversion` route only when automatic conversion was explicitly requested;
- a whole-slide screenshot or a slide cut into image tiles;
- automatic raster fallback for text, shapes, effects, diagrams, charts, tables, equations, or motion;
- claiming exact browser pixels when PowerPoint has no native equivalent.

## Verify

Dry-run the spec, commit without saving, and validate. Under `release-powerpoint`, preview every slide at full size, compare the native render against the reference, and revise the AI-authored object plan. Under `production-non-rendering`, preserve the reference reconstruction as semantic input and run deterministic package, relationship, geometry, text-fit, and accessibility checks without claiming individual PowerPoint review. Before release qualification, verify that every picture relationship corresponds to a declared true media asset and that all ordinary content remains editable PowerPoint XML.

Compare at the same dimensions as the source and report any resampling separately. Static previews cannot prove animation quality, native opening/zoom behavior, narration playback, or synchronization; check those separately in PowerPoint. A valid frame or a passing schema is not evidence of pixel-perfect visual parity.
