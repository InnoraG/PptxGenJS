# Semantic art-direction authoring

Choose a visual World as an AI design decision, not as an automatic theme recommendation. Discover the unranked `art-direction` catalog, select a story-fit key through `styleIntent.artDirection`, and set `styleIntent.mode` only when the alternate tuned mode is intentional. The 18 named Worlds change the complete visual grammar—canvas treatment, card language, typography, accents, depth, image treatment, data language, and motion temperament—not merely a colour swatch.

Named Worlds are discrete starting selectors. They are not a ceiling: brand palette, explicit fonts, surface axes, composition, depth, image treatment, presenter, motion, and data-style overrides remain authorable wherever the public contract exposes them. For a bespoke World, supply an inline `styleIntent.artDirection` object with only the axes the story needs; the engine synthesizes the remaining safe defaults and reports the resolved World/readback.

The AI owns the visual thesis, audience fit, hierarchy, contrast, and balance judgment. The engine owns deterministic realization, precedence, legibility checks, and factual readback. Do not copy computed rectangles or treat an engine fallback as creative direction. Use `dryRun`, inspect `appliedDefaults` and quality findings, patch semantic intent, and rerun before committing.

For lifecycle proof, a fresh public client discovers the 18-world catalog, selects a named or bespoke World, performs a mutation-free dry-run, commits and exports the durable JSON source, then verifies reset/re-edit and no-private-leakage. Public responses expose semantic World/readback only; private repository paths, implementation names, and asset locations are never part of the public contract.
