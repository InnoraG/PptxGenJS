<#
  One-time Tailscale Funnel setup → a STABLE public HTTPS URL with NO domain.

  Result: https://<device>.<tailnet>.ts.net  →  your local MCP server on :PORT.
  tailscaled (a Windows service) keeps the Funnel up across reboots on its own,
  so pm2 only needs to supervise the node server (TUNNEL=tailscale).

  Free Tailscale Personal plan is fine. Two one-time toggles in the admin console
  (https://login.tailscale.com/admin) are required and the CLI will link you to them
  if missing:
    • DNS → enable MagicDNS + HTTPS certificates
    • Access controls → allow the "funnel" node attribute

  Usage (normal PowerShell):
    .\setup-tailscale-funnel.ps1 [-Port 3344]
#>
param([int]$Port = 3344)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ts = "C:\Program Files\Tailscale\tailscale.exe"

# 0) install
if (-not (Test-Path $ts)) {
  Write-Host "==> Tailscale not found — installing via winget…" -ForegroundColor Cyan
  try { winget install --id tailscale.tailscale --accept-source-agreements --accept-package-agreements } catch {}
  if (-not (Test-Path $ts)) { throw "Install Tailscale from https://tailscale.com/download/windows, then re-run." }
}

Write-Host "==> 1/4 tailscale up (browser login to your tailnet)" -ForegroundColor Cyan
& $ts up

Write-Host "==> 2/4 enable Funnel on port $Port (persisted in tailscaled, survives reboot)" -ForegroundColor Cyan
# If Funnel isn't allowed yet, this prints an admin URL to enable it — open it, approve, re-run.
& $ts funnel --bg $Port

Write-Host "==> 3/4 resolve public URL" -ForegroundColor Cyan
$dns = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
if (-not $dns) { throw "Could not read device DNS name from 'tailscale status'." }
$base = "https://$dns"
Write-Host "    public origin: $base"

Write-Host "==> 4/4 write deploy\production.env (PUBLIC_BASE + TUNNEL=tailscale)" -ForegroundColor Cyan
$envFile = Join-Path $here "production.env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $here "production.env.example") $envFile }
$lines = Get-Content $envFile
function Set-Kv($content, $key, $val) {
  if ($content -match "(?m)^\s*$key\s*=") { return ($content -replace "(?m)^\s*$key\s*=.*$", "$key=$val") }
  else { return $content + "`r`n$key=$val" }
}
$txt = ($lines -join "`r`n")
$txt = Set-Kv $txt "TUNNEL" "tailscale"
$txt = Set-Kv $txt "BETTERPPTX_PUBLIC_BASE" $base
$txt = Set-Kv $txt "BETTERPPTX_PORT" "$Port"
Set-Content -Encoding UTF8 $envFile $txt

# read the URL secret (if any) to print the exact connector URL
$secM = ($txt | Select-String -Pattern "(?m)^\s*BETTERPPTX_URL_SECRET\s*=\s*(.*)$").Matches
$secret = if ($secM.Count) { $secM[0].Groups[1].Value.Trim() } else { "" }
$path = if ($secret -and $secret -notmatch "CHANGE-ME") { "/s/$secret/mcp" } else { "/s/<set BETTERPPTX_URL_SECRET in production.env>/mcp" }

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
Write-Host "  Funnel status:" ; & $ts funnel status
Write-Host ""
Write-Host "  Connector URL → $base$path" -ForegroundColor Cyan
Write-Host "  Next:  edit deploy\production.env (set a real BETTERPPTX_URL_SECRET), then  .\start.ps1"
