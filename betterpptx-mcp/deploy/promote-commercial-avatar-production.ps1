param(
    [string]$Project = 'betterpptx-mcp-staging',
    [string]$Region = 'us-central1',
    [string]$Service = 'betterpptx-mcp-staging',
    [string]$CanaryImage = 'betterpptx-mcp/outputs/consented-head-talker-face-crop-long.png',
    [string]$CanaryAudio = 'betterpptx-mcp/outputs/narration/tts-en_US-ljspeech-high-mriud6ct-25c5632f.wav',
    [ValidateSet('low','balanced','natural','medium','blink','blink-soft','blink-closed-soft-gaze','static')]
    [string]$CanaryMotionProfile = 'blink',
    [ValidateSet('jaw','jaw-strong','raw')]
    [string]$CanaryMouthProfile = 'jaw'
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$source = Join-Path $repo 'betterpptx-mcp\deploy\avatar-worker\modal_avatar_commercial_eval.py'
$artifactRoot = Join-Path $repo 'betterpptx-mcp\outputs\commercial-promotion-20260727'
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null

function New-OwnerToken {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([Convert]::ToBase64String($bytes)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Get-FileFingerprint16([string]$path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash([System.IO.File]::ReadAllBytes($path))
        return ([System.BitConverter]::ToString($hash) -replace '-', '').Substring(0, 16)
    } finally { $sha.Dispose() }
}

function Deploy-Candidate([hashtable]$account) {
    $token = New-OwnerToken
    $secretFile = Join-Path $env:TEMP ("betterpptx-commercial-auth-" + [guid]::NewGuid().ToString('N') + '.env')
    $logFile = Join-Path $artifactRoot ("modal-deploy-" + $account.id + '.log')
    try {
        Set-Content -LiteralPath $secretFile -Value ("BETTERPPTX_COMMERCIAL_AVATAR_ENDPOINT_TOKEN=" + $token) -NoNewline
        $env:MODAL_PROFILE = $account.profile
        $oldErrorPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & py -m modal secret create betterpptx-avatar-commercial-auth --from-dotenv $secretFile --force 2>$null | Out-Null
        $secretExit = $LASTEXITCODE
        $ErrorActionPreference = $oldErrorPreference
        if ($secretExit -ne 0) { throw "Commercial Modal secret creation failed for $($account.id)" }
        $oldErrorPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & py -m modal deploy $source --tag commercial-restoreformer-20260727 2>&1 | Tee-Object -LiteralPath $logFile | Out-Null
        $deployExit = $LASTEXITCODE
        $ErrorActionPreference = $oldErrorPreference
        if ($deployExit -ne 0) { throw "Commercial Modal deploy failed for $($account.id)" }
        $text = Get-Content -Raw -LiteralPath $logFile
        $normalizedText = $text -replace '[^A-Za-z0-9:/._-]+', ''
        $matches = [regex]::Matches($normalizedText, 'https://[A-Za-z0-9._-]+\.modal\.run')
        if ($matches.Count -eq 0) { throw "Deployment succeeded but no Modal endpoint URL was reported for $($account.id)" }
        $endpoint = $matches[$matches.Count - 1].Value.TrimEnd('/')
        return ,([pscustomobject][ordered]@{ id = $account.id; profile = $account.profile; endpoint = $endpoint; token = $token; status = 'DEPLOYED' })
    } finally {
        Remove-Item -LiteralPath $secretFile -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-CommercialCanary([pscustomobject]$candidate) {
    $output = Join-Path $artifactRoot ($candidate.id + '-blink-canary.mp4')
    $headersFile = Join-Path $artifactRoot ($candidate.id + '-blink-canary.headers.txt')
    $imageFull = (Resolve-Path (Join-Path $repo $CanaryImage)).Path
    $audioFull = (Resolve-Path (Join-Path $repo $CanaryAudio)).Path
    # Multipart fields select POST for the initial request. Let curl follow
    # Modal's 303 attempt handoff as GET; forcing POST on the handoff yields a
    # provider-side 400 on some rotated accounts.
    $lastError = $null
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        Remove-Item -LiteralPath $headersFile, $output -Force -ErrorAction SilentlyContinue
        & curl.exe -sS -L --max-time 180 $candidate.endpoint `
            -H ("Authorization: Bearer " + $candidate.token) `
            -H 'Accept: video/mp4' `
            -D $headersFile -o $output `
            -F ("image=@" + $imageFull + ';type=image/png') `
            -F ("audio=@" + $audioFull + ';type=audio/wav') `
            -F ("motionProfile=" + $CanaryMotionProfile) -F ("mouthProfile=" + $CanaryMouthProfile) -F 'parsingMode=jaw' -F 'bboxShift=0' -F 'durationMs=4000' | Out-Null
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $headersFile)) {
            $headers = Get-Content -Raw -LiteralPath $headersFile
            if ($headers -match 'HTTP/\S+\s+200') {
                $size = (Get-Item -LiteralPath $output).Length
                if ($size -ge 1024) {
                    $pipeline = ([regex]::Match($headers, '(?im)^X-Pipeline:\s*([^\r\n]+)')).Groups[1].Value.Trim()
                    $enhancement = ([regex]::Match($headers, '(?im)^X-Enhancement:\s*([^\r\n]+)')).Groups[1].Value.Trim()
                    $restorationSecondsText = ([regex]::Match($headers, '(?im)^X-RestoreFormer-Seconds:\s*([^\r\n]+)')).Groups[1].Value.Trim()
                    $restorationSeconds = if ($restorationSecondsText) { [double]$restorationSecondsText } else { 0 }
                    if ($pipeline -eq 'liveportrait-musetalk-commercial-restoreformer-pp' -and $enhancement -eq 'restoreformer++' -and $restorationSeconds -gt 0) {
                        return [pscustomobject][ordered]@{ account = $candidate.id; status = 'PASS'; endpoint = $candidate.endpoint; pipeline = $pipeline; enhancement = $enhancement; restorationSeconds = $restorationSeconds; bytes = $size; profile = $CanaryMotionProfile; mouthProfile = $CanaryMouthProfile; tokenFingerprint = Get-FileFingerprint16 $headersFile }
                    }
                    $lastError = "unexpected pipeline header"
                } else { $lastError = 'implausibly small MP4' }
            } else { $lastError = 'not HTTP 200' }
        } else { $lastError = "transport failed (attempt $attempt)" }
    }
    throw "Commercial HTTP canary failed for $($candidate.id): $lastError"
}

$accounts = @(
    @{ id = 'telcomgapp'; profile = 'telcomgapp' },
    @{ id = 'fluxworkerai'; profile = 'betterpptx-fluxworkerai' }
)
$candidates = @()
foreach ($account in $accounts) {
    $candidates += Deploy-Candidate $account
}
foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace([string]$candidate.endpoint) -or [string]::IsNullOrWhiteSpace([string]$candidate.id)) {
        throw 'Commercial deployment returned an invalid candidate record; routing was not changed.'
    }
}

