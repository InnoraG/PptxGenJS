# G5 — Hash-Keyed Asset License / Provenance Ledger

Status: **EXACT PRODUCT-BUNDLE APPROVAL GATE CLOSED / STRICT GUARD ACTIVE 2026-08-14** (roadmap G5).
The owner approved the three current product bundles at their exact hashes and stated in-project distribution
boundaries in `G5-BUNDLE-OWNER-DECISION-20260814.json`. `verify-g5-product-asset-ledger.mjs` and the strict ship
gate fail closed on missing, drifted, pending, or decision-mismatched product rows. This closes the hash-bound
product-bundle approval gate only; the separate dependency/notices/legal work below remains open.

## Historical re-audit — 2026-08-01 (superseded for product-bundle approval by the 2026-08-14 decision)

At this historical checkpoint the ledger was useful evidence but was not yet a green release gate. The
server-side kinetic-library approval remained recorded, and the corrected local avatar-license verifier reported
**11/11 ledger entries parsed and owner approval PASS** against the authoritative `APPROVED_AND_CLOSED` record.
The strict release-build guard (`verify-g5-product-asset-ledger.mjs`, `verifyG5ReleaseGate`) then failed closed on
the three pending product-bundle approvals. Those exact product-bundle approvals were subsequently closed by the
hash-bound 2026-08-14 decision above. Separate dependency/notices/legal work remains open and is not inferred by
that product approval.

Mixamo licensing basis (all Mixamo rows): Adobe's
[Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) allows characters and
animations in commercial projects, but that FAQ alone does not authorize reselling a reusable
source clip library; owner/legal approval is required for the exact bundled/distributed form.

The current owner-maintainer source-row hash pass is recorded in
`G5-SOURCE-ASSET-HASH-MANIFEST-20260802.json` and verified by
`verify-g5-source-asset-hashes.mjs`: **19/19** present FBX rows match their declared byte counts and
SHA-256 values. This is source-integrity evidence only; it does not infer licensing approval or make raw
FBX files shippable.

The machine-side notices/SBOM cross-check passes with
`verify-g5-notices-sbom-crosscheck.mjs`: all 11 talking-head ledger entries, 4 source-repository pins,
8 model-artifact pins, native-3D runtime pins, and the reviewed 65-component CycloneDX SBOM are structurally
aligned with `avatar/NOTICES.md`. The new private maintainer version/revision index enumerates the exact pinned
rows and explicitly labels excluded, PoC-only, and still-unpinned rows. The report deliberately retains
`manualVersionCoverageRequired:true` because standalone pins for the listed transitive PoC dependencies still
require owner-maintainer closure; the index explicitly reconciles the separate `mediapipe==0.10.11` MuseTalk image
and `mediapipe==0.10.14` model3d-worker image scopes. This is not a legal or distribution approval.

The separate model3d-worker dependency audit (`verify-model3d-worker-dependency-lock.mjs`) now inventories every
Modal `.pip_install` declaration in `deploy/model3d-worker/model3d_app.py`. It records the exact Torch,
MediaPipe, Blender, and CUDA-index declarations and identifies **12** range/unpinned declarations that still
need maintainer pinning and SBOM refresh. It intentionally does not infer versions from the local desktop
Python environment; this is an evidence inventory, not dependency-lock closure.

## Shipped / shippable assets

