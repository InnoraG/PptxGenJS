param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$ReportPath
)

$ErrorActionPreference = 'Stop'

function Get-SafeValue {
    param($Object, [Parameter(Mandatory = $true)][string]$Property, $Fallback = $null)
    try { return $Object.$Property } catch { return $Fallback }
}

function Get-ActionSnapshot {
    param($ActionSettings, [Parameter(Mandatory = $true)][int]$Trigger)

    $setting = $null
    $hyperlink = $null
    $sound = $null
    try {
        $setting = $ActionSettings.Item($Trigger)
        try { $hyperlink = $setting.Hyperlink } catch { $hyperlink = $null }
        try { $sound = $setting.SoundEffect } catch { $sound = $null }
        return [ordered]@{
            Action = [int](Get-SafeValue -Object $setting -Property 'Action' -Fallback 0)
            Address = [string](Get-SafeValue -Object $hyperlink -Property 'Address' -Fallback '')
            SubAddress = [string](Get-SafeValue -Object $hyperlink -Property 'SubAddress' -Fallback '')
            ScreenTip = [string](Get-SafeValue -Object $hyperlink -Property 'ScreenTip' -Fallback '')
            SlideShowName = [string](Get-SafeValue -Object $setting -Property 'SlideShowName' -Fallback '')
            ShowAndReturn = [bool](Get-SafeValue -Object $setting -Property 'ShowAndReturn' -Fallback $false)
            SoundName = [string](Get-SafeValue -Object $sound -Property 'Name' -Fallback '')
        }
    }
    finally {
        if ($sound) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sound) } catch {} }
        if ($hyperlink) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($hyperlink) } catch {} }
        if ($setting) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($setting) } catch {} }
    }
}

function Get-RunSnapshots {
    param($Shape)

    $result = @()
    $textRange = $null
    try {
        if ([int](Get-SafeValue -Object $Shape -Property 'HasTextFrame' -Fallback 0) -eq 0) { return $result }
        $textRange = $Shape.TextFrame.TextRange
        $runCount = 0
        try { $runCount = [int]$textRange.Runs().Count } catch { $runCount = 0 }
        for ($index = 1; $index -le $runCount; $index += 1) {
            $runRange = $null
            try {
                $runRange = $textRange.Runs($index, 1)
                $result += [ordered]@{
                    Text = [string](Get-SafeValue -Object $runRange -Property 'Text' -Fallback '')
                    Click = Get-ActionSnapshot -ActionSettings $runRange.ActionSettings -Trigger 1
                    Hover = Get-ActionSnapshot -ActionSettings $runRange.ActionSettings -Trigger 2
                }
            }
            finally {
                if ($runRange) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($runRange) } catch {} }
            }
        }
        return $result
    }
    finally {
        if ($textRange) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($textRange) } catch {} }
    }
}

function Get-ShapeSnapshot {
    param($Shape)

    return [ordered]@{
        Name = [string](Get-SafeValue -Object $Shape -Property 'Name' -Fallback '')
        Type = [int](Get-SafeValue -Object $Shape -Property 'Type' -Fallback -1)
        AutoShapeType = [int](Get-SafeValue -Object $Shape -Property 'AutoShapeType' -Fallback -1)
        ZOrderPosition = [int](Get-SafeValue -Object $Shape -Property 'ZOrderPosition' -Fallback -1)
        Click = Get-ActionSnapshot -ActionSettings $Shape.ActionSettings -Trigger 1
        Hover = Get-ActionSnapshot -ActionSettings $Shape.ActionSettings -Trigger 2
        Runs = @(Get-RunSnapshots -Shape $Shape)
    }
}

function Get-NamedSlideShows {
    param($Presentation)

    $result = @()
    $collection = $null
    try {
        $collection = $Presentation.SlideShowSettings.NamedSlideShows
        for ($index = 1; $index -le [int]$collection.Count; $index += 1) {
            $show = $null
            try {
                $show = $collection.Item($index)
                $ids = @()
                foreach ($id in @($show.SlideIDs)) {
                    $numericId = [int]$id
                    # PowerPoint exposes a leading zero sentinel through some
                    # COM marshaling paths; zero is not a valid slide ID.
                    if ($numericId -gt 0) { $ids += $numericId }
                }
                $result += [ordered]@{ Name = [string]$show.Name; SlideIDs = $ids }
            }
            finally {
                if ($show) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($show) } catch {} }
            }
        }
        return $result
    }
    finally {
        if ($collection) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($collection) } catch {} }
    }
}

function Get-PresentationSnapshot {
    param($Presentation)

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
            $slides += [ordered]@{ Index = $slideIndex; SlideID = [int]$slide.SlideID; Shapes = $shapes }
        }
        finally {
            if ($slide) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) } catch {} }
        }
    }
    return [ordered]@{
        SlideCount = [int]$Presentation.Slides.Count
        Slides = $slides
        NamedSlideShows = @(Get-NamedSlideShows -Presentation $Presentation)
    }
}

$inputFull = [IO.Path]::GetFullPath($InputPath)
$outputFull = [IO.Path]::GetFullPath($OutputPath)
$reportFull = [IO.Path]::GetFullPath($ReportPath)
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; isolated repair-disabled interactive-action proof aborted.' }

[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputFull)) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($reportFull)) | Out-Null
if ([IO.File]::Exists($outputFull)) { [IO.File]::Delete($outputFull) }

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
    $stage = 'SaveCopyAs'
    $source.SaveCopyAs($outputFull, 24)
    $source.Close()
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source)
    $source = $null

    $stage = 'repair-disabled Open2007 roundtrip'
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
    $json = $report | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($reportFull, $json, (New-Object Text.UTF8Encoding($false)))
    $json
}
catch {
    $failure = [ordered]@{ status = 'FAIL'; stage = $stage; message = $_.Exception.Message }
    [IO.File]::WriteAllText($reportFull, ($failure | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    throw
}
finally {
    if ($reopened) { try { $reopened.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened) } catch {} }
    if ($source) { try { $source.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($source) } catch {} }
    if ($app) { try { $app.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
