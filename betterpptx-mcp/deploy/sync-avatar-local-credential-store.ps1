param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials'
)
$ErrorActionPreference = 'Stop'
$bundleFile = Join-Path $env:TEMP ("betterpptx-avatar-bundle-" + [guid]::NewGuid().ToString('N') + '.json')
$storePath = (Resolve-Path (Join-Path $PSScriptRoot '..\config\credential-store.json')).Path
$storeTemp = "$storePath.rotated.tmp"
try {
    gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$bundleFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed' }
    $bundle = Get-Content -Raw -LiteralPath $bundleFile | ConvertFrom-Json
    $store = Get-Content -Raw -LiteralPath $storePath | ConvertFrom-Json
    $sourceAccounts = @($bundle.providers.'avatar-worker'.accounts)
    foreach ($target in @($store.providers.'avatar-worker'.accounts)) {
        $source = @($sourceAccounts | Where-Object { $_.id -eq $target.id })[0]
        if (-not $source) { throw "Rotated bundle is missing account: $($target.id)" }
        $target.env.BETTERPPTX_AVATAR_WORKER_URL = $source.env.BETTERPPTX_AVATAR_WORKER_URL
        $target.env.BETTERPPTX_AVATAR_WORKER_ROUTE = $source.env.BETTERPPTX_AVATAR_WORKER_ROUTE
        $target.env.BETTERPPTX_AVATAR_WORKER_TOKEN = $source.env.BETTERPPTX_AVATAR_WORKER_TOKEN
    }
    $store | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $storeTemp -Encoding utf8
    Move-Item -LiteralPath $storeTemp -Destination $storePath -Force
    [pscustomobject][ordered]@{ status = 'LOCAL_STORE_SYNCHRONIZED'; accountCount = $sourceAccounts.Count; rawSecretsPrinted = $false } | ConvertTo-Json
} finally {
    Remove-Item -LiteralPath $bundleFile,$storeTemp -Force -ErrorAction SilentlyContinue
}
