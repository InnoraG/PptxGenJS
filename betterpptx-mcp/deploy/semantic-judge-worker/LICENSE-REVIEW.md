# Semantic judge worker — dependency and license review

Status: **research contract only / deployment blocked**  
Reviewed: 2026-07-17  
Scope: the pinned Qwen3-VL worker image, before any Modal build or model download.

## Execution boundary

This worker is permitted only as a private Modal-hosted component. Calling a
third-party AI API (including Claude, GPT, or any other externally hosted model)
is forbidden for this goal. The public product surface remains the MCP client
and BetterPPTX tools; it must never proxy or expose an external AI provider.
Customer images are not sent to this worker. The current canaries use only
owned synthetic fixtures.

## Evidence captured without installation

`resolved-dependencies-dry-run.json` was generated from a Python 3.12 binary-only
`pip --dry-run --report` resolution plus PyPI JSON metadata. It resolved 49 package
records. No packages were installed, no model weights were downloaded, and no image
was submitted to a worker.

The Windows dry-run's legacy `license` field is incomplete for some packages, but the
Linux-targeted report also carries PEP 639 `License-Expression` metadata. The corrected
offline inventory recognizes all 66 Linux records as having explicit license evidence
(36 through `license_expression`, the remainder through legacy fields/classifiers), with
zero unresolved license records. This removes a parser false positive; it is not by
itself permission to deploy. Exact wheel license files, notices, CUDA/NVIDIA terms and
the hosted-service distribution boundary still require review.

A second dry-run now targets CPython 3.12 Linux x86_64 wheel tags (`manylinux_2_17`
and `manylinux_2_28`). It records 66 wheel metadata entries in
`resolved-dependencies-linux-modal-dry-run.json`. Torch's metadata declares 15
conditional Linux CUDA/NVIDIA dependencies; those records are still blocked pending
an exact in-image Modal resolution and notice/EULA review. No package was installed
and no model weights or image bytes were downloaded.
Evidence SHA-256:
`8e89a2f3d20797af231636636d420adea4e1db71129045400d34bf5736d9efc4`.

## Known risk classes

- Torch 2.8.0 resolves a Linux x86_64 NVIDIA CUDA 12.8 family (`nvidia-*` packages)
  and Triton when the Modal target is resolved. These require the same conservative
  CUDA/EULA boundary used by the image-edit worker.
- `certifi` and `tqdm` are MPL-2.0/notice-bearing records in the dry-run profile.
- PEP 639 license expressions must be read alongside legacy metadata. The current
  frozen Linux report includes expressions such as MIT-CMU, MIT and 0BSD; exact wheel
  license files and source notices must still be retained before approval.
- The dry-run used Windows cp312 compatibility selection. A separate Linux GPU
  resolution is mandatory because platform markers change the CUDA and wheel set.

## Distribution boundary

The intended product remains PPTX-only. Customers receive generated raster pixels in
the PPTX, never the Qwen weights, worker image, Python runtime, CUDA libraries, or
source. This boundary does not waive the requirement to audit a hosted runtime before
production use.

## Required unblock evidence

1. Rebuild the exact Linux Modal image with hashes and export a complete 49+ record
   inventory, including wheel/source license files and notices.
2. Resolve and review all NVIDIA/CUDA/Triton terms and any non-OSI or missing metadata.
3. Confirm the Qwen3-VL model revision and processor files against the official model card
   and license; preserve notices internally.
4. Obtain owner/legal approval for the private hosted-service boundary.
5. Run a private synthetic judge canary, peak-VRAM/latency/cost/failure metrology, then
   blind human calibration before enabling auto-accept.

Until all five items are green, `SEMANTIC_JUDGE_DEPLOYMENT_APPROVED` must remain unset
and the worker must not load.
