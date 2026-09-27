# Teaching-release integrity

A certification run uses one immutable public authoring environment from prompt
receipt through the first saved artifact.

The release record binds:

- public repository revision;
- `betterpptx-public-manifest.json` and every file hash;
- capability-atlas, casebook-index, and teaching-gap-ledger fingerprints;
- installed BetterPPTX skill-tree hash;
- public tool-schema, capability, workflow, and catalog fingerprints;
- client and model identity;
- original prompt hash;
- public call log and save count.

A release is ineligible if its curriculum is uncommitted, its installed skill
differs from the repository copy, its public surface fingerprints drift during
the run, or private files and maintainer tools are available to the cold author.

## Generated projection

This repository is projected from a canonical public curriculum source. Direct
edits to generated files may be overwritten. The deterministic manifest omits
timestamps and local paths so identical source bytes produce identical public
bytes.

Only public documentation, skill files, public-safe examples, and approved
visual assets belong here. Runtime code, deployment material, dependency locks,
credentials, private endpoint configuration, provider details, and internal
diagnostics are excluded.

## Compatibility

The curriculum teaches procedure and judgment. The live MCP advertises exact
executable schemas and catalog IDs. Publication checks must verify that every
documented `betterpptx.*` tool exists in the public projection and that example
specs pass public dry-run before a release is promoted.
