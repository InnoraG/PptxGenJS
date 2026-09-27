param(
  [Parameter(Mandatory = $true)][string]$PptxPath,
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [int]$SecondsPerSlide = 20,
  [int]$TimeoutMinutes = 10
)

$ErrorActionPreference = 'Stop'
$msoTrue = -1
$msoFalse = 0
$ppt = $null
$pres = $null
try {
  $source = [IO.Path]::GetFullPath($PptxPath)
  $target = [IO.Path]::GetFullPath($VideoPath)
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing PowerPoint file: $source" }
  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }

  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open($source, $msoFalse, $msoFalse, $msoFalse)
  foreach ($slide in @($pres.Slides)) {
    $slide.SlideShowTransition.AdvanceOnTime = $msoTrue
    $slide.SlideShowTransition.AdvanceTime = $SecondsPerSlide
    $slide.SlideShowTransition.AdvanceOnClick = $msoFalse
  }
  $started = $false
  for ($attempt = 1; $attempt -le 12 -and -not $started; $attempt++) {
    try {
      $pres.CreateVideo($target, $msoTrue, $SecondsPerSlide, 720, 30, 90)
      $started = $true
    } catch {
      if ($attempt -eq 12) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  do {
    Start-Sleep -Seconds 2
    $status = [int]$pres.CreateVideoStatus
    Write-Output ("CreateVideoStatus={0}" -f $status)
  } while ($status -in @(1, 2) -and (Get-Date) -lt $deadline)
  $bytes = if (Test-Path -LiteralPath $target) { (Get-Item -LiteralPath $target).Length } else { 0 }
  if ($status -ne 3 -or $bytes -le 100000) { throw "PowerPoint video render failed: status=$status bytes=$bytes" }
  [ordered]@{
    status = 'PASS'
    officeVersion = $ppt.Version
    slideCount = $pres.Slides.Count
    secondsPerSlide = $SecondsPerSlide
    video = $target
    bytes = $bytes
  } | ConvertTo-Json -Depth 4
} finally {
  if ($pres) {
    try { $pres.Saved = $msoTrue } catch {}
    try { $pres.Close() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($pres) | Out-Null } catch {}
  }
  if ($ppt) {
    try { $ppt.Quit() } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($ppt) | Out-Null } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
