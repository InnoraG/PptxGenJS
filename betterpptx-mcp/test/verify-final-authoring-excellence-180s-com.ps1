param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$OutputJson
)
$ErrorActionPreference = 'Stop'
$pptxPath = [IO.Path]::GetFullPath($Pptx)
$outPath = [IO.Path]::GetFullPath($OutputJson)
$pp = $null; $presentation = $null; $show = $null
$script:samples = @()
try {
  if (-not (Test-Path -LiteralPath $pptxPath)) { throw "Missing PPTX: $pptxPath" }
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $presentation = $pp.Presentations.Open($pptxPath, $true, $false, $false)
  if ([int]$presentation.Slides.Count -ne 1) { throw 'Expected one proof slide.' }
  $avatar = $presentation.Slides.Item(1).Shapes | Where-Object { $_.Name -eq 'optional-talking-head-avatar' }
  $audio = $presentation.Slides.Item(1).Shapes | Where-Object { $_.Name -eq 'avatar-native-audio-s1' }
  # Cache edit-mode package facts before launching the slideshow. PowerPoint can
  # invalidate the Presentation/Slide COM proxies while SlideShowSettings.Run()
  # is active; reading them after the run can misleadingly return zero values.
  $editModeFacts = [ordered]@{
    slideCount = [int]$presentation.Slides.Count
    avatarGeometry = [ordered]@{ left = [double]$avatar.Left; top = [double]$avatar.Top; width = [double]$avatar.Width; height = [double]$avatar.Height; mediaType = [int]$avatar.MediaType }
    audioMediaType = [int]$audio.MediaType
  }
  $show = $presentation.SlideShowSettings.Run()
  $sampleAt = {
    param([string]$label)
    $state = $null; $position = $null
    try { $state = [int]$show.View.State } catch { $state = -1 }
    try { $position = [int]$show.View.CurrentShowPosition } catch { $position = -1 }
    $script:samples += [ordered]@{ label = $label; elapsedSeconds = $script:elapsed; state = $state; position = $position }
  }
  $script:elapsed = 0
  Start-Sleep -Seconds 2; $script:elapsed = 2; & $sampleAt 't+2s'
  Start-Sleep -Seconds 45; $script:elapsed = 47; & $sampleAt 't+47s'
  Start-Sleep -Seconds 45; $script:elapsed = 92; & $sampleAt 't+92s'
  Start-Sleep -Seconds 45; $script:elapsed = 137; & $sampleAt 't+137s'
  Start-Sleep -Seconds 45; $script:elapsed = 182; & $sampleAt 't+182s'
  $requiredSamples = @($script:samples | Where-Object { $_.label -in @('t+47s','t+92s','t+137s') -and $_.state -eq 1 })
  $runtimePass = ($requiredSamples.Count -eq 3)
  $result = [ordered]@{
    schemaVersion = 'betterpptx.authoring-excellence.final-proof-180s-runtime.v1'
    status = $(if($runtimePass){'PASS'}else{'FAIL'})
    pptx = $pptxPath
    slideCount = $editModeFacts.slideCount
    avatarGeometry = $editModeFacts.avatarGeometry
    audioMediaType = $editModeFacts.audioMediaType
    samples = $script:samples
    timingContract = [ordered]@{ expectedSeconds = 180; transitionAdvTmMs = 180000; showNarration = $true; useTimings = $true }
    note = 'PowerPoint runtime samples are preserved for review; PASS requires running state at 47s, 92s, and 137s.'
  }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outPath)) | Out-Null
  ($result | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $outPath -Encoding UTF8
  $result | ConvertTo-Json -Depth 8
}
finally {
  if ($show) { try { $show.View.Exit() } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
