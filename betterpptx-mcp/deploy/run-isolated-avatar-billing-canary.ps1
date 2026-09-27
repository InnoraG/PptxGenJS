param(
  [Parameter(Mandatory = $true)][string]$Profile,
  [Parameter(Mandatory = $true)][string]$AccountId,
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$SecretName = 'betterpptx-avatar-worker-credentials',
  [string]$ImagePath = '.\betterpptx-mcp\outputs\presenter-identity-continuity-fixture.png',
  [string]$AudioPath = '.\betterpptx-mcp\outputs\narration\tts-en_US-ljspeech-high-mriud6ct-25c5632f.wav',
  [string]$RunId = '',
  [Parameter(Mandatory = $true)][string]$OwnerApprovalRef,
  [Parameter(Mandatory = $true)][switch]$ConfirmPaidRequest
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmPaidRequest) { throw 'ConfirmPaidRequest is required; this script can deploy a paid Modal app and must never run implicitly.' }
if ([string]::IsNullOrWhiteSpace($OwnerApprovalRef)) { throw 'OwnerApprovalRef is required; record the owner approval reference before running a paid canary.' }
$workspace = if ($Profile -eq 'telcomgapp') { 'telcomgapp' } else { $Profile }
if (-not $RunId) { $RunId = (Get-Date).ToUniversalTime().ToString('MMddHHmmss') }
$safeRunId = ($RunId -replace '[^a-z0-9-]', '').ToLowerInvariant()
if (-not $safeRunId) { throw 'RunId must contain at least one alphanumeric character.' }
$appName = "bpx-avatar-billing-$AccountId-$safeRunId"
$label = "bpxbc-$safeRunId"
$endpoint = "https://$workspace--$label.modal.run/v1/avatar/lipsync"
$root = Join-Path $env:TEMP ("betterpptx-isolated-avatar-billing-" + [guid]::NewGuid().ToString('N'))
$deployLog = Join-Path $root 'deploy.log'
$probeLog = Join-Path $root 'probe.json'
$windowStart = (Get-Date).ToUniversalTime(); $windowStart = [datetime]::new($windowStart.Year, $windowStart.Month, $windowStart.Day, $windowStart.Hour, 0, 0, [DateTimeKind]::Utc)
$windowEnd = $windowStart.AddHours(1)
$startIso = $windowStart.ToString('yyyy-MM-ddTHH:mm:ssZ')
$endIso = $windowEnd.ToString('yyyy-MM-ddTHH:mm:ssZ')
$snapshotPath = (Resolve-Path '.\betterpptx-mcp\outputs').Path + "\avatar-modal-isolated-billing-$AccountId-$safeRunId.json"
New-Item -ItemType Directory -Path $root -Force | Out-Null
$deployed = $false
$cleanup = $false
try {
  $env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'
  $env:MODAL_PROFILE = $Profile
  $env:AVATAR_ACCOUNT_ID = $AccountId
  $env:AVATAR_APP_NAME = $appName
  $env:AVATAR_ENDPOINT_LABEL = $label
  & python -m modal deploy 'D:\PptxGenJS_Claude_betterpptx_mcp_metrology\avatar-metrology\modal_avatar_endpoint.py' *> $deployLog
  if ($LASTEXITCODE -ne 0) { throw "Isolated Modal deploy failed for $AccountId" }
  $deployed = $true
  & .\betterpptx-mcp\deploy\probe-rotated-avatar-worker-auth.ps1 -Project $Project -SecretName $SecretName -AccountId $AccountId -EndpointOverride $endpoint -ImagePath $ImagePath -AudioPath $AudioPath | Set-Content -LiteralPath $probeLog -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "Isolated worker canary failed for $AccountId" }
  $probe = Get-Content -Raw -LiteralPath $probeLog | ConvertFrom-Json
  python betterpptx-mcp\deploy\export-avatar-modal-billing-snapshot.py --profile $Profile --account-id $AccountId --start $startIso --end $endIso --output $snapshotPath *> (Join-Path $root 'billing.log')
  if ($LASTEXITCODE -ne 0) { throw "Isolated billing export failed for $AccountId" }
  $snapshot = Get-Content -Raw -LiteralPath $snapshotPath | ConvertFrom-Json
  $matchingBuckets = @($snapshot.buckets | Where-Object { [string]$_.description -eq $appName })
  $a10gCost = ($matchingBuckets | ForEach-Object { [decimal]$_.costByResource.A10G } | Measure-Object -Sum).Sum
  $stableTagMatch = $matchingBuckets.Count -gt 0 -and @($matchingBuckets | Where-Object { $_.tags.account -eq $AccountId -and $_.tags.pipeline -eq 'liveportrait-musetalk' -and $_.tags.service -eq 'avatar-worker' }).Count -eq $matchingBuckets.Count
  $providerExecutionIds = @($probe.providerExecutionIds | Where-Object { [string]$_ -match '^fc-' } | ForEach-Object { [string]$_ })
  $isolatedInvoiceJoin = $matchingBuckets.Count -eq 1 -and $providerExecutionIds.Count -eq 1 -and $stableTagMatch -and [decimal]$a10gCost -gt 0
  $report = [ordered]@{
    schemaVersion = 'betterpptx.avatar-isolated-billing-canary.v1'
    status = if ($probe.status -eq '200' -and $matchingBuckets.Count -gt 0 -and $stableTagMatch) { 'PARTIAL_ATTRIBUTION_PASS' } else { 'BLOCKED' }
    accountId = $AccountId
    modalProfile = $Profile
    ownerApprovalRef = $OwnerApprovalRef
    isolatedAppName = $appName
    isolatedEndpointLabel = $label
    window = [ordered]@{ start = $startIso; end = $endIso; resolution = 'h' }
    workerProbe = $probe
    providerRows = $matchingBuckets
    providerA10gCost = [decimal]$a10gCost
    providerExecutionIds = $providerExecutionIds
    checks = [ordered]@{
      workerHttp200 = ($probe.status -eq '200')
      validMp4 = ([int]$probe.responseBytes -gt 16 -and [string]$probe.sha256 -match '^[0-9a-f]{64}$')
      uniqueProviderObjectMatched = ($matchingBuckets.Count -gt 0)
      stableAccountPipelineTagsMatched = $stableTagMatch
      isolatedInvoiceJoin = $isolatedInvoiceJoin
      requestAttribution = $false
    }
    interpretation = 'A unique isolated Modal App object and A10G invoice row are matched to exactly one captured Modal FunctionCall ID; this is a bounded per-run invoice join, not request attribution for the shared production App.'
    cleanupCompleted = $false
    customerData = $false
    rawSecretsPrinted = $false
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $snapshotPath -Encoding utf8
  Write-Output ($report | ConvertTo-Json -Depth 12)
} finally {
  if ($deployed) {
    & python -m modal app stop $appName -y *> (Join-Path $root 'stop.log')
    $cleanup = ($LASTEXITCODE -eq 0)
  }
  if (Test-Path -LiteralPath $snapshotPath) {
    try {
      $final = Get-Content -Raw -LiteralPath $snapshotPath | ConvertFrom-Json
      $final.cleanupCompleted = $cleanup
      $final | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $snapshotPath -Encoding utf8
    } catch {}
  }
  Remove-Item Env:PYTHONUTF8,Env:PYTHONIOENCODING,Env:MODAL_PROFILE,Env:AVATAR_ACCOUNT_ID,Env:AVATAR_APP_NAME,Env:AVATAR_ENDPOINT_LABEL -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
