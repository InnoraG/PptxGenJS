# claudepptxmcp

A complete **Model Context Protocol** server that exposes the EVOLVED
`pptxgenjs` library (the one in this repo — v4.0.1, far beyond public
`pptxgenjs`) as a clean set of MCP tools.

It is a sibling of the existing `claudepptxmcp` MCP — separate brand, separate
endpoint, fresh-from-scratch implementation, oriented at Claude as the
client.

## Endpoint

- **Bin**: `claudepptxmcp` (registered in root `package.json`)
- **Entry**: `claudepptxmcp/cli.mjs` → `claudepptxmcp/server.mjs`
- **Transports**:
  - **stdio** (`@modelcontextprotocol/sdk`) — Claude Desktop / Claude Code / Codex
  - **Streamable HTTP** (`server-http.mjs`) — claude.ai & chatgpt.com web connectors,
    with three auth modes (`bearer` header · `path` URL-secret · `none`) and public
    file downloads (`/files/...`). See **[GO_PUBLIC.md](./GO_PUBLIC.md)**.
- **Package export**: `import 'pptxgenjs/claudepptxmcp'`

> **Status:** runs live over the public internet via a **Tailscale Funnel** (stable
> `*.ts.net` URL) under **pm2**. All tools advertise MCP `outputSchema` +
> `annotations`; `deck.save` returns a public `downloadUrl`. Full deploy + capacity
> guidance in **[GO_PUBLIC.md](./GO_PUBLIC.md)**.

## Capabilities (mapped from the evolved library)

| Public pptxgenjs                | claudepptxmcp ALSO exposes                                              |
| ------------------------------- | ----------------------------------------------------------------------- |
| Slides, shapes, text, tables    | ✅                                                                       |
| Native charts (bar/line/pie...) | ✅ + dual-axis, multi-type combo, gradient series                        |
| Images                          | ✅                                                                       |
| Speaker notes                   | ✅                                                                       |
| Solid fills                     | ✅ + multi-stop **gradient** fills (linear, circle, rect, shape) with presets, angle, transparency, flip, fillToRect, tileRect |
| Shadows                        | ✅ + **reflection**, **softEdges**, **glow** on shapes & text             |
| Plain text                     | ✅ + **WordArt** transforms (32 presets: arch, wave, circle, chevron, cascade…) |
| —                              | ✅ **Text3D**: bevel + extrusion + material + lightRig + X/Y/Z rotation  |
| —                              | ✅ **Slide transitions** (145+ variants — morph, vortex, prism, fracture, glitter…) |
| —                              | ✅ **Object animations** (149+ effects, sequence modes, motion paths, iterate engine) |
| —                              | ✅ **SmartArt-style diagrams** (editable process/cycle/hierarchy/matrix/pyramid/list/relationship layouts; native SmartArt is preserve-only on roundtrip) |
| —                              | ✅ **GLB 3D models** with raster fallback, camera, lights, transforms     |
| —                              | ✅ **Validation engine** (lenient/normal/strict) with autoFix             |
| —                              | ✅ **Raw OOXML passthrough** for advanced cases                           |

## Design philosophy — PRIMITIVES ONLY

claudepptxmcp deliberately exposes **only domain-neutral primitives**. There is no
"build me a slide about countries" tool, no "apply the aurora theme" tool, no
"insert a morph pair for these shapes" tool. The MCP gives the AI client a
toolbelt; the client owns the storytelling, the brand decisions, and the
domain reasoning.

What this means in practice:
- ✅ `image.sample_palette(imagePath)` — generic colour quantisation. Client picks which cluster becomes "primary".
- ✅ `io.read_file('any.geojson')` + `geometry.polygon_to_custgeom(rings, w, h, projection)` — generic IO + geometry. Country maps, organisation charts, sankey diagrams, custom logos all use the same two tools.
- ✅ `slide.add` with `transition: { type: 'morph' }` + two slides sharing `objectName` — morph transitions emerge from primitives; no bespoke pairing tool.
- ❌ No `geo.country_outline` (countries are a client concern)
- ❌ No `theme.apply_preset` (palettes are client data)
- ❌ No `demo.build_*` (showcases are client recipes)

## Tool catalog

### Discovery (1)

```
claudepptx.help.capabilities          Return a capability catalog
```

### Deck lifecycle (14)

