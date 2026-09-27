# Public capability atlas

The capability atlas is a factual, unranked map from a communication need to
the public catalog family that can help express it. It does not pick a design,
freeze a catalog value, or replace live discovery.

Read the [machine-readable atlas](atlas/capability-atlas.v1.json), then query
only the families that serve the current story. For each selected entry:

1. start with the focused query and small page described by the atlas;
2. for a generic authoring-catalog row, bind a selector only when the live row
   is `implemented` and its `selection` object explicitly contains
   `executableId` or `executableValue`;
3. treat `route.exactSelection` as routing information, not as the selector;
   it may name a public follow-up tool or a semantic spec destination;
4. follow a public tool only when the row is selectorless and that tool accepts
   a focused bounded request, then bind only an explicit id or handle returned
   there. A row that already has a selector does not trigger the route, and an
   unbounded, semantic-destination, composition, validation, preserve-only, or
   planned route is informational rather than an executable choice;
5. preserve the selected row's native, editable, fallback, applicability, and
   constraint facts;
6. record the AI's communication reason in the semantic spec and prove the
   explicit selector survives dry-run, commit, preview, and release readback.

An opaque asset handle is usable only when it was returned by the connected
public catalog or upload result. Never invent, decode, or transform a handle.

## Truth state

This development atlas is manifest-bound to the public schemas and describes
general combination and misuse patterns. It does not yet contain accepted
render evidence. Every `renderEvidence.caseIds` list is therefore empty and
marked `planned`. A later teaching release may change that state only after an
immutable PowerPoint render and its public evidence have been accepted into
the casebook.

The atlas is ordered by stable entry ID for deterministic reading. That order
expresses no aesthetic preference.
