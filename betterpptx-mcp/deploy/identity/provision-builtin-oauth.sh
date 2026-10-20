#!/usr/bin/env bash
# One-time, idempotent owner provisioning for the built-in authorization
# server (auth/oauth-server.mjs). Everything it creates scales to zero:
#   - Secret Manager: RS256 signing JWKS, cookie keys, Identity Platform browser key
#   - Identity Platform: passwordless email-link sign-in, authorized domain
#   - Firestore TTL policies for expired OAuth records
# Prints no secret values. Rotating keys: add a new secret version (the old
# signing key should be kept in the JWKS until issued tokens expire).
#
#   bash betterpptx-mcp/deploy/identity/provision-builtin-oauth.sh
set -euo pipefail
PROJECT="${GCP_PROJECT_ID:-betterpptx-mcp-20260926}"
PUBLIC_HOST="${BETTERPPTX_PUBLIC_HOST:-betterpptx.xmcpx.com}"
RUNTIME_SA="${GCP_RUNTIME_SERVICE_ACCOUNT:-betterpptx-public-runtime@$PROJECT.iam.gserviceaccount.com}"
PREFIX="${BETTERPPTX_OAUTH_FIRESTORE_PREFIX:-betterpptx_oauth}"

ensure_secret() {
  gcloud secrets describe "$1" --project="$PROJECT" >/dev/null 2>&1 \
    || gcloud secrets create "$1" --project="$PROJECT" --replication-policy=automatic >/dev/null
  gcloud secrets add-iam-policy-binding "$1" --project="$PROJECT" \
    --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}
has_version() { gcloud secrets versions describe latest --secret="$1" --project="$PROJECT" >/dev/null 2>&1; }

gcloud services enable identitytoolkit.googleapis.com apikeys.googleapis.com secretmanager.googleapis.com firestore.googleapis.com --project="$PROJECT"

# Signing keys and cookie keys are generated locally and streamed straight in.
ensure_secret betterpptx-oauth-signing-jwks
has_version betterpptx-oauth-signing-jwks || node -e '
  const { generateKeyPairSync, randomUUID } = require("crypto")
  const jwk = generateKeyPairSync("rsa", { modulusLength: 3072 }).privateKey.export({ format: "jwk" })
  const kid = "bpptx-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomUUID().slice(0, 8)
  process.stdout.write(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }))
'   | gcloud secrets versions add betterpptx-oauth-signing-jwks --project="$PROJECT" --data-file=- >/dev/null
ensure_secret betterpptx-oauth-cookie-keys
has_version betterpptx-oauth-cookie-keys || node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64url"))' \
  | gcloud secrets versions add betterpptx-oauth-cookie-keys --project="$PROJECT" --data-file=- >/dev/null

# Identity Platform: initialize once, enable passwordless email links and
# authorize the product host as a sign-in continue URL.
token="$(gcloud auth print-access-token)"
api() { curl --fail-with-body --silent --show-error -H "Authorization: Bearer $token" -H "x-goog-user-project: $PROJECT" -H 'Content-Type: application/json' "$@"; }
config_url="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config"
if ! api "$config_url" >/dev/null 2>&1; then
  api -X POST "https://identitytoolkit.googleapis.com/v2/projects/$PROJECT/identityPlatform:initializeAuth" -d '{}' >/dev/null
fi
domains="$(api "$config_url" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);const d=new Set(c.authorizedDomains||[]);d.add(process.argv[1]);process.stdout.write(JSON.stringify([...d]))})' "$PUBLIC_HOST")"
api -X PATCH "$config_url?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains" \
  -d "{\"signIn\":{\"email\":{\"enabled\":true,\"passwordRequired\":false}},\"authorizedDomains\":$domains}" >/dev/null

# Browser key for the sign-in page: Identity Platform APIs only, product host only.
ensure_secret betterpptx-signin-api-key
key_name="$(gcloud services api-keys list --project="$PROJECT" --filter='displayName=betterpptx-signin-browser' --format='value(name)' | head -1)"
if [[ -z "$key_name" ]]; then
  gcloud services api-keys create --project="$PROJECT" --display-name=betterpptx-signin-browser \
    --api-target=service=identitytoolkit.googleapis.com --api-target=service=securetoken.googleapis.com \
    --allowed-referrers="https://$PUBLIC_HOST/*" >/dev/null 2>&1
  key_name="$(gcloud services api-keys list --project="$PROJECT" --filter='displayName=betterpptx-signin-browser' --format='value(name)' | head -1)"
fi
has_version betterpptx-signin-api-key || gcloud services api-keys get-key-string "$key_name" --format='value(keyString)' | tr -d '\r\n' \
  | gcloud secrets versions add betterpptx-signin-api-key --project="$PROJECT" --data-file=- >/dev/null

# Expired OAuth records are deleted by Firestore TTL (reads also ignore them).
for model in Session Interaction AuthorizationCode RefreshToken Grant ReplayDetection AccessToken; do
  gcloud firestore fields ttls update expiresAt --collection-group="${PREFIX}_$model" --enable-ttl \
    --project="$PROJECT" --async --quiet >/dev/null 2>&1 || echo "TTL policy for ${PREFIX}_$model not changed (already set or pending)."
done
echo "Built-in sign-in provisioned for https://$PUBLIC_HOST (project $PROJECT)."
