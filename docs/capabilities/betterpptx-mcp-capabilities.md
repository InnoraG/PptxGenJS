# betterpptx-mcp Evolved Capabilities

Generated machine-context companion for `betterpptx-mcp-capabilities.json`.

Load the JSON file as the authoritative artifact. This Markdown file is intentionally thin.

```json
{
  "generatedAt": "2026-06-01T18:01:36.738Z",
  "package": {
    "name": "betterpptx-mcp",
    "version": "4.0.1",
    "description": "Create JavaScript PowerPoint Presentations",
    "exports": {
      ".": {
        "types": "./types/index.d.ts",
        "import": "./dist/betterpptx-mcp.es.js",
        "require": "./dist/betterpptx-mcp.cjs.js"
      },
      "./decypher": {
        "types": "./types/pptx-decypher/index.d.ts",
        "import": "./dist/node/pptx-decypher/index.js"
      },
      "./betterpptx-mcp": "./betterpptx-mcp/server.mjs",
      "./betterpptx-mcp/engine": "./betterpptx-mcp/engine.mjs",
      "./betterpptx-mcp/tools": "./betterpptx-mcp/tools.mjs",
      "./betterpptx-mcp/http": "./betterpptx-mcp/server-http.mjs",
      "./capabilities.json": "./docs/capabilities/betterpptx-mcp-capabilities.json",
      "./package.json": "./package.json"
    },
    "main": "dist/betterpptx-mcp.cjs.js",
    "module": "dist/betterpptx-mcp.es.js",
    "types": "types"
  },
  "counts": {
    "enums": 15,
    "interfaces": 80,
    "typeAliases": 28,
    "shapeTypes": 179,
    "legacyShapeAliases": 184,
    "chartTypes": 20,
    "chartPresets": 24,
    "tablePresets": 8,
    "presentationMethods": 12,
    "slideMethods": 18,
    "animationRegistryEffects": 165,
    "animationPresetEntries": 206,
    "animationSubtypeDirections": 157,
    "animationDefaultDurations": 204,
    "rawPackageFamilies": 13
  },
  "runtime_surfaces": [
    "browser_generation",
    "node_decypher",
    "mcp_adapter",
    "cli"
  ],
  "mcp_tools": [
    "betterpptx.help.capabilities",
    "betterpptx.chart.recommend",
    "betterpptx.table.recommend",
    "betterpptx.deck.new",
    "betterpptx.slide.add_chart",
    "betterpptx.deck.open_existing",
    "betterpptx.deck.validate",
    "betterpptx.deck.save"
  ],
  "capability_atoms": [
    "deck.system",
    "slide.authoring",
    "text.rich",
    "shapes.styles",
    "pictures.fidelity",
    "tables",
    "charts",
    "media.3d",
    "animations",
    "decypher.codegen",
    "mcp.adapter"
  ],
  "generation_recipes": [
    "author_new_deck",
    "roundtrip_existing_deck",
    "rag_guided_generation",
    "visual_fidelity_text",
    "visual_fidelity_picture_shape",
    "animation_authoring"
  ]
}
```
