# BetterPPTX Semantic Deck Spec v1 Policy

`betterpptx.deck-spec.v1` is the first AI-facing intermediate representation
for compiling presentation intent into BetterPPTX primitive operations.

## Deterministic Object Model

The v1 public authoring surface is intentionally more explicit than generic
slide-object JSON. A valid high-quality spec should be built as a flat,
ordered layer list per slide with stable names and explicit inch `bbox`/`rect`
values whenever placement matters.

Text and geometry are distinct:

- `text` / `textBox` compile to standalone editable text boxes.
- `textShape` compiles to editable text inside a PowerPoint preset shape.
- `shape` is geometry-only and must not carry essential text.

If a `shape` block includes non-empty `text`, the compiler must emit
`SHAPE_TEXT_FORBIDDEN` as an error. This prevents AI clients from relying on
ambiguous shorthand that can produce shapes without visible text or editable
text bodies.

The compiler must also expose a deterministic capability matrix so an AI client
can distinguish spec-native blocks, deck-level spec fields, primitive-only
routes, and unsupported v1 capabilities before mutating a deck. The matrix is a
machine-readable authoring contract, not prose-only guidance.

## Versioning

- v1 changes are additive only.
- Unknown fields are accepted when safe and produce warnings instead of hard
  failures.
- Every compiler, verifier, and tool response echoes `schemaVersion`.
- Breaking changes require a parallel v2 schema and explicit migration guidance.

## Naming And Handles

Stable identity starts with author-supplied names:

- slide `id`
- block `name`
- item `name`
- series `name`
- data source `name`
- asset `name`

Generated object names derive from stable fields:

```text
{slideId}.{blockName}.{role}[.{itemName|i}]
```

Fallback positional identity is allowed only when no stable name exists. A
validator or compiler must emit `UNSTABLE_HANDLE` for positional fallback so an
AI client knows that inserts, deletes, or reorders may change downstream handles.

## Data Provenance

Data-bearing blocks and sources should include:

- `dataSource`
- `provenance`
- `verified`

Missing provenance does not block generation, but the compiler must emit
`UNVERIFIED_DATA` with the affected slide/block/data handle.

## Public Safety

Spec payloads and compiler responses must use opaque handles for uploaded
references, assets, and generated artifacts. Public responses must not expose
local filesystem paths, process metadata, source code, dependency names, logs,
or private billing identifiers.
