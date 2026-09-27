param([Parameter(Mandatory=$true)][string]$Pptx,[Parameter(Mandatory=$true)][string]$OutputJson)
$ErrorActionPreference='Continue'
$pp=$null;$p=$null;$show=$null;$samples=@();$openError=$null
try {
  $pp=New-Object -ComObject PowerPoint.Application; $pp.Visible=-1
  try { $p=$pp.Presentations.Open([IO.Path]::GetFullPath($Pptx),$true,$false,$false) } catch { $openError=$_.Exception.Message }
  if($p){ $pre=[ordered]@{slides=[int]$p.Slides.Count;advanceMode=[int]$p.SlideShowSettings.AdvanceMode;showNarration=[int]$p.SlideShowSettings.ShowWithNarration}; $show=$p.SlideShowSettings.Run(); foreach($t in 2,10,20,30,40,50){ if($samples.Count -eq 0){$delta=$t}else{$delta=$t-[int]$samples[-1].elapsed}; Start-Sleep -Seconds $delta; $samples += [ordered]@{elapsed=$t;state=[int]$show.View.State;position=[int]$show.View.CurrentShowPosition} } } else {$pre=@{}}
  $result=[ordered]@{pptx=$Pptx;pre=$pre;samples=$samples;openError=$openError}; [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($OutputJson))|Out-Null; $result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $OutputJson -Encoding UTF8; $result|ConvertTo-Json -Depth 8
} finally { try{if($show){$show.View.Exit()}}catch{}; try{if($p){$p.Close()}}catch{}; try{if($pp){$pp.Quit()}}catch{} }
