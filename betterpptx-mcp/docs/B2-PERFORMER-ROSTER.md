# B2 — Performer Roster (launch ≥4, ≥2 female)

Status: **PIPELINE + REGISTRY + GATE SHIPPED 2026-07-14; member #1 (Joe) automated-green. 3 more
members (≥2 female) need the worker bake + human rubric — owner/worker follow-up.**

## Done (achievable + verified now)

- **One-command onboarding** — `tools/roster/onboard-character.mjs`: a stage pipeline (source →
  fbxToGlb → transplant v3 → normalizeMaterials → slim512 → poster → contacts → oracle →
  durableRegister). Each stage runs if it can, else reports a precise blocker
  (`WORKER_REQUIRED` for the Blender stages, `COM_REQUIRED` for the oracle) with the exact command —
  it never fakes a stage. GLB sources skip fbxToGlb; an existing oracle result (keyed by actor sha)
  is reused; the durable register runs only when the oracle passes (held-out ≤ 0.15) and a poster
  exists.
- **Frozen roster registry** — `deploy/model3d-worker/canonical/roster.json`: per-member id, sex,
  source + license (g5Row), hash-keyed assets, own oracle profile, clip library, per-stage status,
  and the launch bar (≥4 members, ≥2 female). No character inherits another's oracle.
- **Roster gate** — `tools/render-oracle/roster-gate.mjs`: per member checks A3/METROLOGY (own
  oracle held-out ≤ 0.15), F5a/PACKAGE (GLB ≤ 24 MB refuse / 12 MB warn, poster ≤ 500 KB, sha
  integrity), LICENSING (g5 row), PERCEPTUAL (blind rubric — human, never auto-passed); then the
  launch bar.

## Member #1 — Joe (male): onboarded end-to-end + automated-green

Onboarding run: source ✓ · contacts 18 clips ✓ · poster ✓ · **oracle held-out 0.1471 in ✓** ·
**durableRegister ✓** (`gen://rigged3d/2d23f0…`, persisted to the durable store). Roster gate:
oracle ✓ · GLB 11.3 MB (< 12 MB warn) ✓ · poster 304 KB ✓ · license ✓ · **rubric = PENDING (human)**.

Caveat (recorded in the registry): Joe currently carries the v1 ACTION clip pool, not the B1 v3
interaction set — his calibration/budget/gesture roster membership is real; his INTERACTION
pose-semantics wait on a B1 v3 re-bake.

## Roster gate result (2026-07-14)

`1 member, 1 automated-ready, 0 shippable (rubric pending), 0 female` → **NOT launch-ready.**

## Follow-up (owner/worker — Blender bake + owner sourcing + human rubric)

1. **3 more members**, and the composition gap is real: the launch bar needs **≥2 female**, but the
   on-disk candidates give only **1** (louise). Source a **2nd female** — a Mixamo female character,
   or a Flux-generated + TRELLIS-rigged mesh (both resale-safe). Male candidates (josh/remy) exceed
   need.
2. **Bake each candidate** through onboarding — the FBX→GLB and poster stages need Blender (the
   worker); every other stage runs as shown for Joe. Onboarding prints the exact Blender command per
   character.
3. **Re-bake all members onto the B1 v3 clip set** once it exists (one library, many meshes) so the
   roster is interaction-ready, not just gesture/calibration-ready.
4. **Human rubric** — a blind roster-quality sign-off per member (the one gate the automated pass
   cannot provide).
5. Each member gets its **own G5 license row** (Mixamo commercial-in-project or gen-safe) before its
   bytes ship.

## Ties

- A1: each member's own oracle (no inheritance). · G3: durable registration (Joe proven local).
- F5a: the size budgets the gate enforces (owner-approved). · G5: per-member license rows.
- B1: the v3 clip set every member re-bakes. · PERCEPTUAL: the rubric the gate reserves for a human.

measuredAt: 2026-07-14
