# BetterPPTX private image edit/reference worker

This is the dedicated Modal worker for the reference-aware capability lane. It is separate from
`deploy/flux-worker`, so ordinary text creation and reference editing scale to zero independently.
The MCP public surface exposes only `create`, `edit`, `reference`, and `multi-reference` capabilities
plus opaque `gen://image/...` handles.

No GPU deployment or request is part of the offline IMG2 implementation. Production remains blocked
until the container lock, private visual canary, safety, retention, and cost gates in
`dependency-lock.json` are green.

## Private deployment contract

1. Install the pinned deploy host CLI from `dependency-lock.json`.
2. Create one secret in each approved Modal profile:

   `modal secret create betterpptx-image-edit-token IMAGE_EDIT_ENDPOINT_TOKEN=<random-owner-value> --profile <approved-profile>`

3. Set a stable opaque endpoint label locally, then deploy the same worker to each approved rotating
   Modal profile:

   `$env:IMAGE_EDIT_ENDPOINT_LABEL='<opaque-label>'; modal deploy betterpptx-mcp/deploy/image-edit-worker/image_edit_app.py --profile <approved-profile>`

4. Add each returned URL/token pair to the private credential store under provider id
   `modal-image-edit`, using `BETTERPPTX_MODAL_IMAGE_EDIT_URL` and
   `BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN`. The provider rotates and fails over across those entries.

For a research-only build/canary when the dedicated secret does not yet exist, set
`IMAGE_EDIT_MODAL_SECRET_NAME=betterpptx-flux-token` at deploy time. This reuses the existing private
worker credential only for the research deployment and does not weaken HTTP token authentication.
Production must return to the default dedicated secret before its gate can turn green.

The worker permits at most four in-memory references, 16 MiB per encoded image, 25 megapixels per
decoded input, 1536 px output edges, eight inference steps, one concurrent container, and zero warm
minimum containers. It does not expose a file upload route, training path, source browser, logs, or
model selector.

## Verification before any live canary

- `python -m py_compile betterpptx-mcp/deploy/image-edit-worker/image_edit_app.py`
- `node betterpptx-mcp/verify-image-gen-capability-routing.mjs`
- `node betterpptx-mcp/verify-image-edit-worker-contract.mjs`
- Run the full release-safety suite.

The research/demo human assets under `consentedHumanAsset` must never be sent to this worker. A live
canary must use an owned synthetic fixture created specifically for the canary.

## New-profile GPU fallback contract

New profiles use an ordered Modal GPU list; this is a deployment template and does not require
redeploying a healthy existing endpoint. The current service-family defaults are:

| Service | Primary | Backup | Runtime proof |
| --- | --- | --- | --- |
| FLUX.2 Klein 4B edit/reference | `L40S` | `A10G` | Klein `innorag` synthetic canary landed on `A10G` and reported `gpuPreference: L40S|A10G` |
| Private Qwen2.5-VL-7B judge | `L40S` | `A10G` | Source-ready; existing live canaries were on `L40S`; deploy a new profile to prove the backup |
| FLUX.1 Schnell creation | `L40S` | `A100-40GB` | Source-ready; existing live bake-off was on `L40S` |
| TRELLIS.2 + UniRig (deferred) | `L40S` | `A100-40GB` | Already present in the model3d worker |

Each new profile must report both the actual `gpuType` and the ordered preference string. The MCP
image provider applies a bounded scheduler retry (`BETTERPPTX_MODAL_SCHEDULING_RETRIES`, default 1,
maximum 2) for transient Modal capacity/HTTP failures on creation and edit/reference calls. Qwen
judge calls remain private and fail closed; a new Qwen profile should be canaried independently
before it is marked backup-proven.
