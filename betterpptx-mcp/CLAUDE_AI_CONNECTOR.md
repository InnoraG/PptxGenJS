# Using betterpptx-mcp from https://claude.ai

claude.ai supports external MCP servers via **Custom Connectors**. The
stdio transport is a local-only protocol, so we expose the same server
over **HTTP / Streamable HTTP** and tunnel it to a public URL. The current
production-friendly setup uses a stable URL with the secret in the path:
`https://<stable-host>/s/<secret>/mcp`.

```
┌──────────────────┐    HTTPS    ┌──────────────┐    HTTP    ┌───────────────────────┐
│  https://claude  │ ──────────► │ stable tunnel│ ─────────► │  betterpptx-mcp-http   │
│        .ai       │             │  (tunnel)    │            │  localhost:3344/mcp   │
└──────────────────┘             └──────────────┘            └───────────────────────┘
```

---

## 1. Start the stable public service

Use `betterpptx-mcp/deploy/production.env` plus the deploy scripts. In the current
stable mode, `BETTERPPTX_PUBLIC_BASE` is the public host and
`BETTERPPTX_URL_SECRET` is embedded in the connector URL path:

```text
https://<BETTERPPTX_PUBLIC_BASE-host>/s/<BETTERPPTX_URL_SECRET>/mcp
```

Sanity-check the public host:

```bash
$ curl https://<stable-host>/health
{"status":"ok","service":"betterpptx-mcp",...}
```

---

## 2. Expose localhost via HTTPS

Preferred options:

- Tailscale Funnel: stable `https://<device>.<tailnet>.ts.net`, no domain needed.
- Cloudflare named tunnel: stable hostname on your own domain.
- Existing HTTPS hosting/reverse proxy.

Cloudflared quick tunnels are still useful for one-off demos, but their
`trycloudflare.com` URLs are ephemeral and must not be saved as durable connector
configuration.

---

## 3. Register the connector in claude.ai

1. Go to **<https://claude.ai>** → click your profile → **Settings**.
2. Open **Connectors** (or "Integrations").
3. Click **Add custom connector** (or "Browse custom connectors" → "Connect").
4. Fill in:

   | Field                | Value                                                          |
   |----------------------|----------------------------------------------------------------|
   | **Name**             | `betterpptx-mcp` (or whatever you like)                          |
   | **Description**      | `Generate, edit, and animate PowerPoint via MCP`                |
   | **Remote MCP URL**   | `https://<stable-host>/s/<secret>/mcp`                          |
   | **Authentication**   | choose **No authentication**                                    |
   | **Token / value**    | leave empty; the secret is already in the URL path              |

5. Click **Connect**. claude.ai will hit the MCP URL with `initialize`,
   read back the tool catalogue, and you'll see all `betterpptx.*`
   tools listed in the connector's permission card.

6. In any new chat, enable the connector via the **🔌 connectors** button
   on the composer. Ask Claude to *"build me a 3-slide PPT about
   {your topic} using gradients and a morph transition between slides 2 and 3"*
   — Claude will call the tools over HTTPS and return the saved `.pptx`
   `downloadUrl`.

---

## 4. Production hardening checklist

Before you ship this as a paid SaaS:

- [ ] Replace the in-memory deck registry with per-tenant storage (Redis / SQLite).
- [ ] Replace path-secret access with **OAuth 2.0** for per-user auth and revocation.
- [ ] Mount `/mcp` behind a real reverse proxy with TLS (nginx / Caddy / Cloudflare).
- [ ] Add per-token rate limiting (e.g. `express-rate-limit`).
- [ ] Persist generated `.pptx` artefacts to S3 / R2 + return signed URLs.
- [ ] Restrict CORS to the production claude.ai origin only (already restricted in `server-http.mjs`).
- [ ] Add observability — log each tool call with tenantId + tokens consumed.
- [ ] Add a soft cap on slide count / image bytes per request.

---

## 5. Troubleshooting

| Symptom                                       | Likely cause                                                                                            |
|-----------------------------------------------|----------------------------------------------------------------------------------------------------------|
| claude.ai says "Could not connect"             | Tunnel not running, or URL doesn't end with `/mcp`. The full URL must point at the `/mcp` endpoint.       |
| 401 on every request                           | The connector is using the wrong `/s/<secret>/mcp` path, or the server is running in Bearer mode instead of path-secret mode. |
| "No valid session ID" 400                      | claude.ai sent a non-initialize request without a session. Restart the connector in claude.ai.            |
| Tools list is empty                            | The server crashed during initialize. Check the server's stderr — usually a pptxgenjs import error.       |
| Tool call returns `Bad Request: Mcp-Session-Id`| Some intermediary is stripping the `mcp-session-id` header. Make sure your tunnel passes headers through.|

---

## 6. Quick self-test

There are built-in smoke tests that exercise the HTTP transport without needing
claude.ai:

```bash
$ node betterpptx-mcp/smoke-http.mjs
====================================================
  betterpptx-mcp HTTP transport smoke-test
====================================================
  ✓ POST /mcp without token → 401
  ✓ initialize → session …
  ✓ tools/list → 35 tools
  ✓ tools/call (capabilities) → brand=betterpptx-mcp
  ✓ deck.new → deck_…
  ✓ deck.save → outputs/BetterPptxMcp_HTTPSmoke_….pptx (… bytes, 1 slides)
  ✓ DELETE /mcp → 200
  SMOKE: PASS
```

For the stable public connector, prefer:

```bash
$ node betterpptx-mcp/verify-public.mjs
$ node betterpptx-mcp/verify-download.mjs
```
