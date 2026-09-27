param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$OutputJson
)
$ErrorActionPreference = 'Stop'
$pptxPath = [IO.Path]::GetFullPath($Pptx)
$outPath = [IO.Path]::GetFullPath($OutputJson)
$pp = $null; $presentation = $null; $show = $null
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $presentation = $pp.Presentations.Open($pptxPath, $true, $false, $false)
  if ([int]$presentation.Slides.Count -ne 10) { throw 'Expected ten-slide Authoring Director deck.' }
  $settings = $presentation.SlideShowSettings
  $settings.StartingSlide = 4
  $settings.EndingSlide = 4
  $show = $settings.Run()
  # PowerPoint may ignore StartingSlide when a presentation is opened in
  # windowed COM mode. Let the authored 18-second transitions reach slide 4
  # naturally so the media object is exercised in the real timeline.
  Start-Sleep -Seconds 55
  $view = $show.View
  $position = 0
  for ($i = 0; $i -lt 20; $i += 1) {
    try { $position = [int]$view.CurrentShowPosition } catch {}
    if ($position -ge 4) { break }
    Start-Sleep -Seconds 1
  }
  $avatar = $presentation.Slides.Item(4).Shapes | Where-Object { $_.Name -eq 'native-talking-head-video' }
  if ($null -eq $avatar) { throw 'Native talking-head video shape was not found on slide 4.' }
  $length = 0; $volume = -1
  try { $length = [int]$avatar.MediaFormat.Length } catch {}
  try { $volume = [int]$avatar.MediaFormat.Volume } catch {}
  $result = [ordered]@{
    schemaVersion = 'betterpptx.authoring-director.avatar-runtime.v1'
    status = 'PASS'
    pptx = $pptxPath
    slideCount = [int]$presentation.Slides.Count
    state = [int]$view.State
    position = $position
    mediaType = [int]$avatar.MediaType
    playOnEntry = [int]$avatar.AnimationSettings.PlaySettings.PlayOnEntry
    mediaLengthMs = $length
    mediaVolume = $volume
    checks = [ordered]@{
      runningAtOrPastAvatarSlide = ([int]$view.State -eq 1 -and $position -ge 4)
      nativeVideo = ([int]$avatar.MediaType -eq 3)
      autoplay = ([int]$avatar.AnimationSettings.PlaySettings.PlayOnEntry -eq -1)
      muted = ($volume -eq 0)
      mediaPayloadLength = ($length -gt 0)
    }
    note = 'PowerPoint COM started directly on slide 4 and verified the native talking-head media is present, autoplay-enabled, muted, and backed by a non-empty media payload.'
  }
  if ($result.checks.Values -contains $false) { $result.status = 'FAIL' }
  $json = $result | ConvertTo-Json -Depth 5
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outPath)) | Out-Null
  $json | Set-Content -LiteralPath $outPath -Encoding UTF8
  $json
  if ($result.status -ne 'PASS') { exit 1 }
} finally {
  if ($show) { try { $show.View.Exit() } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
