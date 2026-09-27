# Native visuals + native captions — continuation handoff

**Read this first** if continuing MCP native-visual / VTT / texture / artistic-effect work.
Do **not** restart the 3d-gradient comparator loop in `AGENTS.md`. That is a different mission.

Date of this snapshot: **2026-08-22**.
Public MCP schema: `TOOL_SCHEMA_VERSION = 2026-08-22.1`.
Live process: `pm2` app `betterpptx-mcp`; public routing uses the separately managed named BetterPPTX identity.

---

## 1. Situation (what this track is)

Public BetterPPTX MCP (`betterpptx-mcp/`) must author **editable native PowerPoint**, not HTML screenshots.

This track closed three product holes:

1. Native **WebVTT closed captions** on media (PowerPoint Subtitles).
2. Native **fill textures** (generated tiles + harvested Office preset JPEGs).
3. Native **picture artistic effects** (`a14:imgEffect`).

A fourth hole — public **`effectDag` authoring** — was investigated and **rejected**.

Owner decision (2026-08-22): **`effectLst` is the product combination surface.** Desktop PowerPoint writes Format pane combinations (shadow + glow + reflection + soft edge, including the user file `effectDag_sample_manycombination.pptx`) as `a:effectLst`, never `a:effectDag`. Combining those primitives in the library already emits `effectLst`. Inventing a DAG would not be more native.

Public catalog status:

| Surface | Status |
|---|---|
| `effects` (effectLst array) | **executable** |
| `effectDag` | **not-pursued** (preserve imported graphs only; do not author) |
| `texture` including `nativePreset` | **executable** |
| `artisticEffect` | **executable** (defaults + proven extra attrs) |

`NOT_PURSUED_CAPABILITIES` in `public-manifest.mjs` includes `native-effect-graph-authoring`. Do not put `native-effect-graph` back on `PLANNED_CAPABILITIES`.

---

## 2. Achievements (do not re-derive)

### 2.1 Native VTT captions (done, live)

First serializer guess was **wrong** (`2018/10` mediaCaption + sibling `p188:embeddedCaptions`). ZIP tests passed; PowerPoint XML did not.

**Frozen PowerPoint truth** (do not mutate):

`D:\PptxGenJS_Claude\tmp_autonomous_test\VTTSubTitle_Captions_FROZENREFERENCE.pptx`

Actual package:

- Rel type: `http://schemas.microsoft.com/office/2017/04/relationships/track`
- Content type: `text/vtt`
- Track XML **nested inside** `p14:media`:
  - `p14:extLst` / `p:ext uri="{3AFAAA56-56D3-431D-BCD4-E75A35582382}"`
  - `p173:tracksInfo` (`xmlns:p173="http://schemas.microsoft.com/office/powerpoint/2017/3/main"`) `displayLoc="slide"`
  - `p173:track id="{GUID}" label="..." lang="..." r:embed="rIdN"`

Library:

- `src/gen-xml.ts` — 2017 track rel + `p173:tracksInfo`
- `src/gen-objects.ts` — `newClosedCaptionTrackId()` GUID
- `src/core-interfaces.ts` — `closedCaptionTracks[].id`

MCP:

- Narration does **not** auto-create VTT.
- Showcase / default narration: **0 VTT** unless the spec sets `audio.closedCaptionTracks` / `closedCaptionTracks`.
- Engine validates the 2017 track relationship.

COM proof: generated `tmp_autonomous_test/VTTSubTitle_Captions_GENERATED.pptx` opened without repair; SaveCopyAs kept the track (PowerPoint renamed to `track1.vtt`). **On-screen glyphs were not COM-provable.** Eye-check still useful: Slide Show + CC on, first cue ~1.0s “Welcome to our project presentation.” Audio is only ~3.4s.

Tests: `betterpptx-mcp/test/native-caption-tracks.test.mjs` (asserts `p173`, not `p188`).

### 2.2 Generated tile textures (done)

