param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials'
)
$ErrorActionPreference = 'Stop'
$temp = Join-Path $env:TEMP ("betterpptx-avatar-worker-verify-" + [guid]::NewGuid().ToString('N') + '.json')
try {
    gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$temp *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed' }
    $env:BETTERPPTX_CREDENTIAL_STORE = $temp
    node (Join-Path $PSScriptRoot '..\verify-avatar-runtime.mjs') --check-worker-health
    if ($LASTEXITCODE -ne 0) { throw 'Avatar worker health verification failed' }
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_CREDENTIAL_STORE -ErrorAction SilentlyContinue
}
