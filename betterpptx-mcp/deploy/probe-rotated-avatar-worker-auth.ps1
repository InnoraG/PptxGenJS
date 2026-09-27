param(
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$SecretName = 'betterpptx-avatar-worker-credentials',
  [string]$AccountId = '',
  [string]$EndpointOverride = '',
  [string]$Mode = 'liveportrait-musetalk',
  [ValidateSet('default','low','mouth-only','balanced','static')][string]$MotionProfile = 'default',
  [ValidateSet('default','raw','raw-sharp','inner','lower','aligned','warp','warp-upper','warp-upper-teeth','warp-upper-teeth-clean')][string]$MouthProfile = 'default',
  [string]$ImagePath = '.\betterpptx-mcp\outputs\presenter-identity-continuity-fixture.png',
  [string]$AudioPath = '.\betterpptx-mcp\outputs\narration\tts-en_US-ljspeech-high-mriud6ct-25c5632f.wav',
  [string]$OutputPath = ''
)
$ErrorActionPreference = 'Stop'
$raw = gcloud secrets versions access latest --secret=$SecretName --project=$Project
if ($LASTEXITCODE -ne 0) { throw 'Secret Manager read failed.' }
$bundle = ($raw -join "`n") | ConvertFrom-Json
$image = (Resolve-Path -LiteralPath $ImagePath).Path
$audio = (Resolve-Path -LiteralPath $AudioPath).Path
foreach ($account in @($bundle.providers.'avatar-worker'.accounts | Where-Object { -not $AccountId -or [string]$_.id -eq $AccountId })) {
  $uri = if ($EndpointOverride) { $EndpointOverride } else { [string]$account.env.BETTERPPTX_AVATAR_WORKER_URL + [string]$account.env.BETTERPPTX_AVATAR_WORKER_ROUTE }
  $out = Join-Path $env:TEMP ('betterpptx-avatar-auth-probe-' + [guid]::NewGuid().ToString('N') + '.bin')
  $headers = Join-Path $env:TEMP ('betterpptx-avatar-auth-probe-' + [guid]::NewGuid().ToString('N') + '.headers')
  try {
    $status = & curl.exe --silent --show-error --location --dump-header $headers --output $out --write-out '%{http_code}' `
      -H ("Authorization: Bearer " + [string]$account.env.BETTERPPTX_AVATAR_WORKER_TOKEN) `
      -H 'Accept: video/mp4, application/json' `
      -F ("image=@" + $image) -F ("audio=@" + $audio) -F 'quality=fast' -F ("mode=" + $Mode) -F 'durationMs=1500' -F ("motionProfile=" + $MotionProfile) -F ("mouthProfile=" + $MouthProfile) $uri
    $hash = (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
    $headerText = Get-Content -Raw -LiteralPath $headers -ErrorAction SilentlyContinue
    $gpu = [regex]::Match($headerText, '(?im)^X-Gpu-Seconds:\s*([^\r\n]+)').Groups[1].Value.Trim()
    $render = [regex]::Match($headerText, '(?im)^X-Render-Seconds:\s*([^\r\n]+)').Groups[1].Value.Trim()
    $pipeline = [regex]::Match($headerText, '(?im)^X-Pipeline:\s*([^\r\n]+)').Groups[1].Value.Trim()
    $motion = [regex]::Match($headerText, '(?im)^X-Motion-Profile:\s*([^\r\n]+)').Groups[1].Value.Trim()
    $mouth = [regex]::Match($headerText, '(?im)^X-Mouth-Profile:\s*([^\r\n]+)').Groups[1].Value.Trim()
    $providerExecutionIds = [regex]::Match($headerText, '(?im)^X-Provider-Execution-Ids:\s*([^\r\n]+)').Groups[1].Value.Trim()
    if ($OutputPath) {
      $target = [IO.Path]::GetFullPath($OutputPath)
      New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($target)) | Out-Null
      Copy-Item -LiteralPath $out -Destination $target -Force
    }
    [pscustomobject]@{ account = [string]$account.id; status = [string]$status; responseBytes = (Get-Item -LiteralPath $out).Length; sha256 = $hash; gpuSeconds = $gpu; renderSeconds = $render; pipeline = $pipeline; motionProfile = $motion; mouthProfile = $mouth; providerExecutionIds = @($providerExecutionIds -split '[,|\s]+' | Where-Object { $_ }); endpointOverride = [bool]$EndpointOverride } | ConvertTo-Json -Compress
  } finally {
    Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $headers -Force -ErrorAction SilentlyContinue
  }
}