```
claudepptx.deck.new                   Create a new presentation; returns deckId
claudepptx.deck.set_show_settings     Slideshow behaviour (loop/kiosk/...)
claudepptx.deck.define_master         Define a slide master
claudepptx.deck.define_layout         Register custom slide size (A3, square, ...)
claudepptx.deck.load_template         Extract palette/fonts/layout from an existing .pptx
claudepptx.deck.autoplay              kiosk + loop + per-slide advanceAfterTime (composable)
claudepptx.deck.open_existing         Decypher + replay an existing .pptx (edit / animate / morph)
claudepptx.deck.transform_shapes      Deck-wide recolor / invert-mode / patch (colorMap, colorTransform, patch + filter)
claudepptx.deck.set_transitions_all   Apply or rotate transitions across every slide
claudepptx.deck.summary               Inspect deck state
claudepptx.deck.validate              Run validation engine
claudepptx.deck.save                  Write to disk (returns a public downloadUrl in HTTP/public mode)
claudepptx.deck.dispose               Drop deck from memory
claudepptx.deck.list                  List active decks
```

### Slide / object primitives (17)

```
claudepptx.slide.add                  Append a slide (background, transition)
claudepptx.slide.duplicate            Identity-preserving clone (objectName + spid + raw rels) — basis for morph "magic move"
claudepptx.slide.add_text             Text + WordArt + Text3D + reflection + glow
claudepptx.slide.add_shape            Shape + gradient + line + animation
claudepptx.slide.add_smartart         SmartArt-style editable diagrams
claudepptx.slide.add_image            Image (path/data/url)
claudepptx.slide.add_chart            Native chart — single, OR chartMulti combo + dual axes + styled plot area
claudepptx.table.recommend            Contextual premium table presets + PowerPoint Table Design variants
claudepptx.slide.add_table            Table with per-cell GRADIENT, Table Design flags, side borders, colspan/rowspan
claudepptx.slide.add_media            Audio / video / online (YouTube)
claudepptx.slide.add_model3d          GLB 3D model with raster fallback, camera, lights, shadow
claudepptx.slide.add_freeform         custGeom freeform vector (moveTo/lineTo/arcTo/cubic/quadratic Bezier/close)
claudepptx.slide.add_notes            Speaker notes
claudepptx.slide.passthrough_xml      Raw OOXML insert (escape hatch)
claudepptx.slide.list_shapes          List shapes on a slide (index, objectName, kind, bbox)
claudepptx.slide.inspect_shapes       Detailed shape inspection (options, colours) for edit recipes
claudepptx.slide.update_shape         Patch one shape (move / resize / recolor / retext)
claudepptx.slide.animate_shapes       Bulk-animate shapes by name / kind / index (+ cumulative stagger)
```

### Generic primitives (11) — these are why the MCP works for any prompt

```
claudepptx.io.read_file               Read any file (utf-8 or base64)
claudepptx.io.write_file              Write any file
claudepptx.io.list_dir                List a directory (with optional glob)
claudepptx.io.read_json               Read + parse JSON
claudepptx.fs.find                    Recursive glob search
claudepptx.http.fetch                 Fetch any URL (text/json/base64 or saveToPath)
claudepptx.image.sample_palette       k-means colour quantisation of any image
claudepptx.geometry.polygon_to_custgeom  Polygon rings → custGeom points (projection / smoothing / multi-polygon)
claudepptx.geometry.simplify_path     Decimate a polyline / ring to N points
claudepptx.library.list_xml_groups    Catalog top-level p:grpSp entries in any pptx slide XML
claudepptx.library.import_xml_group   Drop a named library group into the target slide (verbatim, with optional re-box)
```

## Asset-source priority (the rule of thumb the AI client should follow)

A SaaS MCP user will reach for assets in this order. The MCP provides a generic
primitive for each tier — never reach for synthesis if a higher-tier source is
available:

| Tier | Source                                                                   | Primitives                                                                                       |
|------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| 1    | **UPLOADED** — files the user attached in the chat                       | `io.write_file({ encoding: 'base64' })` to persist · `image.sample_palette` / `io.read_*` to use |
| 2    | **ONLINE IMAGE URLS** — licensed images selected by the AI client         | Public clients pass a direct remote image file URL to `slide.add_image`; the MCP fetches, validates, and embeds it server-side. Local/maintainer clients can use `http.fetch({ url, saveToPath })` first when they need explicit preflight checks or custom headers. |
| 3    | **LOCAL NON-IMAGE ASSETS** — vector groups, GLBs, geojson, SVG icons shipped on disk | `fs.find` / `io.list_dir` to discover · `library.list_xml_groups` / `library.import_xml_group` to **reuse a ready-made vector group verbatim** · `io.read_file` for data assets. Do not use this tier as a local stock image/photo library. |
| 4    | **SYNTHESISED** — last resort, when none of the above has what you need  | `geometry.polygon_to_custgeom` / `geometry.simplify_path` / `slide.add_freeform` / `slide.add_shape` |

