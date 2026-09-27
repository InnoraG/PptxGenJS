# Synergy Engine — the calculation-based INTERACTION director

Status: M1-M4 CORE SHIPPED (2026-07-13, same day). Gates: M1 projection 0.102in held-out; M2 touch/point-at/
press 0.013-0.066in (EMPIRICAL clip timelines replaced the freeze model — fill=hold does NOT hold am3d scene
time); M3 push 0.0°/30ms + carry endpoint 0.17in + knock-over on plan; M4 spec surface slides[].interactions
live through generate_from_spec with the solved plan in appliedDefaults.presenter.interactions.
Remaining: worker bake-time timeline manifests; carry easing pre-warp (accel hardcoded in core builder);
multi-beat chaining. Empirical record: research-demos/2026-07-13-synergy-calibration/README.md.
Depends on: `ir/choreography-engine.mjs`, `ir/presenter-director.mjs`, `ir/kinetic-transplant.mjs`.

Goal: slide-content-aware dynamics. The 3D presenter TOUCHES / PUSHES / CARRIES / POINTS-AT
actual slide objects, with every contact computed geometrically (never visually guessed),
compiled into native OOXML animations so PowerPoint plays the illusion perfectly.

---

## 0. The physics of the medium (measured constraints — hard, do not soften)

| # | Constraint | Consequence for this engine |
|---|---|---|
| C1 | PowerPoint has **NO runtime scripting, IK, or physics**. | Every interaction is PRE-CALCULATED at authoring time and compiled to native animation timelines: `playScene`, `animMotion` motion paths (incl. custom `motionPathData`), entrance/exit/emphasis, `withPrevious`/`afterPrevious`/`delay`. There is no fallback. |
| C2 | **One 3D-scene clip per model INSTANCE (spid)**; a slide may stage MANY instances, each independently cued; the embedded GLB dedupes (COM-proven, multi-model-deck 2026-07-13). | Multi-verb sequences on one slide = multiple instances of the same actor (the `expandCastDirective` gesture-chaining pattern: unique `objectName` per beat, `morphName` only on the first). |
| C3 | **18-clip ceiling per model** (`embedded1..18`, animId 0..17; measured 2026-07-10). Enforced today as `CLIP_CEILING` in `choreography-engine.mjs`. | Interaction verbs consume slots from the same ≤18 transplanted clip set. The solver never mints a clip; it selects. |
| C4 | **am3d viewport law**: `objViewport` `viewportSz` — LARGER = more zoomed IN. Rest-pose fill calibration = `frameHeightInches * 1600000`; action clips need a `/2.2` margin (measured; see `viewportMargin` in `resolvePresenter`). | The model→slide projection is a function of `(frameBbox, objViewport)`. Zoom changes inches-per-model-unit, so contact math MUST carry the viewport. |
| C5 | **Full FK capability offline**: the GLB carries skeleton + clips; joint world trajectories are computable in pure JS (quaternion math already in `kinetic-transplant.mjs`: `quatMul`/`quatConj`/`quatNorm`, accessor decode in `readAccessorFloats`). | We know, to the millisecond and the model-unit, where every joint is during every clip — before PowerPoint ever opens the deck. |
| C6 | Baked performers face **+Z** (away from camera); default `faceRotationY: 180` (camera `rotateY`) turns them to front (COM-verified, `resolvePresenter`). | The projection model includes the yaw: at 180°, model +X maps to slide −X. |
| C7 | Engine wire keys are `duration`/`delay` (ms), NOT `*Ms` (engine.mjs ~15269 ignores `*Ms` → 500ms default). Custom paths are slide-fraction `motionPathData` strings (`"M 0 0 L 0.25 0 E"`, verified from rendered OOXML). | All synthesized cues go through `compile()`-style emission; S2's sampled paths serialize to multi-`L` `motionPathData`. |

The key insight that makes this possible under C1: **INVERSE PLACEMENT instead of IK**.
PowerPoint cannot bend joints at runtime, but we can solve where to PLACE the presenter frame
and WHEN, so the baked gesture's effector lands exactly on the target:

