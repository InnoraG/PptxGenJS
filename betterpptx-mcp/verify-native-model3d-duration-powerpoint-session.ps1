[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$ManifestPath, [int]$TimeoutMinutes = 15)

$ErrorActionPreference = 'Stop'
$msoTrue = -1
$msoFalse = 0
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$outputDir = [IO.Path]::GetFullPath([string]$manifest.outputDir)
$allowedPrefix = $outputDir.TrimEnd('\') + '\'
$baselineProcesses = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
$pp = $null
$owned = New-Object 'System.Collections.Generic.List[object]'
$report = [ordered]@{ schemaVersion='betterpptx.native-model3d-duration-powerpoint-session.v1'; status='RUNNING'; startedAt=(Get-Date).ToUniversalTime().ToString('o'); hostSafety=[ordered]@{ baselineProcessIds=$baselineProcesses; policy='Never close a pre-existing presentation; never quit a pre-existing application; do not change user visibility or slideshow state.' }; decks=@() }

function Assert-ProofPath([string]$Value) {
  $full = [IO.Path]::GetFullPath($Value)
  if (-not $full.StartsWith($script:allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Proof path is outside the owned directory: $full" }
  return $full
}
function Read-ProofHash([string]$Value) {
  $stream = [IO.File]::OpenRead((Assert-ProofPath $Value))
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $hasher.Dispose() }
}
function Snapshot-Presentations {
  $items = @()
  foreach ($presentation in @($script:pp.Presentations)) {
    $items += [ordered]@{ name=[string]$presentation.Name; fullName=[string]$presentation.FullName; saved=[int]$presentation.Saved; slides=[int]$presentation.Slides.Count }
  }
  return $items
}
function Close-Owned($presentation) {
  if (-not $presentation) { return }
  if (-not $script:owned.Contains($presentation)) { throw 'Refusing to close a presentation not opened by this oracle.' }
  try { $presentation.Saved = $script:msoTrue } catch {}
  $presentation.Close()
  $script:owned.Remove($presentation) | Out-Null
  try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) | Out-Null } catch {}
}
function Read-Deck($presentation, $spec, [string]$phase) {
  $slides = @()
  foreach ($item in $spec.cases) {
    $slide = $presentation.Slides.Item([int]$item.slideIndex)
    $effects = @()
    foreach ($effect in @($slide.TimeLine.MainSequence)) {
      $effects += [ordered]@{ target=[string]$effect.Shape.Name; effectType=[int]$effect.EffectType; durationMs=[Math]::Round([double]$effect.Timing.Duration*1000, 4); triggerType=[int]$effect.Timing.TriggerType; triggerDelayMs=[Math]::Round([double]$effect.Timing.TriggerDelayTime*1000, 4); repeatCount=[double]$effect.Timing.RepeatCount; autoReverse=[int]$effect.Timing.AutoReverse }
    }
    $native3d = @($slide.Shapes | Where-Object { [int]$_.Type -eq 30 }).Count
    $repairMode = $null
    try { $repairMode = [bool]$presentation.RepairMode } catch {}
    $model = @($effects | Where-Object target -eq $item.modelName)
    if ($model.Count -ne 1 -or $native3d -ne 1 -or $repairMode -eq $true) { throw "Native model/repair readback failed: $($item.id) / $phase" }
    $expected = [double]$item.expectedDurationMs
    $durationMatch = [Math]::Abs([double]$model[0].durationMs-$expected) -le 1.001
    if (-not $durationMatch) { throw "PowerPoint duration mismatch: $($item.id) expected=$expected actual=$($model[0].durationMs) / $phase" }
    $image = $null
    if ($phase -eq 'reopened') {
      $image = Assert-ProofPath (Join-Path $script:outputDir "static-$($spec.id)-$('{0:d2}' -f [int]$item.slideIndex).png")
      $slide.Export($image, 'PNG', 1600, 900)
    }
    $slides += [ordered]@{ id=$item.id; slideIndex=[int]$item.slideIndex; native3dShapes=$native3d; expectedDurationMs=$expected; durationMatch=$durationMatch; advanceOnTime=[int]$slide.SlideShowTransition.AdvanceOnTime; advanceMs=[Math]::Round([double]$slide.SlideShowTransition.AdvanceTime*1000,4); effects=$effects; staticImage=$image }
  }
  return [ordered]@{ phase=$phase; readOnly=[int]$presentation.ReadOnly; slideCount=[int]$presentation.Slides.Count; slides=$slides }
}

