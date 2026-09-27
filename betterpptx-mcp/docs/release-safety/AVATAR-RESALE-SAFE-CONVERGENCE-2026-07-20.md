# PowerPoint narration avatar — resale-safe convergence report

Date: 2026-07-20  
Scope: native PowerPoint narration head-talker generated from an owner-consented human image and narration audio.

## Executive decision

The resale-safe lane now has a complete, tested output equivalent:

`YuNet -> LivePortrait natural motion -> MuseTalk 1.5 -> corrected MediaPipe jaw compositor -> BetterPPTX deterministic detail enhancement -> SAM 2.1 temporal matting -> FFmpeg PowerPoint/alpha delivery`

The lane excludes InsightFace pretrained detector models, BiSeNet/CelebAMask-HQ parser weights, CodeFormer, Robust Video Matting, and Real-ESRGAN face enhancement. Licensing is frozen and closed for the exact pinned components in `avatar/model-provenance-lock.json` and `avatar/license-ledger.json`.

The complete authenticated route is deployed in both rotating Modal workspaces and the refreshed Cloud Run staging revision is healthy at 100% traffic. The remaining gates are the owner's one-time visual acceptance and broader tolerance/load evidence, not component licensing or missing pipeline functionality.

## Controlled one-at-a-time substitution

All rows use the same consented crop, narration, LivePortrait `natural` profile, MuseTalk 1.5 revision, 154 frames, 25 fps, and `bbox_shift=0`.

| Lane | Detector | Mouth/face mask | Mouth SSIM vs commercial raw | Finding |
|---|---|---|---:|---|
| Commercial raw | InsightFace | BiSeNet | 1.0000 | Evaluation reference only |
| Detector replacement only | YuNet | BiSeNet | 0.9724 | YuNet is not the material quality problem |
| Parser replacement only | InsightFace | MediaPipe corrected jaw | 0.9511 | Parser/compositor is the largest substitution impact |
| Fully resale-safe raw | YuNet | MediaPipe corrected jaw | 0.9403 | Accepted safe raw baseline |

The first MediaPipe versions regressed badly because the integration failed to crop the expanded parser mask back to MuseTalk's face box and then applied the placement offset twice. Correcting those two coordinate defects removed the suppressed upper-lip movement and false double/third teeth layers. The frozen profile is the standard corrected jaw blend, not the experimental union or upper-teeth-clean profiles.

## Final quality evidence

- Full upper-lip movement: present.
- Teeth: one coherent band; no duplicated source/generator teeth layer in the selected output.
- LivePortrait motion: `natural`, full region, multiplier `0.45`, eye retargeting enabled, observation variance `8e-7`.
- Blink evidence: 7 closed/closing frames across two controlled blink events.
- Gaze p05-p95 range: `0.0092`, below the earlier low profile's `0.0117`.
- SAM2 matte: 154/154 frames, mean frame-to-frame IoU `0.9996726`, minimum `0.9919989`, foreground-area coefficient of variation `0.0003205`.
- PowerPoint delivery: H.264/AAC MP4, embedded and set to auto-play.
- Transparent master: VP9 WebM with alpha.
- PowerPoint validation: native PowerPoint open/save passed; package media hash matched the frozen safe MP4; timing/media XML is present; slide render and overflow test passed.
- Rotating account canary: 2/2 authenticated HTTP routes returned valid final MP4 files with pipeline `narration-avatar-final` on A10 GPUs.
- Cloud Run staging: revision `betterpptx-mcp-staging-00074-zpn`, 100% traffic, `/health` status `ok`, credential secret mounted at `latest`.

## Component decisions

