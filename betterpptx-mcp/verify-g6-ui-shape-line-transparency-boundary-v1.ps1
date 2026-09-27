$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = (Get-Location).Path
$source = Join-Path $root 'outputs/authoring-principle-corpus/global-extended-option-five-point/shape-connector-line-native/20260824T223704Z/shape-connector-line-five-point.pptx'
$archive = Join-Path $root 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/g6-ui-shape-line-transparency-boundary'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$outDir = Join-Path $archive $stamp
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$authored = Join-Path $outDir 'ui-authored-shape-line-transparency.pptx'
$roundtrip = Join-Path $outDir 'ui-authored-shape-line-transparency-savecopyas.pptx'
$png = Join-Path $outDir 'ui-authored-shape-line-transparency.png'
$pp = New-Object -ComObject PowerPoint.Application
$p = $null; $r = $null
try {
  $pp.Visible = $true
  $p = $pp.Presentations.Open2007($source, $false, $false, $true, $false)
  $p.Slides.Item(1).Shapes.Item(2).Select()
  Start-Sleep -Milliseconds 1200
  $pp.CommandBars.ExecuteMso('FormatShape')
  Start-Sleep -Milliseconds 1800
  $hwnd = [IntPtr]$pp.HWND
  $window = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $controls = @()
  foreach ($el in $all) {
    $name = [string]$el.Current.Name
    if ($name -match 'Transparency|Format Shape|Line|Shape Options') {
      $controls += [ordered]@{ name=$name; automationId=[string]$el.Current.AutomationId; controlType=[string]$el.Current.ControlType.ProgrammaticName; enabled=[bool]$el.Current.IsEnabled; className=[string]$el.Current.ClassName }
    }
  }
  $trans = @($controls | Where-Object { $_.name -match 'Transparency' -and $_.enabled })
  $uiSet = $false; $uiRead = $null; $uiError = $null
  foreach ($el in $all) {
    if ($uiSet) { break }
    $name = [string]$el.Current.Name
    if ($name -notmatch 'Transparency') { continue }
    try {
      $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($vp) { $vp.SetValue('50'); $uiSet = $true; $uiRead = '50'; break }
    } catch { $uiError = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds 1000
  $p.SaveAs($authored, 24)
  $p.Close(); $p = $null
  $r = $pp.Presentations.Open2007($authored, $true, $false, $false, $false)
  $actual = [double]$r.Slides.Item(1).Shapes.Item(2).Line.Transparency
  $r.Slides.Item(1).Export($png, 'PNG', 1600, 900)
  $r.SaveCopyAs($roundtrip, 24)
  $r.Close(); $r = $null
  $status = if ($uiSet -and [math]::Abs($actual - 0.5) -le 0.02) { 'PASS' } else { 'FAIL_UI_BOUNDARY' }
  [ordered]@{ schemaVersion='betterpptx.g6-ui-shape-line-transparency-boundary-proof.v1'; status=$status; generatedAt=(Get-Date).ToUniversalTime().ToString('o'); gate='G6'; row=[ordered]@{ family='shapes-gradients'; label='transparency'; catalogRowId='cap_69af4fb2d1dc8eb08ea0'; officeCarrier='Shape.Line.Transparency'; requested=0.5; actual=$actual }; ui=[ordered]@{ windowHandle=[long]$hwnd; transparencyControls=$trans; controlCount=$controls.Count; setterReached=$uiSet; setterReadback=$uiRead; setterError=$uiError }; artifacts=[ordered]@{ source=$source; authored=$authored; roundtrip=$roundtrip; png=$png; authoredBytes=(Get-Item $authored).Length; roundtripBytes=(Get-Item $roundtrip).Length; pngBytes=(Get-Item $png).Length }; checks=[ordered]@{ uiTransparencyControlFound=($trans.Count -gt 0); uiSetterReached=$uiSet; retainedTransparency=([math]::Abs($actual - 0.5) -le 0.02); saveCopyAsReopen=((Get-Item $roundtrip).Length -gt 0); renderedNonEmpty=((Get-Item $png).Length -gt 0) }; boundary='If status is FAIL_UI_BOUNDARY, deterministic UI could not reach a writable transparency control or PowerPoint did not retain it; no row promotion is allowed.' } | ConvertTo-Json -Depth 12
} finally {
  if ($p) { $p.Close() }
  if ($r) { $r.Close() }
  if ($pp) { $pp.Quit() }
}
