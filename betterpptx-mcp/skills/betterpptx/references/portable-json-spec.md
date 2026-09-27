# Portable BetterPPTX JSON specs

A finalized `betterpptx.deck-spec.v1` file is presentation source code, not disposable tool input. A person may attach one directly and ask the AI to inspect, revise, compile, or share it.

## Accept a user-provided spec

1. Keep the attached file unchanged as the authored input.
2. Call `betterpptx.assets.upload` with `kind:"jsonSpec"` and the connector file.
3. Record the returned raw and canonical hashes, schema version, title, and slide count.
4. Call `betterpptx.deck.generate_from_spec` with the opaque value in its `specHandle` argument and `phase:"dryRun"`.
5. Review public findings and provenance. If changes are needed, revise the parsed semantic spec deliberately and dry-run again; never reconstruct the deck from a prose summary.
6. Resolve and lock assets only when required, commit without saving, and run the verification policy returned by discovery. Under `release-powerpoint`, preview every slide, revise, and perform the single certification save only after the frozen package is accepted. Under `production-non-rendering`, run the applicable deterministic package/media/timing/accessibility/selection checks and save without hosted PowerPoint; record that rendering was not performed rather than claiming an individual preview.

## Export and share

`betterpptx.deck.export_spec` has distinct meanings:

- `mode:"current"` reconstructs a semantic representation of the current editable deck. It is useful for revision but is not the original authored file.
- `mode:"authoredInput"` returns the immutable parsed spec supplied to the authoring operation.
- `mode:"effectivePrecompile"` returns the exact deterministic spec immediately before plan compilation.

Set `download:true` on an authored/effective export to obtain a portable `.betterpptx-spec.json` artifact. Keep its canonical hash with the deck evidence.

Specs are private by default. Do not publish, submit a pull request, add to a public casebook, advertise, or use a user's spec as training material without explicit permission, a declared license, privacy/secret review, asset-rights review, and confirmation that the public artifact exposes no private implementation details. Compilation never implies publication consent.
