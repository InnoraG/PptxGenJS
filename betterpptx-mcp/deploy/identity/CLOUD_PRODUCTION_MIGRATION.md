# BetterPPTX production: fully cloud-hosted, scale to zero (2026-10-20)

Owner policy: **minimum cost with no customers** — every tier must scale to
zero. Keycloak was retired for cloud production: its database (Cloud SQL,
~$10/month idle) cannot scale to zero on Google Cloud.

## What was still local

Measured 2026-10-20, app traffic on `betterpptx.xmcpx.com` already went
Cloudflare Worker `betterpptx-cloudrun-edge` → Cloud Run `betterpptx-public`
(+ private `betterpptx-worker`, Firestore/GCS, Cloud Tasks) in project
`betterpptx-mcp-20260926`. Only **sign-in** depended on the Windows host:
`/identity/*` → tunnel → local `http-cli.mjs` identity proxy → Docker Keycloak
→ Docker Postgres. Local Piper TTS and local stores were not on the path.

## Target architecture

```
client ─▶ Cloudflare Worker (betterpptx.xmcpx.com/*, BETTERPPTX_IDENTITY_ROUTE=cloud-run)
            └─▶ Cloud Run betterpptx-public (min 0; OAuth enforced in-app)
                  ├─ /mcp, /files …   ─▶ Firestore + GCS, Cloud Tasks ─▶ betterpptx-worker (private, min 0)
                  └─ /identity/realms/betterpptx/*  built-in authorization server
                        (auth/oauth-server.mjs, oidc-provider 9.12.2, MIT)
                        ├─ state: Firestore collections betterpptx_oauth_* (TTL on expiresAt)
                        ├─ keys: Secret Manager (RS256 JWKS, cookie keys)
                        └─ account sign-in: Google Identity Platform (email link; Google optional)
```

* Issuer, endpoint paths and resource metadata keep the established layout:
  `https://betterpptx.xmcpx.com/identity/realms/betterpptx`,
  `/protocol/openid-connect/{auth,token,certs,userinfo,revoke}`; discovery at
  `…/.well-known/openid-configuration`, `…/.well-known/oauth-authorization-server`
  and the RFC 8414 path-insertion form.
* Clients (exact allowlist, `auth/oauth-clients.mjs`, pinned from their CIMD
  documents): ChatGPT (`private_key_jwt`, `jwks_uri`), hosted Claude (public,
  PKCE), Claude Code (public, PKCE, native loopback on any port). No dynamic
  registration, no PAR, no introspection, S256 PKCE only, code replay revokes
  the grant, rotating refresh tokens (30 days), access tokens 10 minutes.
* Access tokens: RFC 9068 JWT (`typ: at+jwt`, `client_id`, single `aud` =
  origin or `/mcp`, `scope: betterpptx`). The gateway verifies them with its
  in-process public keys (no network hop); `BETTERPPTX_OAUTH_CLIENT_ID` lists
  the three exact clients. Principals stay `HMAC(install secret, iss, sub)`;
  `sub` = Identity Platform user id. The install HMAC secret is unchanged.
* ChatGPT keeps its qualified discovery dialect (`private_key_jwt` only);
  standard clients see `["private_key_jwt","none"]` (PR #33 behaviour).
* Build/deploy: `betterpptx-mcp-cloudrun-free-beta.yml` (`workflow_dispatch`
  on `main`, keyless GitHub OIDC) builds the gateway, worker and edge Worker
  from git, sets the sign-in configuration and verifies discovery/JWKS on the
  run.app URL and on the custom domain.

## One-time owner steps

1. `bash betterpptx-mcp/deploy/identity/provision-builtin-oauth.sh` — signing
   and cookie keys, Identity Platform email-link sign-in + authorized domain,
   referrer-restricted browser key, Firestore TTL policies. (Done 2026-10-20.)
2. Optional: Google-account sign-in — create an OAuth client in the Google
   Cloud console, enable the Google provider in Identity Platform, then set
   `BETTERPPTX_SIGNIN_METHODS: email-link google` in the workflow.
3. Run **BetterPPTX MCP Cloud Run free beta** (DEPLOY) from `main`.
4. Re-connect ChatGPT; add the claude.ai custom connector; `/mcp` in Claude Code.
5. Stop (do not delete) the local pieces: `pm2 stop betterpptx-mcp
   betterpptx-cloudflare-tunnel betterpptx-piper-tts`, `pm2 save`,
   `docker compose -p betterpptx-identity-validation stop`, stop the Piper
   container. Keep them for 14 days as the rollback origin.

## Rollback

| Failure | Action |
|---|---|
| Sign-in broken | Start local Keycloak + pm2 `betterpptx-mcp` + tunnel, redeploy the Worker with `--var BETTERPPTX_IDENTITY_ROUTE:dns-origin` (or `wrangler rollback`), and set the gateway back to `BETTERPPTX_OAUTH_TOKEN_PROFILE=keycloak` without `BETTERPPTX_IDENTITY_PROVIDER`. |
| New gateway revision broken | `gcloud run services update-traffic betterpptx-public --to-revisions=betterpptx-public-size-opt-1015-v1=100` (and the worker's previous revision). |

DNS is unchanged: the proxied `betterpptx.xmcpx.com` record must remain for
the Worker route; with `cloud-run` routing no request reaches the tunnel.

## Cost (USD/month, list prices)

| Item | Idle | In use |
|---|---|---|
| Gateway + worker Cloud Run (min 0) | $0 | per request (unchanged) |
| Authorization server | $0 (in the gateway) | negligible CPU per sign-in |
| Firestore OAuth records | $0 (free tier: 50k reads / 20k writes per day) | ~5–10 writes per sign-in |
| Identity Platform | $0 | free up to 49,999 monthly active users (email/social) |
| Secret Manager | ~$0.20 (3 secrets) | $0.03 per 10k accesses |

Caps: Cloud Run `maxScale` (gateway 3, worker 2). Modal is not involved.

## Follow-ups

* Passkeys (WebAuthn) are not part of the first release; email link (and
  Google, once enabled) are the sign-in methods.
* Hosted narration: production never used the local Piper; cloud TTS is a
  separate feature decision.
* The local `codex/provenance-cleanup` working tree is preserved untouched and
  snapshotted to the local-only ref `refs/backup/provenance-cleanup-20261020`.
