# BetterPPTX Flux Worker (self-hosted FLUX.1 [schnell] on Modal)

Self-hosted text→image generation on a **scale-to-zero L40S**. Native width/height (no cropping),
Apache-2.0 output (commercial, no attribution), $0 when idle.

## Account isolation (important)

This worker runs on a **dedicated Modal profile `betterpptx-flux` (workspace `innorag`)**, kept
**separate from the avatar worker** (`telcomgapp`). The avatar profile stays the active default;
**every command here passes `--profile betterpptx-flux`** so the two accounts never mix.

```
modal profile list          # telcomgapp (active, avatar)  +  betterpptx-flux (innorag, this)
```

## One-time setup

> Select the flux account with `MODAL_PROFILE=betterpptx-flux` (the `--profile` flag is only
> accepted by some subcommands like `deploy`/`token`; `secret create` etc. read the env var).

1. **Create the shared endpoint token** as a Modal Secret (the Node provider sends this token in
   each request body; the worker rejects mismatches with 401):

   ```bash
   MODAL_PROFILE=betterpptx-flux modal secret create betterpptx-flux-token FLUX_ENDPOINT_TOKEN=<random-hex>
   ```

2. **HF token for the gated weights.** FLUX.1-schnell is **gated on Hugging Face** (Apache-2.0
   license, but download requires accepting access + auth). Accept once at
   <https://huggingface.co/black-forest-labs/FLUX.1-schnell>, create a **read** token at
   <https://huggingface.co/settings/tokens>, then store it as a Modal Secret:

   ```bash
   MODAL_PROFILE=betterpptx-flux modal secret create huggingface-token HF_TOKEN=<hf_read_token>
   ```

   (The gate is download-access only; generated output remains Apache-2.0 / commercial / no-attribution.)

3. **Deploy** with an **OBFUSCATED endpoint label** so the URL doesn't reveal it's a flux/image
   worker (black-box doctrine — mirrors the avatar worker's `e3b56934`). Set `FLUX_ENDPOINT_LABEL`
   to a per-endpoint opaque token and **reuse the SAME label on every redeploy** to keep the URL
   stable. (First build downloads torch/diffusers ~minutes; first generation downloads the ~24GB
   schnell weights to a persistent Volume, then future cold starts read from it.)

   ```powershell
   $env:MODAL_PROFILE="betterpptx-flux"; $env:FLUX_ENDPOINT_LABEL="a7f2c918"
   py -m modal deploy betterpptx-mcp/deploy/flux-worker/flux_app.py
   ```

   → `https://<workspace>--<label>.modal.run`, e.g. `https://innorag--a7f2c918.modal.run`.

   **Deployed endpoints (keep these labels stable):**

   | Modal profile / workspace | label | URL |
   | --- | --- | --- |
   | `betterpptx-flux` (innorag) | `a7f2c918` | `https://innorag--a7f2c918.modal.run` |
   | `betterpptx-fluxworkerai1` | `b3e8d504` | `https://betterpptx-fluxworkerai1--b3e8d504.modal.run` |

   Note: the `<workspace>--` prefix is fixed by the account name and can only be changed via a
   custom domain (CNAME) — `betterpptx-fluxworkerai1--` still hints "flux"; rename the workspace or
   add a custom domain if that matters.

3. **Wire the Node provider** (in `.mcp.json` env, alongside the other keys):

   ```json
   "BETTERPPTX_MODAL_FLUX_URL":   "<the printed *.modal.run URL>",
   "BETTERPPTX_MODAL_FLUX_TOKEN": "<the same FLUX_ENDPOINT_TOKEN>"
   ```

   Restart the MCP server. When configured, `provider:"any"` prefers Modal (owned GPU, native aspect).

## HTTP contract

`POST` JSON → JSON:

```
{ "token": "<shared>", "prompt": "...", "width": 1280, "height": 768, "steps": 4, "seed": 123 }
→ { "image": "<base64 png>", "contentType": "image/png", "width": 1280, "height": 768, "model": "...", "seconds": 3.1 }
```

`aspect: "square"|"landscape"|"portrait"` is accepted as a shortcut for width/height. Dimensions
are clamped to [256, 1536] and rounded to a multiple of 16 (Flux requirement).

## Cost / behavior

- **Scale-to-zero:** `min_containers=0`, `scaledown_window=300s` → $0 idle.
- **Warm:** ~2–4s/image on L40S. **Cold:** weight reload from Volume ~20–40s.
- L40S ≈ $1.95/hr → ~$0.0015/image warm. No per-image vendor fee (vs Cloudflare).
- schnell is **guidance-distilled** (`guidance_scale=0.0`) and fast at 4 steps.

## Ops

```bash
modal app list   --profile betterpptx-flux           # see the deployed app
modal app logs betterpptx-flux --profile betterpptx-flux
modal app stop betterpptx-flux --profile betterpptx-flux   # tear down
```

Never bundle non-schnell (dev/pro) checkpoints — they are non-commercial. `MODEL_ID` is pinned.