For a world-map slide, **tier 2 is the right answer** — drop the silhouette
from `slide21.xml` of the reference deck (`Google Shape;669;p9`: 6 shapes, 385
cubicBezTo curves, vector-only, 51 KB) verbatim. Synthesising the same map
from natural-earth geojson is tier-4 territory and only worth doing when the
client needs precise bloc colouring per country — and even then, use the
library map as the **base** and overlay coloured shapes on top.

The world-map demo `claudepptxmcp/demos/demo-library-first.mjs` shows the
correct workflow:

1. `image.sample_palette` extracts a brand palette from the uploaded logo
2. `library.list_xml_groups` discovers the silhouette map group
3. `library.import_xml_group` imports it verbatim with a target box
4. `http.fetch` pulls a Khronos 3D model live
5. `io.read_file` reads the geojson to compute country centroids
6. `slide.add_shape` overlays bloc-coloured dots at each centroid on the
   already-imported map

### Internal (1)

```
claudepptx.demo.build_showcase        Project-internal regression test only
```

## Worked example — "Build a world-map evolution deck themed from a logo"

This is **not** a built-in tool. It's a recipe that an AI client (Claude)
composes from the generic primitives the MCP exposes.

```js
// 1. Sample the brand palette from any image
const palette = await call('claudepptx.image.sample_palette', { imagePath: 'logo.png' })
const brand = palette.brandedClusters.slice(0, 3).map(c => c.hex)

// 2. Read the world geojson — the MCP doesn't know it's a "map"
const geo = await call('claudepptx.io.read_file', { path: 'world.geojson' })
const fc = JSON.parse(geo.content)

// 3. For each country the CLIENT picks, ask geometry to project the polygon
for (const feat of clientSelectedFeatures) {
  const rings = feat.geometry.type === 'Polygon'
    ? feat.geometry.coordinates
    : feat.geometry.coordinates.flat()
  const cg = await call('claudepptx.geometry.polygon_to_custgeom', {
    rings, w: 4, h: 3, projection: 'equirectangular', maxPointsPerRing: 24,
  })
  await call('claudepptx.slide.add_freeform', {
    deckId, slideIndex, x, y, w, h, points: cg.points, fill: { color: brand[0] },
  })
}

// 4. Morph transitions emerge from primitives: same objectName + transition.type='morph'
await call('claudepptx.slide.add', { deckId, transition: { type: 'morph', option: 'byObject' } })
// ... re-add shapes with the SAME objectName at new positions → PowerPoint morphs them
```

The world-map demo in `claudepptxmcp/demos/demo-via-primitives.mjs` is a real
worked example — 476 wire calls, 8 slides, 401 country shapes, all from
generic primitives. Tomorrow's prompt ("build an org chart from this CSV
themed from our brand logo") composes the same primitives with different
data.

## Quick start

### As a server (for an MCP host)

```bash
# Stdio transport (Claude Desktop / Claude Code)
node claudepptxmcp/cli.mjs
# or after `npm i .` / publishing
claudepptxmcp

# HTTP / Streamable HTTP transport (claude.ai & chatgpt.com web connectors)
#   bearer mode (header-capable clients: Claude Code / Codex):
claudepptxmcp-http --port 3344 --token your-bearer-token
#   web-connector friendly (URL-only dialogs): path-secret or open
claudepptxmcp-http --port 3344 --url-secret $(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")
claudepptxmcp-http --port 3344 --open
```

### Development traffic logging

Traffic logging is opt-in and writes newline-delimited JSON to disk. This keeps
stdio MCP stdout clean while still capturing request/response payloads, tool
arguments, tool results, HTTP headers, session lifecycle, downloads, save paths,
and errors for debugging.

```bash
# Redacted structured logging (tokens/cookies/secrets removed)
claudepptxmcp-http --port 3344 --url-secret dev-secret --log

# Full JSON payload logging for local development
claudepptxmcp-http --port 3344 --url-secret dev-secret --log-full

# Equivalent env form
CLAUDEPPTX_LOG=full CLAUDEPPTX_LOG_DIR=logs/claudepptxmcp claudepptxmcp-http --open
```

