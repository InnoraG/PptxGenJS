# Authentication-only project migration

The Firebase sign-in project can differ from the infrastructure project. Keep
the OAuth issuer, signing/cookie keys, installation HMAC, runtime identity,
Firestore project and prefix, storage, billing and container image unchanged.
Never rerun infrastructure provisioning against the new authentication project.

1. Create and configure the new Firebase Authentication project, email-link
   provider, authorized product domain, restricted browser API key, app name and
   verified email sender. Keep the old project available for rollback.
2. Run `test-signin-project.mjs` on loopback with the new sign-in configuration.
   Temporarily authorize its localhost origin and key referrer. Send a real test
   email and complete the link; `/status` must report a verified target-project
   identity. Tokens and account records must stay in memory.
3. Set `BETTERPPTX_SOURCE_AUTH_PROJECT` and `BETTERPPTX_TARGET_AUTH_PROJECT`, then
   run `migrate-signin-users.mjs` for an audit. Its explicit
   `--import-after-verified-test` mode requires the successful loopback proof.
   It preserves UIDs, verification, profile and claims, refuses overwrites or
   email collisions, and rejects password hashes, MFA, tenants and federation
   that require a separate migration procedure. The built-in `password` provider
   label used for email links is derived by Firebase after first sign-in and is
   omitted from uploads; it is not a federated provider.
4. Qualify the original account against the new project and confirm the same
   UID. Repeat the final source audit/import immediately before cutover.
5. Stage the browser key under a distinct Secret Manager secret in the original
   infrastructure project. Bind a no-traffic revision to that secret and the new
   `BETTERPPTX_SIGNIN_PROJECT`/`BETTERPPTX_SIGNIN_AUTH_DOMAIN`. Compare its image,
   runtime identity and remaining environment with the live revision.
6. Set the `betterpptx-canary` GitHub environment variables
   `BETTERPPTX_SIGNIN_PROJECT` and `BETTERPPTX_SIGNIN_API_KEY_SECRET_NAME`; the release
   workflow otherwise defaults to the infrastructure project and original key.
   Promote the qualified revision and update the edge's sign-in project binding.
7. Complete a production email sign-in and verify the public issuer/JWKS remain
   unchanged. Remove temporary localhost authorization/referrers and stop the
   loopback server. Keep only compact counts, hashes, operation/revision IDs and
   outcomes in the current local ledger; never save user exports or tokens.

Rollback restores the previous Cloud Run traffic revision and edge sign-in
project binding plus the two GitHub environment variables. The old key secret
must remain untouched so old revisions can still start. Already-issued links
belong to their original Firebase project; users may need to request a new link
after cutover. Existing product OAuth sessions use the unchanged issuer and keys.
