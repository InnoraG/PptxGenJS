# Verified account boundary — scoped handoff

## Decision

Self-hosted open-source identity authority and database; no external identity SaaS subscription or per-login fee. The existing host/network, backup, upgrade and operator costs remain. Fingerprints do not authenticate direct callers and are no longer trusted by public protected requests.

## Implemented

- `auth/verified-identity.mjs`: pinned issuer/audience/keys, short-lived asymmetric access tokens, explicit token-class profiles, stable server-derived account ownership, optional proof-of-possession verification. No caller-provided key URL or identity header is trusted.
- `auth/public-identity-policy.mjs`, `auth/tool-security.mjs`, HTTP and MCP transports: one anonymous discovery policy, advertised OAuth requirements, authenticated per-request context, account-bound sessions, and protected payment entry routes.
- `storage/artifact-store.mjs`: private local ownership records, request-time expiry, foreign-owner/missing-record/symlink denial. Old ownerless artifacts are not silently adopted.
- `auth/entitlements.mjs`: sponsored reservation identity includes the exact normalized request digest, not merely an author-chosen key.
- `auth/identity-proxy.mjs`: fixed-origin sign-in proxy; no public admin, master realm, dynamic registration or account-management forwarding. Credentials bypass ordinary body logging.
- `deploy/identity/`: owner-private provisioning, one-field self-enrollment followed by a mandatory discoverable passkey with user verification, no password/cookie fallback, five-minute tokens, refresh rotation, exact callback and mandatory S256 PKCE. The pre-registered ChatGPT client uses signed Client Identifier Metadata Document (CIMD) authentication (`private_key_jwt`, RS256) against ChatGPT's published JWKS; no manually entered or reusable shared client secret exists.
- `betterpptx.auth.get_profile`: standard authenticated profile surface returning only an opaque, server-derived account ID. Protected MCP calls emit the ChatGPT-compatible `_meta["mcp/www_authenticate"]` challenge as well as the HTTP challenge header.
- `mission-control-secrets.mjs`: redacted status and audited private actions for local identity secrets. Rotation is persistently staged, not falsely reported as activated.

## Observed deployment

Named endpoint: `https://betterpptx.tail070c3a.ts.net/mcp`.

Responding release: `1.10.9+2026-09-22.13`, build `bpptx_build_3aba832627bbe6953e7b6a47cb508110bebcb38a55e430d4af4f1c39b79fa07f` (observed 2026-09-22).

Raw public tool inventory: 53, canonical serialized inventory SHA-256 `ddfd92730e7e7793c21668668b3045c662c6843be33c0e33cea4c9caf5fcf035`. This is raw service exposure, not a claim about a ChatGPT connector's cached tool projection.

`verify-live-identity-boundary.mjs` passed for this release: discovery/public keys, advertised protected-tool requirements, rejection of forged identity headers and invalid tokens, whole-batch protection, and denial of public administration/registration routes. All supported discovery aliases expose the same origin resource, `betterpptx` scope, signed CIMD method and S256 PKCE policy. No customer account, publication or provider work was created and no funds were consumed.

Browser-side verification used a new ChatGPT development-app form and entered only `https://betterpptx.tail070c3a.ts.net/mcp`. ChatGPT discovered OAuth without an error, selected Client Identifier Metadata Document (CIMD), selected the `betterpptx` scope, and populated the authorization, token, issuer, resource, OIDC configuration and user-info endpoints. No advanced value was entered manually. The connector was created, the one-field registration and passkey ceremony completed, and ChatGPT showed the account connected through OAuth. New credentials default to `Passkey BetterPPTX`; one untouched generic credential label was migrated and custom labels are preserved.

The first reconnect exposed a standards mismatch at the issuer/verifier boundary: the effective access token lacked `sub`. The BetterPPTX client scope now owns an explicit access-token subject mapper, the verifier still requires `sub`, and `azp` is pinned to ChatGPT's official CIMD client identifier rather than merely checked for presence. Exact single-resource audience matching accepts both JWT-permitted string and singleton-array forms while rejecting empty, different and multi-resource audiences. The self-hosted OIDC discovery advertises `openid` for its UserInfo endpoint while `betterpptx` remains the sole resource-authorization scope.

After reconnecting with the existing passkey, the actual ChatGPT `openai-mcp/1.0.0` client fetched all 53 tool definitions and successfully invoked the protected `betterpptx.auth.get_profile` tool. The ChatGPT plugin settings page visibly lists the tools, including upload, estimate, generation, validation, source export and save. This is supported-client authentication and callability evidence; no deck, publication, provider job or charge was created.

The running identity project is `betterpptx-identity-validation`, bound only to host loopback. Local administrative inspection confirmed the passkey-only flow, exact client registration, one application user and one passwordless-passkey credential. Do not create a second Compose project on its port or delete its database to force an import.

## Test boundaries and remaining work

The HTTP tests use the real transport, dispatcher, authentication status and artifact store with synthetic signing keys; allowance persistence is a read-only fixture and external network/provider access is forbidden. Unit and local HTTP passes are not a real-user OAuth acceptance result.

The latest focused release run passed passkey provisioning (3 tests), protocol/identity isolation (33 tests), public HTTP identity isolation (10 tests), public schema parity (1 test), local identity verification and the live public boundary verifier. These are scoped engineering checks, not a full product certification. HTTP/continuation tests require Node's `--experimental-test-module-mocks` switch. Live public checks are separately scoped above.

- Initial ChatGPT authorization, passkey enrollment, OAuth callback, complete 53-tool discovery and one protected profile call are browser-verified. Token refresh, account recovery and a full protected authoring/publication workflow remain to be qualified.
- Bearer tokens remain usable by a thief until expiry. DPoP is optional and not qualified with ChatGPT; its replay cache is process-local, not restart/multiworker durable. No immediate access-token revocation/introspection claim is made.
- Local downloads require account credentials. Ordinary browser click-through without credentials and end-to-end authenticated artifact retrieval need qualification. GCS signed downloads remain transferable bearer links and were not hardened by this change; the active deployment uses local artifacts.
- Account control is not proof of a unique human. Self-registration is deliberately minimal and passkey-only; no anti-Sybil or hardware-attestation guarantee is claimed.
- Legacy fingerprint ownership is not migrated automatically. Key rotation requires identity-data migration, deployment coordination and recovery tests. Bootstrap administrator replacement, encrypted backups and restore qualification remain operator tasks.

Detailed private setup: `D:/PptxGenJS_Claude/docs/SELF-HOSTED-IDENTITY.md`. No credentials, personal identifiers or private recovery links are included in this handoff.
