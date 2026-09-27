param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$SourceRenderDir,
  [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

function Get-CarrierSnapshot {
  param([object]$Carrier)
  $placeholderCount = 0
  $shapeNames = @()
  foreach ($shape in $Carrier.Shapes) {
    $shapeNames += [string]$shape.Name
    try { [void]$shape.PlaceholderFormat.Type; $placeholderCount += 1 } catch {}
  }
  return [ordered]@{
    ShapeCount = [int]$Carrier.Shapes.Count
    PlaceholderCount = [int]$placeholderCount
    ShapeNames = @($shapeNames)
  }
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $master = Get-CarrierSnapshot -Carrier $Presentation.SlideMaster
  $master.Name = [string]$Presentation.SlideMaster.Name
  $layouts = @()
  foreach ($layout in $Presentation.SlideMaster.CustomLayouts) {
    $item = Get-CarrierSnapshot -Carrier $layout
    $item.Index = [int]$layout.Index
    $item.Name = [string]$layout.Name
    $layouts += $item
  }
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $layoutName = ''
    $masterName = ''
    try { $layoutName = [string]$slide.CustomLayout.Name } catch {}
    try { $masterName = [string]$slide.Master.Name } catch {}
    $placeholders = 0
    foreach ($shape in $slide.Shapes) { try { [void]$shape.PlaceholderFormat.Type; $placeholders += 1 } catch {} }
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      LayoutName = $layoutName
      MasterName = $masterName
      ShapeCount = [int]$slide.Shapes.Count
      PlaceholderCount = [int]$placeholders
    }
  }
  return [ordered]@{
    SlideCount = [int]$Presentation.Slides.Count
    DesignCount = [int]$Presentation.Designs.Count
    Master = $master
    Layouts = $layouts
    Slides = $slides
  }
}

function Export-PresentationSlides {
  param([object]$Presentation, [string]$Directory)
  if (Test-Path -LiteralPath $Directory) { throw "Immutable render directory already exists: $Directory" }
  [System.IO.Directory]::CreateDirectory($Directory) | Out-Null
  foreach ($slide in $Presentation.Slides) {
    $file = Join-Path $Directory ("slide-{0}.png" -f [int]$slide.SlideIndex)
    if (Test-Path -LiteralPath $file) { throw "Immutable slide render already exists: $file" }
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
if (Test-Path -LiteralPath $outputFull) { throw "Immutable Office output already exists: $outputFull" }
if (Test-Path -LiteralPath $reportFull) { throw "Immutable Office report already exists: $reportFull" }
if (Test-Path -LiteralPath $sourceRenderFull) { throw "Immutable generated render directory already exists: $sourceRenderFull" }
if (Test-Path -LiteralPath $roundtripRenderFull) { throw "Immutable reopened render directory already exists: $roundtripRenderFull" }
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
