param(
  [Parameter(Mandatory = $true)][string]$PptxPath,
  [Parameter(Mandatory = $true)][string]$PpsxPath
)

$ErrorActionPreference = 'Stop'
$msoFalse = 0
$msoTrue = -1
$ppSaveAsOpenXMLShow = 28
$baseline = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
$ppt = $null
$pres = $null
try {
  $source = [IO.Path]::GetFullPath($PptxPath)
  $target = [IO.Path]::GetFullPath($PpsxPath)
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing PowerPoint file: $source" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }

  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open2007($source, $msoTrue, $msoFalse, $msoFalse, $msoFalse)
  $pres.SaveCopyAs($target, $ppSaveAsOpenXMLShow, $msoFalse)
  $bytes = if (Test-Path -LiteralPath $target) { (Get-Item -LiteralPath $target).Length } else { 0 }
  if ($bytes -le 100000) { throw "PowerPoint show export failed: bytes=$bytes" }
  [ordered]@{
    status = 'PASS'
    repairFreeSourceOpen = $true
    officeVersion = $ppt.Version
    slideCount = $pres.Slides.Count
    output = $target
    bytes = $bytes
    preservedExistingPowerPointSession = ($baseline.Count -gt 0)
  } | ConvertTo-Json -Depth 4
} finally {
  if ($pres) {
    try { $pres.Saved = $msoTrue } catch {}
    try { $pres.Close() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($pres) | Out-Null } catch {}
  }
  if ($ppt) {
    if ($baseline.Count -eq 0) { try { $ppt.Quit() } catch {} }
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($ppt) | Out-Null } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
