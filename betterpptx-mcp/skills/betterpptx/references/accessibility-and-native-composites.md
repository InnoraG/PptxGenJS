# Compose accessible native visuals

Treat accessibility as part of authorship, not a compliance layer added after design. Build slides whose hierarchy, meaning, and editability survive loss of colour, motion, audio, or presenter presence.

## Prefer a native composite when one object is not enough

A native composite combines a small set of editable PowerPoint objects around one message. Typical roles are claim, proof, explanation, and implication. Use stable names and semantic regions so those roles remain identifiable without authored placement.

- Pair a native chart with one interpretive callout, not a wall of unrelated metrics.
- Pair a process or relationship diagram with a concise explanation of why the structure matters.
- Pair an equation with a plain-language interpretation and the meaning of its variables.
- Pair an editable 3-D model or image with labels that reveal mechanism, orientation, or evidence.
- Pair a native table with a focal row, column, variance, or decision rule when exact lookup needs guidance.

Exploit native charts, tables, SmartArt, connectors, equations, models, media, ink, and expressive type when each object has a semantic job. Do not add capabilities for coverage, and do not rasterize a composition merely to preserve appearance.

## Make each native family complete

- SmartArt: choose a layout whose declared topology matches the relationship; supply the required parent, child, sibling, or level structure so no node can disappear silently. Keep text readable on every native node surface.
- Charts: preserve truthful data semantics, explicit totals where required, readable axes and data labels, theme-consistent fonts, and a meaningful data summary.
- Tables: use real header hierarchy, concise cells, consistent numeric formatting, clear emphasis, and an accessible summary of the important comparison.
- Connectors and diagrams: make direction, endpoints, grouping, and flow unambiguous. Avoid crossing paths and decorative arrows with no meaning.
- Equations: keep the expression native and provide a human-readable interpretation and accessibility description.
- Models and presenter objects: keep the native object editable, provide an intentional static view, and ensure visible slide content carries the complete message without playback.
- Expressive text: keep the spoken phrase legible and use accessible wording elsewhere when a decorative transform reduces direct readability.

## Author for multiple ways of perceiving

- Establish a reading order that follows the intended narrative: title, claim, proof, interpretation, source or action. Layer order must not contradict that sequence.
- Write `altText` for meaning and function. Describe the conclusion, relationship, or mechanism a viewer should understand; avoid inventories of colour and shape.
- For data, include the key trend, comparison, and representative values. Preserve units and the distinction between actual, forecast, and illustrative evidence.
- Never encode status or category through colour alone. Add labels, symbols, pattern, position, or wording.
- Maintain strong text-to-surface contrast across light and dark native objects. Pay special attention to chart labels, table cells, SmartArt nodes, annotations, and text placed over images or gradients.
- Keep text comfortably readable without relying on extreme shrink-to-fit. Simplify content or split the idea when the hierarchy collapses.
- Mark purely decorative objects as decorative and keep them out of the meaning path.
- Keep narration, audio, motion, and presenters supplemental. The static slide must communicate the complete claim, proof, and action.

## Test the composition conceptually

Ask four questions before accepting the design:

1. If colour disappears, are categories, status, and emphasis still clear?
2. If motion and audio never play, is the whole message visible and correctly ordered?
3. If the objects are encountered one at a time, do their names, summaries, and sequence reconstruct the argument?
4. If a colleague edits the deck in PowerPoint, do the important objects remain native, understandable, and safe to change?

Simplify the semantic structure before abandoning native editability. Use a custom composite only when the intended meaning truly exceeds supported native capability, and record that specific reason.
