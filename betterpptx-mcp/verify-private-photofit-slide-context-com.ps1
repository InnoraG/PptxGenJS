$ErrorActionPreference = 'Stop'
$outputRoot = Join-Path $PSScriptRoot 'outputs'
$artifactPrefix = if ([string]::IsNullOrWhiteSpace($env:BETTERPPTX_PHOTOFIT_ARTIFACT_PREFIX)) { 'private-photofit-slide-context' } else { $env:BETTERPPTX_PHOTOFIT_ARTIFACT_PREFIX }
$expectedSlideCount = if ([string]::IsNullOrWhiteSpace($env:BETTERPPTX_COM_SLIDE_COUNT_EXPECTED)) { 3 } else { [int]$env:BETTERPPTX_COM_SLIDE_COUNT_EXPECTED }
$pptxPath = Join-Path $outputRoot ($artifactPrefix + '.pptx')
$renderRoot = Join-Path $outputRoot ($artifactPrefix + '-com')
New-Item -ItemType Directory -Force -Path $renderRoot | Out-Null
$checks = [System.Collections.Generic.List[object]]::new(); $pass = 0; $fail = 0
function Check($name, $condition, $detail = '') { if ($condition) { $script:pass++; $script:checks.Add([pscustomobject]@{name=$name;status='PASS';detail=$detail}) } else { $script:fail++; $script:checks.Add([pscustomobject]@{name=$name;status='FAIL';detail=$detail}) } }
function Close-Com($value) { if ($null -ne $value) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($value) } catch {} } }
$pp = $null
try {
    $pp = New-Object -ComObject PowerPoint.Application; $pp.DisplayAlerts = 1
    Check 'PowerPoint COM server is Microsoft PowerPoint 16.x' ($pp.Version -like '16.*') ("version=$($pp.Version); build=$($pp.Build)")
    Check 'private photofit research PPTX exists' (Test-Path -LiteralPath $pptxPath)
    if (Test-Path -LiteralPath $pptxPath) {
        $presentation = $null
        try {
            $presentation = $pp.Presentations.Open((Resolve-Path -LiteralPath $pptxPath).Path, $true, $true, $false)
            $slideCount = [int]$presentation.Slides.Count
            Check 'research deck reopened with expected slide count' ($slideCount -eq $expectedSlideCount) ("slides=$slideCount; expected=$expectedSlideCount")
            $pictureCount = 0; $altTextCount = 0; $exportCount = 0; $shapeCount = 0
            for ($slideIndex = 1; $slideIndex -le $slideCount; $slideIndex++) {
                $slide = $null
                try {
                    $slide = $presentation.Slides.Item($slideIndex); $shapeCount += [int]$slide.Shapes.Count
                    for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
                        $shape = $null
                        try { $shape = $slide.Shapes.Item($shapeIndex); if ($shape.Type -eq 13) { $pictureCount++; if (-not [string]::IsNullOrWhiteSpace([string]$shape.AlternativeText)) { $altTextCount++ } } } finally { Close-Com $shape }
                    }
                    $pngPath = Join-Path $renderRoot ("slide-{0:D2}.png" -f $slideIndex); if (Test-Path -LiteralPath $pngPath) { Remove-Item -LiteralPath $pngPath -Force }
                    $slide.Export($pngPath, 'PNG', 1600, 900); if ((Test-Path -LiteralPath $pngPath) -and (Get-Item -LiteralPath $pngPath).Length -gt 1000) { $exportCount++ }
                } finally { Close-Com $slide }
            }
            Check 'research deck has one editable picture per slide' ($pictureCount -eq $expectedSlideCount) ("pictures=$pictureCount; expected=$expectedSlideCount")
            Check 'research pictures retain meaningful alt text' ($altTextCount -eq $expectedSlideCount) ("altText=$altTextCount/$expectedSlideCount")
            Check 'research every slide exported through PowerPoint' ($exportCount -eq $expectedSlideCount) ("exports=$exportCount/$expectedSlideCount")
            Check 'research deck has non-empty shape inventory' ($shapeCount -ge ($expectedSlideCount * 2)) ("shapes=$shapeCount; minimum=$($expectedSlideCount * 2)")
        } finally { if ($null -ne $presentation) { try { $presentation.Close() } catch {} }; Close-Com $presentation }
    }
} catch { Check 'private photofit COM corpus completed' $false $_.Exception.Message }
finally { if ($null -ne $pp) { try { $pp.Quit() } catch {}; Close-Com $pp } }
$report = [pscustomobject]@{ schemaVersion='betterpptx.private-photofit-slide-context-powerpoint-com.v1'; application='Microsoft PowerPoint'; hostGated=$false; customerImages=$false; externalAi=$false; ownedSyntheticOnly=$false; researchOnly=$true; slideCount=$expectedSlideCount; artifactPrefix=$artifactPrefix; checks=$pass; failures=$fail; results=$checks }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot ($artifactPrefix + '-com-report.json')) -Encoding UTF8
$report | ConvertTo-Json -Compress
if ($fail -gt 0) { exit 1 }