`fill.type: texture` used to fall through to empty XML.

- `src/gen-utils.ts` — `genXmlBlipFill` (`a:blipFill` + `a:tile` / `a:stretch`)
- `src/gen-objects.ts` — `attachShapeFillImage` on addShape/addText; JPEG/PNG from data URI
- `betterpptx-mcp/ir/generated-texture.mjs` — deterministic PNG recipes (grain, filmGrain, paperFibre, speckle, halftone, scanlines, dotGrid, weave, clouds, starField, bokeh, metallicNoise, blueprintGrid)
- Atmosphere `grain` uses generated tiled texture, not pattern `pct5`

### 2.3 Native Office preset textures (done)

COM `Fill.PresetTextured(1..24)` works. Readback `PresetTexture` is often `-2` (mixed); **the saved JPEG tiles are the truth**.

Harvested assets:

`betterpptx-mcp/assets/native-preset-textures/*.jpeg` + `catalog.json` (comId 1–24 = papyrus … mediumWood).

Authoring:

```json
"fill": { "type": "texture", "texture": { "source": { "kind": "nativePreset", "presetId": "texture.canvas" } } }
```

`materializeGeneratedTextureFill()` in `generated-texture.mjs` also resolves `nativePreset`.
Harvest tile XML: `<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>`.

COM source deck: `tmp_autonomous_test/native-visual-harvest/COM_PRESET_TEXTURES.pptx`.

### 2.4 Artistic effects (done for defaults + two proven param sets)

PowerPoint stores these on the **picture blip**, not in `effectLst`:

```xml
<a:blip r:embed="rIdN">
  <a:extLst>
    <a:ext uri="{BEBA8EAE-BF5A-486C-A8C5-ECC9F3942E4B}">
      <a14:imgProps xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main">
        <a14:imgLayer r:embed="rIdN">
          <a14:imgEffect><a14:artisticBlur radius="18"/></a14:imgEffect>
        </a14:imgLayer>
      </a14:imgProps>
    </a:ext>
    <a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}">
      <a14:useLocalDpi ... val="0"/>
    </a:ext>
  </a:extLst>
</a:blip>
```

Office often also embeds `hdphoto` `.wdp` for the imgLayer. Our generator points **both embeds at the same image rId**. COM reopened that form without refusing the file.

Authoring:

```json
"imageAdjustments": { "artisticEffect": { "type": "paintBrush" } }
```

```json
"imageAdjustments": { "artisticEffect": { "type": "paintStrokes", "trans": 5000, "intensity": 9 } }
```

Proven extra attributes (only emit these; do not guess others):

- `artisticBlur` `radius`
- `artisticPaintStrokes` `trans` (ST_PositiveFixedPercentage, 100000 = 100%) and `intensity`

COM `PictureEffects.Insert(n)` **IDs do not match XML tag names** on this Office build (shift starts around chalkSketch). Trust OOXML tags, not COM enum names.

Harvest note: inserting “texturizer” produced `<a14:artisticWatercolorSponge/>`. Direct Insert(28) watercolor crashed PowerPoint. User UI file proved **paintBrush**: `<a14:artisticPaintBrush/>`.

`addImage` must copy `imageAdjustments` onto `options` (`src/gen-objects.ts`). Serializer: `createArtisticEffectExtLst` in `src/gen-xml.ts`.

### 2.5 effectLst combinations (already existed; confirmed enough)

Library already emits one `a:effectLst` with glow, outerShdw, reflection, softEdge, blur, fillOverlay.

COM combo and user `effectDag_sample_manycombination.pptx` both wrote **effectLst + optional scene3d/sp3d bevel**, zero DAG.

3D bevel in the many-combination sample:

```xml
<a:scene3d><a:camera prst="perspectiveContrastingRightFacing"/><a:lightRig rig="threePt" dir="t"/></a:scene3d>
<a:sp3d><a:bevelT w="139700" h="139700" prst="divot"/></a:sp3d>
```

