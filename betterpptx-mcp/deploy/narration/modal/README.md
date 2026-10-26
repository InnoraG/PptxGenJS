# Private speech worker and bridge

The primary is the explicitly pinned Multilingual **V3** checkpoint on a Modal T4. The Cloud Run bridge is IAM protected and invokes authenticated Modal RPC; the GPU worker has no HTTP endpoint. `@enter` loads and verifies the model once per container, and `max_inputs=1` serializes requests against that resident instance.

## Resource and identity contract

- T4, two physical CPU cores, 16 GiB host RAM; maximum one container, minimum zero, 60-second idle window, 900-second execution deadline.
- `modal_app.py` requires an approved immutable base image ID; the current owner deployment uses the independently verified V3 base in the dedicated speech account. It adds only the canonical runtime, loudness helper and worker module.
- V3 checkpoint SHA256: `5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953`. Source, supporting weights and recording digests are pinned in the sibling `chatterbox` manifests. The worker verifies the selector-capable loader and actual checkpoint bytes before serving audio.
- The bridge uses 2 vCPU / 2 GiB, minimum zero / maximum one, concurrency four, and a 900-second HTTP deadline. Primary RPC gets 720 seconds, leaving bounded time for fallback. Its seven-file build context includes no weights, recordings or credentials.
- GPU model downloads are disabled at inference time. Modal transport networking remains available for RPC media transfer.

## Routing and audio policy

Set the main MCP provider to `chatterbox-http`, its URL to the private bridge, and `BETTERPPTX_TTS_AUTH=cloud-run`. `BETTERPPTX_TTS_LEGACY_FALLBACK=1` preserves all 51 previously shipped approved Piper IDs and Piper-only language defaults; the four V3 showcase language defaults take priority. Explicit legacy selections go directly to the private Piper route, with their original speaker/settings and actual model/licence recorded.

Transient V3 failures may use only the four language/gender mappings in `fallback-map.json`. Arabic, Swahili and private personal voices have no approved automatic Piper substitute and fail clearly. Input errors never trigger automatic fallback. Alternative identities and attribution are verified against the shipped catalog, rather than accepted from arbitrary upstream headers.

All generated speech is leveled to the presentation policy of -20 LUFS integrated, with an oversampled peak ceiling below -1 dBTP. Primary float samples are leveled before PCM encoding. Piper audio is converted to mono PCM16 at 24 kHz and leveled by the same helper. Compliant primary bytes are preserved. This is a presentation loudness policy, not a claim of broadcast certification.

Submit the complete ordered narration to `betterpptx.narration.get_voice_timing` once with a stable idempotency key. Internal GPU executions are serialized, while the public response returns all measured segment boundaries together. Reuse its immutable preparation manifest and per-slide segment selections for compilation, previews and rebuilds; these stages must not synthesize speech again.

## Credentials and owner control

The bridge reads `BETTERPPTX_SPEECH_WORKER_CREDENTIALS` from Secret Manager `betterpptx-speech-worker-credentials`, as JSON containing `token_id` and `token_secret`. Use the dedicated speech account, outside avatar rotation. Never print the pair, put it in a build context, or activate another local Modal profile implicitly.

Private Mission Control exposes `speech_worker_credentials` with redacted fingerprint, source, active version, rotation time and dependencies. The authenticated owner can deliberately reveal, replace and format-test it. Create/revoke rotated credentials at Modal, update the stored pair through Mission Control, redeploy the bridge to activate the new version, verify RPC, then revoke the replaced pair. The format test explicitly does not claim runtime authentication proof. Public MCP/gateway identities receive no access to this account secret.

`deploy-private-runtime.sh` deploys the bridge and outputs the shared gateway/worker settings; the Modal worker is deployed separately under the explicitly selected account. The release workflow retains `piper-http` as a full rollback selection. Preserve the existing Piper service and its catalog during primary activation.

## Acceptance

Run `test_bridge.py`, `test_speech_loudness.py`, the existing runtime tests, and `test/narration-fallback-identity.test.mjs`. Real deployment acceptance must additionally demonstrate separate HTTP calls reusing one worker instance, concurrent calls completing serially, private reference isolation, controlled fallback with real Piper audio, exact measured loudness and PCM format, IAM denial without credentials, and one-batch preparation reuse through native PPTX delivery. Maintainer-only `inspect_state` RPC provides residency counters; the bridge never publishes that diagnostic route.
