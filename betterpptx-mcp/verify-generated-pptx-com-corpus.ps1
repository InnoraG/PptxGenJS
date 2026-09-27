$ErrorActionPreference = 'Stop'
$outputRoot = Join-Path $PSScriptRoot 'outputs'
$artifacts = @(
    @{ Id = 'img7-treatment'; File = 'img7-treatment-canary.pptx'; ExpectedSlides = 4 },
    @{ Id = 'img12-e2e'; File = 'img12-private-e2e-canary.pptx'; ExpectedSlides = 1 }
)
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
    foreach ($item in $artifacts) {
        $pptxPath = Join-Path $outputRoot $item.File
        Check "$($item.Id): saved generated PPTX exists" (Test-Path -LiteralPath $pptxPath)
        if (-not (Test-Path -LiteralPath $pptxPath)) { continue }
        $presentation = $null
        try {
            $presentation = $pp.Presentations.Open((Resolve-Path -LiteralPath $pptxPath).Path, $true, $true, $false)
            $slideCount = [int]$presentation.Slides.Count
            Check "$($item.Id): PowerPoint reopened without repair/error" ($slideCount -eq $item.ExpectedSlides) ("slides=$slideCount expected=$($item.ExpectedSlides)")
            $shapeCount = 0
            $pictureCount = 0
            $altTextCount = 0
            $exportCount = 0
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
                    $pngPath = Join-Path $outputRoot "$($item.Id)-com-slide-$slideIndex.png"
                    $slide.Export($pngPath, 'PNG', 1600, 900)
                    if ((Test-Path -LiteralPath $pngPath) -and (Get-Item -LiteralPath $pngPath).Length -gt 1000) { $exportCount++ }
                } finally { Close-Com $slide }
            }
            Check "$($item.Id): generated slides contain editable picture objects" ($pictureCount -gt 0) ("pictures=$pictureCount")
            Check "$($item.Id): generated picture objects retain meaningful alt text" ($altTextCount -eq $pictureCount -and $pictureCount -gt 0) ("altText=$altTextCount/$pictureCount")
            Check "$($item.Id): every generated slide exported through PowerPoint" ($exportCount -eq $slideCount) ("exports=$exportCount/$slideCount")
            Check "$($item.Id): generated slide shape inventory is non-empty" ($shapeCount -gt 0) ("shapes=$shapeCount")
        } finally {
            if ($null -ne $presentation) { try { $presentation.Close() } catch {} }
            Close-Com $presentation
        }
    }
} catch {
    Check 'PowerPoint generated-artifact COM corpus completed' $false $_.Exception.Message
} finally {
    if ($null -ne $pp) { try { $pp.Quit() } catch {}; Close-Com $pp }
}
$report = [pscustomobject]@{
    schemaVersion = 'betterpptx.generated-pptx-powerpoint-com-corpus.v1'
    application = 'Microsoft PowerPoint'
    hostGated = $false
    customerImages = $false
    externalAi = $false
    researchOnly = $true
    artifacts = $artifacts
    checks = $pass
    failures = $fail
    results = $checks
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'generated-pptx-powerpoint-com-report.json') -Encoding UTF8
$report | ConvertTo-Json -Compress
if ($fail -gt 0) { exit 1 }
