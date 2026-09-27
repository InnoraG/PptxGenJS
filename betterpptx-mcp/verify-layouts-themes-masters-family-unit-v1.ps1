param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath,
  [Parameter(Mandatory = $true)][string]$SourceRenderDir,
  [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

function Get-ShapeNames {
  param([object]$Shapes)
  $names = @()
  foreach ($shape in $Shapes) { $names += [string]$shape.Name }
  return @($names | Sort-Object)
}

function Get-Snapshot {
  param([object]$Presentation)
  $masters = @()
  foreach ($design in $Presentation.Designs) {
    $master = $design.SlideMaster
    $layouts = @()
    foreach ($layout in $master.CustomLayouts) {
      $layouts += [ordered]@{
        Name = [string]$layout.Name
        Shapes = Get-ShapeNames -Shapes $layout.Shapes
      }
    }
    $masters += [ordered]@{
      Name = [string]$master.Name
      Shapes = Get-ShapeNames -Shapes $master.Shapes
      Layouts = @($layouts)
    }
  }
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $layoutName = ''
    $masterName = ''
    try { $layoutName = [string]$slide.CustomLayout.Name } catch {}
    try { $masterName = [string]$slide.Master.Name } catch {}
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      LayoutName = $layoutName
      MasterName = $masterName
      Shapes = Get-ShapeNames -Shapes $slide.Shapes
    }
  }
  return [ordered]@{ SlideCount = [int]$Presentation.Slides.Count; Masters = @($masters); Slides = @($slides) }
}

function Export-Slides {
  param([object]$Presentation, [string]$Directory)
  [System.IO.Directory]::CreateDirectory($Directory) | Out-Null
  foreach ($slide in $Presentation.Slides) {
    $file = Join-Path $Directory (('slide-{0}.png' -f [int]$slide.SlideIndex))
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
if (Test-Path -LiteralPath $outputFull) { throw "Output already exists: $outputFull" }

$app = $null
$sourcePresentation = $null
$roundtripPresentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $sourcePresentation = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
  $source = Get-Snapshot -Presentation $sourcePresentation
  Export-Slides -Presentation $sourcePresentation -Directory $sourceRenderFull
  $sourcePresentation.SaveCopyAs($outputFull, 24)
  $sourcePresentation.Close()
  $sourcePresentation = $null

  $roundtripPresentation = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
  $roundtrip = Get-Snapshot -Presentation $roundtripPresentation
  Export-Slides -Presentation $roundtripPresentation -Directory $roundtripRenderFull
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
  [System.IO.File]::WriteAllText($reportFull, ($report | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
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
