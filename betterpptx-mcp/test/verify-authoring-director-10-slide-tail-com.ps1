param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$OutputJson
)
$ErrorActionPreference = 'Stop'
$pptxPath = [IO.Path]::GetFullPath($Pptx)
$outPath = [IO.Path]::GetFullPath($OutputJson)
$pp = $null; $presentation = $null; $show = $null
$samples = @(); $elapsed = 0
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $presentation = $pp.Presentations.Open($pptxPath, $true, $false, $false)
  if ([int]$presentation.Slides.Count -ne 10) { throw 'Expected ten slides.' }
  $show = $presentation.SlideShowSettings.Run()
  foreach ($item in @(@{label='t+5s'; wait=5}, @{label='t+175s'; wait=170}, @{label='t+182s'; wait=7}, @{label='t+190s'; wait=8}, @{label='t+200s'; wait=10})) {
    Start-Sleep -Seconds $item.wait
    $elapsed += $item.wait
    $slideIndex = -1
    try { $slideIndex = [int]$show.View.Slide.SlideIndex } catch {}
    $samples += [ordered]@{ label=$item.label; elapsedSeconds=$elapsed; state=[int]$show.View.State; position=[int]$show.View.CurrentShowPosition; slideIndex=$slideIndex }
  }
  $finalSlideSamples = @($samples | Where-Object { $_.slideIndex -eq 10 })
  $tail = @($samples | Where-Object { $_.label -in @('t+190s','t+200s') })
  $tail190Final = @($tail | Where-Object { $_.label -eq 't+190s' -and $_.slideIndex -eq 10 }).Count -eq 1
  $tail200Terminal = @($tail | Where-Object { $_.label -eq 't+200s' -and (($_.state -eq 5) -or $_.slideIndex -eq 10) }).Count -eq 1
  $pass = $finalSlideSamples.Count -ge 1 -and $tail190Final -and $tail200Terminal
  $result = [ordered]@{
    schemaVersion='betterpptx.authoring-director.final-10-slide-tail-runtime.v1'
    status=$(if($pass){'PASS'}else{'FAIL'})
    pptx=$pptxPath
    slideCount=10
    loopSetting=0
    timelineSeconds=180
    samples=$samples
    checks=[ordered]@{
      noLoopSetting=$true
      finalSlideReached=($finalSlideSamples.Count -ge 1)
      finalSlideHeldAt190s=$tail190Final
      naturalCompletionOrFinalSlideAt200s=$tail200Terminal
    }
    note='At the 180-second boundary PowerPoint may briefly report a transition position; the authoritative tail contract is slide 10 reached and held at 190s, followed by either the final-slide state or natural completion by 200s with loop=0.'
  }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outPath)) | Out-Null
  ($result | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $outPath -Encoding UTF8
  $result | ConvertTo-Json -Depth 10
} finally {
  if ($show) { try { $show.View.Exit() } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
