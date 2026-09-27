# B1 — Clip Library v2 (designed authoring interaction set)

Status: **CONTRACT + ENVELOPE + GATE SHIPPED 2026-07-14; clip SOURCING + BAKE + PERCEPTUAL = owner/worker follow-up.**

B1 designs a ≤18-clip library built for the SYNERGY INTERACTION verbs (touch / point-at / press /
carry / push / knock-over) — distinct from the gesture library (presentation gestures) and the
kinetic action pool (athletic clips). The parts that need no GPU/browser are done and verified; the
parts that need the Mixamo browser + Blender/Modal bake are specified as a mechanical checklist.

## Done (achievable + verified now)

- **Frozen 18-slot contract** — `deploy/model3d-worker/canonical/authoring-clipmap-v3.json`: slot ==
  embed animId (frozen order, ≤18 = L6 ceiling); each slot names its role, height band, side,
  served verbs, contact bone, the **≥400 ms plateau** requirement (so the solver's freeze-time
  contact is stable), rest-return, Mixamo source candidates, and a per-slot G5 `status` lifecycle
  (`TO_SOURCE → SOURCED → BAKED → ORACLE_MEASURED → SHIPPABLE`). The 18 slots: 6 reach-touch
  (3 heights × 2 sides), 2 point (mid/high), 1 press, 2 grab-carry-drop (near/far), walk + turn,
  breathing idle, emphatic beat, greet/bow, agree/disagree nods.
- **Semantic verb→slot map** (in the contract) — the solver's `semanticClips` filter (T25: never
  scan all clips). Impulse verbs (push/knock-over) reuse the highest-velocity slot (beat) + a reach.
- **Admissible target envelope** — `deploy/model3d-worker/canonical/authoring-envelope-v1.json`:
  per verb × window family (small 3.5 / medium 5 / large 6.5), the reach region (fractions of window
  height) in which a target MUST be solvable within `tolIn=0.15`, with a grid.
- **Envelope gate tool** — `tools/render-oracle/envelope-gate.mjs`: sweeps the envelope against an
  actor's oracle timelines; reports per-verb coverage %, the nearest solvable point for each failure
  (the actionable fix), and — critically — separates **positional reachability** from the
  **pose-semantic** verdict.

## Measured baseline (v1 action-clip actor kinetic-joe, honest)

| verb | positional coverage | semantic |
|---|---|---|
| touch | 100% (60/60) | NOT proven — slots 0-5 are athletic clips, not reach-touch |
| point-at | 100% (45/45) | NOT proven — slots 6-7 are athletic clips |
| press | 100% (27/27, all-clips fallback) | NOT proven — no press slot on this actor |
| carry | **77.8% (28/36)** | real positional gap — carry needs a grab plateau action clips rarely have |

**What the baseline proves:** the placement solver is positionally powerful — it can put the window
so *some* frozen hand lands on almost any target. So positional reachability is NOT the binding B1
constraint; **pose-semantic correctness is** (a backflip freeze isn't a "touch"), and the residual
gate cannot see that — same lesson as pixel-metrics-vs-filmstrips. The carry 77.8% is a genuine
gap even positionally. The gate goes to `semanticAllProven` only when run against a **v3-baked**
actor (slot N IS the v3 role) AND a perceptual/filmstrip pass signs off the poses.

## Follow-up (owner/worker — needs Mixamo browser + Blender/Modal bake)

1. **Source** each slot's clip from its `candidates` (Mixamo browser, owner login) → `SOURCED` +
   a G5-ASSET-LICENSE-LEDGER row (Mixamo commercial-in-project basis).
2. **Bake** the 18 slots into a v3 library GLB via the worker (`mixamo_bake.py` retarget +
   `reorder_animations` to the frozen slot order + `validate` against `authoring-clipmap-v3.json`);
   enforce the plateau requirement at bake time (reject a slot whose contact pose holds < 400 ms).
3. **Oracle-measure** a v3-baked actor (A1 `oracle-run.mjs`) → timelines.
4. **Gate**: `envelope-gate.mjs` against the v3 actor must reach `semanticAllProven` (100% per verb,
   slot-clips-present); a PERCEPTUAL/filmstrip pass confirms each reach/point/carry reads correctly.
5. Then flip each slot's `status` to `SHIPPABLE`.

## Ties

- G5: every sourced clip needs its ledger row before its baked bytes ship (contract `g5` field).
- A1: the oracle produces the v3 actor's timelines the gate consumes.
- PERCEPTUAL: the pose-semantic sign-off the residual gate cannot provide.
- B2 roster: each roster character re-bakes THIS frozen v3 clip set (one library, many meshes).

measuredAt: 2026-07-14
