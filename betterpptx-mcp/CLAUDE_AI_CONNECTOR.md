# Using BetterPPTX from Claude (claude.ai, Desktop, mobile, Cowork, Claude Code)

BetterPPTX is a remote MCP server with **OAuth 2.0 sign-in and lazy
authentication**: anyone can connect, initialize and list tools; a tool that
acts on the user's account asks them to sign in the first time Claude calls it.
The same server serves ChatGPT; each client gets the challenge dialect it
understands (see [Client dialects](#client-dialects)).

The obsolete path-secret (`/s/<secret>/mcp`) and "No authentication" setup is
gone: the public service requires a verified account for protected execution.

```
Claude ──HTTPS──► https://<host>/mcp ───────────────► BetterPPTX MCP (server-http.mjs)
  │                    │ 401 + WWW-Authenticate            │
  │                    ▼                                    │
  ├──► /.well-known/oauth-protected-resource/mcp  (resource = https://<host>/mcp)
  ├──► /identity/realms/betterpptx/.well-known/oauth-authorization-server
  └──► /identity/... authorize (passkey) → token  (Keycloak, realm betterpptx)
```

Spec references: <https://claude.com/docs/connectors/building/authentication>
and <https://claude.com/docs/connectors/building/lazy-authentication>.

---

## 1. Add the connector

| Surface | Steps |
|---|---|
| claude.ai / Desktop / mobile / Cowork | **Customize → Connectors → Add custom connector**, URL `https://<host>/mcp`. Leave the advanced OAuth client fields empty: Claude identifies itself with its hosted Client ID Metadata Document. |
| Claude Code | `claude mcp add --transport http betterpptx https://<host>/mcp`, then `/mcp` in a session to sign in when prompted. |

The URL must be exactly `https://<host>/mcp` (no trailing slash): Claude
requires the protected resource metadata `resource` to equal it.

What the user sees: tools work immediately for discovery and public tools; the
first protected call (generate/save/export/read a deck, billing, operation
status, `resources/read`) shows an inline **Connect** card. After the passkey
sign-in and consent, Claude retries the same call with the new token.

---

## 2. The server contract

### Lazy-auth gate (before the MCP SDK)

`authGuard` in `server-http.mjs` runs before the Streamable HTTP transport, on
the parsed JSON-RPC body:

- Anonymous only for discovery (`initialize`, `tools/list`, `resources/list`,
  `prompts/list`, `ping`, …) and the explicitly public tools
  (`auth/public-identity-policy.mjs` → `tool-security.mjs`).
- Anything else without a valid token (including any batch containing a
  protected member, and calls inside an existing session) gets:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="BetterPPTX", resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp", scope="betterpptx", error_description="..."
```

  With an invalid/expired token the challenge also carries
  `error="invalid_token"` (Claude refreshes, then re-authorizes). A token
  without the `betterpptx` scope gets `403` + `error="insufficient_scope"`.

### Discovery documents

| URL | `resource` | Who uses it |
|---|---|---|
| `/.well-known/oauth-protected-resource/mcp` | `https://<host>/mcp` | Claude (from the 401 pointer, or path-suffixed probing) |
| `/.well-known/oauth-protected-resource` | `https://<host>` | ChatGPT (qualified origin form, RFC 9728 root document) |

Both list `authorization_servers: ["https://<host>/identity/realms/betterpptx"]`
and `scopes_supported: ["betterpptx"]`.

The authorization-server metadata (served by the identity proxy,
`auth/identity-proxy.mjs`, and the fallback in `mcp-v2/oauth.mjs`) advertises
`client_id_metadata_document_supported: true`,
`token_endpoint_auth_methods_supported: ["private_key_jwt", "none"]`,
`code_challenge_methods_supported: ["S256"]`, no `registration_endpoint`.
Claude picks CIMD only when both the CIMD flag and `"none"` are present.

### Pre-registered clients (Keycloak realm `betterpptx`)

| client_id (CIMD URL) | Type | Redirect URIs |
|---|---|---|
| `https://chatgpt.com/oauth/client.json` | confidential, `private_key_jwt` (RS256, pinned JWKS) | `https://chatgpt.com/connector_platform_oauth_redirect` |
| `https://claude.ai/oauth/mcp-oauth-client-metadata` | public, `none` | `https://claude.ai/api/mcp/auth_callback` |
| `https://claude.ai/oauth/claude-code-client-metadata` | public, `none` | `http://localhost/callback`, `http://127.0.0.1/callback` |

All require S256 PKCE, consent, `fullScopeAllowed=false`, default scope
`betterpptx` only, and use realm refresh-token rotation
(`revokeRefreshToken=true`, `refreshTokenMaxReuse=0`): a replayed or revoked
refresh token fails with `invalid_grant`. Keycloak 26.7 matches the two
loopback URIs with the port ignored (RFC 8252 §7.3, also for `localhost`) and
the path exact, so Claude Code's ephemeral ports work without wildcards.

Create/align the Claude clients (idempotent, additive; asserts the ChatGPT
client is unchanged; validates each live CIMD document before writing):

```bash
node betterpptx-mcp/deploy/identity/activate-claude-public-clients.mjs
```

New installs can also stage them in the import file:
`provision.mjs configure-client --client-id <CIMD URL> --redirect <URI>`.
`deploy/identity/verify-local.mjs` checks them when present.

### Access-token verification

`auth/verified-identity.mjs` (Keycloak profile) requires: pinned issuer and
JWKS, `typ: Bearer`, `azp` exactly one of `BETTERPPTX_OAUTH_CLIENT_ID`
(space-separated exact list; the self-hosted config sets all three client IDs),
exactly one `aud` equal to `BETTERPPTX_OAUTH_AUDIENCE` (the origin, which the
realm audience mapper issues) or one of `BETTERPPTX_OAUTH_ADDITIONAL_AUDIENCES`
(same-origin only; the self-hosted config adds `https://<host>/mcp`), scope
`betterpptx`, lifetime ≤ 600 s. The account principal is derived from
`iss` + `sub` only, so the same person keeps their decks across ChatGPT,
claude.ai and Claude Code.

Keycloak ignores the RFC 8707 `resource` parameter Claude sends; the audience
comes from the realm mapper. The verifier already accepts the `/mcp` form, so
the mapper can later be switched to it without breaking issued tokens.

### Client dialects

`auth/client-profile.mjs` decides only the *shape* of a refusal, never access:

- **openai** (ChatGPT: `x-openai-session`/`x-openai-subject` headers,
  `User-Agent: openai-mcp/…`, or an `openai`/`chatgpt` clientInfo name): protected
  `tools/call` refusals stay `200` + `isError` + `_meta["mcp/www_authenticate"]`,
  root `resource_metadata`, origin-form resource, and AS metadata listing only
  `private_key_jwt` — byte-for-byte the qualified ChatGPT contract.
- **standard** (everyone else, including Claude): transport `401` as above.

A client that spoofs a profile only receives a different, equally protected
refusal.

---

## 3. Self-test

```bash
# protected call without a token → 401 + resource_metadata …/oauth-protected-resource/mcp
curl -si https://<host>/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"betterpptx.deck.save","arguments":{"deckId":"x"}}}'

# resource must equal the connector URL
curl -s https://<host>/.well-known/oauth-protected-resource/mcp

# CIMD + public-client support
curl -s https://<host>/identity/realms/betterpptx/.well-known/oauth-authorization-server
```

Unit/integration coverage: `test/public-verified-identity-http.test.mjs`
(run with `--experimental-test-module-mocks`), `test/verified-identity.test.mjs`,
`test/identity-proxy.test.mjs`, `test/mcp-v2-protocol.test.mjs`,
`deploy/identity/provision.test.mjs`.

---

## 4. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Couldn't reach the MCP server", identity sees no traffic | No `401`/`resource_metadata`, or `/.well-known/*` not routed to the MCP server. |
| "Please sign in" text in chat instead of a **Connect** card | The request was classified as the ChatGPT dialect (200 + `isError`). Check for stray `x-openai-*` headers or an `openai-mcp` User-Agent added by a proxy. |
| Sign-in loop / "resource mismatch" | Connector URL not exactly `https://<host>/mcp`, or a cached PRM (Claude caches discovery ~5 min). |
| Keycloak "Client not found" | Claude clients not activated: run `activate-claude-public-clients.mjs`. |
| Keycloak "Invalid parameter: redirect_uri" | Redirect differs from the CIMD-declared URIs (hosted callback, or loopback `/callback`). |
| Token accepted by Keycloak but MCP returns 401 | `azp` not in `BETTERPPTX_OAUTH_CLIENT_ID`, or `aud` not origin / `/mcp`. |
| Refresh fails | Refresh tokens rotate; a reused one returns `invalid_grant` and Claude re-authorizes. |

Anthropic egress for allowlists: `160.79.104.0/21`. Claude gives discovery and
token endpoints 10 s (refresh 30 s).
