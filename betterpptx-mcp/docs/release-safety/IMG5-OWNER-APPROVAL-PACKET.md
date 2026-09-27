# IMG5 / Modal owner approval packet

Status: **research only; no launch**  
Prepared: 17 July 2026  
Evidence: `outputs/private-modal-account-inventory-report.json`,
`outputs/img5-semantic-judge-inventory-report.json`, `outputs/img9-powerpoint-com-report.json`

This packet is intentionally explicit so no owner decision is hidden behind a generic “pending” label. It contains
no token, URL, customer image, consented-human image, or external-AI credential.

## Current facts

| Lane | Current durable accounts | Router status | Exact gap |
|---|---:|---|---|
| FLUX creation / Schnell | 2 | round-robin + failover implemented | none for current research creation |
| FLUX edit/reference / Klein 4B | 2 durable `modal-image-edit` entries | live round-robin + failover; 15/15 synthetic canary checks | broader quality corpus, calibrated judge and production legal/runtime gates |
| Private semantic judge / Qwen2.5-VL | 2 durable `semantic-judge-worker` entries | live cold/warm judge canary 14/14; scorecard remains uncalibrated | independent labels/kappa, production runtime/legal gate and auto-accept approval |
| 3D generation | 2 | round-robin + failover implemented | expansion deferred; add profiles only when 3D throughput requires it |
| Avatar worker | 2 | round-robin + failover implemented | none |
| Piper TTS | local CPU sidecar | localhost HTTP | no Modal account required |

The PowerPoint host gate is green: Microsoft PowerPoint 16.0 build 20131, IMG9 COM corpus 22/22.
The semantic-judge Linux inventory is green for metadata: 66/66 records have explicit license evidence,
36 use PEP 639 expressions, and no package is marked non-commercial. The owner has approved the private Qwen
worker and two independent synthetic-packet reviewers; deployment/calibration still fail closed until the exact
in-image runtime, CUDA/NVIDIA notice review and measured agreement gates are recorded. The exact deployed image
attestation now reports 102/102 package records with license evidence (including torchvision 0.23.0); the 15
NVIDIA/CUDA records remain conservatively production-blocked.

## One-shot owner decisions requested

Record `approved`, `deferred`, or `rejected` for each item:

1. **Dedicated Klein edit worker:** **approved and deployed** to the two existing
   approved private Modal profiles, with a separate worker secret on each profile and two durable credential-store
   entries. Synthetic fixtures only; no customer or consented-human images.
2. **Private semantic judge:** **approved for deployment** as a private Modal Qwen2.5-VL worker under the pinned revision and exact
   runtime inventory, with no external Claude/GPT/API calls, no customer-image training, and public scorecards only.
   It remains fail-closed until the in-image notice/EULA review is recorded.
3. **3D account expansion:** **deferred**; retain the two-profile baseline.
4. **Calibration:** **two independent synthetic-packet reviewers authorized** to label the 20-record blind
   packet. Their labels—not owner intent—are required for kappa and auto-accept calibration.

## Automatic safeguards after approval

- Per-request GPU cost and attempt ceilings remain enforced.
- No raw model/provider/path metadata crosses the public black-box boundary.
- Account tokens remain owner-controlled and redacted from reports/logs.
- Private canaries use owned synthetic rasters only.
- PPTX-only output remains the product boundary; raw GLB/FBX export stays disabled.