```
framePos = targetPoint − projectedEffectorOffset(clip, contactFrame)
```

Add travel (a motion path) to arrive at `framePos` before the gesture fires. Exact contact,
zero runtime computation.

---

## 1. Architecture

```
spec: slides[].interactions            (authoring surface, §7)
        │
        ▼
S3 Timeline Compiler ── lowers to scene beats (expandCastDirective) + target cues
        │            ╲
        ▼             ╲ validated by
S1 Interaction Solver   extended choreography-engine (validate/predict/compile)
        │
        ▼
S0 Geometry Kernel ── FK sampler + am3d projection + object registry
        │
        ▼
S2 Effect Synthesizer ── contact-geometry-derived native effects on targets
        │
        ▼
S4 Verification ── interactionPlan JSON (AI-visible calc) + COM probe harness (CI spot-check)
```

New files (all in the private repo, `ir/` unless noted):

| File | Layer | Contents |
|---|---|---|
| `ir/synergy-geometry.mjs` | S0 | `fkJointTrajectories`, `modelToSlide`, `projectedEffectorOffset`, `buildObjectRegistry`, `fitProjectionCalibration` |
| `ir/synergy-solver.mjs` | S1 | `VERBS`, `contactFrame`, `solvePlacement`, `reachabilityCheck` |
| `ir/synergy-effects.mjs` | S2 | `synthesizeEffect`, `sampleCarryPath`, `throwPath` |
| `ir/synergy-compiler.mjs` | S3 | `expandInteractions`, `planInteractions`, validation extensions |
| `research-demos/<date>-synergy-calibration/` | S4 | probe deck builder, COM render, pixel-measure, error report |

Prereq change: export `readAccessorFloats` from `ir/kinetic-transplant.mjs` (currently
module-private; S0 reuses it verbatim — no reimplementation).

---

## 2. Layer S0 — Geometry Kernel (`ir/synergy-geometry.mjs`)

### 2.1 FK sampler

Port of the proven Python `fk_check` (bake-side). Pure JS, no I/O, unit-testable like
`choreography-engine.mjs`.

```js
/**
 * fkJointTrajectories(glbBuf, animId, hz = 30) → ClipTrajectory
 * ClipTrajectory = {
 *   animId, slug, durationMs, hz,
 *   times: Float64Array,                     // sample times, seconds
 *   joints: {                                // world-space, MODEL units, Y-up
 *     [boneName]: {                          // e.g. 'mixamorig:RightHand'
 *       pos: Float32Array,                   // n*3 packed [x,y,z]
 *       vel: Float32Array,                   // n*3 finite-difference velocity (units/s)
 *     }
 *   },
 *   rootBone: 'mixamorig:Hips',
 *   restHeight: number,                      // rest-pose bbox height, model units (viewport anchor)
 * }
 */
```

Algorithm (all pieces exist in `kinetic-transplant.mjs`):
1. `parseGlb(buf)` → `{ json, bin }`.
2. Build the node hierarchy (parent index per node) from `json.nodes[].children`.
3. For each sample time `t`: per animated channel, interpolate the sampler
   (`LINEAR` slerp for rotations / lerp for translation+scale; `STEP` hold;
   `CUBICSPLINE` → reject with `UNSUPPORTED_INTERP` — the Baker emits LINEAR).
   Accessor decode = `readAccessorFloats`.
4. Compose local TRS per node (animated value, else the node's static `rotation`/
   `translation`/`scale`; note the Baker flattens node scale into vertices —
   commit 182050e11 — so scale ≈ 1).
5. Walk root→leaf multiplying 4×4s; joint world position = translation column.
6. Quaternion ops: `quatMul`/`quatNorm` (import once exported) + a local quat→mat3.

Determinism: same GLB + animId + hz → bit-identical output. Cache per
`(glbSha, animId, hz)` in the compile pass (the transplanted GLB is built in-process by
`transplantKinetic`, so the sha is known at deck-compile time).

### 2.2 am3d projection model

