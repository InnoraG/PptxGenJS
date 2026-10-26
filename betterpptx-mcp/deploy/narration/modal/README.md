The private narration service uses a Cloud Run IAM HTTP bridge and an authenticated Modal RPC worker. The worker has no web endpoint. Its model loads once in `@modal.enter` and stays resident across separate RPC requests, with one serialized input, one T4, two physical CPU cores, 16 GiB RAM, no minimum containers, and a 60-second idle window. Existing Modal apps and the desktop's active profile are independent.

The HTTP contract is private and deliberately small:

| Route | Behavior |
|---|---|
| `GET /health` | Generic bridge readiness; does not wake a GPU. |
| `GET /voices` | Approved default catalog; excludes personal registrations and reference paths. |
| `POST /voices/register` | Existing bounded, consent-attested sample registration contract. |
| `POST /synthesize` | V3 text, voice and optional language; at most 1,000 characters. |
| `POST /fallback/synthesize` | Explicit selection of a shipped approved Piper ID; at most 4,000 characters, bounded speaker and finite numeric controls. Does not call the GPU worker. |

V3 is selected explicitly. Startup verifies the installed upstream source hash, the complete pinned model aggregate and the actual V3 checkpoint bytes. It does not fall back to V2. `modal_app.py` requires an approved immutable `BETTERPPTX_NARRATION_BASE_IMAGE_ID`; current image/source provenance is recorded in the maintainer deployment evidence. The base already contains pinned weights, tokenizer assets and approved reference recordings, so deploying an application layer does not download another model. Keep that base image available for future deployments; rebuilding it requires the canonical source/model identities and approved reference assets, not an unpinned upstream download.

Apply concurrency wrapping in `modal_app.py`, not on the separately imported class declaration: the latter exports a partial wrapper that the remote class importer cannot hydrate. Do not use the deprecated `app.cls(max_inputs=1)` setting, which selects single-use containers rather than persistent serialized input handling.

The GPU runtime applies the shared speech-level policy before PCM encoding. Piper output is converted to mono PCM16 at 24 kHz and leveled with the same helper. Original reference samples are unchanged. The bridge admits four requests and runs at most one memory-intensive leveling operation at a time; fallback audio is capped at 64 MiB and ten minutes. Use 4 GiB bridge memory for the explicit long-text route. Primary RPC waits up to 720 seconds, leaving time for an approved fallback inside the 900-second HTTP deadline. RPC execution has its own 900-second limit. The RPC design avoids the [150-second HTTP redirect behavior of Modal web functions](https://modal.com/docs/guide/webhook-timeouts).

Automatic fallback is restricted to `fallback-map.json`. It runs only after primary unavailability or timeout, never after an invalid-input response. A source voice used in another language has no automatic substitution. Arabic, Swahili and personal voices have no approved automatic mapping. The four initial mappings preserve language and declared gender; the French MLS selections require CC-BY-4.0 attribution, which the main provider obtains from the shipped actual-voice metadata.

Successful audio responses identify the actual selection with `X-Speech-Voice-Id` and, when selected, `X-Speech-Speaker`. Automatic alternates set `X-Speech-Fallback: 1`. Explicit legacy selection sets `X-Speech-Fallback: 0` and `X-Speech-Selection: explicit`. Primary V3 audio sets `X-Speech-Fallback: 0`. The bridge never returns model paths, implementation diagnostics or credentials.

The bridge reads `BETTERPPTX_SPEECH_WORKER_CREDENTIALS` from Secret Manager secret `betterpptx-speech-worker-credentials`, using JSON keys `token_id` and `token_secret`. Owner control is Mission Control's `speech_worker_credentials` entry. Rotate at Modal, update this owner-controlled secret, then deploy a new bridge revision. Never put credentials in source, command arguments, build contexts, output files or logs. The narration service identity needs secret access and private Piper invocation; the public runtime identity is the bridge invoker. Anonymous invocation must fail.

Deploy the RPC class with an explicit child-process profile and UTF-8 output, preserving the desktop's global profile:

```powershell
$env:MODAL_PROFILE = 'betterpptx-fluxworkerai1'
$env:PYTHONUTF8 = '1'
$env:BETTERPPTX_NARRATION_BASE_IMAGE_ID = '<approved immutable image ID>'
python -m modal deploy betterpptx-mcp/deploy/narration/modal/modal_app.py
```

`prepare-build-context.mjs` creates a new context outside the checkout containing only seven small bridge/configuration files. It copies no weights, recordings or credentials. `cloudbuild.bridge.yaml` builds that context. `deploy-private-runtime.sh` selects the immutable image, updates only its required environment/secrets, enforces IAM, checks anonymous rejection and exports the main runtime configuration. It does not deploy or stop a Modal app. Private personal-voice objects stay in the gateway/task-worker storage layer and are rehydrated into the GPU worker's ephemeral reference cache.

Run `python betterpptx-mcp/deploy/narration/modal/test_bridge.py` with FastAPI, HTTPX, NumPy, SciPy, pyloudnorm and future installed. The eight focused checks cover input rejection, actual identity and speaker headers, approved-only fallback, IAM token construction, resampling/leveling, private-route refusal, timeout cancellation and queue admission. Maintainer-only `inspect_state` RPC can prove instance/counter continuity across separate HTTP requests; no HTTP route exposes it.

The presentation loudness policy is -20 LUFS integrated, with a peak ceiling below -1 dBTP; this is not a broadcast certification. Compliant primary bytes are preserved. Mission Control credential testing checks format only and explicitly does not certify live account authentication.

Submit every ordered segment in one get_voice_timing request with a stable idempotency key. GPU executions are serialized internally; the response returns all measured boundaries together. Reuse the immutable preparation and per-slide segment selections for compilation, previews and rebuilds, with no further speech synthesis. With BETTERPPTX_TTS_LEGACY_FALLBACK=1, all 51 approved legacy IDs remain available alongside the eight V3 defaults. The release workflow retains piper-http as a complete rollback selection.
