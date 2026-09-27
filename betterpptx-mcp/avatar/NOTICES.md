# BetterPPTX Avatar Notices

This directory implements the BetterPPTX avatar narration integration boundary.

## Current shipped implementation

- `test-static` provider: uses ffmpeg to loop the approved default or uploaded avatar image over narration audio. This is a packaging and PowerPoint-media proof only; it is not marketed as lip-sync.
- Default presenter asset: product-owned geometric PNG generated locally with Pillow. It is not based on a real person or third-party image.

## Provider review status

The machine-readable evidence boundary is [`license-ledger.json`](./license-ledger.json), checked by
`verify-avatar-license-ledger.mjs`. The current LivePortrait + MuseTalk worker release is frozen against
the reviewed ledger and SBOM; the ledger records the selected release boundary and required notices.

The following remain outside the frozen talking-head resale path and require separate review before use:

- SadTalker source and checkpoints
- GFPGAN and enhancer checkpoints
- Any alternative face detector, face parser, or alignment model
- Any default-avatar replacement tooling

Wav2Lip is excluded from product defaults unless a commercial license is obtained.

### LivePortrait + MuseTalk notice inventory (frozen worker path)

The private worker uses the pinned LivePortrait and MuseTalk sources and model artifacts recorded in
`model-provenance-lock.json`; the selected release is cleared in `license-ledger.json`:

- LivePortrait code notice: https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE
- Commercial face detector: OpenCV Zoo YuNet model/code, pinned to commit `47534e27c9851bb1128ccc0102f1145e27f23f98`, MIT: https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet
- MuseTalk code notice: https://github.com/TMElyralab/MuseTalk/blob/main/LICENSE
- MuseTalk model terms: https://huggingface.co/TMElyralab/MuseTalk/tree/main/musetalk
- MediaPipe Face Landmarker license: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- MediaPipe Face Landmarker documentation: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- The legacy InsightFace detector and BiSeNet face-parser checkpoints are intentionally removed from the
  worker image. The shipped mask path uses the pinned MediaPipe task
  (`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`).

The public avatar enablement flag remains separately disabled by owner policy; enabling it is an operational
release decision, not an unresolved license item in this frozen worker boundary.

### Maintainer version/revision index (private evidence, 2026-08-02)

This index makes the prose notices auditable without putting implementation details in a production deck. It is
an evidence cross-reference, **not** legal approval and not a public runtime contract. Exact model/source pins are
authoritative only when they also appear in `model-provenance-lock.json` or
`3d-presenter-license-ledger.json`.

