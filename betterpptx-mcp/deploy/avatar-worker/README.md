# BetterPPTX Avatar Worker Deployment

Read
[`../../docs/avatar-generation-architecture.md`](../../docs/avatar-generation-architecture.md)
first for the complete MCP-to-worker topology, HTTP contract, Modal-compatible
wiring notes, cache/billing rules, and smoke-test ladder.

BetterPPTX keeps the Node MCP server separate from heavy avatar model stacks.
The MCP container owns PowerPoint authoring, narration audio resolution, ffmpeg
normalization, cache, billing gates, and MP4 insertion. A private worker
container owns model-backed image plus audio to talking-head MP4 generation.

## Modes

- `test-static`: packaging MVP. Loops the default avatar PNG over WAV with
  ffmpeg. This proves MP4, poster, timing, captions, and PowerPoint validation.
- `sadtalker`: model MVP. Configure the private worker or CLI env only after
  license/model review. Enhancers are off by default.
- `musetalk`: product track. Configure the HTTP worker URL and token through
  private deployment secrets.
- `liveportrait-musetalk`: advanced track. Use only after dependency and model
  license review.

## Container Workflow

1. Build the BetterPPTX service image from the repository root:

   ```bash
   docker build -f betterpptx-mcp/deploy/Dockerfile -t betterpptx-mcp:avatar .
   ```

2. Copy `betterpptx-mcp/deploy/avatar.env.example` to a private env file and
   set public origin, billing, cache, and worker values.

3. Packaging-only MVP:

   ```bash
   docker compose -f betterpptx-mcp/deploy/avatar-compose.yml --env-file betterpptx-mcp/deploy/avatar.env up --build betterpptx-mcp
   ```

4. Model-backed MuseTalk worker:

   ```bash
   docker compose -f betterpptx-mcp/deploy/avatar-compose.yml --env-file betterpptx-mcp/deploy/avatar.env --profile musetalk up --build
   ```

The placeholder worker images in `avatar-compose.yml` must be replaced with
private images that include reviewed model code, approved weights, and the
expected HTTP route. Do not bundle unreviewed checkpoints in the public MCP
image.

## Worker Contract

The HTTP worker should accept `multipart/form-data`:

- `image`: portrait PNG/JPEG
- `audio`: WAV/M4A/MP3 narration
- `quality`: `fast`, `default`, or `quality`
- `mode`: internal worker mode
- `durationMs`: optional expected duration

It should return either:

- `video/mp4` bytes directly, or
- JSON with `videoBase64`, `mp4Base64`, or `videoDataUri`.

The MCP service normalizes every returned video through:

```bash
ffmpeg -i avatar_raw.mp4 \
  -c:v libx264 -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  -movflags +faststart \
  avatar_powerpoint.mp4
```

`ffprobe` is mandatory for render validation. If ffmpeg, ffprobe, or the worker
is missing, public tools return generic avatar availability errors and do not
leak binary paths, command lines, local files, stderr, model names, or worker
internals.

## Operational Rules

- Avatar rendering uses its own queue via `BETTERPPTX_AVATAR_MAX_CONCURRENCY`.
- Public users should call `betterpptx.avatar.render_job`, poll
  `betterpptx.avatar.job_status`, then call `betterpptx.avatar.attach_result`.
- Inline render is for `test-static` and short maintainer-local smokes.
- Uploaded person images require `consentAffirmed: true`; public results expose
  only opaque handles and generic status.
- Cache directories must have explicit TTL and disk budget. Cache hits release
  the render reservation instead of charging again.
