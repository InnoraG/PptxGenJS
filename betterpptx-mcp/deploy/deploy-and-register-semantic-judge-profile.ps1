param(
    [Parameter(Mandatory = $true)][string]$Profile,
    [Parameter(Mandatory = $true)][string]$AccountId,
    [Parameter(Mandatory = $true)][string]$EndpointLabel,
    [string]$WorkspaceSlug = '',
    [string]$StorePath = (Join-Path $PSScriptRoot '..\config\credential-store.json'),
    [int]$AuthProbeTimeoutMs = 15000,
    [int]$ModalCommandTimeoutMs = 180000
)
$ErrorActionPreference = 'Stop'

function Resolve-ModalInvocation {
    $configured = $env:BETTERPPTX_MODAL_BIN
    if ($configured -and (Test-Path -LiteralPath $configured)) {
        return [pscustomobject]@{ FileName = (Resolve-Path -LiteralPath $configured).Path; Prefix = @() }
    }
    $command = Get-Command modal.exe -ErrorAction SilentlyContinue
    if ($null -eq $command) { $command = Get-Command modal -ErrorAction SilentlyContinue }
    if ($command) { return [pscustomobject]@{ FileName = $command.Source; Prefix = @() } }
    $localModal = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\Scripts\modal.exe'
    if (Test-Path -LiteralPath $localModal) { return [pscustomobject]@{ FileName = $localModal; Prefix = @() } }
    return [pscustomobject]@{ FileName = 'python'; Prefix = @('-m', 'modal') }
}

$modalInvocation = Resolve-ModalInvocation

function Invoke-ModalCommand {
    param([Parameter(Mandatory = $true)][string[]]$Arguments, [Parameter(Mandatory = $true)][int]$TimeoutMs)
    $allArguments = @($modalInvocation.Prefix) + @($Arguments)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $modalInvocation.FileName
    $psi.Arguments = (($allArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    try {
        if (-not $process.Start()) { throw "unable to start Modal CLI ($($modalInvocation.FileName))" }
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill() } catch {}
            throw "Modal command timed out after ${TimeoutMs}ms before a safe result was returned."
        }
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = $process.StandardOutput.ReadToEnd()
            Stderr = $process.StandardError.ReadToEnd()
        }
    } finally {
        $process.Dispose()
    }
}

