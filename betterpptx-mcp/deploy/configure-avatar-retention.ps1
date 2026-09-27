param(
  [string]$Project = 'betterpptx-mcp-staging',
  [string]$ArtifactBucket = 'betterpptx-mcp-staging-artifacts-860007156914',
  [string]$JobCollection = 'betterpptx_avatar_jobs',
  [string]$LifecycleFile = "$PSScriptRoot\avatar-artifact-lifecycle.json"
)

$ErrorActionPreference = 'Stop'
$gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
$gcloud = if ($gcloudCommand) { $gcloudCommand.Source } else { $null }
if (-not $gcloud) {
  $gcloudCommand = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($gcloudCommand) { $gcloud = $gcloudCommand.Source }
}
if (-not $gcloud) { throw 'gcloud CLI was not found.' }
if (-not (Test-Path -LiteralPath $LifecycleFile)) { throw "Lifecycle file not found: $LifecycleFile" }

$token = (& $gcloud auth print-access-token --quiet).Trim()
if (-not $token) { throw 'Could not obtain an authenticated Google Cloud access token.' }
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
function Invoke-GcpJson([string]$Uri, [string]$Method = 'Get', $Body = $null) {
  $params = @{ Uri = $Uri; Headers = $headers; Method = $Method; TimeoutSec = 45 }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 12) }
  Invoke-RestMethod @params
}

# Firestore TTL is attached to the durable job expiry field. Existing records
# remain readable; expired records are removed asynchronously by Firestore.
$fieldUrl = "https://firestore.googleapis.com/v1/projects/$Project/databases/(default)/collectionGroups/$JobCollection/fields/expiresAt"
$ttl = Invoke-GcpJson $fieldUrl
if ($ttl.ttlConfig.state -ne 'ACTIVE') {
  $ttl = Invoke-GcpJson "$fieldUrl?updateMask=ttlConfig" 'Patch' @{ ttlConfig = @{} }
}

# GCS lifecycle is scoped to the avatar tenant prefix so unrelated staging
# artifacts are never subject to this retention policy.
$lifecycle = Get-Content -Raw -LiteralPath $LifecycleFile | ConvertFrom-Json
$bucketUrl = "https://storage.googleapis.com/storage/v1/b/$ArtifactBucket"
$bucket = Invoke-GcpJson $bucketUrl 'Patch' @{ lifecycle = $lifecycle }

$tenantLifecycle = [bool]($bucket.lifecycle.rule | Where-Object { $_.condition.age -eq 2 -and $_.action.type -eq 'Delete' -and $_.condition.matchesPrefix -contains 'betterpptx-avatar-artifacts/tenants/' })
$workerLifecycle = [bool]($bucket.lifecycle.rule | Where-Object { $_.condition.age -eq 2 -and $_.action.type -eq 'Delete' -and $_.condition.matchesPrefix -contains 'betterpptx-avatar-artifacts/worker-idempotency/' })
$report = [ordered]@{
  status = 'RETENTION_CONFIGURED'
  project = $Project
  firestoreJobCollection = $JobCollection
  firestoreTtlVerified = ($ttl.ttlConfig.state -eq 'ACTIVE')
  artifactBucket = $ArtifactBucket
  gcsLifecycleVerified = ($tenantLifecycle -and $workerLifecycle)
  gcsTenantLifecycleVerified = $tenantLifecycle
  gcsWorkerIdempotencyLifecycleVerified = $workerLifecycle
  rawSecretsPrinted = $false
}
$outputPath = Join-Path $PSScriptRoot '..\outputs\avatar-retention-configuration-report.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8
Write-Output ($report | ConvertTo-Json -Depth 8)