| Need | Frozen component | Status | Reason |
|---|---|---|---|
| Face detection/crop | OpenCV Zoo YuNet | Keep | MIT directory/model notice; smallest measured substitution regression |
| Natural head/eye motion | LivePortrait with YuNet adapter | Keep | MIT project; upstream itself instructs commercial users to replace InsightFace models |
| Audio lip sync | MuseTalk 1.5 | Keep | Upstream explicitly permits commercial use of code and trained model; its restricted test data is excluded |
| Face-part blend mask | MediaPipe Face Landmarker geometry | Keep | Apache-2.0; corrected jaw geometry preserves full lip movement |
| Detail enhancement | BetterPPTX-owned deterministic enhancer | Keep | No external restoration weights; reweights only detail already present |
| Person/background matte | SAM 2.1 small | Keep | Official code and released checkpoints are Apache-2.0; exact commit/checkpoint hash pinned |
| Encoding/composition | FFmpeg | Keep | Produces PowerPoint-safe MP4 and alpha-aware WebM master |

## Alternatives investigated

- Grounding DINO + SAM2: not used for mouth parsing. It adds a detector/prompt stage but still does not provide stable semantic upper/lower-lip classes. SAM2 alone is used where it is strong: final temporal person segmentation.
- YOLO11-Segment: rejected for this lane. A generic person silhouette does not solve face-part parsing, and the available AGPL/commercial-license choice adds an avoidable commercial dependency.
- BiSeNet retrained with Microsoft FaceSynthetics: rejected. The official FaceSynthetics repository limits the dataset to non-commercial research, so it is not a safe training source for this product.
- MediaPipe Face Mesh/Landmarker: selected after the coordinate and mask-region defects were fixed.
- YuNet + SFace: YuNet is selected. SFace is unnecessary because identity recognition/embedding is not required for cropping or lip sync.
- CodeFormer: retained only in the isolated commercial comparison lane; its NTU S-Lab license is not part of the frozen safe lane.
- Robust Video Matting: retained only in the isolated commercial comparison lane; its official repository is GPL-3.0.
- Real-ESRGAN/GFPGAN: excluded from the frozen lane, including `--face_enhance`. The owned deterministic enhancer removes the checkpoint/training-provenance dependency entirely.

## Observed cost

The 6.16-second fixture used approximately:

- LivePortrait: 16.72 A10 seconds.
- MuseTalk safe row: 64.09 A10 seconds.
- SAM2 matting: 31.92 A10 seconds.
- Owned enhancer: 52.2 CPU seconds in the current unoptimized local implementation.

At Modal's current listed A10 rate of `$0.000306/sec`, the measured GPU floor is about `$0.0345` for this fixture. Including CPU/memory and normal serving overhead, use `$0.04-$0.06` per 6-second narration as the current realistic planning range, approximately `$0.40-$0.60` per generated minute before storage/egress. Warm containers, chunk batching, and moving the deterministic enhancer into the GPU/encoding worker should lower wall time and unit cost.

## Finalization plan

1. Owner performs the one-time visual acceptance in `outputs/visualizations/avatar-resale-safe-convergence.html` against the commercial reference.
2. Run a 25-image tolerance corpus covering dark/light hair, glasses, mild off-axis pose, varied lighting, and low-resolution inputs. Fail softly to a non-transparent MP4 when person matting confidence is inadequate; never alter the source identity to force acceptance.
3. Run concurrency, retry/idempotency, rotation, and cancellation tests; record per-stage GPU seconds and final cost per generated minute.
4. Promote beyond staging after the one-time visual acceptance and operational tests. No new licensing decision is required unless a frozen component, revision, checkpoint, or restoration model changes.

## Frozen artifacts

- Freeze manifest: `outputs/commercial-eval/resale-safe-integrated-final-v12/resale-safe-freeze.json`
- Comparison tracker: `outputs/visualizations/avatar-resale-safe-convergence.html`
- PowerPoint narration sample: `outputs/commercial-eval/pptx-natural-avatar/betterpptx-resale-safe-avatar-natural-narration.pptx`
- PowerPoint MP4: `outputs/commercial-eval/resale-safe-integrated-final-v12/resale-safe-sam2-powerpoint-preview.mp4`
- Transparent master: `outputs/commercial-eval/resale-safe-integrated-final-v12/resale-safe-sam2-alpha.webm`
- Dual-account canary: `outputs/private-avatar-worker-canary-all.json`
