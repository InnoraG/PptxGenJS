param(
    [string]$TelcomRollback = 'betterpptx-avatar-auth-rollback-20260718-telcomgapp-5b3be8271b',
    [string]$FluxRollback = 'betterpptx-avatar-auth-rollback-20260718-fluxworkerai-bf51f56b85'
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$items = @(
    [pscustomobject]@{ account = 'telcomgapp'; profile = 'telcomgapp'; secret = $TelcomRollback },
    [pscustomobject]@{ account = 'fluxworkerai'; profile = 'betterpptx-fluxworkerai'; secret = $FluxRollback }
)
foreach ($item in $items) {
    $env:MODAL_PROFILE = $item.profile
    & python -m modal secret delete $item.secret --yes *> $null
    if ($LASTEXITCODE -ne 0) { throw "Rollback secret deletion failed for $($item.account)" }
}
[pscustomobject][ordered]@{ status = 'OLD_MODAL_ROLLBACK_SECRETS_REVOKED'; accounts = @($items.account); rawSecretsPrinted = $false; mutationsPerformed = $true } | ConvertTo-Json
