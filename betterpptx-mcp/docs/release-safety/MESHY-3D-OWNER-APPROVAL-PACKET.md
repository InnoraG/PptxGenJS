# Meshy native 3D owner approval packet

Status: **local readiness proven; owner action required; no live request made**

This packet is for the native 3D model presenter only. It excludes narration video, talking-head avatars, LivePortrait, MuseTalk, MP4, and lip-sync.

## Local readiness

Run the bounded preflight:

```powershell
node betterpptx-mcp/verify-meshy-presenter-owner-preflight.mjs
```

The resulting `meshy-owner-preflight-20260718.json` must report `READY_FOR_OWNER_ACTION` and `networkAttempted: false`. It confirms the Meshy 1–4 image contract, documented request shape, hybrid GLB handoff, repair-free PowerPoint export, native slideshow motion, private-profile routing/failover, local immutable-revision/rollback contract, the redacted Mission Control owner-control contract, and the machine-checkable decision worksheet contract. The worksheet is [`MESHY-3D-OWNER-DECISION-WORKSHEET.json`](MESHY-3D-OWNER-DECISION-WORKSHEET.json); validate it with `node betterpptx-mcp/verify-meshy-owner-decision-worksheet.mjs`. It starts with all seven decisions `OPEN` and never grants approval by itself.

## Owner decisions required

1. Record the production Meshy account plan and commercial-use terms.
2. Approve external processing of the supplied full-body images, likeness generation, tenant scope, retention/deletion, and no-training policy.
3. Approve the Mixamo/Adobe distribution decision for the frozen 65-joint, 18-clip animation library.
4. Approve the exact Joe and Louise fallback GLB/poster hashes.
5. Provide 1–4 new owner-approved full-body JPG/JPEG/PNG images of the same subject from different angles. Restricted research-only inputs must not be reused.
6. Configure the Meshy credential through private Mission Control secret `meshy_api_key` (`betterpptx-meshy-api-key`), bound to `BETTERPPTX_MESHY_API_KEY` for the private 3D presenter worker. Mission Control exposes owner-only reveal/update/rotate/test actions; the raw value must never enter this ledger, telemetry, public tool results, or normal logs. The local contract evidence is `meshy-owner-control-20260718.json`.
7. Authorize exactly one paid live canary and record the real immutable revision/image digests for the requested private profiles `betterxavatar1` and `betterxavatar2`, including rollback evidence. The current inventory shows those profiles exist but have no deployed `betterpptx-model3d` app; the older routed pair is `betterxavatar`/`betterpptx` and must not be silently substituted for the requested pair.

## One bounded live sequence

```powershell
$env:BETTERPPTX_MESHY_LIVE_CANARY_APPROVED='1'
$env:BETTERPPTX_MESHY_LIVE_CANARY_SCOPE='OWNER_APPROVED_MESHY_API'
$env:BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM='GENERATE_ONE_PAID_REQUEST'
node betterpptx-mcp/verify-meshy-presenter-live-canary.mjs `
  --live `
  --input <owner-approved-front.jpg> `
  --input <owner-approved-side.jpg> `
  --input <owner-approved-back.jpg>
```

If the canary passes, run the same bounded downstream acceptance orchestrator with `--live` and the same approved inputs against the requested profile pair. No automatic retry is allowed. A canary failure is diagnosed and stopped, not repeated across profiles.

## Evidence boundary

The final runtime asset remains Meshy-generated geometry, face, hair, clothing, UVs, materials, and textures. The existing Mixamo-proven library supplies the skeleton and exact animation clips. Joe/Louise are only the deterministic fallback when the user does not provide or does not want to provide personal images.
