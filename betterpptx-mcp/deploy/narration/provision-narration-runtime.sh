#!/usr/bin/env bash
# One-time owner provisioning: a dedicated identity for the private narration
# runtime (it needs no project roles) that the GitHub deployer may attach.
set -euo pipefail
PROJECT="${GCP_PROJECT_ID:-betterpptx-mcp-20260926}"
SA="betterpptx-narration-runtime@$PROJECT.iam.gserviceaccount.com"
DEPLOYER_SA="${GCP_DEPLOY_SERVICE_ACCOUNT:-github-free-beta-deployer@$PROJECT.iam.gserviceaccount.com}"
gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create betterpptx-narration-runtime --project="$PROJECT" --display-name="BetterPPTX narration runtime"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --member="serviceAccount:$DEPLOYER_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
echo "Narration runtime identity ready: $SA"