By default logs are written to `logs/claudepptxmcp/mcp-<timestamp>-<pid>.ndjson`.
Authentication/cookie/token values and `/s/<secret>/mcp` URL path secrets are
redacted unless `CLAUDEPPTX_LOG_SECRETS=1` or `--log-secrets` is explicitly set.
Non-full mode caps each event at 200k characters; full mode is uncapped unless
`CLAUDEPPTX_LOG_MAX_CHARS` is set.

**To go public** (claude.ai + chatgpt.com) see **[GO_PUBLIC.md](./GO_PUBLIC.md)**:

- `node claudepptxmcp/serve-public.mjs` — one command: server + a cloudflared
  quick tunnel, prints a public URL + ready-to-paste connector configs.
- `deploy/` — production kit: **pm2** (server + crash/memory restart) and a
  **stable URL with no domain via Tailscale Funnel** (`setup-tailscale-funnel.ps1`)
  or a **cloudflared named tunnel** if you own a domain.
- Saved decks return a public `downloadUrl` so web users can download the `.pptx`.
- Capacity guards (deck LRU/TTL eviction, heavy-op concurrency gate, disk budget)
  keep memory/disk bounded under load; live numbers at `GET /health`.

### Local smoke test (in-process, fast)

```bash
node claudepptxmcp/demo-runner.mjs
# → outputs/ClaudePptxMcp_Showcase_v2_<stamp>.pptx
```

This calls `callClaudePptxTool` (the tool-layer function) directly, bypassing
the stdio transport. It's the same code path the MCP server hits when it
receives a `tools/call` — just without JSON-RPC framing in the way.

### WIRE-ONLY demo (proves the deck builds purely over MCP)

```bash
node claudepptxmcp/demo-via-mcp.mjs
# → outputs/ClaudePptxMcp_WireDemo_<stamp>.pptx
```

This spawns the MCP server as a **separate process** and sends EVERY
primitive tool call (deck.new, slide.add, slide.add_text, slide.add_shape,
slide.add_chart, slide.add_table, slide.add_freeform, slide.add_morph_pair,
slide.add_model3d, deck.autoplay, deck.validate, deck.save — ~162 calls)
as an individual `tools/call` JSON-RPC request over stdio. The client
imports nothing from the engine and nothing from pptxgenjs — only the
recipe (which is just a list of tool invocations).

Output of a real run:

```
recipe RPCs : 162 tools/call requests sent
responses   : 162 tools/call responses received
bytes sent  : 75 349 bytes over stdin
bytes recv  : 90 337 bytes over stdout
file        : outputs/ClaudePptxMcp_WireDemo_….pptx
bytes       : 185 447
slides      : 17
```

### Comparison of in-process vs wire builds

```bash
node claudepptxmcp/compare-builds.mjs
```

```
byte-identical files     : 90
trivially-different (IDs): 2  (GUIDs / random creation-IDs)
substantively different  : 0
VERDICT: EQUIVALENT
```

### Structural integrity check + evolved-feature verification

```bash
node claudepptxmcp/inspect.mjs outputs/ClaudePptxMcp_WireDemo_<stamp>.pptx
node claudepptxmcp/verify-evolved.mjs outputs/ClaudePptxMcp_WireDemo_<stamp>.pptx
# → 14/14 evolved-feature OOXML checks PASS
```

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  MCP host (Claude Desktop / Claude Code / SDK client / SaaS)   │
└──────────────┬─────────────────────────────────────────────────┘
               │ MCP over stdio JSON-RPC  (initialize, tools/list, tools/call …)
┌──────────────▼─────────────────────────────────────────────────┐
│  claudepptxmcp/server.mjs   (transport + dispatch)              │
│    • Redirects library console.log → stderr (clean stdout)       │
└──────────────┬─────────────────────────────────────────────────┘
               │ in-process call
┌──────────────▼─────────────────────────────────────────────────┐
│  claudepptxmcp/engine.mjs   (handlers + deck registry)          │
│    • In-memory deck registry keyed by deckId                    │
│    • Animation lifting (addAnimation API, not inline)           │
│    • Friendly effect-name aliasing (fadeIn → fade, …)           │
│    • Theme presets, autoplay, template extraction, morph pair    │
└──────────────┬─────────────────────────────────────────────────┘
               │ direct ESM import
┌──────────────▼─────────────────────────────────────────────────┐
│  dist/pptxgen.es.js          (the EVOLVED pptxgenjs library)    │
└────────────────────────────────────────────────────────────────┘

