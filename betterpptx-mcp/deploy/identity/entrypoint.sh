#!/bin/bash
set -euo pipefail
# These are files, not shell source. Never enable shell tracing here.
KC_DB_PASSWORD="$(< /run/secrets/postgres-password)"
export KC_DB_PASSWORD
if [[ -s /run/secrets/bootstrap-admin-password ]]; then
  KC_BOOTSTRAP_ADMIN_PASSWORD="$(< /run/secrets/bootstrap-admin-password)"
  export KC_BOOTSTRAP_ADMIN_PASSWORD
fi
exec /opt/keycloak/bin/kc.sh "$@"
