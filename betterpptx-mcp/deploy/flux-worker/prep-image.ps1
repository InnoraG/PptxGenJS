<#
.SYNOPSIS
  Preprocess a realistic photo into a TRELLIS-ready reference image (Flux-schnell img2img).

.DESCRIPTION
  Realistic photo  ->  Flux-schnell IMG2IMG redraw  ->  a clean, 3D-reconstruction-friendly reference:
  front-facing full-body subject, plain seamless background, soft even lighting, square-framed.
  Feed the OUTPUT into make-presenter.ps1 / perform_from_image for a better TRELLIS result.

  Flux-schnell is Apache-2.0 (resale-clean). Runs on the dedicated `betterpptx-flux` Modal profile.

  --Strength (0..1): how hard Flux redraws. ~0.4-0.5 = gentle cleanup, keeps identity. ~0.6-0.75 = stronger
  studio look / better background + framing, but the face drifts from the original. Start ~0.55 and adjust.

.EXAMPLE
  .\prep-image.ps1 -Image .\photo.jpg
.EXAMPLE
  .\prep-image.ps1 -Image C:\pics\person.png -Out C:\out\ready.png -Strength 0.6
.EXAMPLE
  # then:  ..\model3d-worker\make-presenter.ps1 -Image C:\out\ready.png -Preview
#>
param(
  [Parameter(Mandatory = $true)][string]$Image,
  [string]$Out = "",
  [double]$Strength = 0.55,
  [int]$Steps = 6,
  [int]$Seed = 0,
  [int]$Size = 1024,
  [string]$Prompt = "",
  [string]$Profile = "betterpptx-flux"
)
$ErrorActionPreference = 'Stop'
$Image = $Image.Trim().Trim('"').Trim("'").Trim()
if ($Out) { $Out = $Out.Trim().Trim('"').Trim("'").Trim() }
if (-not (Test-Path -LiteralPath $Image)) { throw "Image not found: $Image  (tip: .\prep-image.ps1 -Image C:\path\photo.jpg )" }
$Image = (Resolve-Path -LiteralPath $Image).Path
if ($Out) { $Out = [System.IO.Path]::GetFullPath($Out) }

$env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONWARNINGS = 'ignore'
$env:MODAL_PROFILE = $Profile
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

Write-Host "prep-image (Flux img2img -> TRELLIS-ready): $Image  [strength=$Strength profile=$Profile]" -ForegroundColor Cyan
$argv = @('-m', 'modal', 'run', 'flux_app.py::prep_image', '--image-path', $Image, '--strength', "$Strength", '--steps', "$Steps", '--seed', "$Seed", '--size', "$Size")
if ($Out) { $argv += @('--out-path', $Out) }
if ($Prompt) { $argv += @('--prompt', $Prompt) }

# --- BUDGET GUARD: block if this profile is at/over the ~$29.50 monthly cap (owner rule 2026-07-11). ---
& py "$PSScriptRoot\..\model3d-worker\check_budget.py" $Profile
if ($LASTEXITCODE -ne 0) { throw "Budget guard STOPPED this run: profile '$Profile' is near/over its monthly cap. Re-run with -Profile <a fresh profile>." }

& py @argv
if ($LASTEXITCODE -ne 0) { throw "prep-image failed (exit $LASTEXITCODE)" }
Write-Host "DONE. Feed the .trellis-ready.png into make-presenter.ps1." -ForegroundColor Green
