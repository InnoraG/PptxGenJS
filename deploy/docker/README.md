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

## Explicit multilingual model selection

The private speech worker supports `CHATTERBOX_MODEL_VARIANT=multilingual` with
`CHATTERBOX_MULTILINGUAL_VERSION=v2` or `v3`. The version defaults to `v2` so
existing deployments and their model digests retain their meaning. Version
selection is exact: unknown values, an English variant combined with `v3`,
missing selected weights, and mismatched catalog identities fail startup.

For V3, provision `t3_mtl23ls_v3.safetensors` alongside `conds.pt`,
`grapheme_mtl_merged_expanded_v1.json`, `s3gen.pt`, and `ve.pt`. The catalog must
declare `modelVariant: "multilingual"`, `multilingualVersion: "v3"`, and a
`modelDigest` computed by `model_digest(model_directory, 'multilingual', 'v3')`.
The selected filename and its actual bytes participate in that digest; a V2
catalog cannot authorize V3 weights. Existing catalogs without a version field
are interpreted as V2 and cannot be used for a V3 selection. A voice entry may
add its own `multilingualVersion` restriction, which must agree with the catalog.

V3 also requires upstream code with an explicit `from_local(..., t3_model=...)`
selector. The verified upstream source is
[revision 5de7a54aa4e5e2baadb0182dde554908b48b85c2](https://github.com/resemble-ai/chatterbox/blob/5de7a54aa4e5e2baadb0182dde554908b48b85c2/src/chatterbox/mtl_tts.py).
The worker calls that selector with `t3_model='v3'`; it does not catch a failed
load and retry another version. Older fixed-V2 loaders remain supported only for
V2. The 0.1.7 package alone must not be described as V3-capable.

This selection support does not provision weights, update a container image,
change a production manifest, or certify V3 inference. Validate the selected
upstream revision, actual weights, reference permissions, and real output
separately. Local diagnostics can record startup details; HTTP errors remain
generic and expose no model or filesystem metadata.

Focused offline worker checks:

```powershell
python -m unittest discover -s deploy/docker -p test_chatterbox_http_runtime.py
```
