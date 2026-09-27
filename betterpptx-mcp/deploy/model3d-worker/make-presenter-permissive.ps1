<#
.SYNOPSIS
  RESALE-SAFE textured: photo -> animated rigged 3D presenter GLB with a real UV TEXTURE, via a PERMISSIVE
  (MIT-licensed DRTK) rasterizer instead of NVIDIA nvdiffrast.

.DESCRIPTION
  Same crisp UV-textured result as make-presenter-premium.ps1, but the texture is baked through Meta's DRTK
  (MIT) rather than NVIDIA nvdiffrast (non-commercial). That means the output IS cleared for commercial resale:
  image -> TRELLIS.2 (MIT) -> DRTK texture bake (MIT) -> UniRig (MIT) -> Baker (18-clip). A proper
  baseColorTexture + metallicRoughness, no NVIDIA-licensed code anywhere in the path.

  The two other tracks are untouched: make-presenter.ps1 (resale-clean vertex-color) and make-presenter-premium.ps1
  (nvdiffrast, evaluation-only). This is the "best of both": premium-quality texture AND resale-safe.

  First run builds the permissive Modal image (compiles DRTK + TRELLIS.2 kernels) — expect ~15-25 min ONE TIME.
  If the baked texture looks vertically flipped, re-run with the env  DRTK_FLIP_V=0  (see the shim header).

.EXAMPLE
  .\make-presenter-permissive.ps1 -Image .\face.png -Preview
.EXAMPLE
  .\make-presenter-permissive.ps1 -Image C:\pics\person.jpg -NoRig          # just the UV-textured 3D model
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
if (-not (Test-Path -LiteralPath $Image)) { throw "Image not found: $Image  (tip: .\make-presenter-permissive.ps1 -Image C:\path\photo.png )" }
$Image = (Resolve-Path -LiteralPath $Image).Path
if ($Out) { $Out = [System.IO.Path]::GetFullPath($Out) }

$env:PYTHONUTF8 = '1'; $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONWARNINGS = 'ignore'
# Dev-mode ROTATION (owner rule): -Profile 'auto' -> first image-to-3D profile under the $15 dev threshold.
if ($Profile -eq 'auto') {
  $Profile = (& py "$PSScriptRoot\pick_profile.py" 2>$null | Select-Object -Last 1)
  if ([string]::IsNullOrWhiteSpace($Profile)) { throw "Rotation: no image-to-3D profile under budget. Create one (modal token new) + add to BETTERPPTX_IMG3D_POOL." }
  $Profile = $Profile.Trim(); Write-Host "auto-rotated to image-to-3D profile: $Profile" -ForegroundColor Cyan
}
$env:MODAL_PROFILE = $Profile
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

Write-Host "make-presenter-PERMISSIVE (DRTK/MIT texture, RESALE-SAFE): $Image  [profile=$Profile quality=$Quality]" -ForegroundColor Green
$argv = @('-m', 'modal', 'run', 'model3d_app.py::perform_from_image_permissive', '--image-path', $Image, '--quality', $Quality, '--seed', "$Seed")
if ($Out) { $argv += @('--out-path', $Out) }
if ($Preview) { $argv += '--preview' }
if ($NoRig) { $argv += '--norig' }   # just the 3D model (no rig, no gestures)

# --- BUDGET GUARD: block if this profile is at/over the ~$29.50 monthly cap (owner rule 2026-07-11). ---
& py "$PSScriptRoot\check_budget.py" $Profile
if ($LASTEXITCODE -ne 0) { throw "Budget guard STOPPED this run: profile '$Profile' is near/over its monthly cap. Re-run with -Profile <a fresh profile>." }

& py @argv
if ($LASTEXITCODE -ne 0) { throw "permissive pipeline failed (exit $LASTEXITCODE)" }
Write-Host "DONE (permissive / UV-textured / resale-safe)." -ForegroundColor Green