try {
  try { $pp = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') } catch { $pp = New-Object -ComObject PowerPoint.Application }
  $report.office = [ordered]@{ version=[string]$pp.Version; build=[string]$pp.Build }
  $before = @(Snapshot-Presentations)
  $report.hostSafety.presentationsBefore = $before
  foreach ($spec in $manifest.decks) {
    $source = Assert-ProofPath ([string]$spec.source)
    $roundtrip = Assert-ProofPath ([string]$spec.roundtrip)
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing proof source: $source" }
    if (Test-Path -LiteralPath $roundtrip) { throw "Refusing to overwrite prior proof: $roundtrip" }
    if (@($before | Where-Object { $_.fullName -eq $source -or $_.fullName -eq $roundtrip }).Count) { throw 'A proof deck is already open; refusing to take ownership.' }
    $sourceHash = Read-ProofHash $source
    $presentation = $pp.Presentations.Open2007($source,$msoTrue,$msoFalse,$msoFalse,$msoFalse)
    $owned.Add($presentation)
    $sourceReadback = Read-Deck $presentation $spec 'source'
    $presentation.SaveCopyAs($roundtrip,24,$msoFalse)
    Close-Owned $presentation
    $presentation = $pp.Presentations.Open2007($roundtrip,$msoTrue,$msoFalse,$msoFalse,$msoFalse)
    $owned.Add($presentation)
    $roundtripReadback = Read-Deck $presentation $spec 'reopened'
    $video = $null
    if ($spec.video) {
      $videoPath = Assert-ProofPath ([string]$spec.video)
      if (Test-Path -LiteralPath $videoPath) { throw "Refusing to overwrite prior video: $videoPath" }
      $presentation.CreateVideo($videoPath,$msoTrue,5,720,30,90)
      $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
      do {
        Start-Sleep -Seconds 2
        $videoStatus = [int]$presentation.CreateVideoStatus
        Write-Host "Native duration video status: $videoStatus"
      } while ($videoStatus -in @(1,2) -and (Get-Date) -lt $deadline)
      $bytes = if (Test-Path -LiteralPath $videoPath) { (Get-Item -LiteralPath $videoPath).Length } else { 0 }
      if ($videoStatus -ne 3 -or $bytes -lt 100000) { throw "Native video failed: status=$videoStatus bytes=$bytes" }
      $video = [ordered]@{ status='PASS'; path=$videoPath; bytes=$bytes; sha256=(Read-ProofHash $videoPath); mode='authored-timing'; fps=30; height=720 }
    }
    Close-Owned $presentation
    $afterHash = Read-ProofHash $source
    if ($afterHash -ne $sourceHash) { throw 'The generated proof source changed during the oracle.' }
    $report.decks += [ordered]@{ id=[string]$spec.id; source=$source; sourceSha256=$sourceHash; sourceUnchanged=$true; roundtrip=$roundtrip; roundtripSha256=(Read-ProofHash $roundtrip); sourceReadback=$sourceReadback; roundtripReadback=$roundtripReadback; video=$video }
  }
  $after = @(Snapshot-Presentations)
  $report.hostSafety.presentationsAfter = $after
  foreach ($prior in $before) {
    $match = @($after | Where-Object { $_.fullName -eq $prior.fullName -and $_.name -eq $prior.name })
    if ($match.Count -ne 1 -or $match[0].saved -ne $prior.saved -or $match[0].slides -ne $prior.slides) { throw 'A pre-existing presentation state changed during the oracle.' }
  }
  $report.hostSafety.preExistingPresentationsPreserved = $true
  $report.status = 'PASS'
} catch {
  $report.status = 'FAIL'
  $report.error = $_.Exception.Message
  $report.scriptStack = $_.ScriptStackTrace
} finally {
  foreach ($presentation in @($owned.ToArray())) { try { Close-Owned $presentation } catch {} }
  if ($pp) {
    # Only an oracle-created app may be closed; a user app is never quit.
    if ($baselineProcesses.Count -eq 0 -and @($pp.Presentations).Count -eq 0) { try { $pp.Quit(); $report.hostSafety.oracleCreatedEmptyApplicationClosed=$true } catch {} }
    try { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($pp) | Out-Null } catch {}
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  $report | ConvertTo-Json -Depth 35 | Set-Content -LiteralPath (Join-Path $outputDir 'powerpoint-session-proof.json') -Encoding UTF8
}
$report | ConvertTo-Json -Depth 4
if ($report.status -ne 'PASS') { exit 1 }
