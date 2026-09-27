# Private maintainer evidence surface

This repository contains historical PowerPoint rebuilds and Record Studio probes that
were authored by importing `betterpptx-mcp/engine.mjs` directly. They are useful for
debugging and owner review, but they are not public-product generation evidence.

## Surface classification

| Class | Examples | Release meaning |
| --- | --- | --- |
| Retired legacy generator | `test/build-commercial-recordstudio-combined.mjs`, `test/verify-avatar-recording-structure.mjs`, `test/rebuild-current-commercial-round.mjs` | Removed from the worktree. Historical/private PPTX outputs remain quarantined; no replacement script may generate product-style decks outside the live MCP semantic JSON-spec route. |
| Private rebuild/generator | The exact reviewed set is recorded in [`PRIVATE-DIRECT-ENGINE-SCRIPT-MANIFEST.json`](PRIVATE-DIRECT-ENGINE-SCRIPT-MANIFEST.json). | Historical/private evidence only; direct engine calls do not prove the MCP transport boundary. The manifest is exact-gated: a new direct-engine script fails the boundary check until reviewed, and none may create new delivery artifacts. |
| Read-only verifier | Record Studio UI/playback probes, package ZIP checks, Director COM/runtime checks | May inspect an already-produced artifact; it must not be described as a generator. |
| Live MCP proof | `tools/run-spec-edit-roundtrip-corpus.mjs`, `tools/run-existing-first-user-edit-smoke.mjs` | The only class that demonstrates a real MCP client transport. |

Direct-engine artifacts remain preserved under the historical quarantine manifest; no
artifact deletion is required. The exact delivery manifest is the only source of
production candidates, and every candidate still requires the production PPTX
black-box scan, PowerPoint reopen proof, and owner approval.

Private provider, enhancement, execution, and pipeline vocabulary may appear in
owner-only research evidence. It must not appear in delivered PPTX package text,
public tool results, download names, or customer-facing metadata.
