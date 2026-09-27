$ErrorActionPreference = 'Stop'
$outputRoot = Join-Path $PSScriptRoot 'outputs'
$pptxPath = Join-Path $outputRoot 'img11-slide-context-corpus.pptx'
$renderRoot = Join-Path $outputRoot 'img11-slide-context-com'
New-Item -ItemType Directory -Force -Path $renderRoot | Out-Null
$checks = [System.Collections.Generic.List[object]]::new()
$pass = 0
$fail = 0
function Check($name, $condition, $detail = '') {
    if ($condition) { $script:pass++; $script:checks.Add([pscustomobject]@{ name = $name; status = 'PASS'; detail = $detail }) }
    else { $script:fail++; $script:checks.Add([pscustomobject]@{ name = $name; status = 'FAIL'; detail = $detail }) }
}
function Close-Com($value) {
    if ($null -ne $value) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value) } catch {} }
}
$pp = $null
try {
    $pp = New-Object -ComObject PowerPoint.Application
    $pp.DisplayAlerts = 1
    Check 'PowerPoint COM server is Microsoft PowerPoint 16.x' ($pp.Version -like '16.*') ("version=$($pp.Version); build=$($pp.Build)")
    Check 'IMG11 slide-context PPTX artifact exists' (Test-Path -LiteralPath $pptxPath)
    if (Test-Path -LiteralPath $pptxPath) {
        $presentation = $null
        try {
            $presentation = $pp.Presentations.Open((Resolve-Path -LiteralPath $pptxPath).Path, $true, $true, $false)
            $slideCount = [int]$presentation.Slides.Count
            Check 'IMG11 slide-context deck reopened with all 20 slides' ($slideCount -eq 20) ("slides=$slideCount")
            $pictureCount = 0
            $altTextCount = 0
            $exportCount = 0
            $shapeCount = 0
            for ($slideIndex = 1; $slideIndex -le $slideCount; $slideIndex++) {
                $slide = $null
                try {
                    $slide = $presentation.Slides.Item($slideIndex)
                    $shapeCount += [int]$slide.Shapes.Count
                    for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
                        $shape = $null
                        try {
                            $shape = $slide.Shapes.Item($shapeIndex)
                            if ($shape.Type -eq 13) {
                                $pictureCount++
                                if (-not [string]::IsNullOrWhiteSpace([string]$shape.AlternativeText)) { $altTextCount++ }
                            }
                        } finally { Close-Com $shape }
                    }
                    $pngPath = Join-Path $renderRoot ("slide-{0:D2}.png" -f $slideIndex)
                    if (Test-Path -LiteralPath $pngPath) { Remove-Item -LiteralPath $pngPath -Force }
                    $slide.Export($pngPath, 'PNG', 1600, 900)
                    if ((Test-Path -LiteralPath $pngPath) -and (Get-Item -LiteralPath $pngPath).Length -gt 1000) { $exportCount++ }
                } finally { Close-Com $slide }
            }
            Check 'IMG11 slide-context deck has 20 editable picture objects' ($pictureCount -eq 20) ("pictures=$pictureCount")
            Check 'IMG11 slide-context picture objects retain meaningful alt text' ($altTextCount -eq 20) ("altText=$altTextCount/20")
            Check 'IMG11 every slide exported through PowerPoint' ($exportCount -eq 20) ("exports=$exportCount/20")
            Check 'IMG11 slide-context deck has a non-empty shape inventory' ($shapeCount -ge 40) ("shapes=$shapeCount")
        } finally {
            if ($null -ne $presentation) { try { $presentation.Close() } catch {} }
            Close-Com $presentation
        }
    }
} catch {
    Check 'IMG11 slide-context COM corpus completed' $false $_.Exception.Message
} finally {
    if ($null -ne $pp) { try { $pp.Quit() } catch {}; Close-Com $pp }
}
$report = [pscustomobject]@{
    schemaVersion = 'betterpptx.img11-slide-context-powerpoint-com.v1'
    application = 'Microsoft PowerPoint'
    hostGated = $false
    customerImages = $false
    externalAi = $false
    ownedSyntheticOnly = $true
    slideCount = 20
    checks = $pass
    failures = $fail
    results = $checks
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'img11-slide-context-com-report.json') -Encoding UTF8
$report | ConvertTo-Json -Compress
if ($fail -gt 0) { exit 1 }
