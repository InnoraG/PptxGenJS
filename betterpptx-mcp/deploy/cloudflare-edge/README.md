# BetterPPTX Cloud Run edge route

This Worker keeps the canonical BetterPPTX origin while routing application
traffic to Cloud Run. `/identity/*` is passed to the pre-existing proxied DNS
origin so the current Keycloak issuer and RP ID remain unchanged during the
separate identity/database migration. All other paths are forwarded, without
caching or body transformation, to the pinned Cloud Run service URL.

The route is intentionally configured for `betterpptx.xmcpx.com/*`. The zone
must already have an active proxied DNS record for that hostname. A public
Cloud Run service must enforce BetterPPTX OAuth at the application boundary;
Cloud Run's public invoker setting is not user authentication. Keep the
existing private canary separate.

The checked-in origin is deliberately invalid. A release workflow must supply
the exact ready service origin using Wrangler's `--var` option. This prevents
an accidental deploy from silently sending traffic to the canary or an
unreviewed host. Never put API tokens or other credentials in this directory.

The Worker does not cache MCP, identity, or artifact traffic. It preserves the
request method, path, query, body stream, authorization, MCP session headers,
and upstream response stream. Errors are generic and do not disclose origin
details. The origin URL is restricted to HTTPS Cloud Run `run.app` hosts.

Validation:

```powershell
node --test betterpptx-mcp/test/cloudflare-edge-worker.test.mjs
```

Deployment is managed from GitHub Actions. The `betterpptx-canary` environment
requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets. Scope the
token to the single Cloudflare account and the `xmcpx.com` zone; grant only the
Workers Scripts permission needed to deploy this Worker and Workers Routes
write permission for that zone. Never put the token in the repository or a
workflow log. Without both secrets, the Cloud Run release can still deploy and
be verified at its run.app URL, but the custom-domain route is intentionally
left unchanged.
