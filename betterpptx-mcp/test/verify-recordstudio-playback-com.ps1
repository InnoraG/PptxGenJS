param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $false)][string]$OutputJson = '',
  [Parameter(Mandatory = $false)][int]$ExpectedSlideCount = 1
)
$ErrorActionPreference = 'Stop'
function Invoke-ComRetry([scriptblock]$Action, [int]$Attempts = 30) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    try { return & $Action }
    catch {
      if ($_.Exception.HResult -ne -2147418111 -and $_.Exception.Message -notmatch 'rejected by callee') { throw }
      Start-Sleep -Milliseconds 100
    }
  }
  return & $Action
}
function Wait-RunningShowView($Show) {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $candidate = $Show.View
      if ($candidate -and [int]$candidate.State -eq 1 -and [int]$candidate.CurrentShowPosition -ge 1) { return $candidate }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  throw 'PowerPoint slideshow did not expose a running view before the playback probe timeout.'
}
$pptxPath = [IO.Path]::GetFullPath($Pptx)
if (-not (Test-Path -LiteralPath $pptxPath)) { throw "Missing PPTX: $pptxPath" }
$baselinePowerPointPids = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
if ($baselinePowerPointPids.Count -gt 0) {
  throw 'PowerPoint is already running. Playback verification stopped without touching the existing session.'
}
$pp = $null
$pp2 = $null
$first = $null
$second = $null
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1

  $first = $pp.Presentations.Open($pptxPath, $true, $false, $false)
  $firstSlideCount = [int]$first.Slides.Count
  $presenter = @($first.Slides.Item(1).Shapes | Where-Object { $_.MediaType -eq 3 } | Select-Object -First 1)
  if ($presenter.Count -ne 1) { throw 'PowerPoint did not expose exactly one playable presenter video shape.' }
  $presenterShape = [ordered]@{
    name = [string]$presenter[0].Name
    mediaType = [int]$presenter[0].MediaType
    autoShapeType = [int]$presenter[0].AutoShapeType
    leftPt = [double]$presenter[0].Left
    topPt = [double]$presenter[0].Top
    widthPt = [double]$presenter[0].Width
    heightPt = [double]$presenter[0].Height
    playOnEntry = [int]$presenter[0].AnimationSettings.PlaySettings.PlayOnEntry
  }
  $frameTolerancePt = 0.2
  if ([math]::Abs($presenterShape.leftPt - 791.496) -gt $frameTolerancePt -or
      [math]::Abs($presenterShape.topPt - 371.52) -gt $frameTolerancePt -or
      [math]::Abs($presenterShape.widthPt - 162) -gt $frameTolerancePt -or
      [math]::Abs($presenterShape.heightPt - 162) -gt $frameTolerancePt -or
      $presenterShape.mediaType -ne 3 -or $presenterShape.autoShapeType -ne 9 -or $presenterShape.playOnEntry -ne -1) {
    throw "Presenter COM geometry/play contract is outside the accepted 162pt ellipse window: $($presenterShape | ConvertTo-Json -Compress)"
  }
  $sameBoxPictures = @($first.Slides.Item(1).Shapes | Where-Object {
    $_.Name -ne $presenterShape.name -and $_.Type -eq 13 -and
    [math]::Abs([double]$_.Left - $presenterShape.leftPt) -le $frameTolerancePt -and
    [math]::Abs([double]$_.Top - $presenterShape.topPt) -le $frameTolerancePt -and
    [math]::Abs([double]$_.Width - $presenterShape.widthPt) -le $frameTolerancePt -and
    [math]::Abs([double]$_.Height - $presenterShape.heightPt) -le $frameTolerancePt
  })
  if ($sameBoxPictures.Count -gt 0) { throw 'A separate picture still occupies the native presenter window.' }
  $show1 = $first.SlideShowSettings.Run()
  # Wait for a running view, then sample while the short canary media is still
  # active; waiting until a six-second clip is near its end makes PowerPoint
  # drop the mutable View state and turns valid playback into a false negative.
  $view1 = Wait-RunningShowView $show1
  $runningState = Invoke-ComRetry { [int]$view1.State }
  $runningPosition = Invoke-ComRetry { [int]$view1.CurrentShowPosition }
  Invoke-ComRetry { $view1.State = 2 } # ppSlideShowPaused
  Start-Sleep -Milliseconds 300
  $pausedState = Invoke-ComRetry { [int]$view1.State }
  $pausedPosition = Invoke-ComRetry { [int]$view1.CurrentShowPosition }
  Invoke-ComRetry { $view1.State = 1 } # ppSlideShowRunning
  Start-Sleep -Milliseconds 300
  $resumedState = Invoke-ComRetry { [int]$view1.State }
  $resumedPosition = Invoke-ComRetry { [int]$view1.CurrentShowPosition }
  try { Invoke-ComRetry { $view1.Exit() } } catch { }
  Start-Sleep -Seconds 1
  try { $first.Close() } catch {}

  # A second PowerPoint run verifies replay from the beginning rather than
  # merely proving that the first run could be paused.
  # Use a fresh PowerPoint COM application for replay.  Reusing an application
  # after closing a slideshow can leave View.State=0 even though the second
  # run is valid, which is a host-side COM artefact rather than deck failure.
  $pp2 = New-Object -ComObject PowerPoint.Application
  $pp2.Visible = -1
  $second = $pp2.Presentations.Open($pptxPath, $true, $false, $false)
  $secondSlideCount = [int]$second.Slides.Count
  $show2 = $second.SlideShowSettings.Run()
  $view2 = Wait-RunningShowView $show2
  $replayState = Invoke-ComRetry { [int]$view2.State }
  $replayPosition = Invoke-ComRetry { [int]$view2.CurrentShowPosition }
  try { Invoke-ComRetry { $view2.Exit() } } catch { }

  if ($firstSlideCount -ne $ExpectedSlideCount -or $secondSlideCount -ne $ExpectedSlideCount) { throw "Unexpected slide count during playback probe; expected $ExpectedSlideCount." }
  if ($runningState -ne 1 -or $pausedState -ne 2 -or $resumedState -ne 1) { throw 'PowerPoint pause/resume state transition failed.' }
  if ($replayState -ne 1 -or $replayPosition -ne 1) { throw 'PowerPoint replay did not restart at slide 1.' }

  $result = [ordered]@{
    ok = $true
    pptx = $pptxPath
    firstSlideCount = $firstSlideCount
    secondSlideCount = $secondSlideCount
    visiblePresenterMedia = $true
    singleNativePresenterVisual = $true
    presenterShape = $presenterShape
    runningState = $runningState
    pausedState = $pausedState
    resumedState = $resumedState
    runningPosition = $runningPosition
    pausedPosition = $pausedPosition
    resumedPosition = $resumedPosition
    replayState = $replayState
    replayPosition = $replayPosition
    note = 'PowerPoint COM verified the playable presenter video shape at the accepted 162pt window, autoplay, runtime start, pause, resume, and second-run replay. Record/Retake ribbon provenance is not exposed by this COM probe and remains a separate UI check.'
  }
  $json = $result | ConvertTo-Json -Depth 4
  if ($OutputJson) {
    $out = [IO.Path]::GetFullPath($OutputJson)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($out)) | Out-Null
    $json | Set-Content -LiteralPath $out -Encoding UTF8
  }
  $json
}
finally {
  if ($second) { try { $second.Close() } catch {} }
  if ($first) { try { $first.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
  if ($pp2) { try { $pp2.Quit() } catch {} }
}