function New-OwnerToken {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

function Get-SafeModalDiagnostic {
    param([Parameter(Mandatory = $true)]$Result)
    $text = (($Result.Stderr + "`n" + $Result.Stdout) -replace "\s+", " ").Trim()
    # Keep deployment failures actionable without echoing tokens, URLs or CLI payloads.
    $text = [regex]::Replace($text, '(?i)(token|secret|authorization|api[_-]?key)\s*[:=]?\s*[^ ]+', '$1=<redacted>')
    $text = [regex]::Replace($text, 'https?://[^ ]+', '<url-redacted>')
    if ($text.Length -gt 240) { $text = $text.Substring(0, 240) + '…' }
    if (-not $text) { $text = 'no diagnostic text returned' }
    return "exit=$($Result.ExitCode); $text"
}

$temp = Join-Path $env:TEMP ("betterpptx-semantic-judge-deploy-" + [guid]::NewGuid().ToString('N') + '.env')
try {
    $token = New-OwnerToken
    Set-Content -LiteralPath $temp -Value ("SEMANTIC_JUDGE_ENDPOINT_TOKEN=" + $token) -NoNewline
    $env:MODAL_PROFILE = $Profile
    $env:SEMANTIC_JUDGE_ENDPOINT_LABEL = $EndpointLabel
    $env:SEMANTIC_JUDGE_PAIR_ENDPOINT_LABEL = ($EndpointLabel + '-pair')
    $env:SEMANTIC_JUDGE_MODAL_SECRET_NAME = 'betterpptx-semantic-judge-token'
    $env:SEMANTIC_JUDGE_DEPLOYMENT_APPROVED = 'true'
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'

    # Fail before creating/rotating a secret if the requested Modal workspace
    # profile is not authenticated. Never fall back to another workspace: the
    # account/profile boundary is part of the owner-controlled rotation policy.
    $tokenInfo = Invoke-ModalCommand -Arguments @('token', 'info') -TimeoutMs $AuthProbeTimeoutMs
    if ($tokenInfo.ExitCode -ne 0) {
        throw "Modal profile '$Profile' is not authenticated; deployment stopped before secret or endpoint mutation."
    }

    $secretResult = Invoke-ModalCommand -Arguments @('secret', 'create', 'betterpptx-semantic-judge-token', '--from-dotenv', $temp, '--force') -TimeoutMs $ModalCommandTimeoutMs
    if ($secretResult.ExitCode -ne 0) { throw "semantic-judge secret creation failed for profile $Profile ($(Get-SafeModalDiagnostic -Result $secretResult))" }

    $workerPath = Join-Path $PSScriptRoot 'semantic-judge-worker\semantic_judge_app.py'
    # Recreate ensures a rotated Modal secret is not left in an already-running container.
    $deployResult = Invoke-ModalCommand -Arguments @('deploy', '--strategy', 'recreate', $workerPath) -TimeoutMs $ModalCommandTimeoutMs
    $deployOutput = ($deployResult.Stdout + "`n" + $deployResult.Stderr)
    if ($deployResult.ExitCode -ne 0) { throw "Modal semantic-judge deploy failed for profile $Profile ($(Get-SafeModalDiagnostic -Result $deployResult))" }
    $matches = [regex]::Matches($deployOutput, 'https://[A-Za-z0-9._-]+\.modal\.run')
    $urls = @($matches | ForEach-Object { $_.Value } | Select-Object -Unique)
    # Modal CLI 1.5.x confirms deployment but no longer prints FastAPI URLs. When the
    # owner supplies the exact workspace slug, derive only the documented endpoint form;
    # never guess a workspace from the active/default profile.
    if ($urls.Count -lt 2 -and $WorkspaceSlug -and $deployOutput -match '(?i)App deployed') {
        $safeSlug = $WorkspaceSlug.Trim().ToLowerInvariant()
        $safeLabel = $EndpointLabel.Trim().ToLowerInvariant()
        $urls = @(
            "https://$safeSlug--$safeLabel.modal.run",
            "https://$safeSlug--$safeLabel-pair.modal.run"
        )
    }
    if ($urls.Count -lt 2) { throw "Modal semantic-judge deploy returned fewer than two endpoint URLs for profile $Profile" }
    $pairEndpointUrl = $urls | Where-Object { $_ -match [regex]::Escape($EndpointLabel + '-pair') } | Select-Object -First 1
    if (-not $pairEndpointUrl) { $pairEndpointUrl = $urls[1] }
    $endpointUrl = $urls | Where-Object { $_ -ne $pairEndpointUrl } | Select-Object -First 1
    if (-not $endpointUrl) { throw "Modal semantic-judge deploy returned no primary endpoint URL for profile $Profile" }

    $store = Get-Content -LiteralPath $StorePath -Raw | ConvertFrom-Json
    if ($store.schemaVersion -ne 'betterpptx.credential-store.v1') { throw 'credential store schema mismatch' }
    $provider = $store.providers.'semantic-judge-worker'
    if ($null -eq $provider) {
        $provider = [pscustomobject]@{
            label = 'Private Qwen semantic judge worker (isolated)'
            category = 'semantic-judge'
            envKeys = @('BETTERPPTX_SEMANTIC_JUDGE_URL', 'BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL', 'BETTERPPTX_SEMANTIC_JUDGE_TOKEN')
            activeAccountId = $AccountId
            accounts = @()
        }
        $store.providers | Add-Member -NotePropertyName 'semantic-judge-worker' -NotePropertyValue $provider
    }
    $accounts = @($provider.accounts)
    $existing = $accounts | Where-Object { $_.id -eq $AccountId } | Select-Object -First 1
    if ($null -eq $existing) {
        $existing = [pscustomobject]@{ id = $AccountId; label = "$Profile (Qwen judge)"; enabled = $true; env = [pscustomobject]@{} }
        $accounts += $existing
    }
    $existing.label = "$Profile (Qwen judge)"
    $existing.enabled = $true
    if ($null -eq $existing.env) { $existing | Add-Member -NotePropertyName env -NotePropertyValue ([pscustomobject]@{}) }
    $existing.env | Add-Member -NotePropertyName BETTERPPTX_SEMANTIC_JUDGE_URL -NotePropertyValue $endpointUrl -Force
    $existing.env | Add-Member -NotePropertyName BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL -NotePropertyValue $pairEndpointUrl -Force
    $existing.env | Add-Member -NotePropertyName BETTERPPTX_SEMANTIC_JUDGE_TOKEN -NotePropertyValue $token -Force
    $provider.activeAccountId = $AccountId
    $provider.accounts = $accounts
    $store.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $tempStore = "$StorePath.$([guid]::NewGuid().ToString('N')).tmp"
    $store | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempStore -Encoding UTF8
    Move-Item -LiteralPath $tempStore -Destination $StorePath -Force
    Write-Output ("Qwen semantic-judge worker deployed and registered: profile=$Profile account=$AccountId endpoint-label=$EndpointLabel")
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
