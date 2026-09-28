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

Deployment is managed from GitHub Actions after its existing keyless Google
Cloud authentication. `CLOUDFLARE_ACCOUNT_ID` is a non-secret GitHub Actions
environment variable. The scoped Cloudflare API token is owner-managed in
BetterPPTX Mission Control and stored in Google Secret Manager as
`betterpptx-cloudflare-worker-deploy-token`; only the dedicated private
Mission Control runtime and GitHub deploy service account receive access to
that individual secret. The public MCP runtime receives no access. Mission
Control can verify, reveal (with explicit owner confirmation), and update the
value. Create or rotate the token in Cloudflare, then update it in Mission
Control. Scope the
token to one Cloudflare account and the `xmcpx.com` zone, granting only Worker
script edit and Worker route edit. Never put it in the repository, a GitHub
secret, or a workflow log. Without an active secret version and the account ID,
the Cloud Run release still deploys and verifies at its run.app URL, but the
custom-domain route is intentionally left unchanged.

Mission Control runs as a separate Cloud Run service with minimum instances
set to zero, no unauthenticated access, and an Invoker binding for the named
owner account only. To open it from the owner's workstation, authenticate the
Google Cloud CLI as that same account and run:

```powershell
gcloud run services proxy betterpptx-mission-control --project=betterpptx-mcp-20260926 --region=us-central1 --port=8787
```

Then open `http://localhost:8787/ops/mission-control` in the owner's browser.
The local proxy supplies Cloud Run IAM authentication; the page stores no
access or admin bearer token. This deployment exposes only the Cloudflare
deployment-token control, not the full secret registry. Production cloud
storage and deployment credentials remain outside the public MCP gateway.
