# Source after assets_volume is initialized in BOTH gateway and task-worker steps.
# Owner-provisioned bucket and IAM were checked before the speech runtime deployment.
if [[ ( "${NARRATION_PROVIDER:-piper-http}" == chatterbox-http || "${NARRATION_PROVIDER:-piper-http}" == chatterbox-modal ) && -n "${PRIVATE_VOICE_BUCKET:-}" ]]; then
  assets_volume+=("--add-volume=name=private-voices,type=cloud-storage,bucket=${PRIVATE_VOICE_BUCKET},readonly=false,mount-options=implicit-dirs;metadata-cache-ttl-secs=0;stat-cache-max-size-mb=0;type-cache-max-size-mb=0;uid=10001;gid=10001;file-mode=0600;dir-mode=0700" "--add-volume-mount=volume=private-voices,mount-path=/private-voices")
fi
