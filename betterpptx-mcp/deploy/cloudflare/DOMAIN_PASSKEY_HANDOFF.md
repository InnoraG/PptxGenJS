# Same-account passkey handoff for a public-origin change

This is an operator-only procedure, not a public MCP capability. The current
account's user ID and entitlement records must survive; creating a replacement
user or enabling password login is not an acceptable shortcut.

## Gate before changing the issuer or WebAuthn RP ID

1. Complete DNSSEC-safe delegation and confirm the new hostname's certificate,
   tunnel, and public identity discovery work. The old origin and passkey must
   still work at this point.
2. Have the user authenticate with the existing passkey in their own browser.
   The operator verifies that the same existing account is active. Never ask the
   user to disclose a passkey, PIN, action link, or OAuth token to the AI.
3. Privately record the existing user ID, WebAuthn credential IDs/count, issuer,
   RP ID, audience mapper, and realm/user settings needed for rollback. Do not
   put these records in a public tool result or normal log.
4. Start the opt-in `handoff-mailbox` Compose service in the existing identity
   project. Its SMTP listener is on the private Docker `identity` network; only
   its message viewer is bound to host loopback. Verify Keycloak can reach
   `handoff-mailbox:1025` and that no public SMTP/viewer route exists.

## One-time handoff

1. Configure the realm SMTP host to `handoff-mailbox`, port `1025`, no external
   relay. Assign the *existing* user a temporary, non-deliverable local mailbox
   address. Test the SMTP route before changing the issuer or RP ID.
2. Change the identity hostname and WebAuthn passwordless RP ID to the new
   hostname. Update the resource audience for that same application client.
   Keep the passkey-only browser flow and the existing user/credential intact.
3. Through loopback-only Keycloak administration, issue an
   `execute-actions-email` request for exactly
   `webauthn-register-passwordless`, with a 300-second lifespan, for the
   existing user. Keycloak 26.7.4 treats completed execute-actions tokens as
   one-time use. The action URL is a secret: deliver it directly through the
   local browser handoff, never through chat, logs, shell arguments, or a public
   artifact.
4. The user completes the browser's passkey registration prompt themselves.
   Do not automate their PIN, biometric confirmation, or security key.
5. Confirm the same user ID now has a credential for the new RP ID and can
   complete a fresh login/OAuth flow on the new hostname. Confirm the MCP sees
   the expected subject and audience. A credential-count increase alone is not
   sufficient proof of a usable passkey.

## Cleanup and rollback

- Restore the user's original email state and realm SMTP settings, purge the
  captured message, and stop/remove the handoff mailbox. Verify its loopback
  viewer is closed. Do not delete the old passkey during this cutover; review
  its retirement separately after the new login is proven.
- If any step fails, stop issuing action links, restore issuer/RP ID/audience
  from the private snapshot, and verify the old passkey login again. Do not
  create a new user or add password fallback. Expired/used action links must
  be discarded, not replayed.
- The revoked Cloudflare CLI certificate file could not be removed by the
  operator tool's filesystem policy. The owner must delete it manually; do not
  use an alternate command to evade that block.

Keycloak reference: https://www.keycloak.org/docs-api/26.7.4/rest-api/index.html
and https://www.keycloak.org/docs/26.7.4/upgrading/ .
