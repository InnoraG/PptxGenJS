# Meshy native 3D cold canary

This runbook is for the native 3D presenter only. It does not invoke LivePortrait, MuseTalk, narration video, or any talking-head worker.

The current default is a no-network dry run. A live call is deliberately owner-authorized because Meshy generation consumes account credits and sends the supplied images to Meshy.

## Dry run

```powershell
node betterpptx-mcp/verify-meshy-presenter-live-canary.mjs `
  --dry-run `
  --input <full-body-front.png>
```

The report records only image count, MIME type, byte count, and SHA-256. It never copies the input image into evidence.

## One live request

After the native-3D license/consent ledger has been approved and the Meshy credential is stored through the owner-controlled credential path:

```powershell
$env:BETTERPPTX_MESHY_LIVE_CANARY_APPROVED='1'
$env:BETTERPPTX_MESHY_LIVE_CANARY_SCOPE='OWNER_APPROVED_MESHY_API'
$env:BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM='GENERATE_ONE_PAID_REQUEST'
node betterpptx-mcp/verify-meshy-presenter-live-canary.mjs `
  --live `
  --input <full-body-front.png> `
  --input <full-body-side.png> `
  --input <full-body-back.png>
```

The runner uses the existing bounded Meshy adapter: one multi-image task, one rigging task, a 20-minute deadline, five-second polling, hybridization onto the frozen Mixamo performer, structural verification, and a Meshy poster check. It writes only the derived hybrid GLB, poster, manifest, and hash-only report to the selected evidence directory.

The API contract used by this runbook was checked against the official Meshy documentation on 2026-07-18: Multi-Image-to-3D accepts 1–4 JPG/JPEG/PNG images supplied as public HTTPS URLs or base64 data URIs, with the same subject shown from different angles; Meshy 6 textured generation is 30 credits and auto-rigging is 5 credits. See the [Multi-Image-to-3D API](https://docs.meshy.ai/en/api/multi-image-to-3d), [pricing](https://docs.meshy.ai/en/api/pricing), and [rigging](https://docs.meshy.ai/en/api/rigging) documentation. The local matrix records this provenance and verifies that the production boundary matches it.

Do not use the current `consentedHumanAsset` research files for this external Meshy call: their attestation explicitly allows local/private research only and denies other cloud processing. A separate owner-approved input set is required.
