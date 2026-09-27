[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$AtlasPath,
  [Parameter(Mandatory=$true)][string]$PortfolioDir,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [string]$PriorPlaybackEvidenceDir,
  [string]$PriorPlaybackAtlasPath,
  [string]$PythonExe = 'C:\Users\SafeUser\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$msoTrue = -1
$msoFalse = 0
$ppSaveAsOpenXMLPresentation = 24
$mutex = $null
$ppt = $null
$ownedPresentationPaths = @()
$report = [ordered]@{
  schemaVersion = 'betterpptx.authoring-v3-powerpoint-oracles.v1'
  startedAt = (Get-Date).ToUniversalTime().ToString('o')
  status = 'RUNNING'
  hostSafety = [ordered]@{}
  presentations = @()
  playback = [ordered]@{}
  video = [ordered]@{}
  checks = @()
}

function Add-Check([string]$Name, [bool]$Condition, $Evidence = $null) {
  $item = [ordered]@{ name = $Name; status = $(if ($Condition) { 'PASS' } else { 'FAIL' }) }
  if ($null -ne $Evidence) { $item.evidence = $Evidence }
  $script:report.checks += $item
  Write-Host "$(if ($Condition){'PASS'}else{'FAIL'}) $Name"
}

function Save-Report {
  $report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $OutputDir 'powerpoint-oracle-report.json') -Encoding utf8
}

function Get-UnknownPresentationPaths {
  $known = @($ownedPresentationPaths | ForEach-Object { try { [IO.Path]::GetFullPath([string]$_) } catch { $null } } | Where-Object { $_ })
  $unknown = @()
  if ($ppt) {
    foreach ($presentation in @($ppt.Presentations)) {
      try {
        $full = [IO.Path]::GetFullPath([string]$presentation.FullName)
        if ($known -notcontains $full) { $unknown += $full }
      } catch {}
    }
  }
  return $unknown
}

function Assert-HostOwnership {
  $others = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $script:powerPointPid })
  $unknown = @(Get-UnknownPresentationPaths)
  if ($others.Count -gt 0 -or $unknown.Count -gt 0) {
    throw "Foreign PowerPoint work appeared during the oracle run; stopping before further UI automation. Other processes=$($others.Id -join ','); unknown presentations=$($unknown -join ',')"
  }
}

function Capture-WindowFrame([long]$Hwnd, [string]$Target) {
  & $PythonExe (Join-Path $PSScriptRoot 'test\capture-window-frame.py') ([string]$Hwnd) $Target
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Target)) { throw "Window capture failed: $Target" }
}

function Start-PlaybackWindow($Settings, $Application) {
  $window = $Settings.Run()
  $deadline = (Get-Date).AddSeconds(8)
  while (-not $window -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
    if ($Application.SlideShowWindows.Count -gt 0) {
      $window = $Application.SlideShowWindows.Item(1)
    }
  }
  if (-not $window) { throw 'PowerPoint started slideshow mode without returning an automation window after the bounded acquisition poll.' }
  return $window
}

function Export-StaticSamples($Presentation, [int[]]$SlideIndexes, [string]$Prefix) {
  $items = @()
  foreach ($index in $SlideIndexes) {
    if ($index -lt 1 -or $index -gt $Presentation.Slides.Count) { continue }
    $target = Join-Path $OutputDir ('static-renders\{0}-slide-{1:d3}.png' -f $Prefix,$index)
    $Presentation.Slides.Item($index).Export($target, 'PNG', 1600, 900)
    $modelCount = 0
    foreach ($shape in @($Presentation.Slides.Item($index).Shapes)) {
      try { if ([int]$shape.Type -eq 30) { $modelCount++ } } catch {}
    }
    $items += [ordered]@{ slideIndex = $index; image = [IO.Path]::GetFileName($target); native3dShapes = $modelCount }
  }
  return $items
}

