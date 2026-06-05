# betterpptx-mcp — Go Public (claude.ai + chatgpt.com)

Expose the MCP server on the public internet over HTTPS so claude.ai and
chatgpt.com can use it **directly**, and so generated `.pptx` files are
**downloadable from the chat**.

```
 MCP engine
   └─ Streamable-HTTP server   127.0.0.1:3344   (server-http.mjs)
        ├─ /s/<secret>/mcp     ← MCP endpoint (POST/GET/DELETE)
        └─ /files/<token>/<name>.pptx   ← published downloads
   └─ stable HTTPS tunnel/domain  ──►  https://<host>   (public HTTPS)
```

## 1. Bring up the service

For persistent Claude/chatgpt connectors, use the deploy kit in
`betterpptx-mcp/deploy/` with Tailscale Funnel or a named Cloudflare tunnel. The
connector URL is:

```text
https://<stable-host>/s/<BETTERPPTX_URL_SECRET>/mcp
```

Do not save quick-tunnel handoff URLs as durable connector configuration:
ephemeral `trycloudflare.com` URLs go stale and mislead clients after the tunnel
exits.

For throwaway demos only, `node betterpptx-mcp/serve-public.mjs` can still launch a
temporary cloudflared quick tunnel and print the connector URL to the terminal.
Do not use that printed URL as durable configuration.

## 2. Add it as a connector — what to add on each client, and why

A remote MCP server is consumed over **Streamable HTTP**. The web apps take a
**URL** (auth = OAuth or none → use `path`/`open` mode). CLIs can send headers
(so they can also use Bearer).

| Client | What to add | Why |
|---|---|---|
| **claude.ai** (Pro/Max/Team/Ent) | Settings → Connectors → **Add custom connector** → paste the public MCP URL, Auth = *No authentication* | claude.ai custom connectors *are* remote MCP servers; URL-only dialog, no header field → needs `path`/`open` mode |
| **chatgpt.com** (Plus/Pro/Biz/Ent/Edu) | Settings → Connectors → **enable Developer mode** → add connector → paste MCP URL, Auth = *No authentication* | Developer mode is required to use **write** tools (not just the read-only `search`/`fetch` pair); URL-only → `path`/`open` mode |
| **Claude Code** (CLI) | `claude mcp add --transport http betterpptx-mcp <URL>` (`--header "Authorization: Bearer <token>"` if Bearer) | built-in MCP client speaks HTTP + can send headers |
| **Codex** (CLI/IDE) | `~/.codex/config.toml` → `[mcp_servers.betterpptx-mcp]` `command="npx"` `args=["-y","mcp-remote","<URL>"]` | Codex speaks **stdio** MCP only; `mcp-remote` bridges stdio ↔ remote HTTP |

There is **no npm package to publish** for the web apps — the "plugin" is the
remote connector URL itself. `mcp-remote` is the only helper, and only for Codex
(stdio→HTTP bridge).

## 3. File downloads (the key SaaS detail)

A deck saved by a remote server lives on the **server's** disk — a ChatGPT /
claude.ai user can't reach a local path. So the server publishes every saved file
and `deck.save` returns a public link:

```json
{ "filePath": "…server path…", "bytes": 14612,
  "downloadUrl": "https://<host>/files/<token>/<name>.pptx",
  "downloadName": "<name>.pptx" }
```

The model hands `downloadUrl` back in chat; the user clicks → browser downloads
the `.pptx` (`Content-Disposition: attachment`, correct PowerPoint MIME type).
Files sit behind an unguessable per-file token and are swept after 12h. No client
changes needed — works in ChatGPT, claude.ai, and any MCP host.

Config (set automatically by `serve-public.mjs`):
`BETTERPPTX_PUBLIC_BASE` (public origin) + `BETTERPPTX_DOWNLOAD_ROOT`
(served dir, default `outputs/public_files`).

## 4. Auth modes

| Mode | How | Web UIs | CLIs |
|---|---|---|---|
| `path` *(default)* | secret in URL `/s/<secret>/mcp` | ✅ | ✅ |
| `none` | open `/mcp` | ✅ | ✅ |
| `bearer` | `Authorization: Bearer <token>` | ❌ (no header field) | ✅ |

`path`/`none` are what make the web connectors work directly. Rotate the secret by
relaunching. For a real multi-tenant SaaS, add **OAuth 2.1 + Dynamic Client
Registration** (advertise `/.well-known/oauth-protected-resource`) so each user
authenticates — that's the production upgrade beyond this launch setup.

## 5. Capacity & load — disk vs memory (built in)

**Decision: disk is the artifact store; memory is only transient.** PowerPoint
generation (JSZip) assembles a file in RAM briefly, but the finished `.pptx` is
written to disk and **streamed** on download (`createReadStream`, O(1) RAM per
download regardless of file size). The rejected alternative — "keep the file in a
memory buffer until the user downloads it" — pins every pending file in RAM, so a
handful of concurrent large decks (your 12 MB 3D one ×N) exhausts memory and the
process hard-crashes. Disk is cheap, easy to cap, and a full disk fails *gracefully*
(refuse a save) where RAM does not (OOM kill).

The real memory hog is the **live deck registry** (the editable pptxgenjs graph +
raw package parts), not the saved files. Both are now bounded:

