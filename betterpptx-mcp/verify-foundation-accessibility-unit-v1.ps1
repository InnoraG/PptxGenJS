param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-SafeShapeValue {
    param(
        [Parameter(Mandatory = $true)]$Shape,
        [Parameter(Mandatory = $true)][string]$Property,
        $Fallback = $null
    )
    try { return $Shape.$Property } catch { return $Fallback }
}

function Get-ShapeSnapshot {
    param([Parameter(Mandatory = $true)]$Shape)

    $children = @()
    $groupCount = 0
    try { $groupCount = [int]$Shape.GroupItems.Count } catch { $groupCount = 0 }
    for ($index = 1; $index -le $groupCount; $index += 1) {
        $child = $null
        try {
            $child = $Shape.GroupItems.Item($index)
            $children += [ordered]@{
                Name = [string](Get-SafeShapeValue -Shape $child -Property 'Name' -Fallback '')
                Type = [int](Get-SafeShapeValue -Shape $child -Property 'Type' -Fallback -1)
                ZOrderPosition = [int](Get-SafeShapeValue -Shape $child -Property 'ZOrderPosition' -Fallback $index)
                Title = [string](Get-SafeShapeValue -Shape $child -Property 'Title' -Fallback '')
                AlternativeText = [string](Get-SafeShapeValue -Shape $child -Property 'AlternativeText' -Fallback '')
                Decorative = [int](Get-SafeShapeValue -Shape $child -Property 'Decorative' -Fallback 0)
            }
        }
        finally {
            if ($child) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($child) } catch {} }
        }
    }

    return [ordered]@{
        Name = [string](Get-SafeShapeValue -Shape $Shape -Property 'Name' -Fallback '')
        Type = [int](Get-SafeShapeValue -Shape $Shape -Property 'Type' -Fallback -1)
        ZOrderPosition = [int](Get-SafeShapeValue -Shape $Shape -Property 'ZOrderPosition' -Fallback -1)
        Title = [string](Get-SafeShapeValue -Shape $Shape -Property 'Title' -Fallback '')
        AlternativeText = [string](Get-SafeShapeValue -Shape $Shape -Property 'AlternativeText' -Fallback '')
        Decorative = [int](Get-SafeShapeValue -Shape $Shape -Property 'Decorative' -Fallback 0)
        GroupItems = $children
    }
}

function Get-PresentationSnapshot {
    param([Parameter(Mandatory = $true)]$Presentation)

    $slides = @()
    for ($slideIndex = 1; $slideIndex -le $Presentation.Slides.Count; $slideIndex += 1) {
        $slide = $null
        try {
            $slide = $Presentation.Slides.Item($slideIndex)
            $shapes = @()
            for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex += 1) {
                $shape = $null
                try {
                    $shape = $slide.Shapes.Item($shapeIndex)
                    $shapes += Get-ShapeSnapshot -Shape $shape
                }
                finally {
                    if ($shape) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shape) } catch {} }
                }
            }
            $slides += [ordered]@{ Index = $slideIndex; Shapes = $shapes }
        }
        finally {
            if ($slide) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) } catch {} }
        }
    }
    return [ordered]@{ SlideCount = [int]$Presentation.Slides.Count; Slides = $slides }
}

$inputFull = [IO.Path]::GetFullPath($InputPath)
$outputFull = [IO.Path]::GetFullPath($OutputPath)
$reportFull = [IO.Path]::GetFullPath($ReportPath)
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; isolated repair-disabled accessibility proof aborted.' }

[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportFull)) | Out-Null
if ([IO.File]::Exists($outputFull)) { [IO.File]::Delete($outputFull) }

$app = $null
$source = $null
$reopened = $null
try {
    $app = New-Object -ComObject PowerPoint.Application
    $source = $app.Presentations.Open2007($inputFull, $true, $false, $false, $false)
    $sourceSnapshot = Get-PresentationSnapshot -Presentation $source
    $source.SaveCopyAs($outputFull, 24)
    $source.Close()
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source)
    $source = $null

    $reopened = $app.Presentations.Open2007($outputFull, $true, $false, $false, $false)
    $reopenedSnapshot = Get-PresentationSnapshot -Presentation $reopened
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
    $json = $report | ConvertTo-Json -Depth 12
    [IO.File]::WriteAllText($reportFull, $json, (New-Object Text.UTF8Encoding($false)))
    $json
}
finally {
    if ($reopened) { try { $reopened.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened) } catch {} }
    if ($source) { try { $source.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source) } catch {} }
    if ($app) { try { $app.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
