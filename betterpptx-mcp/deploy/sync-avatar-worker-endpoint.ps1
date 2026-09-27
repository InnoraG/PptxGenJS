param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials',
    [string]$AccountId = 'fluxworkerai',
    [string]$Endpoint = 'https://betterpptx-fluxworkerai--e3b56934.modal.run'
)
$ErrorActionPreference = 'Stop'
$inputFile = Join-Path $env:TEMP ("betterpptx-avatar-worker-sync-in-" + [guid]::NewGuid().ToString('N') + '.json')
$outputFile = Join-Path $env:TEMP ("betterpptx-avatar-worker-sync-out-" + [guid]::NewGuid().ToString('N') + '.json')
try {
    gcloud secrets versions access latest --secret=$SecretName --project=$Project --out-file=$inputFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed' }
    $bundle = Get-Content -Raw -LiteralPath $inputFile | ConvertFrom-Json
    $account = @($bundle.providers.'avatar-worker'.accounts | Where-Object { $_.id -eq $AccountId })[0]
    if (-not $account) { throw "Account not found: $AccountId" }
    $account.env.BETTERPPTX_AVATAR_WORKER_URL = $Endpoint
    $bundle | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputFile -Encoding utf8
    gcloud secrets versions add $SecretName --project=$Project --data-file=$outputFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Secret Manager version add failed' }
    $version = (gcloud secrets versions list $SecretName --project=$Project --format='value(name)' --sort-by='~createTime' --limit=1).Trim()
    [pscustomobject][ordered]@{ status = 'ENDPOINT_UPDATED'; account = $AccountId; secret = $SecretName; latestVersion = $version; mutationsPerformed = $true } | ConvertTo-Json
} finally {
    Remove-Item -LiteralPath $inputFile, $outputFile -Force -ErrorAction SilentlyContinue
}