function Open-And-Inspect([string]$Path, [string]$Kind, [int[]]$Samples) {
  Assert-HostOwnership
  $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
  $hashBefore = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
  $mtimeBefore = (Get-Item -LiteralPath $resolved).LastWriteTimeUtc
  $presentation = $ppt.Presentations.Open($resolved, $msoTrue, $msoFalse, $msoFalse)
  $script:ownedPresentationPaths += $resolved
  $repairMode = $null
  try { $repairMode = [bool]$presentation.RepairMode } catch {}
  $static = @(Export-StaticSamples $presentation $Samples ([IO.Path]::GetFileNameWithoutExtension($resolved)))
  $entry = [ordered]@{
    kind = $Kind
    fileName = [IO.Path]::GetFileName($resolved)
    sourcePath = $resolved
    opened = $true
    repairMode = $repairMode
    slideCount = [int]$presentation.Slides.Count
    staticSamples = $static
    sha256Before = $hashBefore
  }
  $presentation.Close()
  $script:ownedPresentationPaths = @($script:ownedPresentationPaths | Where-Object { $_ -ne $resolved })
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null
  $hashAfter = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
  $entry.sha256After = $hashAfter
  $entry.sourceUnchanged = $hashBefore -eq $hashAfter -and (Get-Item -LiteralPath $resolved).LastWriteTimeUtc -eq $mtimeBefore
  $report.presentations += $entry
  Add-Check "$Kind opens in PowerPoint without repair mode" ($entry.opened -and $entry.repairMode -ne $true) @{ fileName = $entry.fileName; repairMode = $entry.repairMode }
  Add-Check "$Kind source remains byte-unchanged after read-only open" $entry.sourceUnchanged @{ fileName = $entry.fileName; sha256 = $hashAfter }
  return $entry
}

function Get-ZipEntryHash($Archive, [string]$Name) {
  $entry = $Archive.GetEntry($Name)
  if (-not $entry) { return $null }
  $stream = $entry.Open()
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($sha.ComputeHash($stream)).ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Get-ZipEntryText($Archive, [string]$Name) {
  $entry = $Archive.GetEntry($Name)
  if (-not $entry) { return $null }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() }
  finally { $reader.Dispose() }
}

function Get-NormalizedPlaybackSlide([string]$XmlText) {
  $document = [Xml.XmlDocument]::new()
  $document.PreserveWhitespace = $true
  $document.LoadXml($XmlText)
  $volatileNodes = @($document.SelectNodes("//*[local-name()='creationId' or local-name()='modId']"))
  foreach ($node in $volatileNodes) { [void]$node.ParentNode.RemoveChild($node) }
  return $document.OuterXml
}

function Test-PlaybackPackageEquivalence([string]$ReferencePath, [string]$CandidatePath, [int]$SpecimenCount) {
  $referenceResolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ReferencePath).Path)
  $candidateResolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $CandidatePath).Path)
  $reference = [IO.Compression.ZipFile]::OpenRead($referenceResolved)
  $candidate = [IO.Compression.ZipFile]::OpenRead($candidateResolved)
  try {
    $referenceNames = @($reference.Entries | Where-Object { $_.Name } | ForEach-Object FullName | Sort-Object -Unique)
    $candidateNames = @($candidate.Entries | Where-Object { $_.Name } | ForEach-Object FullName | Sort-Object -Unique)
    $partSetDifference = @((Compare-Object $referenceNames $candidateNames) | ForEach-Object InputObject)

    $normalizedSpecimenMismatches = @()
    for ($slideIndex = 2; $slideIndex -le ($SpecimenCount + 1); $slideIndex++) {
      $part = "ppt/slides/slide$slideIndex.xml"
      $referenceText = Get-ZipEntryText $reference $part
      $candidateText = Get-ZipEntryText $candidate $part
      if (-not $referenceText -or -not $candidateText -or (Get-NormalizedPlaybackSlide $referenceText) -ne (Get-NormalizedPlaybackSlide $candidateText)) {
        $normalizedSpecimenMismatches += $part
      }
    }

    $allowedVolatileParts = @('docProps/core.xml','ppt/betterpptx-edition.xml','ppt/slides/slide1.xml')
    $exactPartMismatches = @()
    foreach ($part in $referenceNames) {
      if ($allowedVolatileParts -contains $part -or $part -match '^ppt/slides/slide\d+\.xml$') { continue }
      if ((Get-ZipEntryHash $reference $part) -ne (Get-ZipEntryHash $candidate $part)) { $exactPartMismatches += $part }
    }

    $mediaParts = @($referenceNames | Where-Object { $_ -like 'ppt/media/*' })
    $slideRelationshipParts = @($referenceNames | Where-Object { $_ -like 'ppt/slides/_rels/*' })
    $status = $partSetDifference.Count -eq 0 -and $normalizedSpecimenMismatches.Count -eq 0 -and $exactPartMismatches.Count -eq 0
    return [ordered]@{
      status = $(if ($status) { 'PASS' } else { 'FAIL' })
      referenceAtlas = [ordered]@{ fileName = [IO.Path]::GetFileName($referenceResolved); sha256 = (Get-FileHash -LiteralPath $referenceResolved -Algorithm SHA256).Hash.ToLowerInvariant() }
      candidateAtlas = [ordered]@{ fileName = [IO.Path]::GetFileName($candidateResolved); sha256 = (Get-FileHash -LiteralPath $candidateResolved -Algorithm SHA256).Hash.ToLowerInvariant() }
      specimenSlidesCompared = $SpecimenCount
      normalizedSpecimenMismatches = $normalizedSpecimenMismatches
      exactPackagePartsCompared = @($referenceNames | Where-Object { $allowedVolatileParts -notcontains $_ -and $_ -notmatch '^ppt/slides/slide\d+\.xml$' }).Count
      exactPartMismatches = $exactPartMismatches
      mediaPartsCompared = $mediaParts.Count
      slideRelationshipPartsCompared = $slideRelationshipParts.Count
      partSetDifference = $partSetDifference
      excludedNonPlaybackParts = $allowedVolatileParts
      normalization = 'Only volatile Office creationId/modId elements are removed from specimen slide XML.'
    }
  } finally {
    $reference.Dispose()
    $candidate.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir,(Join-Path $OutputDir 'static-renders'),(Join-Path $OutputDir 'atlas-playback-frames') | Out-Null
$AtlasPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $AtlasPath).Path)
$PortfolioDir = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PortfolioDir).Path)
$OutputDir = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $OutputDir).Path)
$mutex = New-Object System.Threading.Mutex($false, 'Local\BetterPPTX.AuthoringV3.PowerPointOracle')
$lockAcquired = $mutex.WaitOne(0)
$report.hostSafety.namedLockAcquired = $lockAcquired
if (-not $lockAcquired) { throw 'Another Authoring-v3 PowerPoint oracle owns the named lock.' }

