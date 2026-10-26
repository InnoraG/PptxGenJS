# Optional private speech deployment

This is an opt-in deployment candidate, not a deployed release. Piper and its pinned
51-model catalog remain unchanged and are the default workflow selection. The new
service is separate (`betterpptx-narration-chatterbox`), so selecting `piper-http`
on the next approved release restores the existing routing and catalog.

## Immutable bundle and image

`model-source.json` pins official `ResembleAI/chatterbox` multilingual revision
`5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`, MIT, with exact file sizes and SHA256s.
It selects multilingual V3 explicitly and identifies approximately 3.21 GB of model files. No weights are committed,
copied into build contexts, downloaded at startup, or bundled in the image.

Provision a dedicated, owner-controlled bucket before selecting this engine:

```
models/conds.pt
models/grapheme_mtl_merged_expanded_v1.json
models/s3gen.pt
models/t3_mtl23ls_v3.safetensors
models/ve.pt
references/female-ljspeech.wav
references/male-thorsten.wav
```

Use the existing approved local cache to upload only these named objects once;
do not upload a source checkout, dataset archive or model-cache history. Verify
the local model files without copying them by setting `CHATTERBOX_MODEL_CACHE`
when invoking `prepare-build-context.mjs <new-temporary-context>`. The context
contains only the runtime, Dockerfile and small provisioning/verification/catalog files and
is capped at 256 KiB. `verify-bundle.py --model-root ... --reference-root ...`
also checks the full provisioned files in place. Container startup first checks
sizes and the catalog's aggregate identity against the pinned source hashes;
the worker then hashes actual model bytes against that aggregate before loading.
This avoids a redundant full model read over the bucket mount.

The multilingual tokenizer additionally needs a Cangjie mapping and the PKUSEG
segmenter model, even for non-Chinese startup. The first real container check
exposed an upstream startup download despite Hugging Face offline flags. The
Docker build now explicitly provisions these two resources with pinned SHA256
checks: `Cangjie5_TC.json` (1,920,163 bytes) from the model revision above and
`spacy_ontonotes.zip` (34,567,143 bytes) from the official spacy-pkuseg v0.0.26
release. The upstream MIT notice is retained with that segmenter resource.
`provision-tokenizers.py` records the hashes and immutable source URLs.

Five zero-copy symlinks under `/app/model-links` point to the read-only speech
weights. The Cangjie Hugging Face cache layout is baked beside those links, and
`PKUSEG_HOME` points to the baked segmenter cache. No additional objects need to
be uploaded to the model bucket. The container is tested with networking
disabled to detect unexpected startup downloads.

The seed catalog has eight language/voice choices using two human recordings:
Linda Johnson, LJSpeech LJ001-0001, public domain, and Thorsten Müller,
TV-44kHz-Full neutral row 1, CC0. Provenance URLs and reference hashes are
embedded in `runtime-manifest.json`. This fixture catalog does not establish
native accent quality: local ASR matched English and French, while Arabic and
Swahili need listening review.

The official image selects Python 3.11.14, CPU Torch/Torchaudio 2.6.0,
`CHATTERBOX_MODEL_VARIANT=multilingual`, and
`CHATTERBOX_MULTILINGUAL_VERSION=v3`. Both model identity files explicitly
record V3. `verify-bundle.py` rejects a V2 catalog, a mismatched selected T3
filename, or disagreement about the runtime source commit.

PyPI `chatterbox-tts==0.1.7` bootstraps the dependency set; Transformers 5.2.0
and Gradio 6.8.0 are then pinned to match the selected source metadata.
The PyPI package is not the final inference source. `source-identity.json` pins upstream commit
`5de7a54aa4e5e2baadb0182dde554908b48b85c2` and archive SHA256
`bb7363a76c0c0432a0305681fe2e533bbfb0f10fcf7b98d75a439d9a909f1576`.
`install-source.py` streams that approximately 1.48 MB source ZIP into one bounded
temporary file, verifies its exact size, archive digest and multilingual module
digest, then installs it with `--no-deps --force-reinstall`. It verifies the
installed module bytes and explicit `t3_model` selector before the build can
continue. No source checkout or model history is copied. `resemble-perth==1.0.1`
is pinned independently; the source metadata's moving Perth master dependency
is never resolved by the source installation step.