Transport-agnostic recipe layer:
┌────────────────────────────────────────────────────────────────┐
│  claudepptxmcp/showcase.mjs                                     │
│    • Pure recipe — 162 invocations of `call(name, args)`        │
│    • ZERO imports from engine.mjs or pptxgenjs                  │
│    • Same recipe runs through any `call` function the caller    │
│      supplies: in-process engine OR live MCP stdio client       │
└────────────────────────────────────────────────────────────────┘
```

## Built-in showcase

`claudepptx.demo.build_showcase` (also runnable directly via
`node claudepptxmcp/demo-runner.mjs`) produces a 17-slide AUTOPLAY deck
that exercises **every** evolved capability — every slide advances after
7 seconds, loops continuously, runs in kiosk mode:

| Slide | Content                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------- |
| 1     | Cover — radial nebula gradient, WordArt arch title, Text3D subtitle, glow ellipse, chevron fly-ins   |
| 2     | Six gradient cards, drop shadows, reflections, fly-in animation                                       |
| 3     | Gradient gallery — 8 gradient permutations (linear/radial/rect/transparent/multi-stop…)               |
| 4     | WordArt parade — 8 transforms (arch, wave, circle, chevron, cascade, inflate, deflate, triangle)      |
| 5     | Native bar chart with gradient series                                                                  |
| 6     | Feature-comparison table                                                                               |
| 7     | Shape gallery — glow / reflection / softEdges / shadow + motion-path animated orb (circlepath preset)  |
| 8     | Text3D deep dive — metal / plastic / powder / matte materials, four lightRig variations                |
| 9     | Sequenced text animation (iterate engine, byParagraph) + stacked entrance+emphasis on callout          |
| 10    | "Thank you" finale with Text3D reflection title + pulsing ribbons                                       |
| **11**| **Evolved chart** — bar + line **combo** with **dual value axes**, styled plot area, smoothed line, sized markers |
| **12**| **Evolved table** — **per-cell gradients** (17 distinct gradient fills), **side-specific borders**, **colspan** group header |
| **13**| **custGeom** — 4 hand-drawn vector freeforms: lightning bolt (lineTo+close), wave (cubic Bezier), 8-point star, quadratic-Bezier underline |
| **14**| Morph transition source — 3 named round-rects (cyan/magenta/amber)                                     |
| **15**| Morph transition target — same names, repositioned + recoloured + rotated → PowerPoint morphs in slideshow |
| **16**| **3D model** — embedded GLB (growth-arrow.glb) with PNG raster fallback + tech-card panel              |
| 17    | Finale — Text3D + glow + reflection + custGeom play-triangle, "autoplay·loop·kiosk" tagline           |

A representative run produces a 185 KB `.pptx` with:

- **17 slides**, **134 shapes**
- **50 gradient fills**
- **9 WordArt warps**
- **7 Text3D / 3D-shape extrusions**
- **28 transitions** (every slide, including 1 morph and 1 orbit, 1 vortex, 1 shred, 1 glitter, 1 flyThrough …)
- **119 animation par trees**
- **1 embedded GLB 3D model**
- **kiosk mode + loop + useTimings + showAnimation** — autoplays automatically when opened
- All slide XML well-formed; required OOXML parts present
- 14/14 evolved-feature OOXML verifier checks pass

## How to use Claude with this MCP

In a typical Claude session:

```jsonc
// 1. Create the deck
{ "tool": "claudepptx.deck.new",
  "args": { "layout": "LAYOUT_WIDE", "title": "Q3 Review" } }
// -> { deckId: "deck_..." }

// 2. Add a slide with a transition + gradient background
{ "tool": "claudepptx.slide.add",
  "args": {
    "deckId": "deck_...",
    "background": {
      "type": "gradient", "gradientDirection": "linear", "gradientAngle": 45,
      "gradientStops": [
        { "position": 0, "color": "1F2A6B" },
        { "position": 100, "color": "22D3EE" }
      ]
    },
    "transition": { "type": "fade", "speed": "slow" }
  } }
// -> { slideIndex: 0 }

