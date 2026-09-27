# Image edit worker — hosted-service license review

Status: **research-approved / production-blocked**  
Reviewed: 2026-07-17  
Scope: the exact private Modal image described by `dependency-lock.json` and
`resolved-dependencies.json`.

This is an engineering compliance record, not legal advice or final legal approval.

## Product distribution boundary

- Customers receive a generated PPTX containing raster output pixels.
- Customers do **not** receive the worker image, Python packages, CUDA libraries,
  model weights, source tree, raw reference images, or a model/runtime download.
- The worker remains a private, scale-to-zero hosted service. Public tools expose
  generic image capabilities and opaque asset handles, not provider/model/runtime
  identities.
- Publishing the worker image, weights, or CUDA/Python runtime is a different
  distribution event and is blocked until a separate review approves it.

The PPTX-only boundary is material: it avoids bundling the proprietary GPU runtime
or model implementation into the sold artifact. It does not clear rights in a
particular generated image, such as third-party trademarks, publicity rights, or
unlawful content.

## Exact inventory result

| Check | Result |
|---|---:|
| Resolved distribution records | 105 |
| Python-selected distributions | 101 |
| Records without any license metadata | 0 |
| Classifier-only records | 9 |
| NVIDIA/proprietary-marked CUDA records | 14 |
| MPL-declared records | 3 records / 2 selected package names |

The classifier-only records are all identified by an OSI-approved classifier:
`annotated-types`, the Modal-shadow `idna`, `Jinja2`, `markdown-it-py`, `mdurl`,
`safetensors`, `tokenizers`, `triton`, and `wheel`.

The 14 NVIDIA/CUDA records are not relabelled as open source. They are permitted
only inside the private hosted-runtime boundary pending owner/legal approval.
`nvidia-nccl-cu12` and `nvidia-nvtx-cu12` have metadata that conflicts with their
`Other/Proprietary` classifiers, so the conservative proprietary classification
wins.

MPL records (`certifi` twice because Modal shadows one version, and `tqdm`) require
the applicable notices/source-form obligations to be preserved if those components
are ever distributed. They are not present in the PPTX output.

## Primary-source basis

- FLUX.2 Klein 4B model card: Apache-2.0, commercial use, generation/editing and
  multi-reference: <https://huggingface.co/black-forest-labs/FLUX.2-klein-4B>
- Exact Diffusers source commit license: Apache-2.0:
  <https://github.com/huggingface/diffusers/blob/55ae46db619223625c2ab5debcbb5131f1094129/LICENSE>
- Current CUDA 13.0 EULA (last updated 2025-01-07): install/use grant,
  distribution requirements and attachment of redistributable components:
  <https://docs.nvidia.com/cuda/archive/13.0.1/eula/index.html>
- NVIDIA's current CUDA best-practices guide confirms that the EULA permits
  redistribution of many CUDA libraries subject to its conditions:
  <https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/#cuda-toolkit-library-redistribution>

## Fail-closed controls

1. Keep the service private and PPTX-only; no raw GLB/FBX, runtime, container, or
   weight export.
2. Keep the exact model and source revisions pinned; the 9B/dev/non-commercial
   variants remain forbidden.
3. Regenerate the resolved inventory after every dependency, base-image, Python,
   Torch, CUDA, Modal, model, or source revision change.
4. Fail release if any package has no license metadata, adds a non-commercial
   restriction, adds an unreviewed proprietary component, or changes the known
   MPL/proprietary sets.
5. Preserve third-party notices internally now and prepare a product notice bundle
   before launch even though the sold PPTX does not contain the runtime.
6. Require the owner, acting for the production entity, to accept the applicable
   platform and NVIDIA terms and obtain legal review before production activation.
7. Keep customer/reference pixels in memory only, do not train on them, and apply
   the separate safety/identity/content policy before production.

## OCR adapter boundary (IMG4)

The deterministic image-quality layer now has a local, hash-pinned OCR path for
research and owned-synthetic QA. The exact direct dependency is `tesseract.js`
5.1.1 (Apache-2.0); its resolved package tree is captured by the local npm lock
file and `npm audit` reports no vulnerabilities. English traineddata is stored
locally as `assets/ocr/eng.traineddata.gz` (SHA-256
`ED350F3752F81EE8F38769EDC14D92D997DABABE23B565C59879372CC46A2468`), sourced
from the tesseract-ocr tessdata distribution and treated as Apache-2.0. The
adapter allowlists `eng`, requires the local traineddata file, applies a minimum
confidence/readable-token policy, and retains only text length/digests in corpus
reports. It never sends pixels to an external AI API or persists OCR text.

The corpus verifier scanned 28/28 owned-synthetic generated rasters with no
readable tokens. A configured native Tesseract CLI remains supported for owners
who prefer it; missing binaries, traineddata, timeouts and malformed output stay
fail-closed. The adapter writes only bounded temporary inputs, deletes them after
execution, and never persists OCR output or customer pixels. Any future language
data or runtime change becomes a new inventory record and must pass the same
license/notice review before use in a production worker.

## Decision

Research and owned-synthetic canaries may continue on the private Modal worker.
Production remains blocked. The proprietary CUDA runtime is an accepted internal
research dependency under the hosted-service boundary, not an approved component
for customer redistribution.
