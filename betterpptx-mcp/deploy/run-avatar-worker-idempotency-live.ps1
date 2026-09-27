param(
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$SecretName = 'betterpptx-avatar-worker-credentials',
  [string]$BrokerUrl = 'https://betterpptx-mcp-staging-yqkbambcna-uc.a.run.app',
  [string]$Bucket = 'betterpptx-mcp-staging-artifacts-860007156914'
)
$ErrorActionPreference = 'Stop'
$credentialFile = Join-Path $env:TEMP ('betterpptx-avatar-idempotency-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$credentialFile *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed.' }
  $bundle = Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json
  $first = $bundle.providers.'avatar-worker'.accounts | Where-Object id -eq 'telcomgapp'
  $second = $bundle.providers.'avatar-worker'.accounts | Where-Object id -eq 'fluxworkerai'
  if (-not $first -or -not $second) { throw 'Expected two avatar worker accounts were not found.' }
  $env:BETTERPPTX_AVATAR_IDEMPOTENCY_BROKER_URL = $BrokerUrl
  $env:BETTERPPTX_GCP_PROJECT = $Project
  $env:BETTERPPTX_GEN_ASSET_BUCKET = $Bucket
  $env:BETTERPPTX_AVATAR_WORKER_TOKEN_A = [string]$first.env.BETTERPPTX_AVATAR_WORKER_TOKEN
  $env:BETTERPPTX_AVATAR_WORKER_TOKEN_B = [string]$second.env.BETTERPPTX_AVATAR_WORKER_TOKEN
  $env:BETTERPPTX_GCP_OAUTH_TOKEN = (gcloud auth print-access-token).Trim()
  node (Join-Path $PSScriptRoot '..\verify-avatar-worker-idempotency-live.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Live worker idempotency evidence failed.' }
} finally {
  Remove-Item -LiteralPath $credentialFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_IDEMPOTENCY_BROKER_URL -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_WORKER_TOKEN_A -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_WORKER_TOKEN_B -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_GCP_OAUTH_TOKEN -ErrorAction SilentlyContinue
}
