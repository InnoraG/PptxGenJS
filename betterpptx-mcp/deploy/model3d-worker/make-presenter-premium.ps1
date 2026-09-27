<#
.SYNOPSIS
  PREMIUM (EVALUATION-ONLY): photo -> animated rigged 3D presenter GLB with a REAL UV TEXTURE.

.DESCRIPTION
  Same pipeline as make-presenter.ps1 but the PREMIUM path: image -> TRELLIS.2 with the real NVIDIA nvdiffrast
  TEXTURE bake -> UniRig -> Baker (18-clip). Output has a proper baseColorTexture (crisp skin/clothes) instead
  of the resale-safe vertex-color export.

  *** LICENSING: this path installs NVIDIA nvdiffrast/nvdiffrec (NVIDIA Source Code License = non-commercial). ***
  Its output is NOT cleared for commercial resale. Use ONLY to EVALUATE quality; secure a commercial license from
  NVIDIA before shipping anything produced this way. The resale-clean make-presenter.ps1 pipeline is untouched.

  First run builds the premium Modal image (installs + compiles nvdiffrast) — expect ~15-25 min ONE TIME.

.EXAMPLE
  .\make-presenter-premium.ps1 -Image .\face.png -Preview
.EXAMPLE
  .\make-presenter-premium.ps1 -Image C:\pics\person.jpg -Out C:\out\presenter.glb -Quality standard
#>
param(
  [Parameter(Mandatory = $true)][string]$Image,
  [string]$Out = "",
  [switch]$Preview,
  [switch]$NoRig,                                 # just the UV-textured 3D MODEL (skip UniRig + gesture bake)
  [string]$Profile = "auto",                      # 'auto' = rotate across image-to-3D profiles (<$15 each); or a profile name
  [ValidateSet("ppt-lite", "standard")][string]$Quality = "ppt-lite",
  [int]$Seed = 0
)
$ErrorActionPreference = 'Stop'

# PowerShell's interactive prompt keeps typed quotes as LITERAL characters — strip surrounding "..." or '...'.
$Image = $Image.Trim().Trim('"').Trim("'").Trim()
if ($Out) { $Out = $Out.Trim().Trim('"').Trim("'").Trim() }
if (-not (Test-Path -LiteralPath $Image)) { throw "Image not found: $Image  (tip: .\make-presenter-premium.ps1 -Image C:\path\photo.png )" }
$Image = (Resolve-Path -LiteralPath $Image).Path
if ($Out) { $Out = [System.IO.Path]::GetFullPath($Out) }

$env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONWARNINGS = 'ignore'
$env:MODEL3D_ENABLE_PREMIUM = '1'   # EVAL-ONLY: this wrapper deliberately builds the NVIDIA nvdiffrast image (non-commercial). Never in production.
# Dev-mode ROTATION (owner rule): -Profile 'auto' -> first image-to-3D profile under the $15 dev threshold.
if ($Profile -eq 'auto') {
  $Profile = (& py "$PSScriptRoot\pick_profile.py" 2>$null | Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($Profile)) { throw "Rotation: no image-to-3D profile under budget. Create one (modal token new) + add to BETTERPPTX_IMG3D_POOL." }
  $Profile = $Profile.Trim(); Write-Host "auto-rotated to image-to-3D profile: $Profile" -ForegroundColor Cyan
}
$env:MODAL_PROFILE = $Profile
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

Write-Host "make-presenter-PREMIUM (nvdiffrast texture, EVALUATION-ONLY): $Image  [profile=$Profile quality=$Quality]" -ForegroundColor Magenta
Write-Host "  NOTE: nvdiffrast is NVIDIA non-commercial - output is for quality evaluation, not resale." -ForegroundColor DarkYellow
$argv = @('-m', 'modal', 'run', 'model3d_app.py::perform_from_image_premium', '--image-path', $Image, '--quality', $Quality, '--seed', "$Seed")
if ($Out) { $argv += @('--out-path', $Out) }
if ($Preview) { $argv += '--preview' }
if ($NoRig) { $argv += '--norig' }   # just the 3D model (no rig, no gestures)

# --- BUDGET GUARD: block if this profile is at/over the ~$29.50 monthly cap (owner rule 2026-07-11). ---
& py "$PSScriptRoot\check_budget.py" $Profile
if ($LASTEXITCODE -ne 0) { throw "Budget guard STOPPED this run: profile '$Profile' is near/over its monthly cap. Re-run with -Profile <a fresh profile>." }

& py @argv
if ($LASTEXITCODE -ne 0) { throw "premium pipeline failed (exit $LASTEXITCODE)" }
Write-Host "DONE (premium / UV-textured)." -ForegroundColor Green
