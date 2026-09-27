param(
  [Parameter(Mandatory = $true)][string]$ShellPptx,
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [Parameter(Mandatory = $true)][string]$OutputPptx
)

$ErrorActionPreference = 'Stop'

$shell = (Resolve-Path -LiteralPath $ShellPptx).Path
$video = (Resolve-Path -LiteralPath $VideoPath).Path
$output = [System.IO.Path]::GetFullPath($OutputPptx)
$outputDirectory = [System.IO.Path]::GetDirectoryName($output)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = -1
  $presentation = $powerPoint.Presentations.Open($shell, 0, 0, 0)
  $slide = $presentation.Slides.Item(1)

  # Artifact-tool works in 1280x720 CSS pixels. PowerPoint uses points, so the
  # 230x288 avatar frame at (972, 340) maps with the 72/96 scale factor.
  $left = 972 * 0.75
  $top = 340 * 0.75
  $width = 230 * 0.75
  $height = 288 * 0.75

  $media = $slide.Shapes.AddMediaObject2($video, 0, -1, $left, $top, $width, $height)
  $media.Name = 'Narration Head Talker'
  $media.AlternativeText = 'Blink-enabled narration avatar; plays automatically with the slide.'
  $media.AnimationSettings.PlaySettings.PlayOnEntry = -1
  $media.AnimationSettings.PlaySettings.PauseAnimation = 0
  $media.AnimationSettings.PlaySettings.LoopUntilStopped = 0
  $media.AnimationSettings.PlaySettings.HideWhileNotPlaying = 0
  $media.AnimationSettings.PlaySettings.RewindMovie = -1

  # SaveAs 24 is the native Open XML PowerPoint presentation format (.pptx).
  $presentation.SaveAs($output, 24)
}
finally {
  if ($presentation) {
    $presentation.Close()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
  }
  if ($powerPoint) {
    $powerPoint.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Get-Item -LiteralPath $output | Select-Object FullName, Length, LastWriteTime
