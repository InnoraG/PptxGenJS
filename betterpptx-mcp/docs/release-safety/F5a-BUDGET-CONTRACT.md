# F5a — Performance / Artifact Budget Contract (APPROVED)

Status: **APPROVED BY OWNER 2026-07-14** ("I approve F5a thresholds" — chat, 2026-07-14). Every §2-§4
threshold below is now BINDING at the stated warning/degrade/refuse semantics; changes require a new
owner approval recorded here. Remaining open items from §6: the official L40S $/GPU-second basis and
the oversized-user-media posture are still owner decisions pending. Enforcement semantics: **warning**
(compile proceeds, storyboard notes the overrun), **degradation** (compiler substitutes the declared
cheaper form and says so), **refusal** (actionable `{code,severity,reason,fix,evidence}`), and the
**fail-closed spend preflight** for cloud work.

## 1. Binding, already-owner-decided constraints (NOT proposals)

| Constraint | Value | Source |
|---|---|---|
| Modal spend cap | **≤ $30/month/profile** (~$29.50 working ceiling), fail-closed preflight | owner hard rule; `deploy/model3d-worker/check_budget.py` |
| Texture caps | 512/512, JPEG q82 | owner-final 2026-07-12 ("size beats fidelity when the eye can't tell") |
| Materials | matte (anti-glassy) | owner-final |
| Clip library | ≤ 18 clips per model | measured PP ceiling (L6) |

## 2. Proposed artifact budgets (per deck, windows-desktop profile)

| Metric | Warning | Degrade | Refuse | Basis |
|---|---|---|---|---|
| Single presenter/actor GLB (ppt-lite, slimmed) | > 12 MB | — | > 24 MB | kinetic-joe-fixed = 11.3 MB (18 clips, 512 slim); joe-slim base = 8.9 MB |
| Total 3D bytes per deck (all actors, deduped) | > 30 MB | drop poster→static for over-budget actors | > 60 MB | GLB dedupes per deck (one part per model); 2-3 actor scenes ≈ 12-34 MB |
| Saved .pptx total | > 60 MB | re-slim / drop non-critical media | > 150 MB | full-synergy demo deck ≈ 5 MB + media; email/share ergonomics |
| Poster PNG per actor | > 500 KB | re-encode q80 | > 2 MB | joe_front_alpha 640×640 = 304 KB |
| Narration audio per slide (WAV→embedded) | > 2 MB | resample 22.05 kHz mono | > 8 MB | Piper 22.05 kHz output; text-is-master dwell |

## 3. Proposed latency budgets (local engine, warm process)

| Operation | Warning | Refuse/investigate | Basis |
|---|---|---|---|
| generate_from_spec commit (no narration, ≤10 slides, 1 presenter) | > 20 s | > 60 s | current demos ≈ 3-8 s |
| Kinetic transplant (in-process, 18 clips) | > 2 s | > 10 s | measured 114-400 ms |
| deck.save | > 15 s | > 60 s | current ≈ 1-4 s incl. sidecar |
| Narration per clip (Piper CPU) | > 40 s | > 120 s | measured ≈ 26 s/clip; BETTERPPTX_TOOL_TIMEOUT_MS raised for narrated decks |
| Rigged-3D generation E2E (worker warm) | > 6 min | poll deadline 20 min (existing `pollDeadlineMs`) | worker spawn+poll design |

## 4. Proposed cloud-cost budgets (measured USD, no multiplier — costing doctrine)

| Item | Proposal | Basis |
|---|---|---|
| Per rigged-3D generation (L40S GPU s) | warn > 240 GPU-s, refuse > 600 GPU-s per request | typical gen+rig run; owner to confirm against `modal billing report` actuals |
| Per image generation | warn if > $0.01 estimated | Flux schnell sub-cent/image basis |
| Per-profile monthly | **fail-closed at $29.50** (existing check_budget.py wired into dev wrappers) | owner cap |
| Avatar (A10G) | $0.018/cold + $0.0014/audio-s attribution basis | measured cost memory |

## 5. Enforcement wiring (where each check lives / must land)

- Spend preflight: `check_budget.py` (exists, fail-closed, dev wrappers) → ALSO wire into any owner-only
  F2 onboarding workflow before worker calls. Native Modal dashboard limits set per deployed app.
- Artifact budgets: compile-time in the spec compiler after asset materialization (bytes are known
  there); emit `BUDGET_WARNING` / `BUDGET_DEGRADED` / `BUDGET_REFUSED` decisions in the storyboard.
- Latency budgets: measured by A3 regression runs (not runtime-enforced; a slow run fails the gate,
  not the user's deck).
- All budgets are per **execution profile**; non-wide/static profiles inherit the byte budgets and
  drop the 3D-latency rows.

## 6. Open items for the owner

1. Approve/adjust every §2-§4 number (they become binding on approval; F5a gate = one pilot actor
   passes with every overrun producing the declared outcome).
2. Set the official L40S $/GPU-second basis for the cost model (metrology memory: owner action).
3. Decide the warn-vs-refuse posture for oversized user-supplied media (we can degrade ours, not theirs).

measuredAt: 2026-07-14 · draft author: engineering session · git HEAD at draft time: 7889373de
