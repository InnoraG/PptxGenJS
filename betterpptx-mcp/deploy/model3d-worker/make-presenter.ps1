<#
.SYNOPSIS
  Turn a PHOTO into an animated, rigged 3D presenter GLB (BetterPPTX full pipeline).

.DESCRIPTION
  Runs the full custom pipeline on Modal:  image  ->  TRELLIS.2 (3D mesh)  ->  UniRig (auto-rig)  ->
  Baker (transplant the 18-clip gesture library + flatten)  ->  ONE PowerPoint-ready GLB with 18 embedded
  skeletal animations (idle, talk, greet, point, ... clap).

  INPUT GUIDANCE: use a CLEAN, FRONT-FACING, FULL-BODY subject (A/T-pose reads best). Prefer a STYLIZED or
  SYNTHETIC person over a real identifiable individual (right-of-publicity/likeness) and never sexualized content.
  UniRig auto-rig quality VARIES per mesh; if the result deforms, try a cleaner image, or use a pre-rigged
  Mixamo character instead (perform_rigged) which skips UniRig entirely and is the most reliable path.

.EXAMPLE
  .\make-presenter.ps1 -Image .\face.png
.EXAMPLE
  .\make-presenter.ps1 -Image C:\pics\person.jpg -Out C:\out\presenter.glb -Preview
.EXAMPLE
  .\make-presenter.ps1 -Image face.png -Profile betterpptx -Quality standard -Seed 7
#>
param(
  [Parameter(Mandatory = $true)][string]$Image,   # input photo (png/jpg)
  [string]$Out = "",                              # output .glb (default: <image>.presenter.glb / .model.glb next to the input)
  [switch]$Preview,                               # also render front + 3/4 preview PNGs
  [switch]$NoRig,                                 # just the 3D MODEL from the picture (skip UniRig + gesture bake)
  [string]$Profile = "auto",                      # 'auto' = rotate across image-to-3D profiles (<$15 each); or a profile name
  [ValidateSet("ppt-lite", "standard")][string]$Quality = "ppt-lite",
  [int]$Seed = 0
)
$ErrorActionPreference = 'Stop'

# PowerShell's interactive prompt keeps typed quotes as LITERAL characters — strip surrounding "..." or '...'.
$Image = $Image.Trim().Trim('"').Trim("'").Trim()
if ($Out) { $Out = $Out.Trim().Trim('"').Trim("'").Trim() }

if (-not (Test-Path -LiteralPath $Image)) { throw "Image not found: $Image  (tip: pass it as an argument, e.g.  .\make-presenter.ps1 -Image C:\path\photo.png )" }
$Image = (Resolve-Path -LiteralPath $Image).Path
if ($Out) { $Out = [System.IO.Path]::GetFullPath($Out) }

# UTF-8 so the Modal CLI's checkmarks don't crash the Windows console; select the Modal profile.
$env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONWARNINGS = 'ignore'
# Dev-mode ROTATION (owner rule): -Profile 'auto' -> first image-to-3D profile under the $15 dev threshold.
if ($Profile -eq 'auto') {
  $Profile = (& py "$PSScriptRoot\pick_profile.py" 2>$null | Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($Profile)) { throw "Rotation: no image-to-3D profile under budget. Create one (modal token new) + add to BETTERPPTX_IMG3D_POOL." }
  $Profile = $Profile.Trim(); Write-Host "auto-rotated to image-to-3D profile: $Profile" -ForegroundColor Cyan
}
$env:MODAL_PROFILE = $Profile
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# This script lives next to model3d_app.py; run modal from here so add_local_dir picks up canonical/, bake/, mocap/.
Set-Location -LiteralPath $PSScriptRoot

Write-Host "make-presenter: $Image  ->  (TRELLIS -> UniRig -> Baker)  [profile=$Profile quality=$Quality seed=$Seed]" -ForegroundColor Cyan
$argv = @('-m', 'modal', 'run', 'model3d_app.py::perform_from_image', '--image-path', $Image, '--quality', $Quality, '--seed', "$Seed")
if ($Out) { $argv += @('--out-path', $Out) }
if ($Preview) { $argv += '--preview' }
if ($NoRig) { $argv += '--norig' }   # just the 3D model (no rig, no gestures)

# --- BUDGET GUARD: block if this profile is at/over the ~$29.50 monthly cap (owner rule 2026-07-11). ---
& py "$PSScriptRoot\check_budget.py" $Profile
if ($LASTEXITCODE -ne 0) { throw "Budget guard STOPPED this run: profile '$Profile' is near/over its monthly cap. Re-run with -Profile <a fresh profile>." }

& py @argv
if ($LASTEXITCODE -ne 0) { throw "pipeline failed (exit $LASTEXITCODE). If it was a Modal 'not found', run:  py -m modal profile list" }
Write-Host "DONE." -ForegroundColor Green