Shape 3D is a separate executable surface (`options.effect3D`), not effectDag.

### 2.5.1 Picture Format structured carrier bridge (implemented 2026-08-22)

Pictures now accept the same continuous native `p:pic/p:spPr` controls instead of being limited to gallery recipes or shadow:

- `line` (Picture Border)
- `shadow`, `glow`, `reflection`, `softEdges`, `blur`, `fillOverlay`
- `effect3D`
- top-level `transparency` or `imageAdjustments.transparency`

The JSON-spec image path forwards `style.line`, `style.effects[]`, and `style.effect3D`; the direct execution path normalizes continuous aliases before calling the library. Structured edits clear the conflicting whole-picture/raw component while retaining extracted non-conflicting geometry, fill, line, effect, 3-D, and `spPr` extension fragments. `effects:[]`/`effects:null` is the full effect-list reset; a component set to `null` resets only that component.

PowerPoint proof: the maximal one-picture canary passed package integrity, opened through `Open2007(..., OpenAndRepair=false)`, survived `SaveCopyAs`, retained `a:ln`, all six `a:effectLst` children, `a:scene3d`, and `a:sp3d` in Office order, and exported a visible PNG with border/glow/bevel/reflection treatment. The focused automated proof is `betterpptx-mcp/test/picture-format-native-effects.test.mjs`; the local render evidence is under `tmp_autonomous_test/native-visual-harvest/picture-format-maximal-canary-render/`.

Important ordering: `a:ln` → `a:effectLst` → `a:scene3d` → `a:sp3d` → `a:extLst`. An older comparator comment/check said the reverse and was corrected. `create3DElements()` now builds `a:sp3d` attributes directly; it no longer rewrites generated XML with regex.

### 2.5.2 Picture corrections and color sliders (implemented locally 2026-08-22)

PowerPoint-authored COM/UI specimens established the actual native controls and clamp domains:

- `imageAdjustments.sharpness`: `-1..1` → `a14:sharpenSoften amount=-100000..100000`; `0` is the omitted-attribute default.
- `imageAdjustments.saturation`: `0..4` → `a14:saturation sat=0..400000`; `1` is the omitted-attribute default.
- `imageAdjustments.temperature`: `1500..11500` Kelvin → `a14:colorTemperature colorTemp=1500..11500`; `6500` is the omitted-attribute default.
- `imageAdjustments.recolor` / `duotone`: two editable endpoints. Each endpoint accepts a hex, theme, or preset color plus normalized tint, shade, saturation multiplier, and opacity. A native teal gallery specimen wrote black plus `accent4` with `tint=45000` and `satMod=400000`, proving that Recolor is a structured duotone/color-transform recipe rather than a baked bitmap filter.

The old sharpness-to-contrast approximation is removed. Multiple correction/color effects serialize as ordered sibling `a14:imgEffect` nodes in one `a14:imgLayer`. Decypher extracts sharpness, saturation, temperature, luminance, transparency, grayscale, and theme-aware recolor into typed `imageAdjustments` while retaining the exact imported payload. Untouched imports prefer that preserved payload once; structured edits clear the conflicting raw owner and regenerate from typed values.

Local proof artifacts:

- parameter harvester: `tools/harvest-picture-correction-parameters.ps1`
- package scanner: `tools/scan-picture-correction-ooxml.mjs`
- comparative canary builder: `tools/create-picture-color-canary.mjs`
- PowerPoint-authored UI recolor specimen: `tmp_autonomous_test/native-visual-harvest/COM_PICTURE_RECOLOR_TEAL_UI.pptx`
- local canary and PNG: `tmp_autonomous_test/native-visual-harvest/PICTURE_COLOR_CONTINUOUS_CANARY.pptx` and `picture-color-continuous-canary-render/Slide1.PNG`