```js
/**
 * modelToSlide(pModel /*[x,y,z] model units*/, ctx) → { xIn, yIn, zDepth }
 * ctx = { frameBbox: {x,y,w,h},      // inches (the model3d block bbox)
 *         objViewport: number,       // EMU viewportSz (as emitted by the director)
 *         faceRotationY: 0|180|deg,  // camera yaw (default 180)
 *         calib: Calibration }       // fitted constants, §2.3
 */
```

First-order model (to be FIT, not assumed):

```
s      = (objViewport / 1600000) / U0 * kS        // inches per model unit
                                                   // U0 = model rest height that fills the
                                                   //      frame at rest-fit calibration (≈1.8u
                                                   //      post-Baker-flatten); kS ≈ 1 fitted
p'     = yaw(pModel, faceRotationY)                // 180° ⇒ x' = −x, z' = −z
xIn    = frameCx + kX + p'.x * s  (+ kPz * p'.z * p'.x * s)   // kPz = perspective term, 0 if ortho
yIn    = frameBottom − kY − p'.y * s (+ kPz * p'.z * p'.y * s) // slide Y grows DOWN; model Y grows UP
```

`Calibration = { kS, kX, kY, kPz, U0, fitRmsIn, fittedAt, ppBuild }` — persisted JSON next to
the harness. Whether the am3d camera is orthographic (kPz ≈ 0) or perspective is UNKNOWN
until measured; the harness answers it (markers at differing Z, §2.3). If depth-dependence
exceeds budget, `kPz` goes live and `solvePlacement` iterates (§3.3).

`projectedEffectorOffset(clipTraj, effector, tMs, ctx)` = `modelToSlide(joint(tMs)) −
modelToSlide(rootAnchor)` where `rootAnchor` is the frame's placement anchor (bottom-center
of the rest bbox). This offset is translation-invariant iff the projection is affine in
frame position — the calibration harness verifies exactly that (same marker, three frame
positions).

### 2.3 Calibration loop (MANDATORY — no constant ships un-fit)

The model MUST be calibrated empirically. Probe harness (research-demos pattern, COM oracle):

1. **Probe GLB**: take the kinetic base character, inject small emissive marker spheres at
   known bone world positions for a chosen frame (buffer surgery via
   `parseGlb`/`serializeGlb` — same technique as `transplantKinetic`), distinct saturated
   colors per joint (Head, Hips, L/R Hand, L/R Foot), plus 2 markers offset ±0.3u in Z to
   measure perspective.
2. **Probe deck**: build via the normal engine path (model3d block, `bbox`, `objViewport`,
   `camera:{rotateY:180}`) — a grid of conditions: 3 frame heights (2.5 / 4.6 / 6.8 in) ×
   2 viewportMargins (1, 2.2) × 3 frame positions (left / center / right).
3. **Predicted crosshairs**: for each condition, render 0.12in crosshair autoshapes at
   `modelToSlide(markerPos)` predictions.
4. **COM render** each slide to PNG (1280×720 ⇒ 96 px/in); detect marker centroids by color
   threshold; error = |marker − crosshair| in inches.
5. **Fit**: least-squares over `{kS,kX,kY,kPz}` on half the grid, report residuals on the
   held-out half.

**Error budget (total contact error ≤ 0.15 in)**

| Source | Budget |
|---|---|
| FK sampling (hz=30, linear interp) | ≤ 0.01 in |
| Projection model residual after fit (held-out) | ≤ 0.08 in |
| Placement rounding (`round2` = 0.005 in) | ≤ 0.01 in |
| PP render/raster nondeterminism | ≤ 0.05 in |

If the held-out residual exceeds 0.08 in, the model gains terms (perspective, per-axis kS)
and the loop reruns. Calibration is re-validated whenever the PP build changes
(`ppBuild` recorded; CI spot-check §6).

### 2.4 Slide object registry

Every content object's bbox is already authored in the spec (the same bboxes
`choreography-engine.validate` reasons over). Registry adds salience:

```js
/** buildObjectRegistry(slideSpec) → SlideObject[]
 *  SlideObject = { name, kind, bbox:{x,y,w,h}, salience:number, authorAnimated:boolean } */
```

