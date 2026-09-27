# Shape the story and choose its medium

Start with the change the audience should experience: understand, believe, decide, remember, or do. Write the deck's promise in one sentence, identify the proof that can earn it, and decide what tension makes the journey worth following.

## Build an argument, not a stack of topics

- Give the opening a productive gap: a surprising fact, consequential question, vivid future state, or conflict the audience recognizes.
- Arrange slides as moves in one argument. Useful moves include orient, complicate, prove, explain, compare, reveal, decide, and echo.
- Escalate evidence or consequence toward a clear turning point. Let the close resolve the opening promise and make the next action memorable.
- Vary rhythm. Follow dense evidence with synthesis; follow abstraction with a concrete example; use a quiet slide when one statement deserves full attention.
- Give each slide one governing message. Supporting objects should prove, clarify, or advance it rather than introduce parallel stories.
- In a keynote, vary the silhouette as well as the message. Do not let every slide become the same centered card, same-width strip, or same dark panel with only different words inside it.
- When three or more consecutive slides use the same structural motif, force a compositional change: switch from loop to evidence card, from table to stage diagram, from full-width row to one dominant proof object with a smaller interpretation lane.
- Inspect the rendered silhouette, not the catalog name. `list1` / Basic Block List reads as equal gold bars with empty vertical space; that is not a decision list. If you need stacked decisions, choose Vertical Bullet List (`vList2`) or a numbered typographic stack. If you need sequence, choose a process layout whose arrows actually read as sequence.
- A closer that repeats the opener's title-plus-gold-callout-plus-presenter frame is an echo only when the ask is visually dominant. Otherwise change `layoutIntent` and drop the repeated callout box.
- Write the closing ask so it holds as one line, or two balanced lines, from the back of the room. A stranded last word (“clear” alone under a long title) is a wrap failure, not a dramatic pause.
- Do not put a gold-outline disclaimer callout on every evidence slide. Honest limits belong in notes, alt text, and one quiet caption at most. If the table or metric cards already carry the proof, a second gold frame is leftover chrome.

Adapt the arc to the communication job instead of copying a fixed formula. Do not recycle a six-slide committee keynote (hook callout, cycle, table, metric-grid, presenter close) unless this brief is that job.

- Decision brief: stakes → evidence → alternatives → judgment → ask.
- Teaching narrative: curiosity → mental model → worked example → transfer.
- Keynote: premise → escalation → reveal → implication → closing echo.
- Progress update: baseline → change → cause → consequence → next move.
- Essay or letter: claim → scene → consequence → ask.
- Quiet launch: one line, then the product itself as native chrome (`textShape` pill, device, or amount), then a close. Do not ship a title on empty white and call it restraint.

## Turn each idea into the strongest medium

Choose the medium yourself from factual, unranked public capabilities. Use fit and support readback as constraints, never as taste.

| Message job | Strong starting medium | Judgment check |
| --- | --- | --- |
| Make a premise felt | Expressive type, a meaningful image, or a restrained native hero composition | Does the device intensify the idea without becoming decoration? |
| Show change or contrast | Native chart, before/after composition, or semantic timeline | Is the comparison immediately legible and truthfully scaled? |
| Explain a relationship | Native SmartArt when its topology matches; otherwise an editable shape-and-connector composition | Can the viewer infer direction, hierarchy, and dependency without narration? |
| Show a mechanism | Native diagram, equation, annotated image, or editable 3-D model | Does the medium reveal how the thing works rather than merely depict it? |
| Support a decision | Evidence chart, option matrix, risk map, or concise native table | Are criteria and trade-offs visible rather than buried in prose? |
| Establish human or spatial context | Purposeful photography, illustration, map, or model | Does the visual carry evidence or empathy specific to the message? |
| Deliver exact reference detail | Native table or structured appendix | Is lookup more important than visual pattern recognition? |

Use advanced capability only when it earns a role. A native chart, SmartArt diagram, equation, WordArt treatment, model, annotation, or transition should reveal meaning that ordinary bullets cannot.

## Compose with hierarchy and rhythm

- Establish one dominant idea or proof object on most slides. Let secondary content interpret it and tertiary content provide context.
- Combine a small number of complementary media roles—claim, evidence, explanation, implication—instead of filling a uniform grid.
- Use semantic regions and relationships, not authored placement, to express hierarchy.
- Preserve continuity through repeated motifs, stable naming, and deliberate callbacks, while varying composition enough to avoid template monotony.
- Use motion only when sequence, causality, transformation, or emphasis is part of the meaning. A static reading must still communicate the complete idea.
- Treat a process loop, table, strip of steps, and closing echo as different rhetorical jobs. They should not all inherit the same visual weight, box treatment, or spacing just because one treatment already works.
- Ask on every slide: what is the one thing the audience should notice first from the back of the room? If the answer is “another similar gold box,” the medium or hierarchy is too repetitive.

Reject interchangeable title-and-bullet slides, decorative icon rows, and capability showcases. If a slide could be moved to another deck without changing its meaning, make its claim, proof, and medium more specific.

Inspect the rendered slide the way a designer inspects HTML: if the only pixels are a thin title, the spec is unfinished. The World supplies canvas, type, and corners; you still author the proof object. Preferred native kinds for that proof: `textShape` (product chrome and room cards), `stat`/`kpi` (a single numeral), `chart-panel`, `table-panel`, `process`, `equation`, `customGeometry`, `image`/`image-feature`, `smartart`, `model3d`.
