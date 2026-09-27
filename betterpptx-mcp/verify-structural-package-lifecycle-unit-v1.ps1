$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$result = node (Join-Path $PSScriptRoot 'verify-structural-package-lifecycle-unit-v1.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Structural package lifecycle verifier failed.' }
Write-Host 'STRUCTURAL PACKAGE LIFECYCLE: PASS' -ForegroundColor Green
