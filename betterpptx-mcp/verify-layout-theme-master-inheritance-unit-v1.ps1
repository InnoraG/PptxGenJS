param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-TextShapeSnapshot {
  param([object]$Shape)
  $fontName = ''
  $fontColorRgb = 0
  $fillVisible = $false
  $fillRgb = 0
  $lineVisible = $false
  $lineRgb = 0
  $lineWeight = 0
  $shadowVisible = $false
  $glowRadius = 0
  $placeholderType = 0
  $zOrderPosition = 0
  try {
    if ($Shape.HasTextFrame -and $Shape.TextFrame2.HasText) {
      $fontName = [string]$Shape.TextFrame2.TextRange.Font.Name
      $fontColorRgb = [int64]$Shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB
    }
  } catch {}
  try { $fillVisible = ([int]$Shape.Fill.Visible -ne 0); $fillRgb = [int64]$Shape.Fill.ForeColor.RGB } catch {}
  try { $lineVisible = ([int]$Shape.Line.Visible -ne 0); $lineRgb = [int64]$Shape.Line.ForeColor.RGB; $lineWeight = [double]$Shape.Line.Weight } catch {}
  try { $shadowVisible = ([int]$Shape.Shadow.Visible -ne 0) } catch {}
  try { $glowRadius = [double]$Shape.Glow.Radius } catch {}
  try { $placeholderType = [int]$Shape.PlaceholderFormat.Type } catch {}
  try { $zOrderPosition = [int]$Shape.ZOrderPosition } catch {}
  return [ordered]@{
    Name = [string]$Shape.Name
    Type = [int]$Shape.Type
    Left = [double]$Shape.Left
    Top = [double]$Shape.Top
    Width = [double]$Shape.Width
    Height = [double]$Shape.Height
    FontName = $fontName
    FontColorRgb = $fontColorRgb
    FillVisible = $fillVisible
    FillRgb = $fillRgb
    LineVisible = $lineVisible
    LineRgb = $lineRgb
    LineWeight = $lineWeight
    ShadowVisible = $shadowVisible
    GlowRadius = $glowRadius
    PlaceholderType = $placeholderType
    ZOrderPosition = $zOrderPosition
    AlternativeText = [string]$Shape.AlternativeText
  }
}

function Get-CarrierShapesSnapshot {
  param([object]$Carrier)
  $items = @()
  foreach ($shape in $Carrier.Shapes) { $items += Get-TextShapeSnapshot -Shape $shape }
  return $items
}

function Get-MasterTextStyleSnapshot {
  param([object]$Master)
  $result = @()
  foreach ($family in 1..3) {
    $fontName = ''
    $fontSize = 0
    $fontRgb = 0
    try {
      $level = $Master.TextStyles.Item($family).Levels.Item(1)
      $fontName = [string]$level.Font.Name
      $fontSize = [double]$level.Font.Size
      $fontRgb = [int64]$level.Font.Color.RGB
    } catch {}
    $result += [ordered]@{ Family = $family; FontName = $fontName; FontSize = $fontSize; FontRgb = $fontRgb }
  }
  return $result
}

function Get-PresentationSnapshot {
  param([object]$Presentation)
  $slides = @()
  foreach ($slide in $Presentation.Slides) {
    $shapes = @()
    foreach ($shape in $slide.Shapes) { $shapes += Get-TextShapeSnapshot -Shape $shape }
    $layoutName = ''
    $masterName = ''
    $followMasterBackground = $true
    $displayMasterShapes = $true
    try { $layoutName = [string]$slide.CustomLayout.Name } catch {}
    try { $masterName = [string]$slide.Master.Name } catch {}
    try { $followMasterBackground = ([int]$slide.FollowMasterBackground -ne 0) } catch {}
    try { $displayMasterShapes = ([int]$slide.DisplayMasterShapes -ne 0) } catch {}
    $slides += [ordered]@{
      Index = [int]$slide.SlideIndex
      LayoutName = $layoutName
      MasterName = $masterName
      FollowMasterBackground = $followMasterBackground
      DisplayMasterShapes = $displayMasterShapes
      Shapes = $shapes
    }
  }
  $majorLatin = ''
  $minorLatin = ''
  $accent1Rgb = 0
  $themeName = ''
  try { $majorLatin = [string]$Presentation.SlideMaster.Theme.ThemeFontScheme.MajorFont.Item(1).Name } catch {}
  try { $minorLatin = [string]$Presentation.SlideMaster.Theme.ThemeFontScheme.MinorFont.Item(1).Name } catch {}
  try { $accent1Rgb = [int64]$Presentation.SlideMaster.Theme.ThemeColorScheme.Colors(5).RGB } catch {}
  try { $themeName = [string]$Presentation.SlideMaster.Theme.Name } catch {}
  $layouts = @()
  foreach ($layout in $Presentation.SlideMaster.CustomLayouts) {
    $layouts += [ordered]@{
      Index = [int]$layout.Index
      Name = [string]$layout.Name
      Shapes = Get-CarrierShapesSnapshot -Carrier $layout
    }
  }
  return [ordered]@{
    SlideCount = [int]$Presentation.Slides.Count
    Theme = [ordered]@{ Name = $themeName; MajorLatin = $majorLatin; MinorLatin = $minorLatin; Accent1Rgb = $accent1Rgb }
    Master = [ordered]@{
      Name = [string]$Presentation.SlideMaster.Name
      Shapes = Get-CarrierShapesSnapshot -Carrier $Presentation.SlideMaster
      TextStyles = Get-MasterTextStyleSnapshot -Master $Presentation.SlideMaster
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
if (Test-Path -LiteralPath $outputFull) { Remove-Item -LiteralPath $outputFull -Force }

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
