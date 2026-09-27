param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-TextShapeSnapshot {
  param([object]$Shape)
  $hasText = $false
  $text = ''
  $paragraphCount = 0
  try {
    $hasText = ([int]$Shape.HasTextFrame -ne 0) -and ([int]$Shape.TextFrame2.HasText -ne 0)
    if ($hasText) {
      $text = [string]$Shape.TextFrame2.TextRange.Text
      $paragraphCount = [int]$Shape.TextFrame2.TextRange.Paragraphs().Count
    }
  } catch {}
  return [ordered]@{
    Name = [string]$Shape.Name
    Type = [int]$Shape.Type
    Left = [double]$Shape.Left
    Top = [double]$Shape.Top
    Width = [double]$Shape.Width
    Height = [double]$Shape.Height
    HasText = $hasText
    Text = $text
    ParagraphCount = $paragraphCount
    AlternativeText = [string]$Shape.AlternativeText
    ZOrderPosition = [int]$Shape.ZOrderPosition
  }
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $shapes = @()
    foreach ($shape in $slide.Shapes) { $shapes += Get-TextShapeSnapshot -Shape $shape }
    $slides += [ordered]@{ Index = [int]$slide.SlideIndex; Shapes = $shapes }
  }
  $hyperlinks = @()
  foreach ($slide in $Presentation.Slides) {
    foreach ($hyperlink in $slide.Hyperlinks) {
      $hyperlinks += [ordered]@{
        SlideIndex = [int]$slide.SlideIndex
        Address = [string]$hyperlink.Address
        SubAddress = [string]$hyperlink.SubAddress
        Type = [int]$hyperlink.Type
      }
    }
  }
  return [ordered]@{ SlideCount = [int]$Presentation.Slides.Count; Hyperlinks = $hyperlinks; Slides = $slides }
}

$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; refusing to interfere with an existing interactive session.' }

$inputFull = [System.IO.Path]::GetFullPath($InputPath)
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$reportFull = [System.IO.Path]::GetFullPath($ReportPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($reportFull)) | Out-Null
if (Test-Path -LiteralPath $outputFull) { throw "Immutable output already exists: $outputFull" }
if (Test-Path -LiteralPath $reportFull) { throw "Immutable report already exists: $reportFull" }

$app = $null
$sourcePresentation = $null
$roundtripPresentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $sourcePresentation = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
  $source = Get-PresentationSnapshot -Presentation $sourcePresentation
  $sourcePresentation.SaveCopyAs($outputFull, 24)
  $sourcePresentation.Close()
  $sourcePresentation = $null

  $roundtripPresentation = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
  $roundtrip = Get-PresentationSnapshot -Presentation $roundtripPresentation
  $roundtripPresentation.Close()
  $roundtripPresentation = $null

  $report = [ordered]@{
    status = 'PASS'
    method = 'Presentations.Open2007'
    openAndRepair = $false
    readOnly = $true
    saveCopyAs = (Test-Path -LiteralPath $outputFull)
    reopened = $true
    source = $source
    roundtrip = $roundtrip
  }
  [System.IO.File]::WriteAllText($reportFull, ($report | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
} finally {
  if ($sourcePresentation) { try { $sourcePresentation.Close() } catch {} }
  if ($roundtripPresentation) { try { $roundtripPresentation.Close() } catch {} }
  if ($app) { try { $app.Quit() } catch {} }
  foreach ($item in @($sourcePresentation, $roundtripPresentation, $app)) {
    if ($item) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($item) } catch {} }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
