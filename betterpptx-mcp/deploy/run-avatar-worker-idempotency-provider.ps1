param(
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$SecretName = 'betterpptx-avatar-worker-credentials',
  [string]$IdempotencyKey = '',
  [string]$AccountId = ''
)
$ErrorActionPreference = 'Stop'
$credentialFile = Join-Path $env:TEMP ('betterpptx-avatar-provider-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$credentialFile *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed.' }
  if ($AccountId) {
    # Keep the one-account diagnostic deterministic without printing or
    # persisting the full credential bundle beyond this temporary file.
    $bundle = Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json
    $provider = $bundle.providers.'avatar-worker'
    $account = @($provider.accounts | Where-Object { [string]$_.id -eq $AccountId })
    if ($account.Count -ne 1) { throw "Requested avatar worker account was not found: $AccountId" }
    $provider.accounts = $account
    $provider.activeAccountId = $AccountId
    $bundle.providers.'avatar-worker' = $provider
    $bundle | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $credentialFile -Encoding utf8
  }
  $env:BETTERPPTX_CREDENTIAL_STORE = $credentialFile
  $env:BETTERPPTX_AVATAR_TIMEOUT_MS = '360000'
  if ($IdempotencyKey) { $env:BETTERPPTX_AVATAR_PROVIDER_IDEMPOTENCY_KEY = $IdempotencyKey }
  node (Join-Path $PSScriptRoot '..\verify-avatar-worker-idempotency-provider.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Provider idempotency evidence failed.' }
} finally {
  Remove-Item -LiteralPath $credentialFile -Force -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_CREDENTIAL_STORE -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_TIMEOUT_MS -ErrorAction SilentlyContinue
  Remove-Item Env:BETTERPPTX_AVATAR_PROVIDER_IDEMPOTENCY_KEY -ErrorAction SilentlyContinue
}
