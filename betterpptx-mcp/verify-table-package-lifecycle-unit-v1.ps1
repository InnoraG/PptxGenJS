param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$SourceRenderDir,
  [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

function Get-TableSnapshot {
  param([object]$Shape, [int]$ShapeIndex)
  $table = $Shape.Table
  $style = $null
  $firstRow = $null
  $lastRow = $null
  $firstColumn = $null
  $lastColumn = $null
  $bandedRows = $null
  $bandedColumns = $null
  try { $style = [string]$table.Style } catch {}
  try { $firstRow = [bool]$table.FirstRow } catch {}
  try { $lastRow = [bool]$table.LastRow } catch {}
  try { $firstColumn = [bool]$table.FirstCol } catch {}
  try { $lastColumn = [bool]$table.LastCol } catch {}
  try { $bandedRows = [bool]$table.HorizBanding } catch {}
  try { $bandedColumns = [bool]$table.VertBanding } catch {}
  return [ordered]@{
    ShapeIndex = $ShapeIndex
    ShapeName = [string]$Shape.Name
    Rows = [int]$table.Rows.Count
    Columns = [int]$table.Columns.Count
    Style = $style
    FirstRow = $firstRow
    LastRow = $lastRow
    FirstColumn = $firstColumn
    LastColumn = $lastColumn
    BandedRows = $bandedRows
    BandedColumns = $bandedColumns
  }
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $tables = @()
    for ($index = 1; $index -le [int]$slide.Shapes.Count; $index += 1) {
      $shape = $slide.Shapes.Item($index)
      try {
        if ([int]$shape.HasTable -eq -1) {
          $tables += Get-TableSnapshot -Shape $shape -ShapeIndex $index
        }
      } finally {
        if ($shape) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shape) } catch {} }
      }
    }
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      Name = [string]$slide.Name
      ShapeCount = [int]$slide.Shapes.Count
      TableCount = [int]$tables.Count
      Tables = @($tables | Sort-Object { [int]$_['ShapeIndex'] })
    }
  }
  return [ordered]@{
    SlideCount = [int]$Presentation.Slides.Count
    Slides = @($slides | Sort-Object { [int]$_['Index'] })
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
    saveCopyAs = (Test-Path -LiteralPath $outputFull -PathType Leaf)
    reopened = $true
    source = $source
    roundtrip = $roundtrip
  }
  $json = $report | ConvertTo-Json -Depth 30
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
