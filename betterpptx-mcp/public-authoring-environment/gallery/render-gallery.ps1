param(
    [Parameter(Mandatory = $true)][string]$PptxPath,
    [Parameter(Mandatory = $true)][string]$PngPath
)

$powerPoint = $null
$presentation = $null
try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $presentation = $powerPoint.Presentations.Open($PptxPath, $true, $true, $false)
    $presentation.Slides.Item(1).Export($PngPath, 'PNG', 1280, 720)
}
finally {
    if ($presentation) { $presentation.Close() }
    if ($powerPoint) { $powerPoint.Quit() }
    if ($presentation) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($powerPoint) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
