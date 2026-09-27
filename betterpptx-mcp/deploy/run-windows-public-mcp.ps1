# Run BetterPPTX HTTP MCP on this Windows/PowerPoint host so ChatGPT can
# preview and save. Linux Docker cannot render authoritative PowerPoint slides.
#
# Usage (from repo root):
#   powershell -File betterpptx-mcp\deploy\run-windows-public-mcp.ps1
#
# Keeps Piper TTS in Docker on 127.0.0.1:5000. Stops only the mcp-server container
# so port 3344 is free for the Windows Node process.

param(
	[int]$Port = 3344,
	[string]$PublicBase = 'https://betterpptx.tail070c3a.ts.net'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $RepoRoot

if (Get-Command docker -ErrorAction SilentlyContinue) {
	docker compose stop mcp-server 2>$null | Out-Null
}

$env:BETTERPPTX_HOST = '0.0.0.0'
$env:BETTERPPTX_PORT = "$Port"
$env:BETTERPPTX_AUTH = 'none'
$env:BETTERPPTX_PUBLIC_BASE = $PublicBase
$env:BETTERPPTX_PUBLIC_BLACK_BOX = '1'
$env:BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
$env:BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = '1'
$env:BETTERPPTX_ENV = 'development'
$env:BETTERPPTX_DEPLOYMENT_STAGE = 'development'
$env:BETTERPPTX_FREE_DECKS_PER_DAY = '100'
$env:BETTERPPTX_FORCE_PLAN = 'premium'
$env:BETTERPPTX_JSON_LIMIT = '50mb'
if (-not $env:BETTERPPTX_TTS_URL) { $env:BETTERPPTX_TTS_URL = 'http://127.0.0.1:5000' }
$env:BETTERPPTX_LOCAL_MAINTAINER = '0'

Write-Host "Starting BetterPPTX HTTP MCP on 0.0.0.0:$Port with PowerPoint preview and premium plan."
node betterpptx-mcp/http-cli.mjs --port $Port --host 0.0.0.0