Salience = index in `PAIR_TARGET_KINDS` (`presenter-director.mjs`: chart > metric > kpi >
image > … > quote), reused so the solver's default-target choice matches `pickPairTarget`.
`authorAnimated` guards the "respect authoring" rule: never re-animate an object the author
already cued.

---

## 3. Layer S1 — Interaction Solver (`ir/synergy-solver.mjs`)

### 3.1 Verb table

| Verb | Effector (default) | Approach direction | Contact-pose rule (from FK) | Notes |
|---|---|---|---|---|
| `touch` | RightHand | facing target | max reach toward target dir | gentlest; any gesture clip qualifies |
| `press` | RightHand | front/above | max reach + lowest effector speed (dwell) | sustained contact reads as pressing |
| `push` | RightHand (or both) | opposite the exit vector | peak effector SPEED within reach window | impulse verb |
| `pull` | RightHand | in front of target | grab frame (max reach) → retract frame | two contact instants |
| `point-at` | RightHand | line-of-sight, ≥1.0 in standoff | max arm extension toward target dir | contact = aim, standoff enforced |
| `kick` | RightFoot | side | peak foot speed | impulse verb |
| `carry` | both hands (midpoint) | at target | pickup contact → drop contact | target rides the effector path (§4) |
| `throw` | RightHand | — | release frame = peak hand speed after max reach | seeds ballistic path (§4) |
| `reveal` | either hand | beside target | clip apex (`computeContacts` fallback) | pairs with entrance |
| `knock-over` | hand or foot | side | impact frame (peak speed) | teeter → exit (§4) |

Effector joints are mixamorig names (the transplant guarantees them:
`transplantKinetic` copies channels by bone name). `hand:'left'` mirrors the effector.

### 3.2 Contact pose

```js
/** contactFrame(clipTraj, effector, targetDirModel, mode:'reach'|'impulse'|'dwell')
 *    → { tMs, effectorPos, effectorVel, reachIn } */
```

`reach` = argmax over samples of `dot(effectorPos − hipsPos, targetDirModel)`;
`impulse` = argmax |vel| restricted to the top-quartile reach window;
`dwell` = min |vel| within the top-quartile reach window.
Fallback when a clip has no distinct reach direction: the `computeContacts` apex
(peak rotational deviation — already computed for every transplanted clip and fed to the
director as `contactMap`). The verb→clip candidate set extends
`DEFAULT_KINETIC_INTENTS` with a verb→slug map (e.g. `push:'ground_pound'`,
`kick:'heavy_kick'`, `throw:'skyward_launch'`, `carry:'atlas_lift'`), resolved through
`deriveIntentClipMap` so it composes with the deck's chosen ≤18 slugs.

### 3.3 Inverse placement

```js
/** solvePlacement(req) → Solution
 *  req = { verb, actorP,                    // resolved presenter (resolvePresenter output)
 *          clipTraj, contact,               // from §3.2
 *          targetPoint:{x,y},               // slide inches (target bbox edge/center per verb)
 *          frame:{w,h}, objViewport, faceRotationY,
 *          stageZone,                       // presenterZoneFor(actorP.stage)
 *          priorPos:{x,y}|null }            // actor's position from the previous beat
 *  Solution = { framePos:{x,y}, contactMs, effectorSlide:{x,y}, residualIn,
 *               travel: { waypoints:[{dxIn,dyIn}], durationMs } | null,
 *               verdicts: [{code, msg}] }
 */
```

Core: `framePos = targetPoint − projectedEffectorOffset(clipTraj, effector, contact.tMs, ctx)`.
If calibration proved the projection affine (`kPz`≈0) this is one subtraction; else 2–3
fixed-point iterations (offset recomputed at the new framePos) — converges because the
perspective term is small by construction.

Then clamp and search:
1. Clamp `framePos` on-slide (the `onSlide` rule from `choreography-engine.mjs`) and inside
   `stageZone` when one exists.
