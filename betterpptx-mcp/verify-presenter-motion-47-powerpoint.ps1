[CmdletBinding()]
param(
  [string]$ProofRoot = (Join-Path $PSScriptRoot '..\outputs\kimodo\presenter-motion-47-proof'),
  [string]$OutputDir = (Join-Path $PSScriptRoot '..\outputs\kimodo\presenter-motion-47-proof\powerpoint-oracle'),
  [switch]$SkipVideo
)

$ErrorActionPreference = 'Stop'
$msoTrue = -1
$msoFalse = 0
$ppSaveAsOpenXMLPresentation = 24
$pp = $null
$owned = @()
$powerPointProcessesBefore = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
$report = [ordered]@{
  schemaVersion = 'betterpptx.presenter-motion-47-powerpoint-oracle.v1'
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  status = 'RUNNING'
  hostSafety = [ordered]@{
    preExistingPowerPointProcesses = @($powerPointProcessesBefore | ForEach-Object { [ordered]@{ id = $_.Id; title = $_.MainWindowTitle } })
    policy = 'Attach if PowerPoint is already running; use uniquely named oracle copies; close only oracle-owned presentations; never quit a pre-existing application.'
  }
  decks = @()
  videos = @()
  checks = @()
}

function Add-Check([string]$Name, [bool]$Condition, $Evidence = $null) {
  $item = [ordered]@{ name = $Name; status = $(if ($Condition) { 'PASS' } else { 'FAIL' }) }
  if ($null -ne $Evidence) { $item.evidence = $Evidence }
  $script:report.checks += $item
  Write-Host "$(if ($Condition){'PASS'}else{'FAIL'}) $Name"
}

function Close-Owned($Presentation) {
  if (-not $Presentation) { return }
  $full = $null
  try { $full = [IO.Path]::GetFullPath([string]$Presentation.FullName) } catch {}
  try { $Presentation.Saved = $msoTrue } catch {}
  try { $Presentation.Close() } catch {}
  if ($full) { $script:owned = @($script:owned | Where-Object { $_ -ne $full }) }
  try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($Presentation) | Out-Null } catch {}
}

$ProofRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProofRoot).Path)
$OutputDir = [IO.Path]::GetFullPath($OutputDir)
$copiesDir = Join-Path $OutputDir 'oracle-copies'
$staticDir = Join-Path $OutputDir 'static-renders'
$videoDir = Join-Path $OutputDir 'videos'
New-Item -ItemType Directory -Force -Path $OutputDir,$copiesDir,$staticDir,$videoDir | Out-Null

$specs = @(
  [ordered]@{ family='interaction'; identity='joe'; expectedSlides=18; samples=@(1,6,10,13,15,18); videoSlides=@(6,10,13,15) },
  [ordered]@{ family='interaction'; identity='louise'; expectedSlides=18; samples=@(1,6,10,13,15,18); videoSlides=@(6,10,13,15) },
  [ordered]@{ family='interaction'; identity='pete'; expectedSlides=18; samples=@(1,6,10,13,15,18); videoSlides=@(6,10,13,15) },
  [ordered]@{ family='kinetic-extension'; identity='joe'; expectedSlides=15; samples=@(1,4,8,9,10,12,15); videoSlides=@(4,8,9,10,12,15) },
  [ordered]@{ family='kinetic-extension'; identity='louise'; expectedSlides=15; samples=@(1,4,8,9,10,12,15); videoSlides=@(4,8,9,10,12,15) },
  [ordered]@{ family='kinetic-extension'; identity='pete'; expectedSlides=15; samples=@(1,4,8,9,10,12,15); videoSlides=@(4,8,9,10,12,15) }
)

