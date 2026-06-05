<#
  Start (or reload) betterpptx-mcp + cloudflared under pm2, and persist the list.
  Usage:  .\start.ps1
#>
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $here "production.env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $here "production.env.example") $envFile
  Write-Host "Created deploy\production.env from the example — EDIT IT (hostname, secret) then re-run." -ForegroundColor Yellow
  exit 1
}
function Get-EnvVal($name) {
  $m = (Get-Content $envFile | Select-String -Pattern "^\s*$name\s*=\s*(.*)\s*$").Matches
  if ($m.Count) { return $m[0].Groups[1].Value.Trim('"').Trim("'") } else { return "" }
}

pm2 start (Join-Path $here "ecosystem.config.cjs")
pm2 save
pm2 status

$base = Get-EnvVal "BETTERPPTX_PUBLIC_BASE"
$secret = Get-EnvVal "BETTERPPTX_URL_SECRET"
$path = if ($secret) { "/s/$secret/mcp" } else { "/mcp" }
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Connector URL (paste into claude.ai / chatgpt.com):"
Write-Host "    $base$path" -ForegroundColor Cyan
Write-Host "  Health: $base/health"
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To survive REBOOT, run ONCE (elevated PowerShell):" -ForegroundColor Yellow
Write-Host "    npm i -g @jessety/pm2-installer; pm2-installer install   # robust Windows service"
Write-Host "  …or a per-user fallback (no admin):"
Write-Host "    schtasks /create /tn betterpptx-mcp /sc onlogon /tr ""pm2 resurrect"" /f"
