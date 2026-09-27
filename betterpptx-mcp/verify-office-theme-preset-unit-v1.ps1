param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$SourceRenderDir,
  [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

$slotNames = @('dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink')

function Get-ThemeSnapshot {
  param([object]$Presentation)
  $theme = $Presentation.SlideMaster.Theme
  $colors = [ordered]@{}
  for ($index = 1; $index -le 12; $index += 1) {
    $colors[$slotNames[$index - 1]] = [int64]$theme.ThemeColorScheme.Colors($index).RGB
  }
  return [ordered]@{
    Name = [string]$theme.Name
    MajorLatin = [string]$theme.ThemeFontScheme.MajorFont(1).Name
    MinorLatin = [string]$theme.ThemeFontScheme.MinorFont(1).Name
    Colors = $colors
  }
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      LayoutName = [string]$slide.CustomLayout.Name
      MasterName = [string]$slide.Master.Name
      ShapeCount = [int]$slide.Shapes.Count
    }
  }
  return [ordered]@{
    SlideCount = [int]$Presentation.Slides.Count
    DesignCount = [int]$Presentation.Designs.Count
    LayoutCount = [int]$Presentation.SlideMaster.CustomLayouts.Count
    MasterName = [string]$Presentation.SlideMaster.Name
    Theme = Get-ThemeSnapshot -Presentation $Presentation
    Slides = $slides
  }
}

function Export-PresentationSlides {
  param([object]$Presentation, [string]$Directory)
  if (Test-Path -LiteralPath $Directory) { throw "Immutable render directory already exists: $Directory" }
  [System.IO.Directory]::CreateDirectory($Directory) | Out-Null
  foreach ($slide in $Presentation.Slides) {
    $file = Join-Path $Directory ("slide-{0}.png" -f [int]$slide.SlideIndex)
    $slide.Export($file, 'PNG', 1600, 900)
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "PowerPoint did not render slide: $file" }
  }
}

$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; refusing to interfere with an existing interactive session.' }

$inputFull = [System.IO.Path]::GetFullPath($InputPath)
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$reportFull = [System.IO.Path]::GetFullPath($ReportPath)
$sourceRenderFull = [System.IO.Path]::GetFullPath($SourceRenderDir)
$roundtripRenderFull = [System.IO.Path]::GetFullPath($RoundtripRenderDir)
if (-not (Test-Path -LiteralPath $inputFull -PathType Leaf)) { throw "Input PPTX does not exist: $inputFull" }
foreach ($target in @($outputFull, $reportFull, $sourceRenderFull, $roundtripRenderFull)) {
  if (Test-Path -LiteralPath $target) { throw "Immutable proof target already exists: $target" }
}
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($reportFull)) | Out-Null

$app = $null
$sourcePresentation = $null
$roundtripPresentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $sourcePresentation = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
  $source = Get-PresentationSnapshot -Presentation $sourcePresentation
  Export-PresentationSlides -Presentation $sourcePresentation -Directory $sourceRenderFull
  $sourcePresentation.SaveCopyAs($outputFull, 24)
  $sourcePresentation.Close()
  $sourcePresentation = $null

  $roundtripPresentation = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
  $roundtrip = Get-PresentationSnapshot -Presentation $roundtripPresentation
  Export-PresentationSlides -Presentation $roundtripPresentation -Directory $roundtripRenderFull
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
  $json = $report | ConvertTo-Json -Depth 20
  $stream = [System.IO.File]::Open($reportFull, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
    try { $writer.Write($json) } finally { $writer.Dispose() }
  } finally { if ($stream) { $stream.Dispose() } }
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
