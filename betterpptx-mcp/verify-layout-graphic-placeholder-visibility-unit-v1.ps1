param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-GraphicShapeSnapshot {
  param([object]$Shape)
  $placeholderType = 0
  $hasChart = $false
  $hasTable = $false
  $chartSeriesCount = 0
  $tableRows = 0
  $tableColumns = 0
  $firstDataCellText = ''
  try { $placeholderType = [int]$Shape.PlaceholderFormat.Type } catch {}
  try {
    $hasChart = ([int]$Shape.HasChart -ne 0)
    if ($hasChart) { $chartSeriesCount = [int]$Shape.Chart.SeriesCollection().Count }
  } catch {}
  try {
    $hasTable = ([int]$Shape.HasTable -ne 0)
    if ($hasTable) {
      $tableRows = [int]$Shape.Table.Rows.Count
      $tableColumns = [int]$Shape.Table.Columns.Count
      if ($tableRows -ge 2 -and $tableColumns -ge 1) {
        $firstDataCellText = [string]$Shape.Table.Cell(2, 1).Shape.TextFrame2.TextRange.Text
      }
    }
  } catch {}
  return [ordered]@{
    Name = [string]$Shape.Name
    Type = [int]$Shape.Type
    Left = [double]$Shape.Left
    Top = [double]$Shape.Top
    Width = [double]$Shape.Width
    Height = [double]$Shape.Height
    PlaceholderType = $placeholderType
    HasChart = $hasChart
    ChartSeriesCount = $chartSeriesCount
    HasTable = $hasTable
    TableRows = $tableRows
    TableColumns = $tableColumns
    FirstDataCellText = $firstDataCellText
    AlternativeText = [string]$Shape.AlternativeText
    ZOrderPosition = [int]$Shape.ZOrderPosition
  }
}

function Get-CarrierShapesSnapshot {
  param([object]$Carrier)
  $items = @()
  foreach ($shape in $Carrier.Shapes) { $items += Get-GraphicShapeSnapshot -Shape $shape }
  return $items
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $layouts = @()
  foreach ($layout in $Presentation.SlideMaster.CustomLayouts) {
    $layouts += [ordered]@{
      Index = [int]$layout.Index
      Name = [string]$layout.Name
      Shapes = Get-CarrierShapesSnapshot -Carrier $layout
    }
  }
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $layoutName = ''
    $masterName = ''
    $displayMasterShapes = $true
    try { $layoutName = [string]$slide.CustomLayout.Name } catch {}
    try { $masterName = [string]$slide.Master.Name } catch {}
    try { $displayMasterShapes = ([int]$slide.DisplayMasterShapes -ne 0) } catch {}
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      LayoutName = $layoutName
      MasterName = $masterName
      DisplayMasterShapes = $displayMasterShapes
      Shapes = Get-CarrierShapesSnapshot -Carrier $slide
    }
  }
  return [ordered]@{
    SlideCount = [int]$Presentation.Slides.Count
    Master = [ordered]@{
      Name = [string]$Presentation.SlideMaster.Name
      Shapes = Get-CarrierShapesSnapshot -Carrier $Presentation.SlideMaster
    }
    Layouts = $layouts
    Slides = $slides
  }
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
