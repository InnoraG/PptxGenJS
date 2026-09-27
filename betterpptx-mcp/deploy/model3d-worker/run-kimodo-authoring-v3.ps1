[CmdletBinding()]
param(
    [ValidateSet('inspect', 'generate', 'predownload', 'bake', 'download', 'presenter-generate', 'presenter-bake', 'presenter-download')]
    [string]$Action = 'generate',
    [ValidateSet('canary', 'quality')]
    [string]$Mode = 'canary',
    [string]$Slots = '',
    [string]$RunId = '',
    [string]$Destination = '',
    [switch]$SelectedOnly,
    [string]$Profile = '',
    [string]$MotionProfile = ''
)

$ErrorActionPreference = 'Stop'
$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appFile = Join-Path $workerRoot 'kimodo\kimodo_app.py'
$profilePicker = Join-Path $workerRoot 'pick_profile.py'

if (-not $Profile) {
    $oldPool = $env:BETTERPPTX_IMG3D_POOL
    try {
        # Kimodo belongs to the established BetterPPTX 3D routing pair:
        # betterxavatar is primary and betterpptx is secondary.
        $env:BETTERPPTX_IMG3D_POOL = 'betterxavatar,betterpptx'
        $Profile = (& py $profilePicker).Trim()
    }
    finally {
        $env:BETTERPPTX_IMG3D_POOL = $oldPool
    }
}
if (-not $Profile) {
    throw 'No budget-eligible Modal profile was selected.'
}

$env:MODAL_PROFILE = $Profile
$env:BETTERPPTX_KIMODO_DEV_MODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONWARNINGS = 'ignore'

function Get-ModalJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $lines = & py -m modal @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Modal inventory command failed: modal $($Arguments -join ' ')"
    }
    $payload = ($lines -join [Environment]::NewLine).Trim()
    if (-not $payload) { return @() }
    return $payload | ConvertFrom-Json
}

# Mandatory read-only preflight. Never start a Kimodo mutation unless the
# selected account still has the established BetterPPTX production objects.
$apps = @(Get-ModalJson -Arguments @('app', 'list', '--json'))
$volumes = @(Get-ModalJson -Arguments @('volume', 'list', '--json'))
$secrets = @(Get-ModalJson -Arguments @('secret', 'list', '--json'))
$appNames = @($apps | ForEach-Object { $_.description })
$volumeNames = @($volumes | ForEach-Object { $_.name })
$secretNames = @($secrets | ForEach-Object { $_.name })

if ('betterpptx-model3d' -notin $appNames) {
    throw "Modal preflight failed for $Profile`: deployed BetterPPTX model3d app is missing."
}
if ('betterpptx-clip-library' -notin $volumeNames) {
    throw "Modal preflight failed for $Profile`: canonical BetterPPTX clip library is missing."
}
if ('huggingface-token' -notin $secretNames) {
    throw "Modal preflight failed for $Profile`: Hugging Face secret is missing."
}

$kimodoInventory = @{}
foreach ($volumeName in @('betterpptx-kimodo-model-cache', 'betterpptx-kimodo-motion-store')) {
    if ($volumeName -in $volumeNames) {
        $entries = @(Get-ModalJson -Arguments @('volume', 'ls', $volumeName, '/', '--json'))
        $kimodoInventory[$volumeName] = @($entries | ForEach-Object { $_.filename })
    }
    else {
        $kimodoInventory[$volumeName] = @()
    }
}

Write-Host "Modal preflight profile=$Profile"
Write-Host "  apps: $($appNames -join ', ')"
Write-Host "  volumes: $($volumeNames -join ', ')"
Write-Host "  Kimodo cache root: $($kimodoInventory['betterpptx-kimodo-model-cache'] -join ', ')"
Write-Host "  Kimodo motion root: $($kimodoInventory['betterpptx-kimodo-motion-store'] -join ', ')"
if ($Action -eq 'inspect') { return }

Write-Host "Kimodo action=$Action profile=$Profile mode=$Mode"

$arguments = @('-m', 'modal', 'run')
switch ($Action) {
    'predownload' {
        $arguments += ($appFile + '::predownload')
    }
    'generate' {
        $arguments += @(($appFile + '::generate_authoring_v3'), '--mode', $Mode)
        if ($Slots) { $arguments += @('--slots', $Slots) }
        if ($RunId) { $arguments += @('--run-id', $RunId) }
    }
    'bake' {
        if (-not $RunId) { throw '-RunId is required for bake.' }
        $arguments += @(($appFile + '::bake_authoring_v3_candidate'), '--run-id', $RunId)
    }
    'download' {
        if (-not $RunId) { throw '-RunId is required for download.' }
        $arguments += @(($appFile + '::download_authoring_v3'), '--run-id', $RunId)
        if ($Destination) { $arguments += @('--destination', $Destination) }
        if ($SelectedOnly) { $arguments += '--selected-only' }
    }
    'presenter-generate' {
        $arguments += @(($appFile + '::generate_presenter_motions'), '--mode', $Mode)
        if ($Slots) { $arguments += @('--slots', $Slots) }
        if ($RunId) { $arguments += @('--run-id', $RunId) }
        if ($MotionProfile) { $arguments += @('--profile-path', (Resolve-Path -LiteralPath $MotionProfile).Path) }
    }
    'presenter-bake' {
        if (-not $RunId) { throw '-RunId is required for presenter-bake.' }
        $arguments += @(($appFile + '::bake_presenter_motion_candidate'), '--run-id', $RunId)
        if ($MotionProfile) { $arguments += @('--profile-path', (Resolve-Path -LiteralPath $MotionProfile).Path) }
    }
    'presenter-download' {
        if (-not $RunId) { throw '-RunId is required for presenter-download.' }
        $arguments += @(($appFile + '::download_presenter_motions'), '--run-id', $RunId)
        if ($Destination) { $arguments += @('--destination', $Destination) }
        if ($SelectedOnly) { $arguments += '--selected-only' }
    }
}

& py @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Kimodo Modal action failed with exit code $LASTEXITCODE."
}
