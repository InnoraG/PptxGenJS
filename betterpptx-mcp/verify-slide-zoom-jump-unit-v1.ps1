param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$ReportPath,
    [Parameter(Mandatory = $true)][string]$SourceRenderDir,
    [Parameter(Mandatory = $true)][string]$RoundtripRenderDir
)

$ErrorActionPreference = 'Stop'

function Get-SafeValue {
    param($Object, [Parameter(Mandatory = $true)][string]$Property, $Fallback = $null)
    try { return $Object.$Property } catch { return $Fallback }
}

function Get-ClickSnapshot {
    param($Shape)
    $setting = $null
    $hyperlink = $null
    try {
        $setting = $Shape.ActionSettings.Item(1)
        try { $hyperlink = $setting.Hyperlink } catch { $hyperlink = $null }
        return [ordered]@{
            Action = [int](Get-SafeValue -Object $setting -Property 'Action' -Fallback 0)
            Address = [string](Get-SafeValue -Object $hyperlink -Property 'Address' -Fallback '')
            SubAddress = [string](Get-SafeValue -Object $hyperlink -Property 'SubAddress' -Fallback '')
            ScreenTip = [string](Get-SafeValue -Object $hyperlink -Property 'ScreenTip' -Fallback '')
        }
    }
    finally {
        if ($hyperlink) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($hyperlink) } catch {} }
        if ($setting) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($setting) } catch {} }
    }
}

function Get-PresentationSnapshot {
    param($Presentation)
    $slides = @()
    for ($slideIndex = 1; $slideIndex -le [int]$Presentation.Slides.Count; $slideIndex += 1) {
        $slide = $null
        try {
            $slide = $Presentation.Slides.Item($slideIndex)
            $shapes = @()
            for ($shapeIndex = 1; $shapeIndex -le [int]$slide.Shapes.Count; $shapeIndex += 1) {
                $shape = $null
                try {
                    $shape = $slide.Shapes.Item($shapeIndex)
                    $shapes += [ordered]@{
                        Name = [string](Get-SafeValue -Object $shape -Property 'Name' -Fallback '')
                        Type = [int](Get-SafeValue -Object $shape -Property 'Type' -Fallback -1)
                        AlternativeText = [string](Get-SafeValue -Object $shape -Property 'AlternativeText' -Fallback '')
                        Left = [math]::Round([double](Get-SafeValue -Object $shape -Property 'Left' -Fallback 0), 3)
                        Top = [math]::Round([double](Get-SafeValue -Object $shape -Property 'Top' -Fallback 0), 3)
                        Width = [math]::Round([double](Get-SafeValue -Object $shape -Property 'Width' -Fallback 0), 3)
                        Height = [math]::Round([double](Get-SafeValue -Object $shape -Property 'Height' -Fallback 0), 3)
                        Click = Get-ClickSnapshot -Shape $shape
                    }
                }
                finally {
                    if ($shape) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shape) } catch {} }
                }
            }
            $slides += [ordered]@{ Index = $slideIndex; SlideID = [int]$slide.SlideID; Shapes = $shapes }
        }
        finally {
            if ($slide) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) } catch {} }
        }
    }
    return [ordered]@{ SlideCount = [int]$Presentation.Slides.Count; Slides = $slides }
}

function Export-SlideRenders {
    param($Presentation, [Parameter(Mandatory = $true)][string]$Directory)
    [IO.Directory]::CreateDirectory($Directory) | Out-Null
    for ($index = 1; $index -le [int]$Presentation.Slides.Count; $index += 1) {
        $slide = $null
        try {
            $slide = $Presentation.Slides.Item($index)
            $file = Join-Path $Directory ('slide-{0:D2}.png' -f $index)
            $slide.Export($file, 'PNG', 1600, 900)
            if (-not [IO.File]::Exists($file) -or (Get-Item -LiteralPath $file).Length -le 0) { throw "PowerPoint did not render $file" }
        }
        finally {
            if ($slide) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) } catch {} }
        }
    }
}

$inputFull = [IO.Path]::GetFullPath($InputPath)
$outputFull = [IO.Path]::GetFullPath($OutputPath)
$reportFull = [IO.Path]::GetFullPath($ReportPath)
$sourceRenderFull = [IO.Path]::GetFullPath($SourceRenderDir)
$roundtripRenderFull = [IO.Path]::GetFullPath($RoundtripRenderDir)
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; isolated repair-disabled Slide Zoom proof aborted.' }

[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportFull)) | Out-Null
foreach ($candidate in @($outputFull, $reportFull)) { if ([IO.File]::Exists($candidate)) { throw "Immutable proof output already exists: $candidate" } }

$app = $null
$source = $null
$reopened = $null
$stage = 'startup'
try {
    $stage = 'create PowerPoint application'
    $app = New-Object -ComObject PowerPoint.Application
    $stage = 'repair-disabled Open2007 source'
    $source = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
    $sourceSnapshot = Get-PresentationSnapshot -Presentation $source
    $stage = 'render source slides'
    Export-SlideRenders -Presentation $source -Directory $sourceRenderFull
    $stage = 'SaveCopyAs'
    $source.SaveCopyAs($outputFull, 24)
    $source.Close()
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source)
    $source = $null

    $stage = 'repair-disabled Open2007 roundtrip'
    $reopened = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
    $reopenedSnapshot = Get-PresentationSnapshot -Presentation $reopened
    $stage = 'render reopened slides'
    Export-SlideRenders -Presentation $reopened -Directory $roundtripRenderFull
    $report = [ordered]@{
        status = 'PASS'
        method = 'Presentations.Open2007'
        openAndRepair = $false
        readOnly = $true
        saveCopyAs = $true
        reopened = $true
        source = $sourceSnapshot
        roundtrip = $reopenedSnapshot
    }
    $json = $report | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($reportFull, $json, (New-Object Text.UTF8Encoding($false)))
    $json
}
catch {
    $failure = [ordered]@{ status = 'FAIL'; stage = $stage; message = $_.Exception.Message }
    if (-not [IO.File]::Exists($reportFull)) { [IO.File]::WriteAllText($reportFull, ($failure | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) }
    throw
}
finally {
    if ($reopened) { try { $reopened.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened) } catch {} }
    if ($source) { try { $source.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source) } catch {} }
    if ($app) { try { $app.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