$canaries = @()
foreach ($candidate in $candidates) {
    $canaries += Invoke-CommercialCanary $candidate
}
if ($canaries.Count -ne 2 -or @($canaries | Where-Object status -ne 'PASS').Count -gt 0) {
    throw 'Commercial promotion stopped: both account canaries must pass before routing changes.'
}

# Add a separate commercial credential namespace to the owner-controlled Secret
# Manager bundle. Existing resale-safe accounts and tokens are preserved verbatim.
$bundleIn = Join-Path $env:TEMP ("betterpptx-avatar-commercial-bundle-in-" + [guid]::NewGuid().ToString('N') + '.json')
$bundleOut = Join-Path $env:TEMP ("betterpptx-avatar-commercial-bundle-out-" + [guid]::NewGuid().ToString('N') + '.json')
try {
    gcloud secrets versions access latest --secret=betterpptx-avatar-worker-credentials --project=$Project --out-file=$bundleIn *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the owner-controlled avatar credential bundle.' }
    $bundle = Get-Content -Raw -LiteralPath $bundleIn | ConvertFrom-Json
    $commercialAccounts = @()
    foreach ($candidate in $candidates) {
        $commercialAccounts += [pscustomobject][ordered]@{
            id = $candidate.id
            label = "Commercial LP/MT + RestoreFormer++ ($($candidate.profile))"
            enabled = $true
            env = [ordered]@{
                BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL = $candidate.endpoint
                BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE = '/'
                BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN = $candidate.token
                BETTERPPTX_COMMERCIAL_AVATAR_WORKER_WEIGHT = '1'
            }
        }
    }
    $commercialProvider = [pscustomobject][ordered]@{
        label = 'Commercial avatar worker (LP/MT + RestoreFormer++)'
        category = 'avatar'
        envKeys = @('BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL', 'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE', 'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN', 'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_WEIGHT')
        activeAccountId = 'telcomgapp'
        accounts = $commercialAccounts
    }
    # JSON object keys may contain hyphens; add the namespace through the PSObject API.
    if ($bundle.providers.PSObject.Properties['avatar-worker-commercial']) {
        $bundle.providers.PSObject.Properties.Remove('avatar-worker-commercial')
    }
    $bundle.providers | Add-Member -NotePropertyName 'avatar-worker-commercial' -NotePropertyValue $commercialProvider
    $bundle | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $bundleOut -Encoding utf8
    gcloud secrets versions add betterpptx-avatar-worker-credentials --project=$Project --data-file=$bundleOut *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Could not publish the commercial credential namespace.' }
} finally {
    Remove-Item -LiteralPath $bundleIn, $bundleOut -Force -ErrorAction SilentlyContinue
}

# Promote only after the two commercial endpoints and credential namespace pass.
gcloud run services update $Service --project=$Project --region=$Region --update-env-vars 'BETTERPPTX_AVATAR_PROVIDER=liveportrait-musetalk-commercial,BETTERPPTX_AVATAR_PRODUCTION_ONLY=1,BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE=blink,BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE=jaw,BETTERPPTX_AVATAR_LICENSE_APPROVED=1' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run routing promotion failed.' }
$revision = (gcloud run services describe $Service --project=$Project --region=$Region --format='value(status.latestReadyRevisionName)').Trim()
[pscustomobject][ordered]@{
    status = 'COMMERCIAL_ROUTING_PROMOTED'
    project = $Project
    region = $Region
    service = $Service
    provider = 'liveportrait-musetalk-commercial'
    profile = $CanaryMotionProfile
    mouthProfile = $CanaryMouthProfile
    enhancement = 'restoreformer++'
    readyRevision = $revision
    canaries = $canaries
    productionFallbackDisabled = $true
    rawSecretsPrinted = $false
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $artifactRoot 'commercial-promotion-report.json') -Encoding utf8
Get-Content -Raw -LiteralPath (Join-Path $artifactRoot 'commercial-promotion-report.json')
