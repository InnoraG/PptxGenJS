$ErrorActionPreference = 'Stop'
$pptx = (Resolve-Path -LiteralPath 'betterpptx-mcp\outputs\commercial-poc\final-commercial-avatar-3min-narration-validated.pptx').Path
$powerPoint = New-Object -ComObject PowerPoint.Application
$presentation = $null
try {
  $presentation = $powerPoint.Presentations.Open($pptx, $true, $true, $false)
  $media = @()
  foreach ($slide in $presentation.Slides) {
    foreach ($shape in $slide.Shapes) {
      if ($shape.Type -eq 16) {
        $media += [pscustomobject]@{ Slide = $slide.SlideIndex; Name = $shape.Name; Type = $shape.Type; Width = $shape.Width; Height = $shape.Height; PlayOnEntry = $shape.AnimationSettings.PlaySettings.PlayOnEntry; LoopUntilStopped = $shape.AnimationSettings.PlaySettings.LoopUntilStopped }
      }
    }
  }
  [pscustomobject]@{ Open = 'PASS'; Slides = $presentation.Slides.Count; MediaCount = $media.Count; Media = $media } | ConvertTo-Json -Depth 5
}
finally {
  if ($presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  $powerPoint.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
