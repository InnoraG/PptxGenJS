param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials',
    [string]$AccountId = '',
    [switch]$WorkersOnly,
    [string]$ImagePath = ''
)
$ErrorActionPreference = 'Stop'
$temp = Join-Path $env:TEMP ("betterpptx-avatar-canary-store-" + [guid]::NewGuid().ToString('N') + '.json')
try {
    gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$temp *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed' }
    $env:BETTERPPTX_CREDENTIAL_STORE = $temp
    $env:BETTERPPTX_AVATAR_CANARY_TIMEOUT_MS = '360000'
    $env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY = 'private-avatar-mcp-canary-' + [guid]::NewGuid().ToString('N')
    if ($AccountId) { $env:BETTERPPTX_AVATAR_CANARY_ACCOUNT = $AccountId }
    if ($ImagePath) { $env:BETTERPPTX_AVATAR_CANARY_IMAGE = [IO.Path]::GetFullPath($ImagePath) }
    node (Join-Path $PSScriptRoot '..\verify-private-avatar-worker-canary.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Rotated worker canary failed' }
    if (-not $WorkersOnly) {
        node (Join-Path $PSScriptRoot '..\verify-private-avatar-mcp-canary.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Rotated MCP/PPTX canary failed' }
    }
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_CREDENTIAL_STORE -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_TIMEOUT_MS -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_IDEMPOTENCY_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_ACCOUNT -ErrorAction SilentlyContinue
    Remove-Item Env:BETTERPPTX_AVATAR_CANARY_IMAGE -ErrorAction SilentlyContinue
}
