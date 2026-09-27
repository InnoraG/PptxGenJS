$ErrorActionPreference = 'Stop'
$outputRoot = Join-Path $PSScriptRoot 'outputs'
$cases = @(
    # The crop corpus now supplies only a semantic framing type.  All three
    # pictures therefore use the shared Director body region; the native
    # srcRect differs by mode while the target geometry remains engine-owned.
    @{ Id = 'cover'; Color = @(29, 78, 216); ExpectedWidthIn = 12.173; ExpectedHeightIn = 5.23 },
    @{ Id = 'contain'; Color = @(13, 148, 136); ExpectedWidthIn = 12.173; ExpectedHeightIn = 5.23 },
    @{ Id = 'crop'; Color = @(234, 88, 12); ExpectedWidthIn = 12.173; ExpectedHeightIn = 5.23 }
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
    # PpAlertLevel.ppAlertsNone = 1; assigning 0 is invalid for the COM enum.
    $pp.DisplayAlerts = 1
    Check 'PowerPoint COM server is Microsoft PowerPoint 16.x' ($pp.Version -like '16.*') ("version=$($pp.Version); build=$($pp.Build)")
    foreach ($item in $cases) {
        $pptxPath = Join-Path $outputRoot "img9-crop-corpus-$($item.Id).pptx"
        $pngPath = Join-Path $outputRoot "img9-crop-corpus-$($item.Id)-com.png"
        Check "$($item.Id): saved PPTX artifact exists" (Test-Path -LiteralPath $pptxPath)
        if (-not (Test-Path -LiteralPath $pptxPath)) { continue }
        $presentation = $null
        $slide = $null
        $shape = $null
        try {
            # Read-only + no window: this is the real PowerPoint parser/reopen path,
            # not ZIP/XML inspection.
            $presentation = $pp.Presentations.Open((Resolve-Path -LiteralPath $pptxPath).Path, $true, $true, $false)
            Check "$($item.Id): PowerPoint reopened without repair/error" ($presentation.Slides.Count -eq 1)
            $slide = $presentation.Slides.Item(1)
            $shape = $null
            for ($i = 1; $i -le $slide.Shapes.Count; $i++) {
                $candidate = $slide.Shapes.Item($i)
                if ($candidate.Type -eq 13 -and $candidate.Name -like "*img9-$($item.Id)*") { $shape = $candidate; break }
                Close-Com $candidate
            }
            Check "$($item.Id): editable picture object survived reopen" ($null -ne $shape -and $shape.Type -eq 13)
            Check "$($item.Id): meaningful alt text survived reopen" ($null -ne $shape -and $shape.AlternativeText -like 'Owned synthetic*')
            $slide.Export($pngPath, 'PNG', 960, 540)
            Check "$($item.Id): PowerPoint exported a rendered slide" ((Test-Path -LiteralPath $pngPath) -and (Get-Item -LiteralPath $pngPath).Length -gt 1000)
            $slideWidth = [double]$presentation.PageSetup.SlideWidth
            $slideHeight = [double]$presentation.PageSetup.SlideHeight
            $expectedW = $item.ExpectedWidthIn * 72.0
            $expectedH = $item.ExpectedHeightIn * 72.0
            $geometryOk = $null -ne $shape -and [math]::Abs([double]$shape.Width - $expectedW) -lt 1.0 -and [math]::Abs([double]$shape.Height - $expectedH) -lt 1.0
            Check "$($item.Id): rendered shape geometry matches crop mode" $geometryOk ("actual=$($shape.Width)x$($shape.Height) expected=${expectedW}x${expectedH}")
            if (Test-Path -LiteralPath $pngPath) {
                Add-Type -AssemblyName System.Drawing
                $bitmap = [System.Drawing.Bitmap]::new($pngPath)
                try {
                    $cx = [math]::Min($bitmap.Width - 1, [math]::Max(0, [int]((($shape.Left + ($shape.Width / 2.0)) / $slideWidth) * $bitmap.Width)))
                    $cy = [math]::Min($bitmap.Height - 1, [math]::Max(0, [int]((($shape.Top + ($shape.Height / 2.0)) / $slideHeight) * $bitmap.Height)))
                    $pixel = $bitmap.GetPixel($cx, $cy)
                    $distance = [math]::Abs($pixel.R - $item.Color[0]) + [math]::Abs($pixel.G - $item.Color[1]) + [math]::Abs($pixel.B - $item.Color[2])
                    Check "$($item.Id): rendered focal pixel matches owned source color" ($distance -le 18) ("rgb=$($pixel.R),$($pixel.G),$($pixel.B); distance=$distance")
                } finally { $bitmap.Dispose() }
            }
        } finally {
            if ($null -ne $presentation) { try { $presentation.Close() } catch {} }
            Close-Com $shape
            Close-Com $slide
            Close-Com $presentation
        }
    }
} catch {
    Check 'PowerPoint COM corpus completed' $false $_.Exception.Message
} finally {
    if ($null -ne $pp) { try { $pp.Quit() } catch {}; Close-Com $pp }
}
$report = [pscustomobject]@{
    schemaVersion = 'betterpptx.img9-powerpoint-com-corpus.v1'
    application = 'Microsoft PowerPoint'
    hostGated = $false
    customerImages = $false
    externalAi = $false
    checks = $pass
    failures = $fail
    results = $checks
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'img9-powerpoint-com-report.json') -Encoding UTF8
$report | ConvertTo-Json -Compress
if ($fail -gt 0) { exit 1 }