The canary passed package audit, `Open2007(OpenAndRepair=false)`, PowerPoint edit-save-reopen, retained-node scanning, and visual inspection. The public endpoint was then restarted and independently queried through Streamable HTTP: health advertised schema `2026-08-22.3` with 47 tools, and live `betterpptx.options.catalog` returned the exact sharpness, saturation, temperature, and theme-aware recolor contracts with no obsolete approximation/planned language. Full cold-client author/reset/save/reopen certification remains open.

### 2.6 Background removal (investigated, not a live effect)

User file `COM_ARTISTIC_BACKGROUND_REMOVAL.pptx`: PowerPoint **baked a PNG** (`ppt/media/image1.png`) and stored a normal `a:blip`. No `a14:imgEffect`. Cannot regenerate as a live picture effect. `NOT_PURSUED_CAPABILITIES` includes `background-removal-live-picture-effect`. If product wants cutouts, author a transparent PNG (or a future crop/geometry), not an artistic tag.

---

## 3. Remaining points (do these next, in order)

1. **Cold-client authoring certify the deployed correction/color slice**
   Schema `2026-08-22.3` and exact live discovery are verified. Next have a fresh public client author, inspect, reset, save, and reopen a canary without private hints. Add isolated min/default/max rendered comparisons and explicit component/full reset tests before calling the slice fully certified.

2. **Artistic parameter harvest (next missing Picture Format family)**
   Only blur radius and paintStrokes trans/intensity are COM/UI proven. Other sliders still serialize as **empty default tags** (correct PowerPoint default write). To prove more: one effect, move one slider, save as `COM_ARTISTIC_PARAM_<name>.pptx` in the harvest folder, then add attrs to `artisticEffectAttributes()` in `src/gen-xml.ts` **only after inspecting OOXML**. Do not guess attribute names.

3. **Systematic PowerPoint reopen gate**
   Still on `PLANNED_CAPABILITIES` as `powerpoint-native-visual-reopen-validation`. We did ad-hoc COM Open/SaveCopyAs. A repeatable gate (no other POWERPNT running, isolate one feature per file) would make this a CI oracle.

4. **VTT eye-check**
   COM cannot prove subtitle glyphs. Human: open `tmp_autonomous_test/VTTSubTitle_Captions_GENERATED.pptx` in Slide Show, captions on.

5. **Minimal unsupported-effect asset synthesis**
   Still planned. Rule: never flatten a whole slide; only an owner-linked transparent remainder. Not blocked on effectDag.

6. **hdphoto / WDP original layer**
   Office artistic files often have `hdphoto1.wdp` + PNG. We reuse the PNG rId. If a future deck repairs or loses “reset artistic effect”, that is the place to look — do not add WDP synthesis unless a reopen failure proves it.

7. **Do not implement public effectDag authoring.**
   Passthrough of existing `a:effectDag` in `native-effect-presets.mjs` / selection verifier may stay. No typed DAG DSL.

---

## 4. Files that matter (stop grepping the whole repo)

### Public MCP / IR

| File | Why |
|---|---|
| `betterpptx-mcp/docs/NATIVE-VISUAL-AND-CAPTION-HANDOFF.md` | This handoff |
| `betterpptx-mcp/public-manifest.mjs` | Schema version, implemented / planned / not-pursued |
| `betterpptx-mcp/ir/native-visual-primitives.mjs` | Public catalog surfaces |
| `betterpptx-mcp/ir/generated-texture.mjs` | Generated PNG + nativePreset JPEG resolve |
| `betterpptx-mcp/ir/atmosphere-compositor.mjs` | Grain → generated texture |
| `betterpptx-mcp/ir/spec-compiler.mjs` | `fillOptions` → `materializeGeneratedTextureFill`; `imageAdjustments`; caption tracks |
| `betterpptx-mcp/ir/html-representation.mjs` | CSS/SVG filters lower to **effect list**, not DAG |
| `betterpptx-mcp/tools.mjs` | `options.catalog` copy (no public DAG authoring) |
| `betterpptx-mcp/assets/native-preset-textures/` | 24 harvested JPEGs + catalog.json |
| `betterpptx-mcp/test/generated-texture.test.mjs` | Texture + artistic XML |
| `betterpptx-mcp/test/native-visual-primitives.test.mjs` | Catalog statuses |
| `betterpptx-mcp/test/native-caption-tracks.test.mjs` | VTT p173 |

