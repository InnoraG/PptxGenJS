#!/usr/bin/env bash
# Invoked only by the explicit Chatterbox workflow selection. No IAM grants to storage.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${GCP_PROJECT_ID:?}" "${GCP_REGION:?}" "${GCP_ARTIFACT_REPOSITORY:?}"
: "${GCP_NARRATION_SERVICE_ACCOUNT:?}" "${GCP_RUNTIME_SERVICE_ACCOUNT:?}"
: "${SPEECH_MODEL_BUCKET:?Select a pre-provisioned immutable model/reference bucket}"
: "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}" "${GITHUB_SHA:?}"
valid_bucket() { [[ "$1" =~ ^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$ ]]; }
valid_bucket "$SPEECH_MODEL_BUCKET"
if [[ -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then
  valid_bucket "$PRIVATE_VOICE_BUCKET"
  [[ "$PRIVATE_VOICE_BUCKET" != "$SPEECH_MODEL_BUCKET" ]]
fi
check_bucket() {
  local bucket="$1" member="$2" roles="$3" writable="$4"
  gcloud storage buckets describe "gs://$bucket" --raw --format=json \
    | jq -e --argjson writable "$writable" '.iamConfiguration.publicAccessPrevention == "enforced" and .iamConfiguration.uniformBucketLevelAccess.enabled == true and (($writable == false) or (.retentionPolicy == null))' >/dev/null
  local policy
  policy="$(gcloud storage buckets get-iam-policy "gs://$bucket" --format=json)"
  jq -e '[.bindings[]?.members[]? | select(. == "allUsers" or . == "allAuthenticatedUsers")] | length == 0' <<< "$policy" >/dev/null
  jq -e --arg member "serviceAccount:$member" --argjson roles "$roles" \
    '[.bindings[]? | select(.condition == null) | select(.role as $role | $roles | index($role)) | .members[]? | select(. == $member)] | length > 0' <<< "$policy" >/dev/null
}
check_bucket "$SPEECH_MODEL_BUCKET" "$GCP_NARRATION_SERVICE_ACCOUNT" '["roles/storage.objectViewer","roles/storage.objectAdmin"]' false
if [[ -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then
  check_bucket "$PRIVATE_VOICE_BUCKET" "$GCP_RUNTIME_SERVICE_ACCOUNT" '["roles/storage.objectUser","roles/storage.objectAdmin"]' true
fi
inputs_digest="$(cat "$here/model-source.json" "$here/runtime-manifest.json" "$here/Dockerfile" "$here/verify-bundle.py" "$here/provision-tokenizers.py" deploy/docker/chatterbox_http_runtime.py | sha256sum | cut -c1-20)"
image="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_ARTIFACT_REPOSITORY}/betterpptx-narration-chatterbox:inputs-${inputs_digest}"
if ! gcloud artifacts docker images describe "$image" --format='value(image_summary.digest)' >/dev/null 2>&1; then
  context="$RUNNER_TEMP/chatterbox-context-${GITHUB_RUN_ID:-local}"
  node "$here/prepare-build-context.mjs" "$context"
  docker build --label "org.opencontainers.image.revision=$GITHUB_SHA" --tag "$image" "$context"
  docker push "$image"
  # This context contains only six small application/config files, no model or audio copies.
fi
image_ref="$(gcloud artifacts docker images describe "$image" --format='value(image_summary.fully_qualified_digest)')"
[[ "$image_ref" == *@sha256:* ]]
service=betterpptx-narration-chatterbox
gcloud run deploy "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="$image_ref" --service-account="$GCP_NARRATION_SERVICE_ACCOUNT" \
  --execution-environment=gen2 --port=8080 --cpu=2 --memory=8Gi --concurrency=1 \
  --min=0 --max=2 --timeout=900s --cpu-boost --no-allow-unauthenticated \
  --startup-probe='tcpSocket.port=8080,periodSeconds=10,timeoutSeconds=3,failureThreshold=24' \
  --clear-volumes --clear-volume-mounts \
  "--add-volume=name=speech-bundle,type=cloud-storage,bucket=${SPEECH_MODEL_BUCKET},readonly=true,mount-options=implicit-dirs;metadata-cache-ttl-secs=-1" \
  --add-volume-mount=volume=speech-bundle,mount-path=/speech-bundle --quiet
for member in allUsers allAuthenticatedUsers; do
  if gcloud run services get-iam-policy "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format=json \
    | jq -e --arg member "$member" '[.bindings[]?.members[]? | select(. == $member)] | length > 0' >/dev/null; then
    gcloud run services remove-iam-policy-binding "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --member="$member" --role=roles/run.invoker --quiet
  fi
done
bash betterpptx-mcp/deploy/gcp/retry-cloud-run-service-add-iam-binding.sh "$service" "$GCP_PROJECT_ID" "$GCP_REGION" "serviceAccount:$GCP_RUNTIME_SERVICE_ACCOUNT" roles/run.invoker --condition=None
url="$(gcloud run services describe "$service" --project="$GCP_PROJECT_ID" --region="$GCP_REGION" --format='value(status.url)')"
[[ "$url" == https://*.a.run.app ]]
status="$(curl --silent --show-error --max-time 60 -o /dev/null -w '%{http_code}' "$url/voices")"
[[ "$status" == 401 || "$status" == 403 ]]
catalog=/app/betterpptx-mcp/deploy/narration/chatterbox/runtime-manifest.json
private_env=''
if [[ -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then private_env=',BETTERPPTX_CUSTOM_VOICE_ROOT=/private-voices/voice-profiles'; fi
echo "NARRATION_ENV=,BETTERPPTX_TTS_PROVIDER=chatterbox-http,BETTERPPTX_CHATTERBOX_URL=${url},BETTERPPTX_TTS_URL=${url},BETTERPPTX_TTS_AUTH=cloud-run,BETTERPPTX_TTS_PROBE_TIMEOUT_MS=60000,BETTERPPTX_TTS_TIMEOUT_MS=900000,BETTERPPTX_NARRATION_RESPONSE_TIMEOUT_MS=900000,BETTERPPTX_TTS_MAX_CONCURRENCY=1,BETTERPPTX_NARRATION_MODE=production,BETTERPPTX_CHATTERBOX_VOICES_MANIFEST=${catalog},BETTERPPTX_RUNTIME_VOICES_MANIFEST=${catalog}${private_env}" >> "$GITHUB_ENV"
echo "- Optional private speech runtime: \`$image_ref\`; personal voice storage enabled: $([[ -n "${PRIVATE_VOICE_BUCKET:-}" ]] && echo yes || echo no)" >> "$GITHUB_STEP_SUMMARY"
