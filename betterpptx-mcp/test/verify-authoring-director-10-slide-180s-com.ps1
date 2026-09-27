param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$OutputJson
)
$ErrorActionPreference = 'Stop'
$pptxPath = [IO.Path]::GetFullPath($Pptx)
$outPath = [IO.Path]::GetFullPath($OutputJson)
$pp = $null; $presentation = $null; $show = $null
$samples = @()
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $presentation = $pp.Presentations.Open($pptxPath, $true, $false, $false)
  $count = [int]$presentation.Slides.Count
  if ($count -ne 10) { throw "Expected ten slides, found $count" }
  $nativeAudio = 0; $nativeVideo = 0; $native3d = 0
  foreach ($s in $presentation.Slides) { foreach ($sh in $s.Shapes) { try { if ([int]$sh.MediaType -eq 2) { $nativeAudio++ } elseif ([int]$sh.MediaType -eq 3) { $nativeVideo++ } } catch {}; try { if ([int]$sh.Type -eq 30) { $native3d++ } } catch {} } }
  if ($nativeAudio -lt 10 -or $nativeVideo -lt 1 -or $native3d -lt 1) { throw "Missing native objects: audio=$nativeAudio video=$nativeVideo 3d=$native3d" }
  $show = $presentation.SlideShowSettings.Run()
  foreach ($item in @(@{label='t+2s'; wait=2}, @{label='t+47s'; wait=45}, @{label='t+92s'; wait=45}, @{label='t+137s'; wait=45}, @{label='t+182s'; wait=45})) {
    Start-Sleep -Seconds $item.wait
    $samples += [ordered]@{ label=$item.label; state=[int]$show.View.State; position=[int]$show.View.CurrentShowPosition }
  }
  $running = @($samples | Where-Object { $_.label -in @('t+47s','t+92s','t+137s') -and $_.state -eq 1 })
  $runtimePass = ($running.Count -eq 3)
  $startupSample = @($samples | Where-Object { $_.label -eq 't+2s' }) | Select-Object -First 1
  $firstRunningSample = @($samples | Where-Object { $_.state -eq 1 }) | Select-Object -First 1
  $result = [ordered]@{ schemaVersion='betterpptx.authoring-director.final-10-slide-runtime.v1'; status=($(if($runtimePass){'PASS'}else{'FAIL'})); pptx=$pptxPath; slideCount=$count; nativeAudioObjects=$nativeAudio; nativeVideoObjects=$nativeVideo; native3dObjects=$native3d; samples=$samples; startupContract=[ordered]@{ initialSampleMayBeStartupRace=$true; initialSampleState=$startupSample.state; firstRunningSampleLabel=$firstRunningSample.label; firstRunningSampleState=$firstRunningSample.state; firstRunningCheckpointRequired='t+47s' }; timingContract=[ordered]@{secondsPerSlide=18; expectedSeconds=180; showNarration=$true; useTimings=$true; loop=$false}; note='PowerPoint runtime samples are preserved for review. PowerPoint COM may report state 0 during the first 2-second startup sample; PASS requires running state at 47s, 92s, and 137s, which proves the timed presentation is active after startup.' }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outPath)) | Out-Null
  ($result | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $outPath -Encoding UTF8
  $result | ConvertTo-Json -Depth 8
} finally {
  if ($show) { try { $show.View.Exit() } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
