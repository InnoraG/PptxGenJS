# Use the atlas, casebook, and teaching evidence

Use the public capability atlas as an unranked navigation aid. It maps a
communication function to focused live catalog discovery; it never selects a
design for you.

1. Identify the communication problem before choosing a medium.
2. Read only the relevant atlas entries in
   `atlas/capability-atlas.v1.json` when the surrounding public teaching
   release makes that artifact available.
3. Use the entry's focused query and smallest page. A generic
   authoring-catalog row is directly selectable only when its live status is
   `implemented` and `selection.executableId` or
   `selection.executableValue` is present.
4. Treat `route.exactSelection` as routing information, never as the selector.
   It may name a public follow-up tool or a semantic spec destination. Follow
   a public tool only for a selectorless row and only when it accepts a focused
   bounded request, then bind an explicit id or opaque handle returned there.
   A row with a direct selector requires no route call. Unbounded,
   composition, validation, preserve-only, planned, and semantic-destination
   routes are informational and also require no follow-up.
5. Preserve the selected row's native, editable, fallback, applicability, and
   constraint facts. Record your own `coherenceReason` for the choice.
6. Treat accepted casebook entries as transferable evidence, not as templates
   to copy. Compare the brief, authorial choice, visible outcome, and lesson to
   the current task.

The casebook is organized by communication problem. A planned evidence lane is
not an accepted example. Do not infer a visual answer from an empty lane or
from a case whose brief materially differs from the user's needs.

If the public environment and the live catalog disagree, the live public
contract controls executable fields. Report the teaching drift instead of
inventing a selector or decoding a handle.

A developer insight is eligible for cold-author use only after it becomes a
general public lesson, factual readback, or universal product invariant. The
teaching-gap ledger records that promotion and its fresh-context forward test;
it must never contain private details or deck-specific hidden answers.
