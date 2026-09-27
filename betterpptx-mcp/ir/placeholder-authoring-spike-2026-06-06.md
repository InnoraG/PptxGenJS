# Placeholder Authoring Spike

Date: 2026-06-06

## Question

Can generated title/body objects bind to real PowerPoint layout placeholders
through the current primitive handlers?

## Finding

The library serializer can emit placeholder metadata when an object carries
placeholder options, and template/layout auditing can discover placeholder
contracts for loaded decks. That means v1 can use real placeholder targeting
when a trusted template contract provides stable placeholder names.

The public semantic compiler cannot assume such a contract exists for every new
deck or uploaded reference. For v1, placeholder binding is therefore:

```text
contract-aware with deterministic geometry fallback
```

## V1 Decision

- If a template/layout contract is supplied and exposes safe placeholder names,
  the compiler may pass `options.placeholder` through existing primitive
  handlers.
- If no contract is available, the layout engine uses deterministic
  geometry-matched title/body/footer regions.
- Every layout plan reports `placeholderPolicy` and each slide reports
  `placeholderBinding` so AI clients know whether true placeholder binding or
  geometry fallback was used.
- The compiler must not claim true PowerPoint placeholder binding when it used
  geometry fallback.

This resolves Milestone 3 for v1 without adding a second renderer.