### Library XML (no regex in `src/`)

| File | Why |
|---|---|
| `src/gen-xml.ts` | `p173` captions; `createArtisticEffectExtLst`; effectLst order |
| `src/gen-objects.ts` | `attachShapeFillImage`; `imageAdjustments` on addImage; caption GUIDs |
| `src/gen-utils.ts` | `genXmlBlipFill` |
| `src/core-interfaces.ts` | `closedCaptionTracks`, texture fill, artisticEffect |

### Harvest / frozen references (do not mutate frozen PPTX)

`tmp_autonomous_test/native-visual-harvest/`

Important files there:

- `COM_PRESET_TEXTURES.pptx` — 24 tiled JPEG textures
- `COM_ARTISTIC_EFFECTS.pptx` — default a14 tags (COM Insert IDs are shifted vs tag names)
- `COM_ARTISTIC_PAINTBRUSH.pptx` — `<a14:artisticPaintBrush/>`
- `COM_ARTISTIC_PAINTSTROKE_nondefault.pptx` — `trans="5000" intensity="9"`
- `COM_ARTISTIC_BACKGROUND_REMOVAL.pptx` — flattened PNG, no live effect
- `COM_SHAPE_EFFECT_COMBO.pptx` / `effectDag_sample.pptx` / `effectDag_sample_manycombination.pptx` — **no effectDag**
- `WIRED_NATIVE_VISUALS.pptx` — generator output COM-opened
- `ARTISTIC_EFFECT_XML.json` — Insert-name → actual a14 tag map

Scripts: `tools/harvest-native-visual-com.ps1`, `tools/inspect-native-visual-harvest.mjs`.
Abort COM harvest if `POWERPNT` is already running.

VTT frozen: `tmp_autonomous_test/VTTSubTitle_Captions_FROZENREFERENCE.pptx`.

---

## 5. Build / test / restart (this track)

Library changes must land in **`dist/pptxgen.cjs.js` and `dist/pptxgen.es.js`**. `npm run build` writes `src/bld/`; copy those two files into `dist/` (engine loads `dist/pptxgen.es.js`). Tests require `dist/pptxgen.cjs.js`.

```
npx tsc --noEmit
npm run build
Copy-Item -Force src\bld\pptxgen.cjs.js dist\pptxgen.cjs.js
Copy-Item -Force src\bld\pptxgen.es.js dist\pptxgen.es.js
node --test betterpptx-mcp/test/generated-texture.test.mjs betterpptx-mcp/test/native-visual-primitives.test.mjs betterpptx-mcp/test/native-caption-tracks.test.mjs
```

After public schema/help changes: bump `TOOL_SCHEMA_VERSION` in `public-manifest.mjs`, then:

```
pm2 restart betterpptx-mcp
```

Keep the named BetterPPTX identity healthy; do not create a machine-host Funnel for this service.

Public black-box: no source paths, Piper brand, or implementation names in public tool schemas/results.

---

## 6. Constraints the next agent must not violate

- No regex XML in `src/`.
- No mutating frozen reference PPTX.
- No post-processing generated PPTX as the product fix.
- No whole-slide screenshot fallback.
- Narration must stay independent of overlay captions; VTT only when `closedCaptionTracks` is explicit.
- Do not commit/push unless the user asks.
- Do not treat comparator-first 3d-gradient convergence as this queue.

---

## 7. Suggested first action for the next agent

If the user did not specify: harvest **one** additional artistic-effect slider file they already saved, or add a tiny COM reopen helper around `WIRED_NATIVE_VISUALS.pptx`.
If they ask for effectDag again: point at this document §1 and the many-combination sample — **do not implement a DAG DSL**.