try {
  $pp = New-Object -ComObject PowerPoint.Application
  $report.powerPoint = [ordered]@{ version = [string]$pp.Version; build = [string]$pp.Build }
  $preExistingPresentationPaths = @()
  foreach ($presentation in @($pp.Presentations)) {
    try { $preExistingPresentationPaths += [IO.Path]::GetFullPath([string]$presentation.FullName) } catch {}
  }
  $report.hostSafety.preExistingPresentations = $preExistingPresentationPaths

  foreach ($spec in $specs) {
    $source = Join-Path $ProofRoot "$($spec.family)\$($spec.identity)\powerpoint-gate\clip-timelines.pptx"
    $source = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $source).Path)
    $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $copy = Join-Path $copiesDir "$($spec.family)-$($spec.identity)-repair-proof.pptx"
    Copy-Item -LiteralPath $source -Destination $copy -Force
    $presentation = $null
    try {
      $presentation = $pp.Presentations.Open2007($copy, $msoTrue, $msoFalse, $msoFalse, $msoFalse)
      $script:owned += [IO.Path]::GetFullPath($copy)
      $repairMode = $null
      try { $repairMode = [bool]$presentation.RepairMode } catch {}
      $slideCount = [int]$presentation.Slides.Count
      $samples = @()
      foreach ($slideIndex in $spec.samples) {
        $slide = $presentation.Slides.Item([int]$slideIndex)
        $native3d = 0
        foreach ($shape in @($slide.Shapes)) { try { if ([int]$shape.Type -eq 30) { $native3d++ } } catch {} }
        $sequenceCount = 0
        try { $sequenceCount = [int]$slide.TimeLine.MainSequence.Count } catch {}
        $png = Join-Path $staticDir "$($spec.family)-$($spec.identity)-slide-$('{0:d2}' -f [int]$slideIndex).png"
        $slide.Export($png, 'PNG', 1600, 900)
        $samples += [ordered]@{ slide = [int]$slideIndex; native3dShapes = $native3d; timelineEffects = $sequenceCount; image = $png }
      }
      $entry = [ordered]@{
        family = $spec.family
        identity = $spec.identity
        source = $source
        sourceSha256 = $sourceHash
        oracleCopy = $copy
        oracleCopySha256 = (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant()
        repairMode = $repairMode
        slideCount = $slideCount
        samples = $samples
      }
      $report.decks += $entry
      Add-Check "$($spec.family)/$($spec.identity) opens without repair" ($repairMode -ne $true -and $slideCount -eq [int]$spec.expectedSlides) @{ repairMode=$repairMode; slides=$slideCount }
      Add-Check "$($spec.family)/$($spec.identity) keeps editable native 3D timelines" (@($samples | Where-Object { $_.native3dShapes -eq 1 -and $_.timelineEffects -gt 0 }).Count -eq $samples.Count) $samples
      Add-Check "$($spec.family)/$($spec.identity) oracle copy is byte-identical" ($entry.oracleCopySha256 -eq $sourceHash) @{ sha256=$sourceHash }
    } finally {
      Close-Owned $presentation
    }

    if (-not $SkipVideo) {
      $videoCopy = Join-Path $copiesDir "$($spec.family)-$($spec.identity)-video-proof.pptx"
      Copy-Item -LiteralPath $source -Destination $videoCopy -Force
      $videoPresentation = $null
      try {
        $videoPresentation = $pp.Presentations.Open($videoCopy, $msoFalse, $msoFalse, $msoFalse)
        $script:owned += [IO.Path]::GetFullPath($videoCopy)
        for ($slideIndex = $videoPresentation.Slides.Count; $slideIndex -ge 1; $slideIndex--) {
          if ($spec.videoSlides -notcontains $slideIndex) { $videoPresentation.Slides.Item($slideIndex).Delete() }
        }
        foreach ($slide in @($videoPresentation.Slides)) {
          $slide.SlideShowTransition.AdvanceOnTime = $msoTrue
          $slide.SlideShowTransition.AdvanceTime = 3
          $slide.SlideShowTransition.AdvanceOnClick = $msoFalse
        }
        $videoPresentation.SaveAs($videoCopy, $ppSaveAsOpenXMLPresentation)
        $videoPath = Join-Path $videoDir "$($spec.family)-$($spec.identity)-motion-proof.mp4"
        if (Test-Path -LiteralPath $videoPath) { Remove-Item -LiteralPath $videoPath -Force }
        $videoPresentation.CreateVideo($videoPath, $msoTrue, 3, 720, 30, 90)
        $deadline = (Get-Date).AddMinutes(8)
        do {
          Start-Sleep -Seconds 2
          $status = [int]$videoPresentation.CreateVideoStatus
        } while ($status -in @(1,2) -and (Get-Date) -lt $deadline)
        $bytes = if (Test-Path -LiteralPath $videoPath) { (Get-Item -LiteralPath $videoPath).Length } else { 0 }
        $videoEntry = [ordered]@{ family=$spec.family; identity=$spec.identity; slides=@($spec.videoSlides); statusCode=$status; path=$videoPath; bytes=$bytes; sha256=$(if($bytes -gt 0){(Get-FileHash -LiteralPath $videoPath -Algorithm SHA256).Hash.ToLowerInvariant()}else{$null}) }
        $report.videos += $videoEntry
        Add-Check "$($spec.family)/$($spec.identity) renders native PowerPoint motion video" ($status -eq 3 -and $bytes -gt 100000) $videoEntry
      } finally {
        Close-Owned $videoPresentation
      }
    }
  }

  $remaining = @()
  foreach ($presentation in @($pp.Presentations)) {
    try { $remaining += [IO.Path]::GetFullPath([string]$presentation.FullName) } catch {}
  }
  $report.hostSafety.presentationsAfterOracle = $remaining
  Add-Check 'pre-existing presentations remain open and untouched' (@($preExistingPresentationPaths | Where-Object { $remaining -notcontains $_ }).Count -eq 0) @{ before=$preExistingPresentationPaths; after=$remaining }
  $report.status = $(if (@($report.checks | Where-Object status -eq 'FAIL').Count -eq 0) { 'PASS' } else { 'FAIL' })
} catch {
  $report.status = 'FAIL'
  $report.error = $_.Exception.Message
  Write-Warning $_.Exception.Message
} finally {
  if ($pp) {
    foreach ($presentation in @($pp.Presentations)) {
      $full = $null
      try { $full = [IO.Path]::GetFullPath([string]$presentation.FullName) } catch {}
      if ($full -and $owned -contains $full) { Close-Owned $presentation }
    }
    if ($powerPointProcessesBefore.Count -eq 0) { try { $pp.Quit() } catch {} }
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($pp) | Out-Null } catch {}
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  $report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $OutputDir 'powerpoint-oracle-report.json') -Encoding utf8
}

$report | ConvertTo-Json -Depth 8
if ($report.status -ne 'PASS') { exit 1 }
