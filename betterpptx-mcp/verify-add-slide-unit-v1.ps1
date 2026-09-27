param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$SourceRenderDir,
  [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

function Get-ShapeSnapshot {
  param([object]$Shape)
  $text = ''
  try { if ($Shape.HasTextFrame -and $Shape.TextFrame.HasText) { $text = [string]$Shape.TextFrame.TextRange.Text } } catch {}
  return [ordered]@{
    Name = [string]$Shape.Name
    Type = [int]$Shape.Type
    Text = $text
    AlternativeText = [string]$Shape.AlternativeText
    Left = [double]$Shape.Left
    Top = [double]$Shape.Top
    Width = [double]$Shape.Width
    Height = [double]$Shape.Height
  }
}

function Get-NotesText {
  param([object]$Slide)
  $parts = @()
  try {
    foreach ($shape in $Slide.NotesPage.Shapes) {
      $placeholderType = 0
      try { $placeholderType = [int]$shape.PlaceholderFormat.Type } catch {}
      if ($placeholderType -ne 2) { continue }
      try {
        if ($shape.HasTextFrame -and $shape.TextFrame.HasText) { $parts += [string]$shape.TextFrame.TextRange.Text }
      } catch {}
    }
  } catch {}
  return [string]::Join("`n", $parts)
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $layoutName = ''
    $masterName = ''
    $displayMasterShapes = $true
    $followMasterBackground = $true
    $hidden = $false
    $entryEffect = 0
    $speed = 0
    $advanceOnClick = $true
    $advanceOnTime = $false
    $advanceTime = 0
    try { $layoutName = [string]$slide.CustomLayout.Name } catch {}
    try { $masterName = [string]$slide.Master.Name } catch {}
    try { $displayMasterShapes = ([int]$slide.DisplayMasterShapes -ne 0) } catch {}
    try { $followMasterBackground = ([int]$slide.FollowMasterBackground -ne 0) } catch {}
    try { $hidden = ([int]$slide.SlideShowTransition.Hidden -ne 0) } catch {}
    try { $entryEffect = [int]$slide.SlideShowTransition.EntryEffect } catch {}
    try { $speed = [int]$slide.SlideShowTransition.Speed } catch {}
    try { $advanceOnClick = ([int]$slide.SlideShowTransition.AdvanceOnClick -ne 0) } catch {}
    try { $advanceOnTime = ([int]$slide.SlideShowTransition.AdvanceOnTime -ne 0) } catch {}
    try { $advanceTime = [double]$slide.SlideShowTransition.AdvanceTime } catch {}
    $shapes = @()
    foreach ($shape in $slide.Shapes) { $shapes += Get-ShapeSnapshot -Shape $shape }
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      SlideID = [int]$slide.SlideID
      Name = [string]$slide.Name
      LayoutName = $layoutName
      MasterName = $masterName
      Hidden = $hidden
      DisplayMasterShapes = $displayMasterShapes
      FollowMasterBackground = $followMasterBackground
      Transition = [ordered]@{ EntryEffect = $entryEffect; Speed = $speed; AdvanceOnClick = $advanceOnClick; AdvanceOnTime = $advanceOnTime; AdvanceTime = $advanceTime }
      Notes = Get-NotesText -Slide $slide
      Shapes = $shapes
    }
  }
  return [ordered]@{ SlideCount = [int]$Presentation.Slides.Count; Slides = $slides }
}

function Export-SlideRenders {
  param([object]$Presentation, [string]$Directory)
  [System.IO.Directory]::CreateDirectory($Directory) | Out-Null
  foreach ($slide in $Presentation.Slides) {
    $file = Join-Path $Directory (('slide-{0:D2}.png' -f [int]$slide.SlideIndex))
    $slide.Export($file, 'PNG', 1600, 900)
  }
}

$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; refusing to interfere with an existing interactive session.' }

$inputFull = [System.IO.Path]::GetFullPath($InputPath)
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$reportFull = [System.IO.Path]::GetFullPath($ReportPath)
$sourceRenderFull = [System.IO.Path]::GetFullPath($SourceRenderDir)
$roundtripRenderFull = [System.IO.Path]::GetFullPath($RoundtripRenderDir)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($reportFull)) | Out-Null
foreach ($target in @($outputFull, $reportFull)) { if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force } }
foreach ($target in @($sourceRenderFull, $roundtripRenderFull)) { if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force } }

$app = $null
$sourcePresentation = $null
$roundtripPresentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $sourcePresentation = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
  $source = Get-PresentationSnapshot -Presentation $sourcePresentation
  Export-SlideRenders -Presentation $sourcePresentation -Directory $sourceRenderFull
  $sourcePresentation.SaveCopyAs($outputFull, 24)
  $sourcePresentation.Close()
  $sourcePresentation = $null

  $roundtripPresentation = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
  $roundtrip = Get-PresentationSnapshot -Presentation $roundtripPresentation
  Export-SlideRenders -Presentation $roundtripPresentation -Directory $roundtripRenderFull
  $roundtripPresentation.Close()
  $roundtripPresentation = $null

  $report = [ordered]@{
    status = 'PASS'
    method = 'Presentations.Open2007 repair disabled + SaveCopyAs + reopen'
    openAndRepair = $false
    readOnly = $true
    saveCopyAs = (Test-Path -LiteralPath $outputFull)
    reopened = $true
    source = $source
    roundtrip = $roundtrip
  }
  [System.IO.File]::WriteAllText($reportFull, ($report | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($sourcePresentation) { try { $sourcePresentation.Close() } catch {} }
  if ($roundtripPresentation) { try { $roundtripPresentation.Close() } catch {} }
  if ($app) { try { $app.Quit() } catch {} }
  foreach ($item in @($sourcePresentation, $roundtripPresentation, $app)) { if ($item) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($item) } catch {} } }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
