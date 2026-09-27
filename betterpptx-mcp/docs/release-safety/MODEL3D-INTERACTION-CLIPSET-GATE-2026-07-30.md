# Native 3D interaction production gate — 2026-07-30

## Implemented

- Public `slides[].interactions` schema and capability contract with the six supported verbs: `touch`, `point-at`, `press`, `push`, `knock-over`, and `carry`.
- Stable same-slide `objectName`/`name` target rule.
- Compiler-generated `_synergyPlan` is mandatory for interaction-heavy slides; failed/unsolved beats are rejected.
- Hand-authored multi-`playScene` choreography is rejected by the Authoring Excellence validator.
- Production Baker accepts a rendered PowerPoint oracle profile, validates it, attaches `manifest.clipTimelines`, computes a digest, and persists it with the durable GLB asset.
- Meshy/Modal adapters can read the owner-only timeline profile from deployment configuration; it is never an AI/public authoring field.
- Dedicated `authoring-v3` bake entry point and read-only readiness gate are present.

## Current gate result

`node betterpptx-mcp/verify-authoring-clipset-v3.mjs` is **BLOCKED**. All 18 rows in `deploy/model3d-worker/canonical/authoring-clipmap-v3.json` are still `TO_SOURCE`, and no final Baker manifest with 18 oracle-measured timelines is available. This is an intentional fail-closed result, not a silent fallback to the ordinary gesture library.

## Re-audit — 2026-08-01

The dedicated gate was rerun against the current tree and remains **BLOCKED** with the same 18/18 `TO_SOURCE` rows, no `--manifest` input, and no `manifest.clipTimelines.timelines` payload. The expected source staging location is not present on this workstation, and no `authoring-interaction-clips-v3.glb` or final oracle manifest has appeared. The tracked `kinetic-clips.glb` pool and the frozen 18-gesture PowerPoint library are ordinary gesture/provenance evidence, not proof of the contact-precise v3 contract; neither is promoted by this audit.

The read-only source availability audit (`verify-authoring-v3-source-availability.mjs`) now records the distinction explicitly: **7/18** v3 slots have only an ordinary-gesture candidate in the existing `mocap/` pack, while **11/18** have no conservative ordinary candidate match. The separate `mocap/kinetic/` 60-move pool is reported only as a non-v3 pool and cannot satisfy a v3 source row. The report sets `dedicatedAuthoringV3Ready:false` and `eligibleForPromotion:false`.

## Promotion sequence

1. Stage the licensed Mixamo FBX takes and set each v3 source row to `SOURCED`.
2. Run `modal run deploy/model3d-worker/model3d_app.py::bake_authoring_clip_library`; verify the private Volume contains `authoring-interaction-clips-v3.glb`.
3. Render/measure each final clip in the PowerPoint calibration probe and provide the resulting `{probe,timelines}` profile through the owner-only `BETTERPPTX_MODEL3D_TIMELINES_FILE` or secret-backed JSON setting.
4. Run the gate with the resulting Baker manifest. Only a `SHIPPABLE` result may be deployed with `BETTERPPTX_MODEL3D_INTERACTION_CLIPSET=authoring-v3`.