| Notice entry | Source/version or explicit boundary | Current evidence state |
|---|---|---|
| LivePortrait code + weights | code commit `9b294b3d0536135442ea73cb01e6cb3ca7029dd3`; model revision `82a4fa6735ca58432b6ce39301b4b9ee066dea47`; [source](https://github.com/KwaiVGI/LivePortrait) / [model](https://huggingface.co/KwaiVGI/LivePortrait) | exact pins recorded |
| MuseTalk code + weights | code commit `0a89dec45a0192b824e3cf4daf96c239440c5ed8`; model revision `3ef28bc5cff08c90ad8178a25f1b570cd800170f`; [source](https://github.com/TMElyralab/MuseTalk) / [model](https://huggingface.co/TMElyralab/MuseTalk) | exact pins recorded |
| YuNet detector | OpenCV Zoo commit `47534e27c9851bb1128ccc0102f1145e27f23f98`; ONNX SHA-256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | exact pins recorded |
| MediaPipe Face Landmarker | task revision/SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`; avatar-worker SBOM records `mediapipe==0.10.11` in the MuseTalk image; the separate model3d-worker image declares `mediapipe==0.10.14` | separate-image scopes are reconciled; transitive dependency pin review remains open |
| SAM 2.1 small | source commit `2b90b9f5ceec907a1c18123530e92e794ad901a4`; checkpoint SHA-256 `6d1aa6f30de5c92224f8172114de081d104bbd23dd9dc5c58996f0cad5dc4d38` | exact pins recorded |
| TRELLIS.2 + sparse decoder | code commit `75fbf0183001ed9876c8dbb35de6b68552ee08bd`; model revisions `af44b45f2e35a493886929c6d786e563ec68364d` and `25e0d31ffbebe4b5a97464dd851910efc3002d96` | exact pins recorded; PoC only |
| UniRig + DINOv3 + BiRefNet | code commit `6793c6640ff01c8fb389f3993434124bb43d2933`; model revisions `36842e2b5947e9e60f89275b83208c8e74071c63`, `ea8dc2863c51be0a264bab82070e3e8836b02d51`, `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4` | exact pins recorded; PoC only |
| DRTK rasterizer | code commit `01f9d76f26af04836b813c71c979af64e67741e2`; [source](https://github.com/facebookresearch/DRTK) | exact pin recorded; PoC only |
| Blender clip-baker | portable LTS `4.2.13`; [download source](https://download.blender.org/release/Blender4.2/) | exact version recorded |
| pygltflib / trimesh / numpy / Pillow / FastAPI | model3d-worker image currently declares version ranges or unpinned installs | **PINNING OPEN**; do not treat the PoC image as immutable release evidence |
| utils3d / CuMesh / FlexGEMM / o-voxel | transitive TRELLIS.2 PoC dependencies; no standalone upstream revision in the current ledger | **PINNING OPEN**; source digest alone is not a version lock |
| PyTorch3D fallback | fallback only; not installed on the current production-boundary image | **EXCLUDED_FROM_CURRENT_RUNTIME**; no deployed version claim |
| nvdiffrast / nvdiffrec | evaluation-only NVIDIA path; not in the resale/default route | **EXCLUDED_FROM_PRODUCTION**; no production version claim |
| RMBG-2.0 | non-commercial background-removal path swapped out for MIT BiRefNet | **EXCLUDED_FROM_PRODUCTION**; no production version claim |
| CMU/cgspeed motion source + Mixamo source clips | build-time-only source material; exact source-row hashes are in the private G5 manifest | **OWNER/DISTRIBUTION REVIEW OPEN**; raw motion/source files never ship |

The open rows above are deliberately retained as explicit blockers. Closing them requires immutable dependency
pins and/or owner/legal evidence; this index must not be read as a clearance decision.

### Frozen resale-safe baseline

The shipped commercial baseline intentionally contains no face-restoration stage. Real-ESRGAN core-only may be
evaluated later with `--face_enhance` disabled and without importing or downloading GFPGAN, but no enhancer is
required for resale clearance. The self-hosted permissive TRELLIS.2/UniRig/DRTK path is retained for PoC and flow testing only; it is not the production 3D provider and carries no production resale-clearance claim. Meshy → Mixamo is the intended production native-3D provider path and is separately gated; it is not cleared by the talking-head baseline.

## Rigged 3D avatar generation (image → rigged GLB)

The self-hosted rigged-3D generator (`deploy/model3d-worker/`) is a PoC/flow-test implementation only. Its
third-party component notices are retained for research and must not be interpreted as production Meshy/Mixamo
clearance. Production 3D uses Meshy → Mixamo and has a separate provider/owner review.

Full dependency-license audit 2026-07-08 (17-agent workflow): after two swaps (nvdiffrast, RMBG-2.0) the
self-hosted PoC component set has a recorded permissive export path. This does **not** make the PoC a
production resale-safe provider: production native 3D is Meshy → Mixamo and remains gated by the current
account/order, input-consent, integrated-end-use, and live acceptance decisions.

| Component | Purpose | License | Commercial | Obligation / resolution |
|---|---|---|---|---|
| TRELLIS.2 (`microsoft/TRELLIS.2-4B`) | image→3D weights | MIT | Yes | none |
| `microsoft/TRELLIS-image-large` | sparse-structure decoder (cross-repo) | MIT | Yes | none (pre-downloaded to Volume) |
| UniRig (`VAST-AI/UniRig`, code + weights) | auto-rig | MIT | Yes | none |
| utils3d / CuMesh / FlexGEMM / o-voxel | CUDA + geometry helpers | MIT | Yes | none |
| **DINOv3** (`facebook/dinov3-vitl16-pretrain-lvd1689m`) | image encoder (gated) | DINOv3 License | **Yes** (outputs incl.; no MAU cap) | **display "Built with DINOv3"** (product UI/docs); HF token for the gated download |
| **`ZhengPeng7/BiRefNet`** | background removal (the permissive swap) | MIT | Yes | keep MIT notice; vendoring its remote code is a hardening TODO |
| ~~`briaai/RMBG-2.0`~~ | bg-removal (TRELLIS.2 default) | CC-BY-NC-4.0 | **No** (paid BRIA) | **BLOCKED — SWAPPED OUT**: Generator.load monkeypatches the bundled BiRefNet class to its MIT default (ZhengPeng7/BiRefNet) so RMBG-2.0 is never constructed. |
| ~~nvdiffrast / nvdiffrec~~ | rasterized texture bake (TRELLIS.2 stock) | NVIDIA Src Code License (1-Way Commercial = non-commercial) | **No** | **NOT in the resale path.** Default export is the in-house vertex-color path (`_export_glb_vertexcolor` via `flex_gemm.grid_sample_3d`, MIT). Installed ONLY in the separate `trellis_image_premium` / `GeneratorPremium` (`_export_glb_textured`) which is **EVALUATION-ONLY**. **GATED (verified 2026-07-11):** unless `MODEL3D_ENABLE_PREMIUM=1` (set only by the local eval wrapper `make-presenter-premium.ps1`), `trellis_image_premium` is repointed to the lightweight orchestrator image, so **`modal deploy` NEVER builds nvdiffrast onto a workspace** and the served endpoint never invokes it. Confirmed: no-flag → premium image IS orchestrator; flag → real build. |
| **DRTK** (`facebookresearch/DRTK`) | permissive rasterizer for the UV texture bake | **MIT** | **Yes** (unrestricted) | **RESALE-SAFE texture path.** `nvdiffrast_drtk/` shim implements `RasterizeCudaContext`/`rasterize`/`interpolate` on DRTK so TRELLIS.2's stock `to_glb` bakes a real UV texture with NO NVIDIA code (`trellis_image_permissive` / `GeneratorPermissive`). Keep the MIT LICENSE + copyright notice. Verified from the LICENSE file 2026-07-10. |
| **PyTorch3D** (`facebookresearch/pytorch3d`) | alternative permissive rasterizer (fallback to DRTK) | **BSD 3-Clause** | **Yes** (unrestricted) | Vetted drop-in alternative if DRTK is unavailable; keep the BSD notice; do not use Meta's name to endorse. Verified from the LICENSE file 2026-07-10. |

### "Built with DINOv3" — where it goes (NOT in the .pptx)

The DINOv3 License requires displaying **"Built with DINOv3"** *"on a related website, user interface, blogpost,
about page, or product documentation."* This is a **PRODUCT-level, one-time** attribution — it does **NOT** go
inside the generated .pptx and is **NOT** per-deck. Satisfy it with a single prominent line on any ONE product
surface, e.g.:

- the BetterPPTX product/marketing website or its **About / Credits / Acknowledgements** page, **or**
- the product **documentation** (this file is that documentation of record), **or**
- the hosted app's **UI** footer/about, **or**
- the MCP Terms/attribution statement.

**Canonical string:** `Built with DINOv3` (with a link to the DINOv3 license is good practice, not strictly
required). Placing it on the product surface satisfies the license for every avatar the pipeline produces — no
per-output marking needed. (Internally, the rigged-3D asset's provenance may also be recorded in the sidecar
license manifest for audit, but that record is not the required *display*.)

## Presenter clip-baker (rigged avatar → multi-clip gesture performer)

The Baker (`deploy/model3d-worker/bake/`) retargets a standard gesture-clip set onto the generated avatar as
embedded glTF skeletal animations PowerPoint plays. Resale-cleared with two carve-outs:

| Component | Purpose | License | Commercial | Obligation / resolution |
|---|---|---|---|---|
| **CMU Graphics Lab Motion Capture Database** (cgspeed Motionbuilder-friendly BVH) | source gesture motion | CMU terms | **Yes, when baked into a product** | **Carve-out:** *"You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form."* We bake the motion into the sold GLB and **NEVER emit the raw BVH** (it is a build-time-only asset, never in any payload/public repo layer). Acknowledgment below. |
| **Blender** (portable LTS 4.2.x binary) + bundled `io_anim_bvh` / `io_scene_gltf2` | headless retarget + glTF bake | GPL | Yes | **Invoked STRICTLY as a subprocess** (`blender --background --python …`) — `model3d_app.py` never `import bpy`. GPL stays at arm's length across the process boundary (mere aggregation); no GPL/paid addon is used (built-in operators + first-party scripts only). |
| pygltflib | pure-Python glTF reorder + validation gate | MIT | Yes | none |
| enumerate + idle-breathe clips | two synthesized gestures | first-party (hand-keyed) | Yes | none — zero CMU provenance |

**CMU acknowledgment (rides the deck sidecar license manifest / this documentation, NOT the .pptx):**

> `The presenter gesture motion is derived from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), created with funding from NSF EIA-0196217.`

Not legally required for product *sale* (only for published research), but cheap to carry alongside the "Built
with DINOv3" line. The load-bearing obligation is the hard rule above: **the sold deck contains only baked
skeletal tracks fused onto the user's avatar — never a standalone or extractable BVH / motion-as-data file.**
