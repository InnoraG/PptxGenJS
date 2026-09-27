# BetterPPTX avatar commercial-license request packet

Date: 2026-07-20  
Scope: PowerPoint narration talking-head video generation  
Deployment: private server-side inference; no redistribution of model weights

## Requested commercial rights

### 1. InsightFace pretrained detection/alignment models

Contact: `contact@insightface.ai`

Requested grant:

- worldwide commercial SaaS inference;
- processing of customer-supplied, expressly consented portrait images;
- server-side use inside LivePortrait preprocessing;
- redundant deployment across private GPU workers;
- permission to cache the licensed model weights in private container images;
- no model-weight redistribution, sublicensing, face recognition, face swapping,
  biometric identification, or public model download;
- generated talking-head MP4 may be embedded in and resold with customer PPTX
  presentations.

Technical identifiers:

- LivePortrait source commit: `9b294b3d0536135442ea73cb01e6cb3ca7029dd3`
- LivePortrait model revision: `82a4fa6735ca58432b6ce39301b4b9ee066dea47`
- evaluation function: face detection/alignment only

Required commercial response:

- exact licensed model files and hashes;
- permitted territories, volume, term, and deployment accounts;
- output ownership and resale rights;
- data-processing/retention restrictions;
- attribution and audit obligations;
- price, renewal, termination, and model-update rights.

### 2. MuseTalk BiSeNet face-parser weight / CelebAMask-HQ-derived rights

Rights holders must confirm commercial rights for the specific
`face-parse-bisent/79999_iter.pth` weight and its CelebAMask-HQ-derived training
lineage. The public CelebAMask-HQ terms currently restrict the dataset,
software, and derived data to non-commercial research/education.

Requested grant:

- worldwide commercial SaaS inference for mouth/lip segmentation and blending;
- processing of expressly consented customer portraits;
- private server-side caching of the exact licensed weight;
- no training-data or weight redistribution;
- generated talking-head MP4 may be embedded in and resold with customer PPTX
  presentations.

Technical identifiers:

- MuseTalk source commit: `0a89dec45a0192b824e3cf4daf96c239440c5ed8`
- MuseTalk model revision: `3ef28bc5cff08c90ad8178a25f1b570cd800170f`
- evaluation parser weight: official MuseTalk download named
  `face-parse-bisent/79999_iter.pth`
- function: lip, mouth, jaw and cheek segmentation for the final compositor

If the rights holders cannot grant complete commercial rights, this weight must
remain excluded. The replacement options are a commissioned parser trained on
commercially licensed/owned data or a contracted avatar API.

### 3. CodeFormer restoration code and pretrained assets

CodeFormer's official S-Lab License 1.0 grants research/non-commercial use and
requires contacting the contributors for commercial use. The requested grant
must cover the code plus the exact restoration, RetinaFace detection, and
ParseNet assets used by the isolated enhancement worker.

Requested grant:

- private commercial SaaS restoration of consented avatar frames;
- generated video resale inside customer PowerPoint presentations;
- redundant private GPU deployment and caching in immutable images;
- no checkpoint redistribution or public model download;
- permission to process customer portraits without face-recognition or
  biometric-identification use.

Technical identifiers:

- CodeFormer source commit: `b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b`
- `codeformer.pth` SHA-256:
  `1009e537e0c2a07d4cabce6355f53cb66767cd4b4297ec7a4a64ca4b8a5684b7`
- RetinaFace ResNet50 SHA-256:
  `6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d`
- ParseNet SHA-256:
  `3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2`
- selected fidelity weight: `0.95`

### 4. Robust Video Matting code and pretrained checkpoint

RVM is released under GPL-3.0 and its official training documentation records
multiple training sources, including separately acquired matting datasets and
crawled Google/Flickr backgrounds. Commercial deployment therefore requires a
documented GPL architecture decision and written clearance for the exact
pretrained checkpoint/training lineage, or replacement with a checkpoint trained
only on commercially controlled data.

Technical identifiers:

- RVM source commit: `53d74c6826735f01f4406b5ca9075eee27bec094`
- selected `rvm_resnet50.pth` SHA-256:
  `c191a807251164c073dce5fa408e7a816070d539b882b2a3150330a9fec112ce`
- evaluated `rvm_mobilenetv3.pth` SHA-256:
  `3c7c1d92033f7c38d6577c481d13a195d7d80a159b960f4f3119ac7b534cf4f8`
- function: temporally coherent foreground and alpha estimation after facial
  restoration

Required response/decision:

- confirm commercial rights for the exact ResNet50 checkpoint and its training
  lineage;
- approve the server-side GPL compliance design;
- confirm generated alpha video ownership and resale rights;
- otherwise replace RVM with an owned/contracted commercial matting model.

## Already cleared component

MuseTalk's official repository states that its code is MIT and its trained
model may be used commercially. No separate MuseTalk contract is requested for
those two assets; its transitive components remain governed by their own terms.

## Technical evidence

- isolated evaluation app: `betterpptx-avatar-commercial-eval`
- isolated enhancement app: `betterpptx-avatar-commercial-enhancement-eval`
- no HTTP endpoint or product route
- same consented image/audio comparison:
  `betterpptx-mcp/outputs/visualizations/avatar-commercial-eval-comparison.html`
- frozen candidate: low/pose-only LivePortrait, MuseTalk jaw parser,
  `bbox_shift=0`
- result: material mouth-quality improvement over the resale-safe MediaPipe
  compositor, with steadier eyes than upstream balanced motion
- enhancement comparison:
  `betterpptx-mcp/outputs/visualizations/avatar-commercial-enhancement-comparison.html`
- selected enhancement: CodeFormer `0.95` + RVM ResNet50 + FFmpeg direct
  foreground/alpha merge
- delivery split: VP9 WebM alpha master plus precomposited H.264/AAC MP4 for
  native PowerPoint playback

## Non-negotiable production condition

No restricted weight or evaluation output enters the BetterPPTX customer path
until written rights cover the exact models, SaaS inference, customer inputs,
PPTX-embedded output resale, private redundant workers, and the intended
territories. After contracting, a new immutable production SBOM and license
gate must pass before routing is enabled.
