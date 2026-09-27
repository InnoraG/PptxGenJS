param(
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$SecretName = 'betterpptx-avatar-worker-credentials'
)
$ErrorActionPreference = 'Stop'
$credentialFile = Join-Path $env:TEMP ('betterpptx-avatar-mcp-only-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$credentialFile *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed.' }
  $env:BETTERPPTX_CREDENTIAL_STORE = $credentialFile
  $env:BETTERPPTX_AVATAR_CANARY_TIMEOUT_MS = '360000'
  $env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY = 'private-avatar-mcp-canary-' + [guid]::NewGuid().ToString('N')
  node (Join-Path $PSScriptRoot '..\verify-private-avatar-mcp-canary.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Rotated MCP/PPTX canary failed.' }
} finally {
  Remove-Item -LiteralPath $credentialFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_CREDENTIAL_STORE -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_CANARY_TIMEOUT_MS -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY -ErrorAction SilentlyContinue
}
