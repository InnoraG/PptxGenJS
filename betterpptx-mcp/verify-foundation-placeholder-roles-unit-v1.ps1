param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-SafeValue {
    param($Object, [string]$Property, $Fallback = $null)
    try { return $Object.$Property } catch { return $Fallback }
}

function Get-PlaceholderType {
    param($Shape)
    try { return [int]$Shape.PlaceholderFormat.Type } catch { return -1 }
}

function Get-ShapeSnapshot {
    param($Shape, [int]$Index)
    return [ordered]@{
        Index = $Index
        Name = [string](Get-SafeValue -Object $Shape -Property 'Name' -Fallback '')
        Type = [int](Get-SafeValue -Object $Shape -Property 'Type' -Fallback -1)
        ZOrderPosition = [int](Get-SafeValue -Object $Shape -Property 'ZOrderPosition' -Fallback -1)
        PlaceholderType = Get-PlaceholderType -Shape $Shape
        Title = [string](Get-SafeValue -Object $Shape -Property 'Title' -Fallback '')
        AlternativeText = [string](Get-SafeValue -Object $Shape -Property 'AlternativeText' -Fallback '')
    }
}

function Get-ShapesSnapshot {
    param($Shapes)
    $items = @()
    $count = [int](Get-SafeValue -Object $Shapes -Property 'Count' -Fallback 0)
    for ($index = 1; $index -le $count; $index += 1) {
        $shape = $null
        try {
            $shape = $Shapes.Item($index)
            $items += Get-ShapeSnapshot -Shape $shape -Index $index
        }
        finally {
            if ($shape) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shape) } catch {} }
        }
    }
    return $items
}

function Get-HeadersFootersSnapshot {
    param($Carrier)
    $headersFooters = $null
    try {
        $headersFooters = $Carrier.HeadersFooters
        return [ordered]@{
            DateAndTime = [int](Get-SafeValue -Object $headersFooters.DateAndTime -Property 'Visible' -Fallback -1)
            Footer = [int](Get-SafeValue -Object $headersFooters.Footer -Property 'Visible' -Fallback -1)
            SlideNumber = [int](Get-SafeValue -Object $headersFooters.SlideNumber -Property 'Visible' -Fallback -1)
            Header = [int](Get-SafeValue -Object $headersFooters.Header -Property 'Visible' -Fallback -1)
        }
    }
    catch {
        return [ordered]@{ Error = [string]$_.Exception.Message }
    }
    finally {
        if ($headersFooters) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($headersFooters) } catch {} }
    }
}

function Get-PresentationSnapshot {
    param($Presentation)

    $slides = @()
    for ($slideIndex = 1; $slideIndex -le $Presentation.Slides.Count; $slideIndex += 1) {
        $slide = $null
        try {
            $slide = $Presentation.Slides.Item($slideIndex)
            $slides += [ordered]@{
                Index = $slideIndex
                LayoutName = [string](Get-SafeValue -Object $slide.CustomLayout -Property 'Name' -Fallback '')
                Shapes = Get-ShapesSnapshot -Shapes $slide.Shapes
                HeadersFooters = Get-HeadersFootersSnapshot -Carrier $slide
            }
        }
        finally {
            if ($slide) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) } catch {} }
        }
    }

    $layouts = @()
    $master = $null
    try {
        $master = $Presentation.SlideMaster
        for ($layoutIndex = 1; $layoutIndex -le $master.CustomLayouts.Count; $layoutIndex += 1) {
            $layout = $null
            try {
                $layout = $master.CustomLayouts.Item($layoutIndex)
                $layouts += [ordered]@{
                    Index = $layoutIndex
                    Name = [string](Get-SafeValue -Object $layout -Property 'Name' -Fallback '')
                    MatchingName = [string](Get-SafeValue -Object $layout -Property 'MatchingName' -Fallback '')
                    Shapes = Get-ShapesSnapshot -Shapes $layout.Shapes
                    HeadersFooters = Get-HeadersFootersSnapshot -Carrier $layout
                }
            }
            finally {
                if ($layout) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($layout) } catch {} }
            }
        }

        return [ordered]@{
            SlideCount = [int]$Presentation.Slides.Count
            Slides = $slides
            Master = [ordered]@{
                Name = [string](Get-SafeValue -Object $master -Property 'Name' -Fallback '')
                Shapes = Get-ShapesSnapshot -Shapes $master.Shapes
                HeadersFooters = Get-HeadersFootersSnapshot -Carrier $master
            }
            CustomLayouts = $layouts
        }
    }
    finally {
        if ($master) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($master) } catch {} }
    }
}

$inputFull = [IO.Path]::GetFullPath($InputPath)
$outputFull = [IO.Path]::GetFullPath($OutputPath)
$reportFull = [IO.Path]::GetFullPath($ReportPath)
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; isolated repair-disabled placeholder-role proof aborted.' }

[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportFull)) | Out-Null
if ([IO.File]::Exists($outputFull)) { [IO.File]::Delete($outputFull) }

$app = $null
$source = $null
$reopened = $null
$stage = 'create-application'
try {
    $app = New-Object -ComObject PowerPoint.Application
    $stage = 'repair-disabled-open-source'
    $source = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
    $stage = 'snapshot-source'
    $sourceSnapshot = Get-PresentationSnapshot -Presentation $source
    $stage = 'save-copy-as'
    $source.SaveCopyAs($outputFull, 24)
    $source.Close()
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source)
    $source = $null

    $stage = 'repair-disabled-reopen-roundtrip'
    $reopened = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
    $stage = 'snapshot-roundtrip'
    $roundtripSnapshot = Get-PresentationSnapshot -Presentation $reopened
    $report = [ordered]@{
        status = 'PASS'
        method = 'Presentations.Open2007'
        openAndRepair = $false
        readOnly = $true
        saveCopyAs = $true
        reopened = $true
        source = $sourceSnapshot
        roundtrip = $roundtripSnapshot
    }
    $json = $report | ConvertTo-Json -Depth 14
    [IO.File]::WriteAllText($reportFull, $json, (New-Object Text.UTF8Encoding($false)))
    $json
}
catch {
    $failure = [ordered]@{
        status = 'FAIL'
        method = 'Presentations.Open2007'
        openAndRepair = $false
        stage = $stage
        hresult = ('0x{0:X8}' -f ($_.Exception.HResult -band 0xffffffffL))
        message = [string]$_.Exception.Message
    }
    try {
        $failureJson = $failure | ConvertTo-Json -Depth 8
        [IO.File]::WriteAllText($reportFull, $failureJson, (New-Object Text.UTF8Encoding($false)))
    } catch {}
    throw "PowerPoint placeholder-role proof failed at ${stage}: $($_.Exception.Message)"
}
finally {
    if ($reopened) { try { $reopened.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened) } catch {} }
    if ($source) { try { $source.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source) } catch {} }
    if ($app) { try { $app.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