| Asset | sha256 | Bytes | Source | License | Distribution mode | Transformations | SHIP status |
|---|---|---|---|---|---|---|---|
| `betterpptx-mcp/assets/kinetic-clips.glb` (31 clips: 00_superhero_landing … 30_atlas_lift) | `0b24cf525add356daf1acb9900e24e204874eaf036344547516071673bfe7876` | 3,252,016 | Mixamo gesture FBX takes (acquired 2026-07-12, owner account) | Mixamo (commercial-in-project) | baked skeletal tracks only, transplanted per-deck into customer avatars (≤18/model); the library itself is a SERVER-side tool asset, not delivered raw to customers | FBX→retarget→bake (mixamo_bake pipeline); no meshes/textures from Mixamo retained | **APPROVED BY OWNER 2026-07-14** ("I sign off G5 ledger" — chat; approval covers the server-side distribution form at this exact hash; re-approve on rebake/hash change) |
| `research-demos/2026-07-14-louise-bake/louise-slim.glb` (roster member #2, female — Mixamo Ch07 "Louise" + 18 transplanted kinetic clips) | `9bdd9030b94c80581e503f2029bb4373f70f42696cfc6c62ce5fe87925d100ff` | 5,667,052 | Mixamo character Ch07 (owner-supplied FBX, acquired 2026-07-14, owner Adobe account) | Mixamo (commercial-in-project) | rigged presenter avatar for decks; server-side product asset (not delivered raw) | FBX→GLB (Blender, bake_space+scale/namespace fix)→transplant 18 clips→matte→512 slim; character mesh+textures ARE retained (Mixamo character) | **PENDING_OWNER_APPROVAL** — Mixamo commercial-in-project covers use; owner sign-off recorded here for the shipped avatar form (like the kinetic library) |
| `research-demos/2026-07-14-louise-bake/louise_front_alpha.png` (Louise front poster) | `35cac4746a649bf6c2a3f43e980b3916d912c629d6958212c096eb7cc39f1fd6` | 238,621 | Blender front render of the Louise GLB | derived (Mixamo character) | am3d raster anchor + static fallback | Cycles-CPU front-orthographic transparent render | with the GLB above |

## Current product-bundle approval decision — 2026-08-14

These files are present under `betterpptx-mcp/assets/` and are used by current native-3D/avatar paths. Their hashes
were re-measured on 2026-08-14 and the owner explicitly approved the exact distribution boundaries recorded in
`G5-BUNDLE-OWNER-APPROVAL-PACKET-20260814.md`. Any byte/hash/path/distribution change requires a new decision.

| Asset | sha256 | Bytes | Current interpretation | SHIP status |
|---|---|---:|---|---|
| `betterpptx-mcp/assets/powerpoint-proven-mixamo-library.glb` (stable legacy ID `ordinary-18-gesture-library`; owner-facing meaning: curated 18-clip presenter deployment bundle) | `3363308deB44806BC6F6914EC88B09E32F4E04985355E1C32081D6A5A21765F3` | 7,545,976 | server-side skeletal-motion source used to construct project presenters; no standalone/raw library download or reusable-source resale; not the complete gesture catalog and not authoring-clipmap-v3 | **APPROVED BY OWNER 2026-08-14 — HASH BOUND** |
| `betterpptx-mcp/assets/default-presenter-joe.glb` | `105594811c8B979AF8CD4918E972961AE12FB7E22FA76E3E115542BB2B4CB151` | 8,899,436 | Joe embedded only in generated presentation projects; no standalone/raw GLB download or reusable-source resale | **APPROVED BY OWNER 2026-08-14 — HASH BOUND** |
| `betterpptx-mcp/assets/default-presenter-louise.glb` | `de219e1f6EF01D9612A2464652A2D7A4BD089526B9691E1057CC68675C2789C4` | 6,487,668 | Louise embedded only in generated presentation projects; no standalone/raw GLB download or reusable-source resale | **APPROVED BY OWNER 2026-08-14 — HASH BOUND** |

## Local R&D derivatives (research-demos/ — gitignored, never shipped as-is)

| Asset | sha256 | Bytes | Source chain | Notes |
|---|---|---|---|---|
| `2026-07-12-presenter-cofire/joe-slim.glb` | `cdc0a0ea62945e71d2f708eb54dfaca10af29ff8cd77811121e48a4f72e83414` | 8,899,852 | Mixamo char Ch33 (Joe) → Blender FBX→GLB → 512 slim | production-condition BASE candidate; a same-pipeline output needs this ledger's Mixamo approval before shipping |
| `2026-07-12-presenter-cofire/kinetic-joe-fixed.glb` | `c7ba3481b6dab8cfcc1ccdee84b1c22eb9d6113873b92b4002ddf01b202985f7` | 11,279,084 | joe-slim + 18 transplanted kinetic clips | as above |
| `2026-07-12-presenter-cofire/joe_front_alpha.png` | `8e146c18452c2a8b7296bcc6ca3aeef239c891058663d329a49af2b531c65d94` | 304,333 | Blender film_transparent render of Joe | poster/raster anchor |

## Source assets (gitignored, SOURCE_ONLY_DO_NOT_SHIP)

| Asset | sha256 | Bytes | Source |
|---|---|---|---|
| `Gestures_Pack_Basic/Joe.fbx` | `4675df93ce139d94e8082ebad96f76a0b2073e659cc43a21517f8101a7e0e984` | 54,631,553 | Mixamo character download (owner account) |
| `Gestures_Pack_Basic/*.fbx` (15 gesture takes) | TODO (hash on demand) | ~1-8 MB each | Mixamo gesture takes |
| `research-demos/2026-07-10-presenter-roster/mixamo-{josh,louise,remy}.fbx` | TODO | 53.1 / 50.0 / 28.3 MB | Mixamo roster candidates |
| `deploy/model3d-worker/mocap/` BVH/FBX | (gitignored by doctrine) | — | CMU terms: bake-into-product OK, raw redistribution FORBIDDEN — raw motion never enters git or any shipped layer |

## Pipeline components (license cross-reference — see `betterpptx-mcp/avatar/NOTICES.md`)

| Component | License | Resale-safe | Note |
|---|---|---|---|
| TRELLIS.2 (generator) | MIT | yes | provider names are now server-side only (G1) |
| UniRig (rigger) | MIT | yes | |
| FLUX.1 [schnell] weights | Apache-2.0 | yes | PINNED — dev/pro are NC and must never be used |
| Piper TTS + en_US-ljspeech-high | MIT / LJSpeech public domain | yes | license-gated voice choice recorded 2026-07 |
| RMBG-2.0 / Real-ESRGAN / nvdiffrast | see NOTICES | nvdiffrast = **NC, eval-only** | nvdiffrast_drtk gitignored 2026-07-14; must never ride a shipped/default path |
| Generated customer assets (gen://) | product license (generic notice; provenance server-side) | yes | sidecar carries the user-facing record only (G1) |

## Gaps / TODO for G5 green

- [x] Owner approval recorded for the kinetic library's server-side distribution form (top row, 2026-07-14)
- [x] Re-measure current product-bundle hashes (`powerpoint-proven-mixamo-library.glb`, `default-presenter-joe.glb`, `default-presenter-louise.glb`) on 2026-08-14
- [x] Obtain explicit owner approval for the exact curated 18-clip deployment, Joe, and Louise product bundles; recorded in `G5-BUNDLE-OWNER-DECISION-20260814.json`
- [x] Hash the currently listed source FBX rows (19/19: `Gestures_Pack_Basic` including `Joe.fbx`, plus
      the three `research-demos/2026-07-10-presenter-roster` candidates); manifest and verifier are
      `G5-SOURCE-ASSET-HASH-MANIFEST-20260802.json` and `verify-g5-source-asset-hashes.mjs`. Raw files remain
      gitignored/build-time-only and owner approval is not inferred.
- [x] Fail-closed build check implemented: `BETTERPPTX_G5_RELEASE_GATE=1 npx gulp verifyG5ReleaseGate`
      refuses missing/hash-drifted/pending/decision-mismatched product rows; the exact product-bundle gate is
      green after the 2026-08-14 owner decision
- [x] Machine notices/SBOM cross-check: `verify-g5-notices-sbom-crosscheck.mjs` confirms the structured
      ledgers, immutable revisions, source URLs, license fields, and reviewed SBOM align with the notices boundary
- [x] Model3d-worker dependency audit: `verify-model3d-worker-dependency-lock.mjs` records every Modal image
      declaration, exact existing pins, and the 12 open range/unpinned declarations without desktop-environment
      inference; its report is `outputs/model3d-worker-dependency-lock-report.json`
- [ ] Manual NOTICES.md version coverage: the private maintainer index now enumerates every prose-table row and
      marks exact pins, exclusions, and open rows. MediaPipe image scopes are reconciled; close the remaining
      standalone transitive-PoC pins (machine cross-check intentionally leaves `manualVersionCoverageRequired:true`).

Original ledger measurement: 2026-07-14 · historical HEAD at record time: dea5ccf4d. Current 2026-08-14
product-bundle measurements and approval are recorded above. This does not approve G1, G4, public enablement,
authoring-v3, raw/reusable-source resale, or the remaining worker dependency/notices/legal work.
