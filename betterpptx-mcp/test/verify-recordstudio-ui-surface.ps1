param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $false)][string]$OutputJson = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$pptxPath = [IO.Path]::GetFullPath($Pptx)
if (-not (Test-Path -LiteralPath $pptxPath)) { throw "Missing PPTX: $pptxPath" }
$pp = $null
$pres = $null
function Find-Control($root, [string]$automationId) {
  $property = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $automationId)
  return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $property)
}
try {
  $pp = New-Object -ComObject PowerPoint.Application
  $pp.Visible = -1
  $pres = $pp.Presentations.Open($pptxPath, $false, $false, $true)
  Start-Sleep -Seconds 2
  $proc = Get-Process POWERPNT | Where-Object { $_.MainWindowTitle -like "*$( [IO.Path]::GetFileName($pptxPath) )*" } | Select-Object -First 1
  if (-not $proc) { throw 'PowerPoint window was not found.' }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([intptr]$proc.MainWindowHandle)
  $recordTab = Find-Control $root 'TabRecording'
  if (-not $recordTab) { throw 'Record tab was not exposed by PowerPoint.' }
  $recordTabSelection = $recordTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
  $recordTabSelection.Select()
  Start-Sleep -Seconds 1

  $controlIds = @(
    'PreviewRecordedVideo',
    'RecordNarration',
    'RecordNarrationFromCurrentSlide',
    'ClearRecordingMenu',
    'ResetToCameoMenu',
    'FileSaveAsPowerPointSlideShow',
    'ExportToVideoMenu'
  )
  $controls = [ordered]@{}
  foreach ($id in $controlIds) {
    $control = Find-Control $root $id
    $controls[$id] = [ordered]@{
      found = [bool]$control
      enabled = if ($control) { [bool]$control.Current.IsEnabled } else { $false }
      name = if ($control) { [string]$control.Current.Name } else { '' }
    }
  }
  if (-not $controls['PreviewRecordedVideo'].found -or -not $controls['PreviewRecordedVideo'].enabled) { throw 'PreviewRecordedVideo is not enabled.' }

  # Exercise the actual Record-tab Preview command. This opens PowerPoint's
  # slideshow preview and is dismissed with Escape; it does not mutate the deck.
  $preview = Find-Control $root 'PreviewRecordedVideo'
  $preview.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Seconds 3
  $slideShowWindowsAfterPreview = [int]$pp.SlideShowWindows.Count
  [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
  Start-Sleep -Seconds 1
  if ($slideShowWindowsAfterPreview -lt 1) { throw 'Record-tab Preview did not open a Slide Show window.' }

  $result = [ordered]@{
    ok = $true
    pptx = $pptxPath
    recordTab = [ordered]@{ found = $true; enabled = [bool]$recordTab.Current.IsEnabled; automationId = 'TabRecording' }
    controls = $controls
    slideShowWindowsAfterPreview = $slideShowWindowsAfterPreview
    retakeRibbonProvenance = 'not exposed as a distinct automation control for this imported recording; manual UI confirmation remains required'
  }
  $json = $result | ConvertTo-Json -Depth 6
  if ($OutputJson) {
    $out = [IO.Path]::GetFullPath($OutputJson)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($out)) | Out-Null
    $json | Set-Content -LiteralPath $out -Encoding UTF8
  }
  $json
}
finally {
  if ($pres) { try { $pres.Close() } catch {} }
  if ($pp) { try { $pp.Quit() } catch {} }
}
