# Docker Runtime

This stack runs the `betterpptx.*` MCP server and an isolated Piper TTS service.

1. Review and approve the production voice set in `betterpptx-mcp/narration/voices/manifest.json`.
2. Build the runtime voice folder:

```powershell
$env:BETTERPPTX_ALLOW_ATTRIBUTION_VOICES='0'
$env:BETTERPPTX_REQUIRED_VOICE_LANGS='approved'
node betterpptx-mcp\narration\download-approved-voices.mjs
```

As of 2026-06-06, the production runtime bundle is the best verified
commercially allowed Piper voice per working language: 24 voices / 24 languages.
Chinese remains a candidate, not runtime-approved, because the current Piper
Chinese phonemizer requires a heavier offline `g2pw`/Torch model path that must
be costed separately before production.

3. Start the stack:

```powershell
$env:BETTERPPTX_TOKEN='replace-me'
docker compose up --build
```

The MCP server listens on `http://localhost:3344/mcp`. The TTS service is only
used over HTTP from the MCP container. The Node MCP process must not import
Piper, piper-phonemize, or espeak-ng code.
