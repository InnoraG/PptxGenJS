param(
  [string]$ProjectId = "betterpptx-mcp-staging",
  [string]$Region = "us-central1",
  [string]$Repository = "betterpptx-mcp",
  [string]$Service = "betterpptx-dodo-webhook-staging",
  [string]$ImageTag = "",
  [string]$BuildConfig = "deploy/cloudbuild.dodo-webhook.yaml",
  [string]$RuntimeServiceAccount = "",
  [string]$WebhookSecretName = "betterpptx-dodo-webhook-secret",
  [string]$CustomHeaderName = "X-BetterPPTX-Dodo-Webhook-Token",
  [string]$CustomHeaderSecretName = "betterpptx-dodo-webhook-custom-token",
  [string]$CustomHeaderToken = "",
  [string]$CustomHeaderTokenFile = "",
  [switch]$PromptForCustomHeaderToken,
  [switch]$RotateCustomHeaderToken,
  [int]$BuildTimeoutSeconds = 1800,
  [switch]$SkipDeploy,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Convert-SecureStringToPlainText([securestring]$Secret) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

Assert-Command "gcloud"

if (-not $ImageTag) {
  $ImageTag = "webhook-$(Get-Date -Format 'yyyyMMddHHmmss')"
}

if (-not $RuntimeServiceAccount) {
  $RuntimeServiceAccount = "bpptx-dodo-wh-runtime@$ProjectId.iam.gserviceaccount.com"
}

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Service`:$ImageTag"
$lastImagePath = Join-Path ([System.IO.Path]::GetTempPath()) "betterpptx-last-dodo-webhook-image-tag.txt"
Set-Content -Path $lastImagePath -Value $image -NoNewline

Write-Host "Project : $ProjectId"
Write-Host "Region  : $Region"
Write-Host "Service : $Service"
Write-Host "Image   : $image"
Write-Host "Config  : $BuildConfig"
Write-Host "SA      : $RuntimeServiceAccount"

$saName = $RuntimeServiceAccount.Split("@")[0]
$saExists = gcloud iam service-accounts describe $RuntimeServiceAccount --project=$ProjectId --format="value(email)" 2>$null
if (-not $saExists) {
  gcloud iam service-accounts create $saName `
    --project=$ProjectId `
    --display-name="BetterPPTX Dodo webhook runtime"
  Assert-NativeSuccess "gcloud iam service-accounts create"
}

$member = "serviceAccount:$RuntimeServiceAccount"

$customHeaderSecretExists = gcloud secrets describe $CustomHeaderSecretName --project=$ProjectId --format="value(name)" 2>$null
if ($CustomHeaderTokenFile) {
  $CustomHeaderToken = (Get-Content -LiteralPath $CustomHeaderTokenFile -Raw).Trim()
}
if ($PromptForCustomHeaderToken) {
  $CustomHeaderToken = Convert-SecureStringToPlainText (Read-Host "Paste the Dodo webhook custom header token" -AsSecureString)
}
if ($RotateCustomHeaderToken -and -not $CustomHeaderToken) {
  $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $CustomHeaderToken = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}
if ($CustomHeaderToken) {
  $tmpSecretFile = New-TemporaryFile
  try {
    Set-Content -Path $tmpSecretFile -Value $CustomHeaderToken -NoNewline -Encoding ASCII
    if ($customHeaderSecretExists) {
      gcloud secrets versions add $CustomHeaderSecretName `
        --project=$ProjectId `
        --data-file=$tmpSecretFile `
        --quiet
      Assert-NativeSuccess "gcloud secrets versions add custom webhook token"
    } else {
      gcloud secrets create $CustomHeaderSecretName `
        --project=$ProjectId `
        --replication-policy="automatic" `
        --data-file=$tmpSecretFile `
        --quiet
      Assert-NativeSuccess "gcloud secrets create custom webhook token"
      $customHeaderSecretExists = $true
    }
  } finally {
    Remove-Item -LiteralPath $tmpSecretFile -Force -ErrorAction SilentlyContinue
  }
} elseif (-not $customHeaderSecretExists) {
  $tmpSecretFile = New-TemporaryFile
  try {
    $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    Set-Content -Path $tmpSecretFile -Value $token -NoNewline -Encoding ASCII
    gcloud secrets create $CustomHeaderSecretName `
      --project=$ProjectId `
      --replication-policy="automatic" `
      --data-file=$tmpSecretFile `
      --quiet
    Assert-NativeSuccess "gcloud secrets create custom webhook token"
  } finally {
    Remove-Item -LiteralPath $tmpSecretFile -Force -ErrorAction SilentlyContinue
  }
}

gcloud projects add-iam-policy-binding $ProjectId `
  --member=$member `
  --role="roles/datastore.user" `
  --condition=None `
  --quiet | Out-Null
Assert-NativeSuccess "gcloud projects add-iam-policy-binding datastore.user"

gcloud secrets add-iam-policy-binding $WebhookSecretName `
  --project=$ProjectId `
  --member=$member `
  --role="roles/secretmanager.secretAccessor" `
  --condition=None `
  --quiet | Out-Null
Assert-NativeSuccess "gcloud secrets add-iam-policy-binding webhook secret"

gcloud secrets add-iam-policy-binding $CustomHeaderSecretName `
  --project=$ProjectId `
  --member=$member `
  --role="roles/secretmanager.secretAccessor" `
  --condition=None `
  --quiet | Out-Null
Assert-NativeSuccess "gcloud secrets add-iam-policy-binding custom webhook token"

gcloud builds submit . `
  --project=$ProjectId `
  --config=$BuildConfig `
  --substitutions=_IMAGE=$image `
  --timeout=$BuildTimeoutSeconds `
  --quiet
Assert-NativeSuccess "gcloud builds submit"

if ($SkipDeploy) {
  Write-Host "Built image only: $image"
  return
}

$envVars = @(
  "BETTERPPTX_BILLING_LEDGER_STORE=firestore",
  "BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX=betterpptx_billing",
  "BETTERPPTX_GCP_PROJECT=$ProjectId",
  "BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER=$CustomHeaderName",
  "BETTERPPTX_WEBHOOK_RATE_LIMIT_MAX=120",
  "BETTERPPTX_WEBHOOK_RATE_LIMIT_WINDOW_MS=60000"
)

gcloud run deploy $Service `
  --project=$ProjectId `
  --region=$Region `
  --image=$image `
  --platform=managed `
  --allow-unauthenticated `
  --service-account=$RuntimeServiceAccount `
  --port=8080 `
  --cpu=1 `
  --memory=512Mi `
  --concurrency=20 `
  --min-instances=0 `
  --max-instances=2 `
  --timeout=60s `
  --set-env-vars ($envVars -join ",") `
  --set-secrets "DODO_PAYMENTS_WEBHOOK_SECRET=$WebhookSecretName`:latest,BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN=$CustomHeaderSecretName`:latest" `
  --quiet
Assert-NativeSuccess "gcloud run deploy"

$serviceUrl = gcloud run services describe $Service `
  --project=$ProjectId `
  --region=$Region `
  --format="value(status.url)"
Assert-NativeSuccess "gcloud run services describe"

Write-Host "Service URL: $serviceUrl"

if (-not $SkipHealthCheck) {
  $health = Invoke-WebRequest `
    -Uri "$serviceUrl/health" `
    -UseBasicParsing `
    -TimeoutSec 30
  if ($health.StatusCode -ne 200) {
    throw "Health check failed with HTTP $($health.StatusCode)."
  }
  Write-Host "Health  : OK"
}

Write-Host "Deploy complete: $image"