The selected V3 checkpoint is `t3_mtl23ls_v3.safetensors`, SHA256
`5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953`.
The catalog aggregate identity is
`sha256:4afe36eeb538555c62c8b768f312a89580a1ef8f764dc7ef87487f8289e25875`.
The worker explicitly calls `from_local(..., t3_model='v3')`; missing selector
support or V3 loading failure stops startup and never retries V2. Historical
V2 container measurements do not qualify this V3 recipe. Current real inference
and application-delivery acceptance must be recorded separately against the
actual image/source/model identities; focused deployment tests do not build or
certify an image.

The starting capacity profile remains 2 CPU, 8 GiB, concurrency 1, min 0, max 2,
and 900-second requests. It is a candidate configuration, not a throughput or
cold-start guarantee. The MCP voice catalog retains the same licensed reference
fixtures and language/gender descriptors. Native Arabic/Swahili fluency and
speaker similarity still require listening review.

Offline contract checks (no weights or speech execution):

```powershell
node --test betterpptx-mcp/deploy/narration/chatterbox/deployment.test.mjs
python -m unittest discover -s betterpptx-mcp/deploy/narration/chatterbox -p test_v3_deployment.py
python -m unittest discover -s deploy/docker -p test_chatterbox_http_runtime.py
```

## Explicit release inputs and IAM

The existing manual release workflow adds typed `narration_provider` selection,
defaulting to `piper-http`. Select `chatterbox-http` and supply
`speech_model_bucket` to deploy this separate private service and route the
gateway and task worker to it. Both clients use service identity authentication.
An empty `private_voice_bucket` leaves personal voice creation disabled.

The owner must provision buckets and IAM separately. The deployment validates,
but does not grant, bucket permissions:

- Model bundle bucket: uniform bucket-level access, public access prevention
  `enforced`, no public members, and an unconditional bucket binding granting the
  narration service identity `roles/storage.objectViewer` (or objectAdmin).
- Optional personal voice bucket: a different dedicated bucket with the same
  privacy controls, no retention policy, and an unconditional bucket binding for
  the existing gateway/task-worker identity with `roles/storage.objectUser`
  (or objectAdmin). Do not grant the narration identity access to this bucket.

The narrow explicit bindings are intentionally checked even if wider inherited
project permissions might suffice. The owner also needs to allow the release
identity to read bucket metadata/IAM for validation. The deployment script does
not create buckets, copy personal recordings, or change storage IAM.

## Personal voice persistence pilot

When both `chatterbox-http` and `private_voice_bucket` are selected, the gateway
and Cloud Tasks worker mount the same private bucket at `/private-voices`, with
metadata TTL and stat/type cache capacities set to zero. The application root is
`BETTERPPTX_CUSTOM_VOICE_ROOT=/private-voices/voice-profiles`. Application owner
authorization scopes each immutable profile; bucket access is reserved to the
service identity, not end users. Public results must expose opaque voice IDs,
never bucket names, profile paths or samples.

The speech runtime uses `/tmp/private-reference-cache` only as a disposable
inference cache: the approved sample is rehydrated from the owner profile for
each request. That directory is not the durable source of truth. The model bundle
is mounted read-only at `/speech-bundle` and contains no personal recordings.

This pilot requires the companion application change that stores each private
profile and its sample together in one immutable object. It must not be enabled
with the earlier two-file/shared-sample implementation. FUSE does not provide
distributed locking; simultaneous writes to the same object can return ESTALE,
and callers may need to retry. The 16-profile limit is not a strict distributed
quota. Validate cross-owner denial, create/list/synthesis/delete across separate
gateway/worker instances, cold restarts, and concurrent same-profile operations
against the real mounted bucket before production acceptance. No such cloud
acceptance is claimed by local filesystem tests.

On rollback, select `piper-http` and leave both bucket inputs empty. Gateway and
worker volumes/env are reset by the existing release commands, personal-voice
creation becomes unavailable, and stored private profiles remain in the bucket.
The separate private speech service is retained for deliberate owner cleanup.

References: [Cloud Run volume configuration](https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts),
[FUSE consistency and close/flush limitations](https://docs.cloud.google.com/storage/docs/cloud-storage-fuse/overview),
[LJSpeech rights](https://keithito.com/LJ-Speech-Dataset/),
[Thorsten recording rights](https://thorsten-voice.de/en/about/recordings/).
