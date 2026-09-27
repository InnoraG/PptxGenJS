param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$SecretName = 'betterpptx-avatar-worker-credentials',
    [string]$DateTag = '20260718'
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$storePath = (Resolve-Path (Join-Path $PSScriptRoot '..\config\credential-store.json')).Path
$store = Get-Content -Raw -LiteralPath $storePath | ConvertFrom-Json
$profileByAccount = @{
    telcomgapp = 'telcomgapp'
    # Product account id is fluxworkerai; its authenticated Modal profile is named betterpptx-fluxworkerai.
    fluxworkerai = 'betterpptx-fluxworkerai'
}
$accountIds = @('telcomgapp', 'fluxworkerai')
$newAccounts = @()
$rollback = @()

foreach ($id in $accountIds) {
    $account = @($store.providers.'avatar-worker'.accounts | Where-Object { $_.id -eq $id })[0]
    if (-not $account) { throw "Missing avatar-worker account: $id" }
    $oldToken = [string]$account.env.BETTERPPTX_AVATAR_WORKER_TOKEN
    if ([string]::IsNullOrWhiteSpace($oldToken)) { throw "Missing current token for: $id" }

    $profile = $profileByAccount[$id]
    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 10)
    $rollbackName = "betterpptx-avatar-auth-rollback-$DateTag-$id-$suffix"
    $oldFile = Join-Path $env:TEMP ("betterpptx-avatar-old-$suffix.env")
    $newFile = Join-Path $env:TEMP ("betterpptx-avatar-new-$suffix.env")
    try {
        Set-Content -LiteralPath $oldFile -Value ("AVATAR_WORKER_TOKEN=" + $oldToken) -NoNewline
        $env:MODAL_PROFILE = $profile
        & python -m modal secret create $rollbackName --from-dotenv $oldFile --force *> $null
        if ($LASTEXITCODE -ne 0) { throw "Rollback secret creation failed for $id" }

        $bytes = New-Object byte[] 48
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $newToken = ([Convert]::ToBase64String($bytes)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
        Set-Content -LiteralPath $newFile -Value ("AVATAR_WORKER_TOKEN=" + $newToken) -NoNewline
        & python -m modal secret create betterpptx-avatar-auth --from-dotenv $newFile --force *> $null
        if ($LASTEXITCODE -ne 0) { throw "Active secret update failed for $id" }

        $newAccounts += [pscustomobject][ordered]@{
            id = $account.id
            label = $account.label
            enabled = ($account.enabled -ne $false)
            env = [ordered]@{
                BETTERPPTX_AVATAR_WORKER_URL = [string]$account.env.BETTERPPTX_AVATAR_WORKER_URL
                BETTERPPTX_AVATAR_WORKER_ROUTE = [string]$account.env.BETTERPPTX_AVATAR_WORKER_ROUTE
                BETTERPPTX_AVATAR_WORKER_TOKEN = $newToken
            }
        }
        $rollback += [pscustomobject][ordered]@{ account = $id; modalProfile = $profile; rollbackSecret = $rollbackName }
    } finally {
        Remove-Item -LiteralPath $oldFile, $newFile -Force -ErrorAction SilentlyContinue
    }
}

$bundle = [ordered]@{
    schemaVersion = 'betterpptx.credential-store.v1'
    providers = [ordered]@{
        'avatar-worker' = [ordered]@{
            label = 'Avatar worker (liveportrait+musetalk)'
            category = 'avatar'
            envKeys = @('BETTERPPTX_AVATAR_WORKER_URL', 'BETTERPPTX_AVATAR_WORKER_ROUTE', 'BETTERPPTX_AVATAR_WORKER_TOKEN')
            activeAccountId = 'telcomgapp'
            accounts = $newAccounts
        }
    }
}
$bundleFile = Join-Path $env:TEMP ("betterpptx-avatar-worker-credentials-" + [guid]::NewGuid().ToString('N') + '.json')
try {
    $bundle | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $bundleFile -Encoding utf8
    gcloud secrets describe $SecretName --project=$Project *> $null
    if ($LASTEXITCODE -ne 0) {
        gcloud secrets create $SecretName --project=$Project --replication-policy=automatic *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Google Secret Manager secret creation failed' }
    }
    gcloud secrets versions add $SecretName --project=$Project --data-file=$bundleFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Google Secret Manager version add failed' }
    $version = (gcloud secrets versions list $SecretName --project=$Project --format='value(name)' --sort-by='~createTime' --limit=1).Trim()
    [pscustomobject][ordered]@{
        status = 'ROTATED_SECRETS'
        gcpSecret = $SecretName
        gcpLatestVersion = $version
        rollback = $rollback
        mutationsPerformed = $true
    } | ConvertTo-Json -Depth 6
} finally {
    Remove-Item -LiteralPath $bundleFile -Force -ErrorAction SilentlyContinue
}
