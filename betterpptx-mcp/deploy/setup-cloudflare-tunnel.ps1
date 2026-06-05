<#
  One-time named-tunnel setup for a STABLE public URL.

  PREREQUISITE: a domain whose DNS is on Cloudflare (free plan is fine). The
  named tunnel binds a hostname on that zone — that is what makes the URL stable.
  (No domain? Use an ngrok static domain instead — see GO_PUBLIC.md.)

  Usage (normal PowerShell, NOT elevated — cloudflared writes to your user dir):
    .\setup-cloudflare-tunnel.ps1 -Hostname mcp.yourdomain.com [-Tunnel betterpptx-mcp] [-Port 3344]

  Steps performed:
    1. cloudflared tunnel login         (opens a browser; pick your zone)
    2. cloudflared tunnel create <name> (creates the tunnel + credentials json)
    3. cloudflared tunnel route dns ... (creates the DNS CNAME for the hostname)
    4. writes deploy/cloudflared-config.yml
  Then start everything with:  .\start.ps1
#>
param(
  [Parameter(Mandatory = $true)][string]$Hostname,
  [string]$Tunnel = "betterpptx-mcp",
  [int]$Port = 3344
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cf = Join-Path (Split-Path -Parent $here) ".tools\cloudflared.exe"
if (-not (Test-Path $cf)) { throw "cloudflared not found at $cf" }
$cfdir = Join-Path $env:USERPROFILE ".cloudflared"

Write-Host "==> 1/4 cloudflare login (a browser window will open; authorize your zone)" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $cfdir "cert.pem"))) { & $cf tunnel login } else { Write-Host "    already logged in (cert.pem present)" }

Write-Host "==> 2/4 create tunnel '$Tunnel'" -ForegroundColor Cyan
$existing = (& $cf tunnel list 2>$null) -match "\b$Tunnel\b"
if (-not $existing) { & $cf tunnel create $Tunnel } else { Write-Host "    tunnel '$Tunnel' already exists" }

# Resolve the tunnel UUID + credentials file
$uuid = ((& $cf tunnel list 2>$null) | Select-String -Pattern "^\s*([0-9a-fA-F-]{36})\s+$([regex]::Escape($Tunnel))\b").Matches.Groups[1].Value
if (-not $uuid) { $uuid = (Get-ChildItem $cfdir -Filter *.json | Select-Object -First 1).BaseName }
$creds = Join-Path $cfdir "$uuid.json"
Write-Host "    tunnel UUID: $uuid"
Write-Host "    credentials: $creds"

Write-Host "==> 3/4 route DNS  $Hostname  ->  $Tunnel" -ForegroundColor Cyan
& $cf tunnel route dns $Tunnel $Hostname

Write-Host "==> 4/4 write cloudflared-config.yml" -ForegroundColor Cyan
$cfgPath = Join-Path $here "cloudflared-config.yml"
@"
tunnel: $Tunnel
credentials-file: $creds
ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$Port
  - service: http_status:404
"@ | Set-Content -Encoding UTF8 $cfgPath
Write-Host "    wrote $cfgPath"

Write-Host ""
Write-Host "DONE. Now:" -ForegroundColor Green
Write-Host "  1) edit deploy\production.env  → set BETTERPPTX_PUBLIC_BASE=https://$Hostname"
Write-Host "     and CLOUDFLARED_TUNNEL_NAME=$Tunnel"
Write-Host "  2) run  .\start.ps1   (starts server + tunnel under pm2)"
Write-Host "  Connector URL → https://$Hostname/s/<your BETTERPPTX_URL_SECRET>/mcp"
