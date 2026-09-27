param(
  [Parameter(Mandatory = $true)][string]$PptxPath,
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [int]$SecondsPerSlide = 12,
  [int]$TimeoutMinutes = 12,
  [ValidateSet(720, 1080, 1440, 2160)][int]$VideoHeight = 720,
  [switch]$OpenOnly
)

$ErrorActionPreference = 'Stop'
$msoTrue = -1
$msoFalse = 0
$baseline = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
$ppt = $null
$pres = $null
try {
  $source = [IO.Path]::GetFullPath($PptxPath)
  $target = [IO.Path]::GetFullPath($VideoPath)
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing PowerPoint file: $source" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }

  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open2007($source, $msoTrue, $msoFalse, $msoFalse, $msoFalse)
  if ($OpenOnly) {
    [ordered]@{
      status = 'PASS'
      repairFreeOpen = $true
      officeVersion = $ppt.Version
      slideCount = $pres.Slides.Count
      source = $source
      preservedExistingPowerPointSession = ($baseline.Count -gt 0)
    } | ConvertTo-Json -Depth 4
    return
  }
  if ($SecondsPerSlide -gt 0) {
    foreach ($slide in @($pres.Slides)) {
      $slide.SlideShowTransition.AdvanceOnTime = $msoTrue
      $slide.SlideShowTransition.AdvanceTime = $SecondsPerSlide
      $slide.SlideShowTransition.AdvanceOnClick = $msoFalse
    }
  }
  $defaultSlideDuration = if ($SecondsPerSlide -gt 0) { $SecondsPerSlide } else { 5 }
  $pres.CreateVideo($target, $msoTrue, $defaultSlideDuration, $VideoHeight, 30, 90)
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
    repairFreeOpen = $true
    officeVersion = $ppt.Version
    slideCount = $pres.Slides.Count
    timingMode = if ($SecondsPerSlide -gt 0) { 'fixed' } else { 'authored' }
    videoHeight = $VideoHeight
    secondsPerSlide = if ($SecondsPerSlide -gt 0) { $SecondsPerSlide } else { $null }
    video = $target
    bytes = $bytes
    preservedExistingPowerPointSession = ($baseline.Count -gt 0)
  } | ConvertTo-Json -Depth 4
} catch {
  [ordered]@{
    status = 'FAIL'
    message = $_.Exception.Message
    exceptionType = $_.Exception.GetType().FullName
    hresult = ('0x{0:X8}' -f ($_.Exception.HResult -band 0xffffffff))
    position = $_.InvocationInfo.PositionMessage
    scriptStackTrace = $_.ScriptStackTrace
  } | ConvertTo-Json -Depth 4
  throw
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