2. If clamping moved the frame, contact is broken → search the candidate lattice:
   {candidate clips for the verb} × {top-k reach frames per clip} × {hand mirror} for the
   combo minimizing `residualIn` under the clamps. This is the **reachable annulus** check:
   the effector offset per (clip, frame) is a fixed vector, so reachability = "does
   targetPoint − offset land in the legal placement region".
3. Travel synthesis: if `framePos ≠ priorPos`, emit waypoint travel
   (`{dxIn,dyIn}` — the exact-inch path of `motionVector`/`pathProps`) sized by
   `contentSafeTravel` semantics, timed to ARRIVE before the gesture beat fires.

### 3.4 Reachability verdicts (choreography-engine-style codes)

| Code | Class | Fired when |
|---|---|---|
| `UNREACHABLE` | warning | no (clip, framePos) combo puts the effector within 0.5 in of the target under clamps; solution = nearest achievable + this warning |
| `CONTACT_OFF_TARGET` | warning | best `residualIn` ∈ (0.15, 0.5] in — playable but visibly imperfect |
| `OCCLUDES_CONTENT` | warning | the presenter frame at `framePos` overlaps a salient registry bbox (other than the target) during the beat window (`bboxOverlap` + timeline overlap, as in `validate` check 6) |
| `TARGET_NOT_AT_PICKUP` | error | `carry`: target bbox center ≠ pickup contact point beyond budget (the illusion breaks at frame one) |
| `PATH_POINTS_EXCESS` | error | synthesized `motionPathData` > 24 `L` points (keep OOXML lean; resample) |
| `UNSUPPORTED_INTERP` | error | clip uses CUBICSPLINE samplers (S0 rejects) |

These join the existing `validate()` codes (`CLIP_CEILING`, `MULTI_3D_CLIP`, `OFFSLIDE`,
`CONTENT_ZONE`, `CONTACT_SYNC`, `COLLIDE`, …) — same `{ ok, errors, warnings }` shape.

---

## 4. Layer S2 — Effect Synthesizer (`ir/synergy-effects.mjs`)

Contact geometry DERIVES the native effect — direction computed, never canned. All cues are
emitted in engine wire format (C7): `{ type, effect?, trigger, delay, duration,
motionPathData? }`, slide-fraction paths relative to the target's start position (exactly
`pathProps`' format).