// 3. Add WordArt-warped title with glow + Text3D
{ "tool": "claudepptx.slide.add_text",
  "args": {
    "deckId": "deck_...", "slideIndex": 0,
    "text": "Q3 Review",
    "options": {
      "x": 0.5, "y": 1.0, "w": 12, "h": 1.5,
      "fontSize": 64, "bold": true, "color": "FFFFFF",
      "wordArt": { "transform": "textArchUp" },
      "glow": { "size": 12, "color": "C026D3", "opacity": 0.7 },
      "text3D": {
        "bevel": { "type": "circle", "width": 4, "height": 4 },
        "extrusion": 8, "extrusionColor": "6D28D9",
        "material": "metal", "lightRig": "threePt",
        "rotationX": 10, "rotationY": 6
      },
      "animation": { "type": "entrance", "effect": "fade", "duration": 800 }
    }
  } }

// 4. Save
{ "tool": "claudepptx.deck.save",
  "args": { "deckId": "deck_...", "fileName": "Q3_Review.pptx" } }
// -> { filePath: "...absolute path..." }
```

## Notes on the engine

- **Animations** are applied via `slide.addAnimation(target, props)` (the
  evolved library no longer accepts `animation` inline on object options).
  The engine accepts the friendly inline form and lifts it automatically.
- **Effect names** are normalised: `fadeIn`/`fadeOut`/`Fade` all map to
  the registry's `fade`. Unmapped names pass through lowercased.
- **Deck IDs** live for the lifetime of the server process. Use
  `claudepptx.deck.dispose` to free memory when done.
- Use `claudepptx.deck.validate` (with `autoFix: true`) before
  `claudepptx.deck.save` if you want explicit corrections.

### Editing an existing deck (open → inspect → mutate → save)

`deck.open_existing` decyphers a `.pptx` and replays it into the registry —
text, shapes, images, **video/audio media**, and relationship-backed passthrough
groups, preserving each object's `objectName` + source shape id. From there the
generic edit primitives work on real decks:

- `slide.list_shapes` / `slide.inspect_shapes` — discover what's there.
- `deck.transform_shapes` — deck-wide **recolor / invert-mode / patch**, e.g.
  `{ colorTransform: 'invertLightness' }` (dark↔light), `{ colorMap: {...} }`,
  or `{ patch: {...}, filter: {...} }`.
- `slide.update_shape` — surgical per-shape change (move / resize / recolor / retext).
- `slide.animate_shapes` — add diversified entrance animations + stagger.

Proven on frozen references (batch7 media / batch10 shapes / batch11 wordart):
invert-mode + smart animation, all repair-free and PowerPoint-openable, purely
over the MCP wire. Media is re-added via `addMedia` (both video rels) and
de-duplicated across slides.

### Morph "magic move" via primitives (no bespoke tool)

Morph shines when consecutive slides share the **same objects in a changed
state**. Compose it from primitives:

```js
// 1. Duplicate a slide — clone keeps every objectName + shape id (identity)
{ tool: "claudepptx.slide.duplicate", args: { deckId, slideIndex: 0 } }   // → new slideIndex
// 2. Mutate the clone's shapes (move / scale / rotate / recolor)
{ tool: "claudepptx.slide.update_shape",
  args: { deckId, slideIndex: 1, objectName: "alpha", patch: { x: 5, y: 2, rotate: 45, fill: { color: "FF3399" } } } }
// 3. Set the morph transition on the clone
{ tool: "claudepptx.deck.set_transitions_all",
  args: { deckId, variants: [ { type: "morph", option: "byObject" } ] } }
```

Because the duplicated objects keep their identity, PowerPoint interpolates
position/size/rotation/colour between the slides — the "magic move". Verified on
all four sample decks (matched objects > 0 with real state deltas, opens in
PowerPoint). See `demos/demo-morph-magic.mjs`.

### Autoplay in one call

```js
{ tool: "claudepptx.deck.autoplay",
  args: {
    deckId,
    secondsPerSlide: 7,
    loop: true,
    mode: "kiosk",
    defaultTransition: { type: "fade", speed: "medium" }
  } }
```

This sets `showSettings` (kiosk + loop + useTimings + showAnimation) on
the deck and applies `advanceAfterTime` + `advanceOnClick: false` to
every slide's transition, adding the default transition where none was
set.

## Comparison to `claudepptxmcp`

`claudepptxmcp` (in `src/pptx-mcp`) is recipe / showcase / SaaS-flavoured —
it bundles design-system templates, capability ledgers, premium assets.
`claudepptxmcp` is intentionally smaller and AI-driver-shaped: it gives
Claude a **direct, low-level handle on every evolved pptxgenjs feature**
so the model can author decks freehand, with the same expressive surface
it gets from writing pptxgenjs code directly.