try {
  $before = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
  $report.hostSafety.powerPointProcessesBefore = @($before | ForEach-Object { [ordered]@{ id = $_.Id; title = $_.MainWindowTitle } })
  Add-Check 'no pre-existing PowerPoint process is disturbed' ($before.Count -eq 0) $report.hostSafety.powerPointProcessesBefore
  if ($before.Count -gt 0) { throw 'A PowerPoint session is already active; oracle automation stopped before launch.' }

  $ppt = New-Object -ComObject PowerPoint.Application
  $ppt.Visible = $msoTrue
  $ppt.DisplayAlerts = 0
  Start-Sleep -Milliseconds 400
  $ownProcess = @(Get-Process POWERPNT -ErrorAction Stop | Sort-Object StartTime -Descending | Select-Object -First 1)
  $script:powerPointPid = [int]$ownProcess.Id
  $report.hostSafety.ownedPowerPointPid = $script:powerPointPid
  $report.powerPoint = [ordered]@{ version = [string]$ppt.Version; build = [string]$ppt.Build }

  $atlasEntry = Open-And-Inspect $AtlasPath 'native motion atlas' @(1,2,19,20,37,38,50)
  $expectedMotionCount = [int]$atlasEntry.slideCount - 1
  Add-Check 'atlas contains an index plus executable motion specimens' ($expectedMotionCount -gt 0) @{ slideCount = $atlasEntry.slideCount; executableMotionCount = $expectedMotionCount }
  Add-Check 'atlas static samples remain editable native 3D specimens' (@($atlasEntry.staticSamples | Where-Object { $_.native3dShapes -gt 0 }).Count -eq $atlasEntry.staticSamples.Count) $atlasEntry.staticSamples

  $portfolioFiles = @(Get-ChildItem -LiteralPath $PortfolioDir -Recurse -Filter '*.pptx' | Sort-Object Name)
  foreach ($file in $portfolioFiles) {
    $probe = $ppt.Presentations.Open($file.FullName, $msoTrue, $msoFalse, $msoFalse)
    $last = [int]$probe.Slides.Count
    $probe.Close()
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($probe) | Out-Null
    [void](Open-And-Inspect $file.FullName "portfolio $($file.BaseName)" @(1,$last))
  }
  Add-Check 'all seven cold-AI portfolio artifacts open in PowerPoint' (@($report.presentations | Where-Object { $_.kind -like 'portfolio *' }).Count -eq 7) @($portfolioFiles.Name)

  Assert-HostOwnership
  $videoSource = Join-Path $OutputDir 'atlas-video-sample-source.pptx'
  $reusePriorPlayback = -not [string]::IsNullOrWhiteSpace($PriorPlaybackEvidenceDir) -or -not [string]::IsNullOrWhiteSpace($PriorPlaybackAtlasPath)
  if ($reusePriorPlayback) {
    if ([string]::IsNullOrWhiteSpace($PriorPlaybackEvidenceDir) -or [string]::IsNullOrWhiteSpace($PriorPlaybackAtlasPath)) {
      throw 'PriorPlaybackEvidenceDir and PriorPlaybackAtlasPath must be supplied together.'
    }
    $priorDir = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PriorPlaybackEvidenceDir).Path)
    $priorAtlas = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $PriorPlaybackAtlasPath).Path)
    $priorAnalysisPath = Join-Path $priorDir 'motion-frame-analysis.json'
    $priorReportPath = Join-Path $priorDir 'powerpoint-oracle-report.json'
    $priorAnalysis = Get-Content -LiteralPath $priorAnalysisPath -Raw | ConvertFrom-Json
    $priorReport = Get-Content -LiteralPath $priorReportPath -Raw | ConvertFrom-Json
    $priorVisibleCheck = @($priorReport.checks | Where-Object { $_.name -like 'all * executable atlas motions visibly change*' -and $_.status -eq 'PASS' })
    $priorPlaybackPass = $priorAnalysis.status -eq 'PASS' -and [int]$priorAnalysis.pairCount -eq $expectedMotionCount -and [int]$priorAnalysis.visiblyChangedCount -eq $expectedMotionCount -and $priorVisibleCheck.Count -eq 1
    Add-Check "prior PowerPoint oracle proves all $expectedMotionCount executable motions visibly change" $priorPlaybackPass @{ analysisSha256 = (Get-FileHash -LiteralPath $priorAnalysisPath -Algorithm SHA256).Hash.ToLowerInvariant(); reportSha256 = (Get-FileHash -LiteralPath $priorReportPath -Algorithm SHA256).Hash.ToLowerInvariant(); pairCount = $priorAnalysis.pairCount; visiblyChangedCount = $priorAnalysis.visiblyChangedCount }

    $equivalence = Test-PlaybackPackageEquivalence $priorAtlas $AtlasPath $expectedMotionCount
    $equivalence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $OutputDir 'playback-package-equivalence.json') -Encoding utf8
    Add-Check 'candidate atlas is playback-equivalent to the fully sampled atlas' ($equivalence.status -eq 'PASS') $equivalence
    $report.playback = [ordered]@{ mode = 'inherited-from-package-equivalent-full-oracle'; priorEvidenceDir = $priorDir; priorAnalysis = $priorAnalysis; equivalence = $equivalence }
    $priorContactSheet = Join-Path $priorDir 'atlas-playback-contact-sheet.png'
    if (Test-Path -LiteralPath $priorContactSheet) { Copy-Item -LiteralPath $priorContactSheet -Destination (Join-Path $OutputDir 'atlas-playback-contact-sheet.png') -Force }
    Copy-Item -LiteralPath $priorAnalysisPath -Destination (Join-Path $OutputDir 'inherited-motion-frame-analysis.json') -Force
    Copy-Item -LiteralPath $AtlasPath -Destination $videoSource -Force
  } else {
    # Playback sampling needs temporary transition overrides. Work on a disposable
    # writable copy so the evidence source remains immutable and PowerPoint cannot
    # raise a hidden read-only save prompt when the slideshow exits.
    $playbackSource = Join-Path $OutputDir 'atlas-playback-source.pptx'
    Copy-Item -LiteralPath $AtlasPath -Destination $playbackSource -Force
    $atlas = $ppt.Presentations.Open($playbackSource, $msoFalse, $msoFalse, $msoTrue)
    $script:ownedPresentationPaths += $playbackSource
    foreach ($slide in @($atlas.Slides)) {
      $slide.SlideShowTransition.AdvanceOnTime = $msoFalse
      $slide.SlideShowTransition.AdvanceOnClick = $msoTrue
    }
    $atlas.Save()
    $settings = $atlas.SlideShowSettings
    $settings.RangeType = 1
    $settings.ShowWithAnimation = $msoTrue
    $settings.ShowWithNarration = $msoFalse
    $show = $null
    $frameRecords = @()
    for ($slideIndex = 2; $slideIndex -le $atlasEntry.slideCount; $slideIndex++) {
      $captured = $false
      $captureError = $null
      for ($captureAttempt = 1; $captureAttempt -le 3 -and -not $captured; $captureAttempt++) {
        Assert-HostOwnership
        try {
          if (-not $show -or $ppt.SlideShowWindows.Count -eq 0) {
            if ($show) { try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($show) | Out-Null } catch {} }
            $show = Start-PlaybackWindow $settings $ppt
          }
          $showHwnd = [long]$show.HWND
          if ($showHwnd -eq 0) { $showHwnd = [long](Get-Process -Id $script:powerPointPid).MainWindowHandle }
          if ($showHwnd -eq 0) { throw 'PowerPoint slideshow window handle was not available.' }
          $show.View.GotoSlide($slideIndex, $msoTrue)
          Start-Sleep -Milliseconds 80
          $durationMs = 1800
          try {
            $sequence = $atlas.Slides.Item($slideIndex).TimeLine.MainSequence
            if ($sequence.Count -gt 0) { $durationMs = [Math]::Round([double]$sequence.Item($sequence.Count).Timing.Duration * 1000) }
          } catch {}
          $targets = @(80,[Math]::Max(350,[Math]::Round($durationMs * 0.20)),[Math]::Max(700,[Math]::Round($durationMs * 0.45)),[Math]::Min(4000,[Math]::Max(1100,[Math]::Round($durationMs * 0.75)))) | Sort-Object -Unique
          $elapsedMs = 80
          $samples = @()
          $sampleIndex = 0
          foreach ($targetMs in $targets) {
            $remainingMs = [Math]::Max(0,[int]$targetMs - $elapsedMs)
            if ($remainingMs -gt 0) { Start-Sleep -Milliseconds $remainingMs }
            $samplePath = Join-Path $OutputDir ('atlas-playback-frames\motion-{0:d3}-sample-{1:d2}.png' -f $slideIndex,$sampleIndex)
            Capture-WindowFrame $showHwnd $samplePath
            $samples += [ordered]@{ atMs = [int]$targetMs; image = [IO.Path]::GetFileName($samplePath) }
            $elapsedMs = [int]$targetMs
            $sampleIndex++
          }
          $currentPosition = [int]$show.View.CurrentShowPosition
          if ($currentPosition -ne $slideIndex) { throw "PowerPoint advanced from slide $slideIndex to $currentPosition during sampling." }
          $frameRecords += [ordered]@{ slideIndex = $slideIndex; durationMs = $durationMs; samples = $samples; captureAttempt = $captureAttempt }
          $captured = $true
        } catch {
          $captureError = $_.Exception.Message
          if ($show) {
            try { $show.View.Exit() } catch {}
            try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($show) | Out-Null } catch {}
            $show = $null
          }
          if ($captureAttempt -lt 3) { Start-Sleep -Milliseconds 500 }
        }
      }
      if (-not $captured) { throw "PowerPoint could not produce same-slide motion evidence for slide $slideIndex after three attempts: $captureError" }
      if ($slideIndex % 5 -eq 0 -or $slideIndex -eq $atlasEntry.slideCount) { Write-Host "PLAYBACK_CAPTURE $slideIndex/$($atlasEntry.slideCount)" }
    }
    if ($show) {
      try { $show.View.Exit() } catch {}
      try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($show) | Out-Null } catch {}
      $show = $null
    }
    Start-Sleep -Milliseconds 1500
    $report.playback.frameRecords = $frameRecords
    & $PythonExe (Join-Path $PSScriptRoot 'test\analyze-authoring-v3-motion-frames.py') $OutputDir
    $analysisExit = $LASTEXITCODE
    $analysis = Get-Content -LiteralPath (Join-Path $OutputDir 'motion-frame-analysis.json') -Raw | ConvertFrom-Json
    $report.playback.analysis = $analysis
    Add-Check "all $expectedMotionCount executable atlas motions visibly change in PowerPoint slideshow frames" ($analysisExit -eq 0 -and $analysis.pairCount -eq $expectedMotionCount -and $analysis.visiblyChangedCount -eq $expectedMotionCount) @{ pairCount = $analysis.pairCount; visiblyChangedCount = $analysis.visiblyChangedCount }
    $atlas.SaveCopyAs($videoSource, $ppSaveAsOpenXMLPresentation)
    $atlas.Close()
    $script:ownedPresentationPaths = @($script:ownedPresentationPaths | Where-Object { $_ -ne $playbackSource })
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($atlas) | Out-Null
  }

  # Produce a concise native PowerPoint video sample from six spread-out atlas
  # motions. This is evidence only: the source atlas remains read-only and the
  # temporary copy is never treated as a product artifact.
  $videoPresentation = $ppt.Presentations.Open($videoSource, $msoFalse, $msoFalse, $msoFalse)
  $script:ownedPresentationPaths += $videoSource
  $keep = @(2,19,20,37,38,$atlasEntry.slideCount) | Where-Object { $_ -ge 1 -and $_ -le $atlasEntry.slideCount } | Sort-Object -Unique
  for ($index = $videoPresentation.Slides.Count; $index -ge 1; $index--) {
    if ($keep -notcontains $index) { $videoPresentation.Slides.Item($index).Delete() }
  }
  foreach ($slide in @($videoPresentation.Slides)) {
    $slide.SlideShowTransition.AdvanceOnTime = $msoTrue
    $slide.SlideShowTransition.AdvanceTime = 7
    $slide.SlideShowTransition.AdvanceOnClick = $msoFalse
  }
  $videoPresentation.Save()
  $videoPath = Join-Path $OutputDir 'authoring-v3-native-motion-playback-sample.mp4'
  $videoStarted = $false
  for ($attempt = 1; $attempt -le 12 -and -not $videoStarted; $attempt++) {
    try {
      $videoPresentation.CreateVideo($videoPath, $msoTrue, 7, 720, 30, 85)
      $videoStarted = $true
    } catch {
      if ($attempt -eq 12) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
  $deadline = (Get-Date).AddMinutes(8)
  do {
    Start-Sleep -Seconds 2
    Assert-HostOwnership
    $videoStatus = [int]$videoPresentation.CreateVideoStatus
  } while ($videoStatus -in @(1,2) -and (Get-Date) -lt $deadline)
  $videoBytes = if (Test-Path -LiteralPath $videoPath) { (Get-Item -LiteralPath $videoPath).Length } else { 0 }
  $report.video = [ordered]@{ statusCode = $videoStatus; fileName = [IO.Path]::GetFileName($videoPath); bytes = $videoBytes; sampleSlides = $keep }
  Add-Check 'PowerPoint creates a native slideshow playback video sample' ($videoStatus -eq 3 -and $videoBytes -gt 100000) $report.video
  $videoPresentation.Close()
  $script:ownedPresentationPaths = @($script:ownedPresentationPaths | Where-Object { $_ -ne $videoSource })
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($videoPresentation) | Out-Null

  $report.status = $(if (@($report.checks | Where-Object { $_.status -eq 'FAIL' }).Count -eq 0) { 'PASS' } else { 'FAIL' })
} catch {
  $report.status = 'FAIL'
  $report.error = $_.Exception.Message
  Write-Warning $_.Exception.Message
} finally {
  if ($ppt) {
    foreach ($presentation in @($ppt.Presentations)) {
      try {
        $full = [IO.Path]::GetFullPath([string]$presentation.FullName)
        if ($ownedPresentationPaths -contains $full) {
          # Oracle-owned working copies are disposable. Suppress any playback-
          # induced dirty flag before closing so cleanup cannot leave a hidden
          # PowerPoint process behind after an interrupted run.
          try { $presentation.Saved = $msoTrue } catch {}
          $presentation.Close()
        }
      } catch {}
      try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null } catch {}
    }
  }
  $ownedPresentationPaths = @()
  if ($ppt) {
    try {
      $unknown = @(Get-UnknownPresentationPaths)
      if ($unknown.Count -eq 0 -and $ppt.Presentations.Count -eq 0) { $ppt.Quit() }
    } catch {}
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($ppt) | Out-Null } catch {}
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  if ($mutex) {
    try { if ($lockAcquired) { $mutex.ReleaseMutex() } } catch {}
    $mutex.Dispose()
  }
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  Save-Report
}

$report | ConvertTo-Json -Depth 8
if ($report.status -ne 'PASS') { exit 2 }