| Verb | Target effect synthesized |
|---|---|
| `push` | `type:'motion'`, `motionPathData: "M 0 0 L dx dy E"` where `(dx,dy)` = unit contact vector (effector velocity direction at contact, projected to slide) × fly distance; `duration` ∝ 1/|impulse|; fires `withPrevious`, `delay = contactMs`. |
| `press` | `type:'emphasis'`, `effect:'growShrink'` (shrink) or `'teeter'`, at `contactMs` — passes the `VALID_EMPHASIS` guard. |
| `pull` | `type:'motion'`, path toward the actor (reverse contact vector), `delay = retractMs`. |
| `carry` | `type:'motion'` with a CUSTOM path equal to the projected effector trajectory between pickup and drop: `sampleCarryPath(clipTraj, effector, pickupMs, dropMs, ctx, maxPts=24)` → `"M 0 0 L f1x f1y … E"` (slide fractions, resampled ≤24 pts). `duration = dropMs − pickupMs` EXACTLY; target start must equal the pickup point (`TARGET_NOT_AT_PICKUP`). **The motionPathData points are sampled from FK** — the object visibly rides the hand. |
| `throw` | `type:'motion'`, parabolic custom path seeded by effector velocity at release: `x(t)=vx·t`, `y(t)=vy·t + ½g·t²` with a tuned visual `g` (constant, in/s², fitted once for plausibility), sampled ≤24 pts; optional `exit` afterPrevious when `to:'offslide-*'`. |
| `knock-over` | `type:'emphasis' effect:'teeter'` at contact, then `type:'exit' effect:'fly'`, direction = contact-vector quadrant mapped to PP's 8 fly directions, `afterPrevious`. |
| `point-at` / `reveal` / `touch` | upgraded `CONTENT_PAIRING` (presenter-director): same effect vocabulary (`fly`/`zoom`/`pulse`…) but `direction` computed from which side the hand approaches, and `delay` = the SOLVED `contactMs` (exact, replacing `pairingDelayMs`' heuristic + `PAIR_DELAY_CAP_MS` cap — interactions are calculated, not capped). |

Every synthesized effect must pass the extended `choreoValidate` category guards
(`EFFECT_CATEGORY`, `BAD_MOTION_PATH`) before emission — the same fail-before-compile
doctrine as `compile()`/`author()`.

---

## 5. Layer S3 — Timeline Compiler (`ir/synergy-compiler.mjs`)

`expandInteractions(spec, options)` is a spec pre-process pass, sibling to and running
BEFORE `expandCastDirective` (it LOWERS `slides[].interactions` into `slides[].scene` beats
plus target-object animations, then the existing cast machinery does what it already does):

1. Resolve actors via `resolveCast` / `resolvePresenter` (same `options.castAssets` maps:
   `clipMap`, `contactMap`, `clipDurations`).
2. Per interaction: S0 trajectories → S1 solution → S2 effect.
3. Emit, in order: optional TRAVEL beat (motion path on the actor's instance, arriving
   before the gesture — `afterPrevious` chaining or computed `delay`), the GESTURE beat
   `{ actor, animId, at, delayMs, bbox: frame at framePos }`, and the target cue(s)
   attached to the target content item (clone-don't-mutate, exactly like the
   `pairContent` block in `expandPresenterDirective`).
4. C2 compliance: each beat is its own model3d instance (`castBeatBlock` naming: repeat
   instances `actorId_k`, `morphName` only on the first) — so `MULTI_3D_CLIP` never fires
   per instance and each clip is independently cued.
5. Budgets: every `animId` < `CLIP_CEILING`; every `playScene` `duration` = the clip's
   measured length (`clipDurations` / `computeContacts().durationMs`) — never the 2000ms
   fallback; every paired effect `delay` = the solved `contactMs`.
6. Validation: run the extended `choreoValidate` per slide (existing checks + §3.4 codes);
   `ok:false` blocks compile, warnings ship in the plan.

`planInteractions(spec, options)` — the no-mutation twin (the `planPresenterGestures`
pattern): pure function of the raw spec, same solver, so report and injection can never
drift.

---

## 6. Layer S4 — Verification harness + AI surface

### 6.1 interactionPlan JSON (the AI SEES the calculation)

Emitted into `appliedDefaults` (alongside `planPresenterGestures`' report):

```json
{ "slide": 3, "beats": [ {
    "actor": "rex", "verb": "push", "clip": "ground_pound", "animId": 4,
    "framePos": { "x": 6.10, "y": 3.02 }, "contactMs": 1470,
    "contactPoint": { "x": 8.21, "y": 4.05 }, "residualIn": 0.04,
    "targetName": "kpiCard", "targetBbox": { "x": 8.0, "y": 3.6, "w": 2.4, "h": 1.4 },
    "effect": { "type": "motion", "motionPathData": "M 0 0 L 0.18 -0.04 E",
                "delay": 1470, "duration": 600, "directionDeg": -12.5 },
    "travel": { "waypoints": [{ "dxIn": 2.3, "dyIn": 0 }], "durationMs": 1400 },
    "verdicts": { "ok": true, "warnings": [], "errors": [] }
} ] }
```

Every number is the calculation the compiler used — the authoring AI can inspect, adjust
(`at`, `hand`, `to`, target), and re-plan deterministically, per the intelligence-is-teamwork
doctrine (heuristics are proposals; the AI confirms).

### 6.2 COM probe harness (CI spot-check)

The §2.3 calibration harness, rerun in spot-check mode: N sampled beats from a fixture deck
→ marker-GLB render → measured contact error vs `residualIn` + budget. Artifacts land in
`research-demos/<date>-synergy-*/` (owner directive: keep demo artifacts, README per folder).
Runs on demand + whenever the PP build or the projection calibration changes; it is the
ground-truth oracle, NOT a per-iteration crutch (the choreography-engine doctrine).

---

## 7. Spec surface

```jsonc
"slides": [ {
  "interactions": [
    { "actor": "rex",             // cast id (spec.presenters.cast) or the single presenter
      "verb": "push",             // §3.1 table
      "target": "kpiCard",        // content objectName — or {x,y} slide inches
      "at": "afterPrevious",      // 'withPrevious' | 'afterPrevious' | ms (beat.at semantics)
      "hand": "right",            // optional effector mirror
      "to": { "x": 11.5, "y": 2 } // carry/throw/push destination; or 'offslide-right'
    } ]
} ]
```

Composition: interactions ARE scene beats that bind to a target object — they lower into
`slides[].scene` and compose freely with authored scene beats (same actor ids, same
`at`/`delayMs` timing model, same Morph-per-actor threading across slides).
No `interactions` → nothing changes (idempotent, fail-safe, like every director pass).

---

## 8. Build plan — 4 milestones, calibration FIRST (it de-risks everything)

| M | Scope | Deliverables | COM-verified exit gate |
|---|---|---|---|
| **M1** | S0 kernel + calibration | `ir/synergy-geometry.mjs` (`fkJointTrajectories`, `modelToSlide`, `projectedEffectorOffset`, `buildObjectRegistry`, `fitProjectionCalibration`); export `readAccessorFloats` from `kinetic-transplant.mjs`; probe-GLB marker injector; probe deck + pixel-measure harness; fitted `Calibration` JSON + error report | Held-out projection residual ≤ 0.08 in; TOTAL predicted-vs-rendered marker error ≤ 0.15 in median across 3 frame heights × 2 viewportMargins × 3 positions × ≥3 joints; ortho-vs-perspective question ANSWERED with numbers |
| **M2** | touch / point-at / press, ONE actor | `ir/synergy-solver.mjs` (`contactFrame`, `solvePlacement`, verdicts); `CONTENT_PAIRING` upgrade to solved `contactMs` + computed `direction`; minimal `expandInteractions` for these verbs | COM stills: hand ON 3 different targets (chart, kpi, image) within 0.15 in; synthetic UNREACHABLE / OCCLUDES_CONTENT fixtures fire their codes; `planInteractions` numbers match the render |
| **M3** | push / carry / knock-over | `ir/synergy-effects.mjs` (`synthesizeEffect`, `sampleCarryPath`, `throwPath`); FK-sampled custom `motionPathData`; travel-then-gesture chaining | COM video (CreateVideo): carried object tracks the hand ≤ 0.2 in over the whole path; push direction matches contact vector ±15°; knock-over teeter→exit reads as caused (contact-sync ≤ 120 ms, the `CONTACT_SYNC` tolerance) |
| **M4** | Cast integration + AI surface + docs | Full `expandInteractions` ahead of `expandCastDirective`; interactionPlan in `appliedDefaults`; CI spot-check wiring; gallery demo deck; this doc updated to STATUS: SHIPPED | End-to-end demo through the normal tool path (spec → deck → video), multi-actor, ≥4 verbs on one deck; plan JSON archived with the render in research-demos; zero validation errors, warnings triaged |

Milestone ordering rationale: every layer above S0 consumes the projection; if the am3d
camera model needs a perspective term, that is a DATA question only M1 can answer, and it
changes `solvePlacement`'s inner loop. Nothing in M2–M4 is speculative once M1's numbers
are in.

## 9. Non-goals / explicit exclusions

- No runtime anything (C1). No claim of physics: `throw`'s parabola and `push`'s impulse are
  authored plausibility, computed from real FK velocities but played as fixed paths.
- No new clips: verbs select from the transplanted ≤18 set (`transplantKinetic` +
  `deriveIntentClipMap`); minting purpose-built interaction clips (a real "reach at chest
  height" family) is a separate Baker work item, deliberately out of scope here.
- No 3D-on-3D interaction (actor pushes actor) in v1 — targets are 2D slide objects with
  bboxes in the registry. The math generalizes; the validation story does not, yet.
- No facial/blendshape anything (PP plays skeletal-only — established constraint).
