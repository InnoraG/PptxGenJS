param(
  [Parameter(Mandatory = $true)][string[]]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutputJson,
  [Parameter(Mandatory = $false)][string]$WorkspaceRoot = ''
)
$ErrorActionPreference = 'Stop'

$baselinePowerPointPids = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
if ($baselinePowerPointPids.Count -gt 0) {
  throw 'PowerPoint is already running. Reopen verification stopped without touching the existing session.'
}

$files = @()
$pp = $null
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  try { $pp.WindowState = 2 } catch {}
  foreach ($inputPath in $Pptx) {
    $fullPath = [IO.Path]::GetFullPath($inputPath)
    if (-not (Test-Path -LiteralPath $fullPath)) { throw "Missing PPTX: $fullPath" }
    $presentation = $null
    try {
      $presentation = $pp.Presentations.Open($fullPath, $true, $false, $false)
      $reportedPath = if ($WorkspaceRoot) { [IO.Path]::GetRelativePath([IO.Path]::GetFullPath($WorkspaceRoot), $fullPath).Replace('\', '/') } else { $fullPath }
      $files += [ordered]@{
        path = $reportedPath
        status = 'PASS'
        slides = [int]$presentation.Slides.Count
        repaired = $false
        readOnly = [bool]$presentation.ReadOnly
      }
    }
    finally {
      if ($presentation) {
        try { $presentation.Close() } catch {}
        try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) } catch {}
      }
    }
  }
}
finally {
  if ($pp) {
    try { $pp.Quit() } catch {}
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($pp) } catch {}
  }
}

$result = [ordered]@{
  schema = 'betterpptx.g1.powerpoint-reopen-evidence.v1'
  measuredAt = [DateTime]::UtcNow.ToString('o')
  application = 'Microsoft PowerPoint COM'
  isolation = 'aborted if any pre-existing PowerPoint process was present'
  files = $files
  pass = ($files.Count -eq $Pptx.Count -and @($files | Where-Object { $_.status -ne 'PASS' -or $_.repaired }).Count -eq 0)
}
$outputPath = [IO.Path]::GetFullPath($OutputJson)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8
$result | ConvertTo-Json -Depth 8
