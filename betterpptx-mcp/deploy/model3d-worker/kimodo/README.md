# BetterPPTX Kimodo authoring-v3 motion lab

This private Modal app generates precise alternatives for all 18 frozen
presenter-interaction slots. It reuses the established `betterxavatar`
(primary) and `betterpptx` (secondary) profiles, their Hugging Face secret, the existing budget
rotator, the canonical skeleton, Blender retargeting helpers, and the private
Modal workflow. It does not expose a public endpoint.

## What it does

1. Resolves the official Kimodo code, `Kimodo-SOMA-RP-v1.1`, and both LLM2Vec
   encoder assets at immutable revisions.
2. Generates several deterministic candidates for a slot.
3. Measures contact stability, requested hand/height, rest return, loop seam,
   foot skate, travel, turn, head motion, and role-specific energy.
4. Refines the best candidate with constraints derived from its own valid
   Kimodo pose. Contact frames repeat one selected pose, so no fabricated or
   malformed end-effector JSON enters the model.
5. Stores every BVH and report in a private `betterpptx-kimodo-motion-store`
   Volume. A candidate is never automatically promoted.
6. Retargets a complete passing 18-slot run to the canonical Mixamo-named rig
   as an oracle-review candidate GLB.

Existing Mixamo and kinetic clips stay available as benchmarks. The profile's
`improve-all` strategy means Kimodo competes for every slot, including the
seven ordinary and two adjacent local review candidates. Replacement is
allowed only after the Kimodo result scores better and passes retarget,
PowerPoint timeline, G5 distribution, and owner release gates.

## Local contract check (no GPU cost)

```powershell
npm run verify:kimodo-authoring-v3
```

## Bounded GPU canary

The wrapper selects the first budget-eligible production-target profile and
forces dev scale-to-zero. This example exercises the precise press slot with
one candidate and 20 diffusion steps:

```powershell
.\betterpptx-mcp\deploy\model3d-worker\run-kimodo-authoring-v3.ps1 `
  -Action generate -Mode canary -Slots press_tap -RunId press-canary-001
```

Generate the full quality pool only after the canary succeeds:

```powershell
.\betterpptx-mcp\deploy\model3d-worker\run-kimodo-authoring-v3.ps1 `
  -Action generate -Mode quality -RunId authoring-v3-quality-001
```

Retargeting fails closed unless all 18 selected candidates passed the
kinematic gates:

```powershell
.\betterpptx-mcp\deploy\model3d-worker\run-kimodo-authoring-v3.ps1 `
  -Action bake -RunId authoring-v3-quality-001
```

Download the selected BVHs, reports, and candidate GLB for PowerPoint-oracle
work without browser or Computer Use automation:

```powershell
.\betterpptx-mcp\deploy\model3d-worker\run-kimodo-authoring-v3.ps1 `
  -Action download -RunId authoring-v3-quality-001 -SelectedOnly
```

The default destination is the gitignored
`mocap/authoring-v3/kimodo-runs/<run-id>.zip` path.

Every helper action begins with a read-only Modal inventory. It verifies the
established `betterpptx-model3d` app, `betterpptx-clip-library`, and
`huggingface-token`, then lists the current Kimodo cache and motion-store roots.
Use `-Action inspect` to run only that preflight. A missing established object
is a hard stop; the helper never guesses or silently creates a replacement.

Kimodo's LLM2Vec adapters require the gated official
`meta-llama/Meta-Llama-3-8B-Instruct` base. The cache preflight checks that
access before downloading weights or starting a GPU generator. An unauthorized
profile returns `BLOCKED_GATED_TEXT_ENCODER`; unofficial mirrors are forbidden.
The read-only `hf_access_probe.py::probe` entrypoint can verify a profile's
existing `huggingface-token` without creating a Volume or downloading weights.

## Promotion boundary

`KINEMATIC_GATE_PASSED_REVIEW_REQUIRED` is not shippable status. This app can
create `authoring-interaction-clips-v3-candidate.glb`, but it deliberately has
no operation that writes `authoring-interaction-clips-v3.glb` to the production
clip-library Volume. Promotion remains blocked until:

- the canonical retarget has exactly 18 ordered actions and no raw SOMA action;
- PowerPoint renders and measures the complete 18-slot empirical timeline;
- the Kimodo code/model/output distribution basis has a G5 record;
- the owner explicitly approves replacement of the selected baseline clips.

## Pinned sources and licensing

- Kimodo code: Apache-2.0 at commit
  `1aece8c124d73d255ceff5086d983b844c9f4e94`.
- Kimodo-SOMA-RP-v1.1: NVIDIA Open Model License at snapshot
  `6c9233af1180b8151e3c4703477104af5dce9dd5`.
- The two LLM2Vec repositories are also snapshot-pinned in `kimodo_app.py`.
- Meta Llama 3 8B Instruct is pinned at
  `8afb486c1db24fe5011ec46dfbe5b5dccdb575c2` and remains subject to the Meta
  Llama 3 Community License and Hugging Face owner-access approval.

Those facts allow controlled evaluation; they do not replace the repository's
G5 asset/distribution ledger or release approval.
