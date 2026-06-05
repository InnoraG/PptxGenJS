param(
  [string]$ProjectId = "betterpptx-mcp-staging",
  [string]$Region = "us-central1",
  [string]$WebhookService = "betterpptx-dodo-webhook-staging",
  [string]$EndpointId = "",
  [string]$EnvFile = "betterpptx-mcp/.betterpptx-mcp-runtime/dodo-local.env",
  [string]$DodoApiKeySecretName = "betterpptx-dodo-test-api-key",
  [string]$HeaderName = "X-BetterPPTX-Dodo-Webhook-Token",
  [string]$CustomHeaderSecretName = "betterpptx-dodo-webhook-custom-token",
  [string]$Token = "",
  [string]$TokenFile = "",
  [switch]$PromptForToken,
  [switch]$GenerateToken,
  [switch]$RevealCurrentValue,
  [switch]$SkipDodoPatch,
  [switch]$SkipCloudRunRefresh
)

$ErrorActionPreference = "Stop"

function Assert-NativeSuccess([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
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

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  $line = Select-String -Path $Path -Pattern "^$([regex]::Escape($Name))=" | Select-Object -First 1
  if (-not $line) { return "" }
  ($line.Line -replace "^$([regex]::Escape($Name))=", "").Trim().Trim('"')
}

function Upsert-EnvValue([string]$Path, [string]$Name, [string]$Value) {
  $lineValue = ('{0}="{1}"' -f $Name, ($Value -replace '"', '\"'))
  $lines = if (Test-Path -LiteralPath $Path) { @(Get-Content -Path $Path) } else { @() }
  $found = $false
  $next = $lines | ForEach-Object {
    if ($_ -match "^$([regex]::Escape($Name))=") {
      $found = $true
      $lineValue
    } else {
      $_
    }
  }
  if (-not $found) { $next += $lineValue }
  $dir = Split-Path -Parent $Path
  if ($dir) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-Content -Path $Path -Value $next -Encoding UTF8
}

if ($RevealCurrentValue) {
  $current = gcloud secrets versions access latest --project=$ProjectId --secret=$CustomHeaderSecretName
  Assert-NativeSuccess "gcloud secrets versions access custom header token"
  Write-Host "Current custom webhook token:"
  Write-Host $current
  return
}

if (-not $EndpointId) {
  $EndpointId = Read-EnvValue -Path $EnvFile -Name "BETTERPPTX_DODO_TEST_WEBHOOK_ID"
}
if (-not $EndpointId -and -not $SkipDodoPatch) {
  throw "EndpointId is required. Pass -EndpointId or set BETTERPPTX_DODO_TEST_WEBHOOK_ID in $EnvFile."
}

if ($TokenFile) {
  $Token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
}
if ($PromptForToken) {
  $Token = Convert-SecureStringToPlainText (Read-Host "Paste the custom webhook token" -AsSecureString)
}
if ($GenerateToken) {
  $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $Token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}
if (-not $Token) {
  throw "Token is required. Use -PromptForToken, -TokenFile, -Token, or -GenerateToken."
}

$tmpSecretFile = New-TemporaryFile
try {
  Set-Content -Path $tmpSecretFile -Value $Token -NoNewline -Encoding ASCII
  $secretExists = gcloud secrets describe $CustomHeaderSecretName --project=$ProjectId --format="value(name)" 2>$null
  if ($secretExists) {
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
  }
} finally {
  Remove-Item -LiteralPath $tmpSecretFile -Force -ErrorAction SilentlyContinue
}

if (-not $SkipDodoPatch) {
  $apiKey = gcloud secrets versions access latest --project=$ProjectId --secret=$DodoApiKeySecretName
  Assert-NativeSuccess "gcloud secrets versions access Dodo API key"
  $body = @{ headers = @{ $HeaderName = $Token } } | ConvertTo-Json -Depth 6 -Compress
  Invoke-WebRequest `
    -Uri "https://test.dodopayments.com/webhooks/$EndpointId/headers" `
    -Method Patch `
    -Headers @{ Authorization = "Bearer $apiKey"; Accept = "application/json" } `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 60 `
    -UseBasicParsing | Out-Null
}

if (-not $SkipCloudRunRefresh) {
  gcloud run services update $WebhookService `
    --project=$ProjectId `
    --region=$Region `
    --update-env-vars "BETTERPPTX_DODO_WEBHOOK_CUSTOM_HEADER=$HeaderName" `
    --update-secrets "BETTERPPTX_DODO_WEBHOOK_CUSTOM_TOKEN=$CustomHeaderSecretName`:latest" `
    --quiet
  Assert-NativeSuccess "gcloud run services update webhook custom token"
}

Upsert-EnvValue -Path $EnvFile -Name "BETTERPPTX_DODO_TEST_WEBHOOK_CUSTOM_HEADER" -Value $HeaderName
Upsert-EnvValue -Path $EnvFile -Name "BETTERPPTX_DODO_TEST_WEBHOOK_CUSTOM_TOKEN_SECRET" -Value $CustomHeaderSecretName

Write-Host "Custom webhook header updated."
Write-Host "Header      : $HeaderName"
Write-Host "Secret      : $CustomHeaderSecretName"
Write-Host "Dodo patch  : $(-not $SkipDodoPatch)"
Write-Host "Cloud Run   : $(-not $SkipCloudRunRefresh)"
