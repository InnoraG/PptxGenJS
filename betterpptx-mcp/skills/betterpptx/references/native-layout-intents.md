# Semantic layout-intent authoring

Choose the communication archetype; do not place objects with coordinates. Set `slides[].layoutIntent` to one of the public semantic intents such as `title-only`, `title-body`, `hero`, `two-column`, `comparison`, `metric-grid`, `process-flow`, `timeline`, `image-left-copy-right`, `chart-left-insights-right`, `three-column`, or `section-divider`. The engine resolves named regions, content-aware columns, typography, fit, and final geometry.

The 19 layout intents are discrete selectors, not rigid templates. Use `content[].kind`, `content[].role`, `content[].region`, and optional `slides[].arrange`/`regionPlan` to express meaning and balance. The AI owns the story, hierarchy, visual weight, and choice of intent; the engine returns factual region assignments, occupancy, fit, warnings, and layout readback. A layout recommendation is feasibility evidence, never an instruction for the AI to surrender design judgment.

Omit `bbox`, `rect`, `x`, `y`, `w`, and `h` in a new authoring spec. If a selected intent is incompatible with the supplied semantic proof/explanation kinds or is too dense, revise the intent or semantic assignments and rerun `dryRun`; never copy engine rectangles back into the spec. Stable names and roles make sparse re-edit and reset deterministic.

For lifecycle proof, use a fresh public session to discover the layout vocabulary, upload a semantic JSON spec, run mutation-free `dryRun`, commit, inspect layout readback and quality findings, patch only semantic fields, reset a named layout override when applicable, export the authored source, and save only after the authoritative preview boundary is available. Public responses contain semantic intent/readback, not private geometry or implementation paths.
