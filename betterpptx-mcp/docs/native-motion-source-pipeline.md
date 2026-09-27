# Private maintainer native motion-source pipeline

This is a development workflow, not a public MCP capability or raw-asset export path. Source files and local provenance must remain private.

## Convert original sources without changing their skeletal basis

Use the native source adapters for new basis-sensitive motion additions. Retain the original input and create a new versioned skeletal-only GLB; do not overwrite an old source pool or reference asset. The historical canonical-skeleton bakers remain compatibility/evidence tooling, not an authoritative regeneration path for these corrected sources.

```powershell
node betterpptx-mcp/scripts/convert-native-fbx-motion-source.mjs --input original.fbx --animation exact_take --output staging/source-v1.glb
node betterpptx-mcp/scripts/convert-native-bvh-motion-source.mjs --input original.bvh --animation exact_take --unit-scale 0.01 --bone-map source-to-output-names.json --output staging/source-v1.glb
```

The BVH name map is an explicit JSON object from original joint name to output joint name. It changes identities only; offsets, hierarchy, ordered Euler channels and original time keys remain authoritative. Unmapped joints remain in the hierarchy. Unit scale is an explicit retained ancestor transform, not guessed from an identity or clip label. Unsupported syntax, duplicate names, unknown channels and invalid clocks fail closed.

The BVH animation endpoint is `(frameCount - 1) * frameTime`. Its capture span `frameCount * frameTime` is reported separately; the converter never adds an artificial final hold frame. Both adapters preserve the source's imported/evaluated clock and use only equivalent quaternion hemisphere sign normalization, without smoothing, bone auto-orientation or pose clamping.

## Select a source-owned retarget policy

Do not infer retarget policy from an actor, slide, motion title or filename.

- `global` preserves existing bone-rest-frame relative rotation behavior. Established native FBX sources keep their proven policy unchanged.
- `world-delta` carries `sourcePose * inverse(sourceRest)` before the destination rest orientation. It is appropriate for original world-axis skeletal sources after confirming shared source/destination world axes through source-derived pose checks. The source and target must use rigid positive-uniform ancestor TRS; at most `1e-4` relative imported scale roundoff is tolerated without altering the scale values. Matrix/sheared/reflected bases, partial bone filters, mixed rotation interpolation and STEP boundary blending are rejected.
- Channel policy is separate: an in-place `rotation-only` source must not silently acquire root travel. Root-motion selections retain their explicitly governed axis, anchor and range policy.

Use independent original-source sampling, GLB forward kinematics and contrasting motions to verify physical pose, not merely equality of quaternion products. Include hand/elbow direction, legitimate inversion/travel, exact source clocks and each target's actual construction-rest profile. A self-consistent quaternion parity check can still miss a physically wrong arm direction.

## Verify, then activate

1. Preserve input hashes and independently compare source versus converted skeleton poses.
2. Materialize each intended target rig using its exact base bytes and construction profile.
3. Compare source-derived pose envelopes and directional landmarks; keep intentional source motion rather than flattening it to pass a gate.
4. Author an exact native playback fixture and inspect its package model hash, selected animation index/name and full source clock.
5. Run native PowerPoint open/save/reopen and complete playback, preserving existing application sessions. Record a bounded visual review separately from numerical results.
6. Add only new versioned sources, native-proof sidecars and hash-matching registry/release entries. The catalog overlays exact semantic motion IDs from the governed source registry; it does not need slide-specific routing.

Every `world-delta` source requires hash-bound native playback proof. Missing/mismatched proof withholds catalog selection, and materialization also binds the exact target bytes and rest-profile hash before cache lookup. The proof includes the retarget policy, so changing it invalidates the old proof. Playback-proven sources do not receive legacy provider-wide articulation clamps or smoothing after the gate; those would modify the verified motion.

Before activation, coordinate code reload for any long-lived service sharing the registry. An older normalizer may reject a new policy. Do not restart or promote a service without the applicable authorization. Source activation and maintainer native review are not owner visual acceptance, raw-source redistribution permission or production launch approval.
