import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { native3dHydrationProofComplete } from './native3d-preview-hydration.mjs'

export const NATIVE3D_STATIC_APPEARANCE_VERSION = 'betterpptx.native3d-static-appearance.v1'
const RECEIPT_VERSION = 'betterpptx.native3d-poster-receipt.v1'
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const bindingKeys = ['modelSha256', 'viewSha256', 'frameSha256', 'bindingSha256']
const safeBinding = binding => Object.fromEntries(bindingKeys.map(key => [key, binding?.[key]]))
const validBinding = binding => bindingKeys.every(key => sha256(binding?.[key]))
const readyError = message => Object.assign(new Error(message), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
const validOpen = proof => proof?.readOnly === true && proof?.withWindow === false && proof?.openAndRepair === false && proof?.repaired === false
const receiptKey = (posterSha256, bindingSha256) => hash(`${posterSha256}:${bindingSha256}`)

// This private directory is deliberately OUTSIDE the opaque asset directory.
// No public tool accepts a receipt, and uploads cannot create trust records.
// A durable record is minted only after a repair-disabled native export passed
// the existing non-fallback readiness gate, never from a static poster export.
export function createNative3dPosterReceiptStore(root) {
	const receiptPath = (poster, binding) => path.join(root, `${receiptKey(poster, binding)}.json`)
	return {
		async record({ posterSha256, binding, packageSha256, powerPointOpen, native3dHydration, expectedCount }) {
			if (!sha256(posterSha256) || !sha256(packageSha256) || !validBinding(binding) || !validOpen(powerPointOpen) || !Number.isInteger(expectedCount) || expectedCount < 1 || !native3dHydrationProofComplete(native3dHydration, expectedCount)) throw readyError('A compatibility image cannot establish native preview provenance.')
			const receipt = { schemaVersion: RECEIPT_VERSION, posterSha256, binding: safeBinding(binding), sourcePackageSha256: packageSha256, sourceEvidence: 'verified-non-fallback-native-object-export', readOnlyOpenWithoutRepair: true }
			await fs.mkdir(root, { recursive: true })
			// Content-addressed and immutable: concurrent equivalent publications
			// reuse the first valid receipt instead of rewriting its provenance.
			try { await fs.writeFile(receiptPath(posterSha256, binding.bindingSha256), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
			return this.find(posterSha256, binding)
		},
		async find(posterSha256, binding) {
			if (!sha256(posterSha256) || !validBinding(binding)) return null
			let bytes, receipt
			try { bytes = await fs.readFile(receiptPath(posterSha256, binding.bindingSha256)); receipt = JSON.parse(bytes) } catch { return null }
			if (receipt?.schemaVersion !== RECEIPT_VERSION || receipt.posterSha256 !== posterSha256 || !sha256(receipt.sourcePackageSha256) || receipt.sourceEvidence !== 'verified-non-fallback-native-object-export' || receipt.readOnlyOpenWithoutRepair !== true || bindingKeys.some(key => receipt.binding?.[key] !== binding[key])) return null
			return { posterSha256, bindingSha256: binding.bindingSha256, sourcePackageSha256: receipt.sourcePackageSha256, receiptSha256: hash(bytes) }
		},
	}
}

export async function bindTrustedNative3dPosters(requirements, bindings, store, packageSha256) {
	const result = structuredClone(requirements)
	result.packageSha256 = packageSha256
	for (const slide of result.slides) for (const target of slide.targets) {
		// Any field in a caller's object is ignored; only local receipt lookup is
		// authoritative. The actual caller derives these bytes from the package.
		delete target.trustedStaticPoster
		const binding = bindings.get(`${slide.slideIndex}:${target.shapeId}`)
		const posterSha256 = target.posterBase64 ? hash(Buffer.from(target.posterBase64, 'base64')) : null
		const receipt = await store.find(posterSha256, binding)
		if (receipt) target.trustedStaticPoster = receipt
	}
	return result
}

export function native3dStaticAppearanceProofComplete(proof, expectedCount, packageSha256, targets) {
	if (!Number.isInteger(expectedCount) || expectedCount < 1 || proof?.schemaVersion !== NATIVE3D_STATIC_APPEARANCE_VERSION || proof.status !== 'verified' || proof.nativeHydration !== 'unverified' || proof.playback !== 'not-verified' || proof.objectCount !== expectedCount || proof.verifiedObjectCount !== expectedCount || proof.stablePasses < 2 || proof.slideContentMatch !== 'verified' || proof.packageBinding !== 'checked' || !sha256(proof.packageSha256) || (packageSha256 && proof.packageSha256 !== packageSha256)) return false
	if (!Array.isArray(proof.objects) || proof.objects.length !== expectedCount || new Set(proof.objects.map(item => item.shapeId)).size !== expectedCount) return false
	let trusted = 0
	for (const item of proof.objects) {
		if (!Number.isInteger(item.shapeId)) return false
		const target = targets?.find(target => target.shapeId === item.shapeId)
		if (targets && !target) return false
		if (item.evidence === 'trusted-pose-view-frame-bound-poster') {
			trusted++
			if (!['posterSha256', 'bindingSha256', 'sourcePackageSha256', 'receiptSha256'].every(key => sha256(item[key]))) return false
			if (targets && ['posterSha256', 'bindingSha256', 'sourcePackageSha256', 'receiptSha256'].some(key => target.trustedStaticPoster?.[key] !== item[key])) return false
		} else if (item.evidence !== 'non-fallback-native-render' || item.fallbackGuard !== 'checked' || target?.trustedStaticPoster) return false
	}
	return trusted > 0 && proof.trustedPosterCount === trusted
}

// This is intentionally separate from Export-Native3dReadySlide. A trusted
// matched poster can prove appearance but cannot prove live native hydration.
// Ordinary/unbound posters still have to pass the original non-fallback test.
export const NATIVE3D_STATIC_APPEARANCE_POWERSHELL = String.raw`
function Export-Native3dStaticAppearanceSlide($slide, $requirement, $slideSize, [string]$packageSha256, [string]$file, [int]$width, [int]$height, [string]$outDir) {
  $targets = @($requirement.targets)
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $attempts = 0; $stablePasses = 0; $previousSignature = ''
  $succeeded = $false; $operation = 'initial_slide_export'
  # Maintainer-only evidence stays in this already-private temporary directory.
  # The caller's existing KEEP/cleanup policy is unchanged. No paths, image
  # bytes, object names or raw exception messages are added to public results.
  $diagnostics = [ordered]@{
    schemaVersion = 'betterpptx.native3d-static-failure-private.v1'
    packageSha256 = $packageSha256; slideNumber = [int]$slide.SlideIndex
    width = $width; height = $height; objectCount = $targets.Count
    slideSizeEmu = [ordered]@{ w = [double]$slideSize.w; h = [double]$slideSize.h }
    maximumElapsedMs = 15000; maximumAttempts = 30; requiredStablePasses = 2
    maximumMeanChannelDifference = 8; termination = $null; finalState = $null
    terminalExceptionCategory = $null; attempts = (New-Object System.Collections.ArrayList)
  }
  try {
  $slide.Export($file, 'PNG', $width, $height)
  while ($watch.ElapsedMilliseconds -lt 15000 -and $attempts -lt 30) {
    $attempts++
    if ($attempts -gt 1) { Start-Sleep -Milliseconds 400 }
    $ready = $true
    $hashes = New-Object System.Collections.ArrayList
    $objects = New-Object System.Collections.ArrayList
    $trustedCount = 0
    $attempt = [ordered]@{
      number = $attempts; startedElapsedMs = $watch.ElapsedMilliseconds
      targets = (New-Object System.Collections.ArrayList)
      slideSha256 = $null; ready = $false; sameSignatureAsPrevious = $false
      stablePasses = $stablePasses; completedElapsedMs = $null
    }
    [void]$diagnostics.attempts.Add($attempt)
    foreach ($target in $targets) {
      $observation = [ordered]@{
        shapeId = [int]$target.shapeId; trusted = ($null -ne $target.trustedStaticPoster)
        frameEmu = [ordered]@{ x = [double]$target.frameEmu.x; y = [double]$target.frameEmu.y; w = [double]$target.frameEmu.w; h = [double]$target.frameEmu.h }
        posterSha256 = $target.trustedStaticPoster.posterSha256
        bindingSha256 = $target.trustedStaticPoster.bindingSha256
        informative = $null; foreground = $null; premultipliedPosterDifference = $null
        posterMatched = $null; isolatedSignatureSha256 = $null; slideCoreMatched = $null
        probePresent = $null; exportExceptionCategory = $null
      }
      [void]$attempt.targets.Add($observation)
      $operation = 'shape_lookup'
      try {
        $shape = Get-Native3dPreviewShape $slide.Shapes ([int]$target.shapeId)
        if ($null -eq $shape) { throw 'native shape was not found' }
        $probeFile = Join-Path $outDir ("native3d_probe_{0}_{1}.png" -f $slide.SlideIndex, $target.shapeId)
        $operation = 'isolated_shape_export'
        $shape.Export($probeFile, 2, $width, $height, 1)
        $operation = 'isolated_raster_inspection'
        $measurement = [BetterPptxNativeRaster]::Inspect($probeFile, [string]$target.posterBase64)
        $observation.informative = [bool]$measurement.Informative
        $observation.foreground = [int]$measurement.Foreground
        if (-not [string]::IsNullOrEmpty([string]$target.posterBase64)) { $observation.premultipliedPosterDifference = [double]$measurement.Difference }
        $observation.posterMatched = [bool]$measurement.FallbackMatch
        $observation.isolatedSignatureSha256 = $measurement.Hash
        if (-not $measurement.Informative) { $ready = $false }
        if ($null -ne $target.trustedStaticPoster) {
          # Exact bytes/model/view/frame trust was established before entering
          # the worker. Raster comparison verifies that appearance on this open.
          if (-not $measurement.FallbackMatch) { $ready = $false }
          $trustedCount++
          [void]$objects.Add([pscustomobject]@{
            shapeId = [int]$target.shapeId
            evidence = 'trusted-pose-view-frame-bound-poster'
            posterSha256 = $target.trustedStaticPoster.posterSha256
            bindingSha256 = $target.trustedStaticPoster.bindingSha256
            sourcePackageSha256 = $target.trustedStaticPoster.sourcePackageSha256
            receiptSha256 = $target.trustedStaticPoster.receiptSha256
          })
        } else {
          if ($measurement.FallbackMatch) { $ready = $false }
          [void]$objects.Add([pscustomobject]@{ shapeId = [int]$target.shapeId; evidence = 'non-fallback-native-render'; fallbackGuard = 'checked' })
        }
        [void]$hashes.Add($measurement.Hash)
      } catch { $ready = $false; $observation.exportExceptionCategory = $operation }
    }
    $operation = 'slide_export'
    $slide.Export($file, 'PNG', $width, $height)
    foreach ($target in $targets) {
      $observation = @($attempt.targets | Where-Object { [int]$_.shapeId -eq [int]$target.shapeId })[0]
      $frame = $target.frameEmu
      $probeFile = Join-Path $outDir ("native3d_probe_{0}_{1}.png" -f $slide.SlideIndex, $target.shapeId)
      $matches = $false
      $operation = 'slide_core_inspection'
      $observation.probePresent = [bool](Test-Path -LiteralPath $probeFile)
      if ($observation.probePresent) { $matches = [BetterPptxNativeRaster]::SlideMatchesNative($file, $probeFile,
        [double]$frame.x / [double]$slideSize.w * $width, [double]$frame.y / [double]$slideSize.h * $height,
        [double]$frame.w / [double]$slideSize.w * $width, [double]$frame.h / [double]$slideSize.h * $height) }
      $observation.slideCoreMatched = [bool]$matches
      if (-not $matches) { $ready = $false }
    }
    $operation = 'slide_hash'
    $slideHash = [BetterPptxNativeRaster]::FileHash($file)
    [void]$hashes.Add($slideHash)
    $signature = [string]::Join(':', [string[]]$hashes)
    $attempt.slideSha256 = $slideHash
    $attempt.sameSignatureAsPrevious = ($signature -eq $previousSignature)
    if ($ready -and $signature -eq $previousSignature) { $stablePasses++ }
    elseif ($ready) { $stablePasses = 1 }
    else { $stablePasses = 0 }
    $previousSignature = $signature
    $attempt.ready = $ready; $attempt.stablePasses = $stablePasses
    $attempt.completedElapsedMs = $watch.ElapsedMilliseconds
    if ($stablePasses -ge 2 -and $trustedCount -gt 0) {
      $succeeded = $true
      return [pscustomobject]@{
        schemaVersion = 'betterpptx.native3d-static-appearance.v1'; status = 'verified'
        nativeHydration = 'unverified'; playback = 'not-verified'
        objectCount = $targets.Count; verifiedObjectCount = $targets.Count
        trustedPosterCount = $trustedCount; objects = $objects
        packageSha256 = $packageSha256; packageBinding = 'checked'
        stablePasses = $stablePasses; slideContentMatch = 'verified'
        rasterComparison = 'normalized-premultiplied-rgba-96px'; maximumMeanChannelDifference = 8
        attempts = $attempts; elapsedMs = $watch.ElapsedMilliseconds
      }
    }
  }
  $operation = 'readiness_gate'
  $diagnostics.termination = if ($watch.ElapsedMilliseconds -ge 15000) { 'elapsed_budget' } else { 'attempt_budget' }
  $lastAttempt = if ($diagnostics.attempts.Count -gt 0) { $diagnostics.attempts[$diagnostics.attempts.Count - 1] } else { $null }
  $diagnostics.finalState = if ($null -eq $lastAttempt) { 'no_attempt_before_budget' } elseif ($lastAttempt.ready) { 'insufficient_stability' } else { 'appearance_rejected' }
  throw ("POWERPOINT_PREVIEW_3D_NOT_READY: Slide {0}: static appearance did not match its trusted native view. No preview approval was recorded." -f $slide.SlideIndex)
  } catch {
    if ($operation -ne 'readiness_gate') {
      $diagnostics.terminalExceptionCategory = $operation
      $diagnostics.termination = 'export_exception'; $diagnostics.finalState = 'incomplete_export'
    }
    throw
  } finally {
    if (-not $succeeded) {
      $diagnostics.elapsedMs = $watch.ElapsedMilliseconds; $diagnostics.stablePasses = $stablePasses
      # Diagnostic I/O must never alter the original fail-closed outcome.
      try {
        $sidecar = Join-Path $outDir ("native3d_static_failure_{0}.json" -f $slide.SlideIndex)
        [IO.File]::WriteAllText($sidecar, ($diagnostics | ConvertTo-Json -Depth 12 -Compress), (New-Object Text.UTF8Encoding($false)))
      } catch {}
    }
  }
}
`
