// Maintainer-side bounded probe. It is intentionally not connected to preview
// approval until a real PowerPoint run verifies exact restoration. A matched
// static poster is not evidence that a native 3D renderer is responding.
export const NATIVE3D_RENDERER_RESPONSE_POWERSHELL = String.raw`
function Test-Native3dRendererResponse($shape, [string]$baselineFile, [int]$width, [int]$height, [string]$outDir) {
  $model = $shape.Model3D
  if ($null -eq $model) { throw 'POWERPOINT_PREVIEW_3D_NOT_READY: Native model view response is unavailable.' }
  $modelFields = @('RotationX', 'RotationY', 'RotationZ', 'CameraPositionX', 'CameraPositionY', 'CameraPositionZ', 'LookAtPointX', 'LookAtPointY', 'LookAtPointZ', 'FieldOfView', 'AutoFit')
  $frameFields = @('Left', 'Top', 'Width', 'Height', 'Rotation')
  $savedModel = @{}
  $savedFrame = @{}
  foreach ($field in $modelFields) { $savedModel[$field] = $model.$field }
  foreach ($field in $frameFields) { $savedFrame[$field] = $shape.$field }
  $baseline = [BetterPptxNativeRaster]::Inspect($baselineFile, '')
  if (-not $baseline.Informative) { throw 'POWERPOINT_PREVIEW_3D_NOT_READY: Native model baseline is not informative.' }
  $baselineFileHash = [BetterPptxNativeRaster]::FileHash($baselineFile)
  $baselineBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($baselineFile))
  $probeFile = Join-Path $outDir ("native3d_response_{0}.png" -f $shape.Id)
  $changed = $false
  $changedStablePasses = 0
  $previousHash = ''
  $restorationFailed = $false
  $restorationDetails = New-Object System.Collections.ArrayList
  try {
    $model.RotationY = [single]$savedModel.RotationY + 23
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      if ($attempt -gt 0) { Start-Sleep -Milliseconds 200 }
      $shape.Export($probeFile, 2, $width, $height, 1)
      $sample = [BetterPptxNativeRaster]::Inspect($probeFile, $baselineBytes)
      if ($sample.Informative -and -not $sample.FallbackMatch -and $sample.Hash -eq $previousHash) { $changedStablePasses++ }
      elseif ($sample.Informative -and -not $sample.FallbackMatch) { $changedStablePasses = 1 }
      else { $changedStablePasses = 0 }
      $previousHash = $sample.Hash
      if ($changedStablePasses -ge 2) { $changed = $true; break }
    }
  } finally {
    # These are exact captured property values, never a reverse increment. The
    # presentation is opened read-only and will not be saved by this probe.
    foreach ($field in $modelFields) { try { if ([double]$model.$field -ne [double]$savedModel[$field]) { if ($field -eq 'AutoFit') { $model.$field = [int]($savedModel[$field]) } else { $model.$field = [single]($savedModel[$field]) } } } catch { $restorationFailed = $true; [void]$restorationDetails.Add([pscustomobject]@{ field=$field; saved=$savedModel[$field]; reason=$_.Exception.Message }) } }
    foreach ($field in $frameFields) { try { if ([double]$shape.$field -ne [double]$savedFrame[$field]) { $shape.$field = [single]($savedFrame[$field]) } } catch { $restorationFailed = $true; [void]$restorationDetails.Add([pscustomobject]@{ field=$field; saved=$savedFrame[$field]; reason=$_.Exception.Message }) } }
  }
  if ($restorationFailed) {
    $failure = New-Object System.Exception('POWERPOINT_PREVIEW_3D_NOT_READY: Native model view could not be restored exactly.')
    $failure.Data['native3dRestorationFailures'] = ($restorationDetails | ConvertTo-Json -Depth 5 -Compress)
    throw $failure
  }
  foreach ($field in $modelFields) { if ([double]$model.$field -ne [double]$savedModel[$field]) { throw 'POWERPOINT_PREVIEW_3D_NOT_READY: Native model view state did not restore.' } }
  foreach ($field in $frameFields) { if ([double]$shape.$field -ne [double]$savedFrame[$field]) { throw 'POWERPOINT_PREVIEW_3D_NOT_READY: Native model frame did not restore.' } }
  if (-not $changed) { throw 'POWERPOINT_PREVIEW_3D_NOT_READY: A matching compatibility picture does not prove native renderer response.' }
  $restoredPasses = 0
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    if ($attempt -gt 0) { Start-Sleep -Milliseconds 200 }
    $shape.Export($probeFile, 2, $width, $height, 1)
    $sample = [BetterPptxNativeRaster]::Inspect($probeFile, '')
    if ($sample.Informative -and $sample.Hash -eq $baseline.Hash -and [BetterPptxNativeRaster]::FileHash($probeFile) -eq $baselineFileHash) { $restoredPasses++ } else { $restoredPasses = 0 }
    if ($restoredPasses -ge 2) {
      return [pscustomobject]@{ status = 'verified'; method = 'reversible-native-view-response'; changedViewStablePasses = $changedStablePasses; restoredStablePasses = $restoredPasses; viewRestored = $true; frameRestored = $true }
    }
  }
  throw 'POWERPOINT_PREVIEW_3D_NOT_READY: The restored native model did not reproduce its original pixels.'
}
`
