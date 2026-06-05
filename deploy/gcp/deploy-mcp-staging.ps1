param(
  [string]$ProjectId = "betterpptx-mcp-staging",
  [string]$Region = "us-central1",
  [string]$Repository = "betterpptx-mcp",
  [string]$Service = "betterpptx-mcp-staging",
  [string]$ImageTag = "",
  [string]$BuildConfig = "deploy/cloudbuild.mcp.yaml",
  [string]$RuntimeServiceAccount = "",
  [string]$SketchfabSecretName = "betterpptx-sketchfab-api-key",
  [string]$SketchfabApiKey = "",
  [string]$SketchfabApiKeyFile = "",
  [switch]$PromptForSketchfabApiKey,
  [switch]$SkipSketchfabSecret,
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
  $ImageTag = "staging-$(Get-Date -Format 'yyyyMMddHHmmss')"
}

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$Service`:$ImageTag"
$lastImagePath = Join-Path ([System.IO.Path]::GetTempPath()) "betterpptx-last-image-tag.txt"
Set-Content -Path $lastImagePath -Value $image -NoNewline

Write-Host "Project : $ProjectId"
Write-Host "Region  : $Region"
Write-Host "Service : $Service"
Write-Host "Image   : $image"
Write-Host "Config  : $BuildConfig"
if (-not $SkipSketchfabSecret) {
  Write-Host "Sketchfab secret: $SketchfabSecretName"
}

if (-not $SkipSketchfabSecret) {
  if ($SketchfabApiKeyFile) {
    $SketchfabApiKey = (Get-Content -LiteralPath $SketchfabApiKeyFile -Raw).Trim()
  }
  if ($PromptForSketchfabApiKey) {
    $SketchfabApiKey = Convert-SecureStringToPlainText (Read-Host "Paste the Sketchfab API key" -AsSecureString)
  }

  $secretExists = gcloud secrets describe $SketchfabSecretName --project=$ProjectId --format="value(name)" 2>$null
  if ($SketchfabApiKey) {
    $tmpSecretFile = New-TemporaryFile
    try {
      Set-Content -Path $tmpSecretFile -Value $SketchfabApiKey -NoNewline -Encoding ASCII
      if ($secretExists) {
        gcloud secrets versions add $SketchfabSecretName `
          --project=$ProjectId `
          --data-file=$tmpSecretFile `
          --quiet
        Assert-NativeSuccess "gcloud secrets versions add Sketchfab API key"
      } else {
        gcloud secrets create $SketchfabSecretName `
          --project=$ProjectId `
          --replication-policy="automatic" `
          --data-file=$tmpSecretFile `
          --quiet
        Assert-NativeSuccess "gcloud secrets create Sketchfab API key"
        $secretExists = $SketchfabSecretName
      }
    } finally {
      Remove-Item -LiteralPath $tmpSecretFile -Force -ErrorAction SilentlyContinue
    }
  } elseif (-not $secretExists) {
    throw "Secret Manager secret '$SketchfabSecretName' was not found. Create it once, or rerun with -SketchfabApiKeyFile or -PromptForSketchfabApiKey."
  }

  if (-not $RuntimeServiceAccount) {
    $RuntimeServiceAccount = gcloud run services describe $Service `
      --project=$ProjectId `
      --region=$Region `
      --format="value(spec.template.spec.serviceAccountName)" 2>$null
  }
  if (-not $RuntimeServiceAccount) {
    $projectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)" 2>$null
    if ($projectNumber) {
      $RuntimeServiceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
    }
  }
  if ($RuntimeServiceAccount) {
    gcloud secrets add-iam-policy-binding $SketchfabSecretName `
      --project=$ProjectId `
      --member="serviceAccount:$RuntimeServiceAccount" `
      --role="roles/secretmanager.secretAccessor" `
      --condition=None `
      --quiet | Out-Null
    Assert-NativeSuccess "gcloud secrets add-iam-policy-binding Sketchfab API key"
  } else {
    throw "Could not resolve the Cloud Run runtime service account for '$Service'. Pass -RuntimeServiceAccount so Secret Manager access can be granted."
  }
}

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

$updateArgs = @(
  "run", "services", "update", $Service,
  "--project=$ProjectId",
  "--region=$Region",
  "--image=$image",
  "--port=8080"
)
if (-not $SkipSketchfabSecret) {
  $updateArgs += @(
    "--update-secrets", "SKETCHFAB_API_KEY=$SketchfabSecretName`:latest",
    "--update-env-vars", "BETTERPPTX_SKETCHFAB_CACHE_DIR=/tmp/betterpptx-sketchfab-assets"
  )
}
$updateArgs += "--quiet"
& gcloud @updateArgs
Assert-NativeSuccess "gcloud run services update"

$serviceUrl = gcloud run services describe $Service `
  --project=$ProjectId `
  --region=$Region `
  --format="value(status.url)"
Assert-NativeSuccess "gcloud run services describe"

Write-Host "Service URL: $serviceUrl"

if (-not $SkipHealthCheck) {
  $identityToken = gcloud auth print-identity-token
  Assert-NativeSuccess "gcloud auth print-identity-token"
  $health = Invoke-WebRequest `
    -Uri "$serviceUrl/health" `
    -Headers @{ Authorization = "Bearer $identityToken" } `
    -UseBasicParsing `
    -TimeoutSec 30
  if ($health.StatusCode -ne 200) {
    throw "Health check failed with HTTP $($health.StatusCode)."
  }
  Write-Host "Health  : OK"
}

Write-Host "Deploy complete: $image"
