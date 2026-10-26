#!/usr/bin/env bash
# Private IAM bridge only. Modal worker deployment is an independent maintainer action.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${GCP_PROJECT_ID:?}" "${GCP_REGION:?}" "${GCP_ARTIFACT_REPOSITORY:?}"
: "${GCP_NARRATION_SERVICE_ACCOUNT:?}" "${GCP_RUNTIME_SERVICE_ACCOUNT:?}"
: "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}"
service="${MODAL_BRIDGE_SERVICE:-betterpptx-narration-modal}"
modal_app="${BETTERPPTX_NARRATION_MODAL_APP:-betterpptx-narration-modal}"
credential_secret="${SPEECH_WORKER_CREDENTIALS_SECRET:-betterpptx-speech-worker-credentials}"
piper_service="${PIPER_FALLBACK_SERVICE:-${CLOUD_RUN_NARRATION:-betterpptx-narration}}"
piper_url="${PIPER_FALLBACK_URL:-$(gcloud run services describe "$piper_service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)')}"
[[ "$piper_url" == https://*.run.app || "$piper_url" == https://*.run.app/* ]]
gcloud secrets versions describe latest --secret="$credential_secret" --project="$GCP_PROJECT_ID" --format='value(state)' | grep -qx ENABLED
if [[ -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then
  [[ "$PRIVATE_VOICE_BUCKET" =~ ^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$ ]]
  gcloud storage buckets describe "gs://$PRIVATE_VOICE_BUCKET" --raw --format=json \
    | jq -e '.iamConfiguration.publicAccessPrevention == "enforced" and .iamConfiguration.uniformBucketLevelAccess.enabled == true and .retentionPolicy == null' >/dev/null
  private_policy="$(gcloud storage buckets get-iam-policy "gs://$PRIVATE_VOICE_BUCKET" --format=json)"
  jq -e '[.bindings[]?.members[]? | select(. == "allUsers" or . == "allAuthenticatedUsers")] | length == 0' <<< "$private_policy" >/dev/null
  jq -e --arg member "serviceAccount:$GCP_RUNTIME_SERVICE_ACCOUNT" \
    '[.bindings[]? | select(.condition == null) | select(.role == "roles/storage.objectUser" or .role == "roles/storage.objectAdmin") | .members[]? | select(. == $member)] | length > 0' <<< "$private_policy" >/dev/null
fi
inputs_digest="$(cat "$here/Dockerfile.bridge" "$here/bridge.py" "$here/budget.py" "$here/fallback.py" "$here/fallback-map.json" "$here/../chatterbox/runtime-manifest.json" betterpptx-mcp/narration/voices/runtime-manifest.production.json deploy/docker/speech_loudness.py | sha256sum | cut -c1-20)"
image="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_ARTIFACT_REPOSITORY}/betterpptx-narration-modal-bridge:inputs-${inputs_digest}"
if ! gcloud artifacts docker images describe "$image" --format='value(image_summary.digest)' >/dev/null 2>&1; then
  context="$RUNNER_TEMP/modal-bridge-context-${GITHUB_RUN_ID:-local}-$$"
  node "$here/prepare-build-context.mjs" "$context"
  gcloud builds submit "$context" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --config="$here/cloudbuild.bridge.yaml" --substitutions="_IMAGE=$image" --quiet
fi
image_ref="$(gcloud artifacts docker images describe "$image" --format='value(image_summary.fully_qualified_digest)')"
[[ "$image_ref" == *@sha256:* ]]
gcloud run deploy "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="$image_ref" --service-account="$GCP_NARRATION_SERVICE_ACCOUNT" \
  --execution-environment=gen2 --port=8080 --cpu=2 --memory=4Gi --concurrency=4 \
  --min=0 --max=1 --timeout=900s --cpu-boost --no-allow-unauthenticated --invoker-iam-check \
  --startup-probe='tcpSocket.port=8080,periodSeconds=10,timeoutSeconds=3,failureThreshold=12' \
  --update-env-vars="BETTERPPTX_NARRATION_MODAL_APP=${modal_app},BETTERPPTX_NARRATION_PIPER_URL=${piper_url},BETTERPPTX_GCP_PROJECT=${GCP_PROJECT_ID},BETTERPPTX_FIRESTORE_DATABASE=${BETTERPPTX_FIRESTORE_DATABASE:-(default)},BETTERPPTX_SPEECH_MONTHLY_CAP_USD=29.50,BETTERPPTX_SPEECH_BUDGET_RESERVE_USD=1.50,BETTERPPTX_SPEECH_ADMISSION_CEILING_USD=27.00" \
  --update-secrets="BETTERPPTX_SPEECH_WORKER_CREDENTIALS=${credential_secret}:latest" --quiet
for member in allUsers allAuthenticatedUsers; do
  if gcloud run services get-iam-policy "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format=json \
    | jq -e --arg member "$member" '[.bindings[]?.members[]? | select(. == $member)] | length > 0' >/dev/null; then
    gcloud run services remove-iam-policy-binding "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --member="$member" --role=roles/run.invoker --quiet
  fi
done
bash betterpptx-mcp/deploy/gcp/retry-cloud-run-service-add-iam-binding.sh "$service" "$GCP_PROJECT_ID" "$GCP_REGION" "serviceAccount:$GCP_RUNTIME_SERVICE_ACCOUNT" roles/run.invoker --condition=None
url="$(gcloud run services describe "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)')"
[[ "$url" == https://*.run.app ]]
status="$(curl --silent --show-error --max-time 60 -o /dev/null -w '%{http_code}' "$url/voices")"
[[ "$status" == 401 || "$status" == 403 ]]
catalog=/app/betterpptx-mcp/deploy/narration/chatterbox/runtime-manifest.json
private_env=''
if [[ -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then private_env=',BETTERPPTX_CUSTOM_VOICE_ROOT=/private-voices/voice-profiles'; fi
echo "NARRATION_ENV=,BETTERPPTX_TTS_PROVIDER=chatterbox-http,BETTERPPTX_TTS_LEGACY_FALLBACK=1,BETTERPPTX_TTS_RUNTIME_VERSION=chatterbox-multilingual-v3-modal-t4-loudness-v1,BETTERPPTX_TTS_CATALOG_TIMEOUT_MS=300000,BETTERPPTX_CHATTERBOX_URL=${url},BETTERPPTX_TTS_URL=${url},BETTERPPTX_TTS_AUTH=cloud-run,BETTERPPTX_TTS_PROBE_TIMEOUT_MS=60000,BETTERPPTX_TTS_TIMEOUT_MS=900000,BETTERPPTX_NARRATION_RESPONSE_TIMEOUT_MS=900000,BETTERPPTX_TTS_MAX_CONCURRENCY=1,BETTERPPTX_NARRATION_MODE=production,BETTERPPTX_CHATTERBOX_VOICES_MANIFEST=${catalog},BETTERPPTX_RUNTIME_VOICES_MANIFEST=${catalog}${private_env}" >> "$GITHUB_ENV"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then echo "- Private narration bridge: \`$image_ref\`; bounded resident GPU worker selected." >> "$GITHUB_STEP_SUMMARY"; fi
