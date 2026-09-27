param(
    [Parameter(Mandatory = $true)][string]$Profile,
    [Parameter(Mandatory = $true)][string]$AccountId,
    [Parameter(Mandatory = $true)][string]$EndpointLabel,
    [string]$StorePath = (Join-Path $PSScriptRoot '..\config\credential-store.json')
)
$ErrorActionPreference = 'Stop'

function New-OwnerToken {
    $bytes = New-Object byte[] 48
    # Windows PowerShell 5 (the host used by the deployment runner) does not
    # expose RandomNumberGenerator.Fill; use the compatible cryptographic RNG
    # API instead of falling back to a predictable token source.
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

$temp = Join-Path $env:TEMP ("betterpptx-image-edit-deploy-" + [guid]::NewGuid().ToString('N') + '.env')
try {
    $token = New-OwnerToken
    Set-Content -LiteralPath $temp -Value ("IMAGE_EDIT_ENDPOINT_TOKEN=" + $token) -NoNewline
    $env:MODAL_PROFILE = $Profile
    $env:IMAGE_EDIT_ENDPOINT_LABEL = $EndpointLabel
    $env:IMAGE_EDIT_MODAL_SECRET_NAME = 'betterpptx-image-edit-token'
    # Modal's Python 3.14 compatibility warning is emitted on stderr and is
    # treated as a terminating native-command error by Windows PowerShell 5.
    $env:PYTHONWARNINGS = 'ignore'
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $savedErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & python -W ignore -m modal secret create betterpptx-image-edit-token --from-dotenv $temp --force | Out-Null
        $secretExitCode = $LASTEXITCODE
        $deployOutput = (& python -W ignore -m modal deploy (Join-Path $PSScriptRoot 'image-edit-worker\image_edit_app.py') 2>&1 | Out-String)
        $deployExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorAction
    }
    if ($secretExitCode -ne 0) { throw "secret creation failed for profile $Profile" }
    if ($deployExitCode -ne 0) { throw "Modal deploy failed for profile $Profile`n$deployOutput" }
    $match = [regex]::Match($deployOutput, 'https://[A-Za-z0-9._-]+\.modal\.run')
    if ($match.Success) {
        $endpointUrl = $match.Value
    } else {
        # Updating an existing Modal app commonly prints only the dashboard URL;
        # the stable fastapi endpoint remains unchanged when its opaque label is
        # unchanged. Reuse the owner-recorded endpoint instead of discarding the
        # freshly rotated secret or inventing a public route.
        $existingStoreForUrl = Get-Content -LiteralPath $StorePath -Raw | ConvertFrom-Json
        $existingAccountForUrl = @($existingStoreForUrl.providers.'modal-image-edit'.accounts) | Where-Object { $_.id -eq $AccountId } | Select-Object -First 1
        $endpointUrl = [string]$existingAccountForUrl.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL
        if ([string]::IsNullOrWhiteSpace($endpointUrl)) { throw "Modal deploy returned no endpoint URL for profile $Profile and no existing endpoint is recorded" }
    }

    $store = Get-Content -LiteralPath $StorePath -Raw | ConvertFrom-Json
    if ($store.schemaVersion -ne 'betterpptx.credential-store.v1') { throw 'credential store schema mismatch' }
    $provider = $store.providers.'modal-image-edit'
    if ($null -eq $provider) {
        $provider = [pscustomobject]@{
            label = 'Modal Flux.2 Klein edit/reference worker (private, isolated)'
            category = 'imagegen'
            envKeys = @('BETTERPPTX_MODAL_IMAGE_EDIT_URL', 'BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN')
            activeAccountId = $AccountId
            accounts = @()
        }
        $store.providers | Add-Member -NotePropertyName 'modal-image-edit' -NotePropertyValue $provider
    }
    $accounts = @($provider.accounts)
    $existing = $accounts | Where-Object { $_.id -eq $AccountId } | Select-Object -First 1
    if ($null -eq $existing) {
        $existing = [pscustomobject]@{ id = $AccountId; label = "$Profile (Klein edit)"; enabled = $true; env = [pscustomobject]@{} }
        $accounts += $existing
    }
    $existing.label = "$Profile (Klein edit)"
    $existing.enabled = $true
    if ($null -eq $existing.env) { $existing | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{}) }
    $existing.env | Add-Member -NotePropertyName BETTERPPTX_MODAL_IMAGE_EDIT_URL -NotePropertyValue $endpointUrl -Force
    $existing.env | Add-Member -NotePropertyName BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN -NotePropertyValue $token -Force
    $provider.activeAccountId = $AccountId
    $provider.accounts = $accounts
    $store.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $tempStore = "$StorePath.$([guid]::NewGuid().ToString('N')).tmp"
    $json = $store | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($tempStore, $json, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tempStore -Destination $StorePath -Force
    Write-Output ("Klein edit worker deployed and registered: profile=$Profile account=$AccountId endpoint-label=$EndpointLabel")
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