| Guard | What it does | Env (default) |
|---|---|---|
| **Deck LRU + TTL** | caps live decks; evicts least-recently-used and idle decks so abandoned web sessions can't grow memory forever | `BETTERPPTX_MAX_DECKS` (60), `BETTERPPTX_DECK_TTL_MS` (1800000) |
| **Heavy-op gate** | limits concurrent save / open_existing / transform / showcase (each a big transient allocation); excess queues, then returns a retriable `BUSY` instead of OOMing | `BETTERPPTX_MAX_CONCURRENCY` (4), `BETTERPPTX_MAX_QUEUE` (64) |
| **Write-once publish** | remote saves write straight into the served dir (no copy) — half the I/O and disk | (automatic when public) |
| **Disk budget** | evicts oldest published files before exceeding the cap → never fills the disk | `BETTERPPTX_DOWNLOAD_BUDGET_MB` (2048) |
| **TTL sweep** | deletes published files older than 12h; idle MCP sessions after 30m | (automatic) |
| **Body limit** | caps inbound JSON (base64 image args etc.) | `BETTERPPTX_JSON_LIMIT` (50mb) |

Tune for the box: a 1 vCPU / 1 GB instance → `MAX_DECKS=20 MAX_CONCURRENCY=2`;
a 4 vCPU / 8 GB → `MAX_DECKS=120 MAX_CONCURRENCY=6`. Watch live numbers at
**`GET /health`** → `{ engine: { decks, maxDecks, decksEvicted, rssMB, heapUsedMB,
concurrency:{active,queued,max} } }`. To scale past one box, run several instances
behind a load balancer with **sticky sessions** (MCP sessions + deck state are
per-process) and point the download root at shared storage (or an object store/CDN).

## 6. Stable URL + always-on service (deploy kit)

Everything is in `betterpptx-mcp/deploy/`:
```
deploy/
  production.env.example         # copy → production.env, edit (PUBLIC_BASE, secret, TUNNEL, limits)
  ecosystem.config.cjs           # pm2: server (+ cloudflared only when TUNNEL=cloudflared/quick)
  setup-tailscale-funnel.ps1     # NO-DOMAIN stable URL  ← recommended
  setup-cloudflare-tunnel.ps1    # stable URL if you own a domain on Cloudflare
  cloudflared-config.example.yml
  start.ps1 / stop.ps1           # pm2 start+save / delete
```
pm2 supervises the **node server** (crash-restart, `max_memory_restart`, boot via
pm2-installer). The **tunnel** is chosen with `TUNNEL=` in `production.env`.

### 6a. No domain → Tailscale Funnel (recommended)
Gives a stable public `https://<device>.<tailnet>.ts.net` with no domain and no
interstitial. `tailscaled` (a Windows service) keeps the Funnel up across reboots
itself, so pm2 only runs the server.

```powershell
cd betterpptx-mcp\deploy
.\setup-tailscale-funnel.ps1            # installs Tailscale, logs in, enables Funnel on :3344,
                                         # writes PUBLIC_BASE + TUNNEL=tailscale into production.env
# edit production.env → set a real BETTERPPTX_URL_SECRET (long random)
.\start.ps1                              # pm2 starts the server (no tunnel app needed)
```
- Free Tailscale Personal plan. Two one-time admin-console toggles the script links
  you to if needed: **DNS → MagicDNS + HTTPS certs**, and **Access controls → `funnel` attribute**.
- Connector URL (stable across reboots): `https://<device>.<tailnet>.ts.net/s/<secret>/mcp`
- Downloads come from the same host: `https://<device>.<tailnet>.ts.net/files/...`
- Verified here: with `TUNNEL=tailscale` the ecosystem runs server-only and `deck.save`
  returns `downloadUrl`s on the `ts.net` base.

### 6b. You own a domain → cloudflared named tunnel
```powershell
cd betterpptx-mcp\deploy
.\setup-cloudflare-tunnel.ps1 -Hostname mcp.yourdomain.com   # login → create → route DNS → config
# production.env → BETTERPPTX_PUBLIC_BASE=https://mcp.yourdomain.com, TUNNEL=cloudflared, CLOUDFLARED_TUNNEL_NAME=betterpptx-mcp
.\start.ps1                                                    # pm2 runs server + cloudflared
```
Connector URL: `https://mcp.yourdomain.com/s/<secret>/mcp`. Bonus: free Cloudflare WAF / rate-limiting at the edge.

### Survive reboot — run ONCE in an elevated PowerShell
```powershell
npm i -g @jessety/pm2-installer; pm2-installer install   # robust Windows service for pm2
# (per-user, no-admin fallback: schtasks /create /tn betterpptx-mcp /sc onlogon /tr "pm2 resurrect" /f)
```
(Tailscale's Funnel + tailscaled already persist on their own; pm2-installer covers the node server.)

### Resilience (verified)
- pm2 auto-restarts the server on crash (tested: kill → back online in seconds, `restarts` increments)
  and recycles it past `max_memory_restart` (900M default).
- In-app guards (deck LRU/TTL, heavy-op gate, disk budget) bound memory/disk first; pm2 is the safety net.

### Further hardening
- **Auth upgrade**: `path` mode → OAuth 2.1 + DCR for per-user access & revocation.
- **Horizontal scale**: several boxes behind a load balancer with **sticky sessions**
  (MCP session + deck state are per-process); put the download root on shared/object storage.

## 7. Verify

```bash
node betterpptx-mcp/smoke-http.mjs        # local HTTP roundtrip
node betterpptx-mcp/verify-public.mjs     # live: initialize + tools/list + tools/call over the tunnel
node betterpptx-mcp/verify-download.mjs   # live: build → save → fetch downloadUrl (.pptx attachment)
```
The public verify scripts read `betterpptx-mcp/deploy/production.env` when no URL
argument is supplied, so they verify the stable configured endpoint rather than an
old quick-tunnel artifact.
