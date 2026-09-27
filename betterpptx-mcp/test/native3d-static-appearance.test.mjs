import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createNative3dPosterReceiptStore, bindTrustedNative3dPosters, native3dStaticAppearanceProofComplete, NATIVE3D_STATIC_APPEARANCE_VERSION, NATIVE3D_STATIC_APPEARANCE_POWERSHELL } from '../quality/native3d-static-appearance.mjs'
import { native3dHydrationProofComplete, NATIVE3D_PREVIEW_HYDRATION_VERSION } from '../quality/native3d-preview-hydration.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'

const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const binding = { modelSha256: '1'.repeat(64), viewSha256: '2'.repeat(64), frameSha256: '3'.repeat(64), bindingSha256: '4'.repeat(64) }
const sourcePackageSha256 = '5'.repeat(64)
const packageSha256 = '6'.repeat(64)
const nativeProof = { schemaVersion: NATIVE3D_PREVIEW_HYDRATION_VERSION, status: 'verified', modelCount: 1, verifiedModelCount: 1, stablePasses: 2, fallbackGuard: 'checked', slideContentMatch: 'verified' }
const powerPointOpen = { readOnly: true, withWindow: false, openAndRepair: false, repaired: false }
const posterBytes = Buffer.from('isolated native PNG fixture')
const posterSha256 = digest(posterBytes)
const requirements = { slides: [{ slideIndex: 0, targets: [{ shapeId: 9, posterBase64: posterBytes.toString('base64') }] }] }
const bindings = new Map([['0:9', binding]])

test('only a previously verified native export establishes durable poster trust; uploads and client fields do not', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native3d-poster-receipts-'))
	try {
		const store = createNative3dPosterReceiptStore(root)
		const untrusted = structuredClone(requirements)
		untrusted.slides[0].targets[0].trustedStaticPoster = { posterSha256, bindingSha256: binding.bindingSha256 }
		assert.equal((await bindTrustedNative3dPosters(untrusted, bindings, store, packageSha256)).slides[0].targets[0].trustedStaticPoster, undefined)
		for (const native3dHydration of [undefined, { ...nativeProof, status: 'unverified' }, { ...nativeProof, fallbackGuard: 'unchecked' }]) {
			await assert.rejects(() => store.record({ posterSha256, binding, packageSha256: sourcePackageSha256, powerPointOpen, native3dHydration, expectedCount: 1 }), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
		}
		await assert.rejects(() => store.record({ posterSha256, binding, packageSha256: sourcePackageSha256, powerPointOpen: { ...powerPointOpen, openAndRepair: true }, native3dHydration: nativeProof, expectedCount: 1 }), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
		await store.record({ posterSha256, binding, packageSha256: sourcePackageSha256, powerPointOpen, native3dHydration: nativeProof, expectedCount: 1 })
		// A new store instance represents a worker reload; trusted evidence survives.
		const reloaded = createNative3dPosterReceiptStore(root)
		const bound = await bindTrustedNative3dPosters(requirements, bindings, reloaded, packageSha256)
		assert.equal(bound.slides[0].targets[0].trustedStaticPoster.sourcePackageSha256, sourcePackageSha256)
		assert.equal(requirements.slides[0].targets[0].trustedStaticPoster, undefined)
		for (const key of Object.keys(binding)) {
			assert.equal(await reloaded.find(posterSha256, { ...binding, [key]: '7'.repeat(64) }), null, key)
		}
		assert.equal(await reloaded.find('8'.repeat(64), binding), null)
		const changedBytes = structuredClone(requirements)
		changedBytes.slides[0].targets[0].posterBase64 = Buffer.from('changed').toString('base64')
		assert.equal((await bindTrustedNative3dPosters(changedBytes, bindings, reloaded, packageSha256)).slides[0].targets[0].trustedStaticPoster, undefined)
	} finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('bound static appearance is explicitly not native hydration or animation proof', () => {
	const receipt = { posterSha256, bindingSha256: binding.bindingSha256, sourcePackageSha256, receiptSha256: '9'.repeat(64) }
	const targets = [{ shapeId: 9, trustedStaticPoster: receipt }]
	const proof = { schemaVersion: NATIVE3D_STATIC_APPEARANCE_VERSION, status: 'verified', nativeHydration: 'unverified', playback: 'not-verified', objectCount: 1, verifiedObjectCount: 1, stablePasses: 2, slideContentMatch: 'verified', packageBinding: 'checked', packageSha256, trustedPosterCount: 1, objects: [{ shapeId: 9, evidence: 'trusted-pose-view-frame-bound-poster', ...receipt }] }
	assert.equal(native3dStaticAppearanceProofComplete(proof, 1, packageSha256, targets), true)
	assert.equal(native3dHydrationProofComplete(proof, 1), false)
	const priorMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		const exposed = sanitizePublicResult({ ok: true, previews: [{ native3dStaticAppearance: proof }] })
		assert.equal(exposed.previews[0].native3dStaticAppearance.nativeHydration, 'unverified')
		assert.equal(exposed.previews[0].native3dStaticAppearance.playback, 'not-verified')
		assert.equal(exposed.previews[0].native3dStaticAppearance.packageBinding, 'checked')
		assert.equal(JSON.stringify(exposed).includes('filePath'), false)
	} finally { if (priorMode === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX; else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = priorMode }
	for (const altered of [{ ...proof, nativeHydration: 'verified' }, { ...proof, playback: 'verified' }, { ...proof, stablePasses: 1 }, { ...proof, trustedPosterCount: 0 }, { ...proof, packageSha256: 'a'.repeat(64) }, { ...proof, objects: [] }]) {
		assert.equal(native3dStaticAppearanceProofComplete(altered, 1, packageSha256, targets), false)
	}
	assert.equal(native3dStaticAppearanceProofComplete(proof, 1, packageSha256, [{ shapeId: 9 }]), false, 'an ordinary/unbound poster cannot borrow the static gate')
	assert.equal(native3dStaticAppearanceProofComplete(proof, 1, packageSha256, [{ shapeId: 9, trustedStaticPoster: { ...receipt, bindingSha256: 'a'.repeat(64) } }]), false)
	const mixed = { ...proof, objectCount: 2, verifiedObjectCount: 2, objects: [...proof.objects, { shapeId: 12, evidence: 'non-fallback-native-render', fallbackGuard: 'checked' }] }
	assert.equal(native3dStaticAppearanceProofComplete(mixed, 2, packageSha256, [...targets, { shapeId: 12 }]), true)
	assert.equal(native3dStaticAppearanceProofComplete({ ...mixed, objects: [proof.objects[0], { shapeId: 12, evidence: 'non-fallback-native-render', fallbackGuard: 'unchecked' }] }, 2, packageSha256), false)
})

test('private failure evidence distinguishes appearance mismatch, instability and elapsed budget without COM', { skip: process.platform !== 'win32' }, async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-native3d-static-sidecar-'))
	try {
		// Only the clock and sleep are virtualized. The production export loop,
		// all acceptance predicates and sidecar writer execute unchanged.
		const worker = NATIVE3D_STATIC_APPEARANCE_POWERSHELL.replace('[Diagnostics.Stopwatch]::StartNew()', '[NativeStaticTestClock]::StartNew()')
		assert.notEqual(worker, NATIVE3D_STATIC_APPEARANCE_POWERSHELL)
		const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
public class NativeStaticTestClock {
  public static NativeStaticTestClock Current;
  public long ElapsedMilliseconds;
  public static NativeStaticTestClock StartNew() { Current = new NativeStaticTestClock(); return Current; }
}
public class NativeStaticTestRasterResult {
  public string Hash; public int Foreground; public bool Informative; public bool FallbackMatch; public double Difference;
}
public static class BetterPptxNativeRaster {
  public static string Mode = "success"; public static int Counter = 0;
  public static NativeStaticTestRasterResult Inspect(string file, string poster) {
    Counter++;
    return new NativeStaticTestRasterResult { Hash = Mode == "unstable" ? Counter.ToString("x64") : new string('a',64), Foreground = Mode == "blank" ? 0 : 400, Informative = Mode != "blank", FallbackMatch = Mode != "poster-mismatch", Difference = Mode == "poster-mismatch" ? 21.5 : 0.25 };
  }
  public static bool SlideMatchesNative(string file, string native, double x, double y, double w, double h) { return Mode != "core-mismatch"; }
  public static string FileHash(string file) { return new string('b',64); }
}
'@
function Start-Sleep { param($Milliseconds) }
function Get-Native3dPreviewShape($shapes, [int]$shapeId) { return $shapes.Shape }
` + worker + String.raw`
$fakeShape = [pscustomobject]@{ Id = 9 }
$fakeShape | Add-Member ScriptMethod Export {
  param($file, $filter, $width, $height, $mode)
  if ([BetterPptxNativeRaster]::Mode -eq 'export-error') { throw 'SECRET_PRIVATE_PATH_AND_PAYLOAD_MUST_NOT_BE_RECORDED' }
  [IO.File]::WriteAllText($file, 'fake-export-marker-not-an-image')
  [NativeStaticTestClock]::Current.ElapsedMilliseconds += 100
}
$fakeSlide = [pscustomobject]@{ SlideIndex = 1; Shapes = [pscustomobject]@{ Shape = $fakeShape } }
$fakeSlide | Add-Member ScriptMethod Export {
  param($file, $filter, $width, $height)
  [IO.File]::WriteAllText($file, 'fake-export-marker-not-an-image')
  if ([BetterPptxNativeRaster]::Mode -eq 'elapsed-budget' -and [BetterPptxNativeRaster]::Counter -gt 0) { [NativeStaticTestClock]::Current.ElapsedMilliseconds = 15001 }
}
$receipt = [pscustomobject]@{ posterSha256=('c'*64); bindingSha256=('d'*64); sourcePackageSha256=('e'*64); receiptSha256=('f'*64) }
$target = [pscustomobject]@{ shapeId=9; posterBase64='RAW_POSTER_MARKER_MUST_NOT_BE_RECORDED'; trustedStaticPoster=$receipt; frameEmu=[pscustomobject]@{ x=0; y=0; w=100; h=100 } }
$requirement = [pscustomobject]@{ targets=@($target) }; $size = [pscustomobject]@{ w=100; h=100 }
$results = New-Object System.Collections.ArrayList
foreach ($mode in @('poster-mismatch','core-mismatch','blank','unstable','elapsed-budget','export-error','success')) {
  [BetterPptxNativeRaster]::Mode=$mode; [BetterPptxNativeRaster]::Counter=0
  $dir = Join-Path $env:NATIVE_STATIC_TEST_ROOT $mode
  [void][IO.Directory]::CreateDirectory($dir)
  $proof=$null; $failure=$null
  try { $proof=Export-Native3dStaticAppearanceSlide $fakeSlide $requirement $size ('1'*64) (Join-Path $dir 'slide.png') 100 100 $dir } catch { $failure=$_.Exception.Message }
  $sidecar=Join-Path $dir 'native3d_static_failure_1.json'
  $diagnostic=$null; if (Test-Path -LiteralPath $sidecar) { $diagnostic=ConvertFrom-Json ([IO.File]::ReadAllText($sidecar)) }
  [void]$results.Add([pscustomobject]@{ mode=$mode; proof=$proof; failure=$failure; diagnostic=$diagnostic })
}
$results | ConvertTo-Json -Depth 14 -Compress
`
		const stdout = execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-STA', '-Command', script], {
			encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, NATIVE_STATIC_TEST_ROOT: root },
		})
		const results = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
		const byMode = new Map(results.map(item => [item.mode, item]))
		for (const item of results.filter(item => item.mode !== 'success')) {
			assert.ok(item.failure?.startsWith('POWERPOINT_PREVIEW_3D_NOT_READY:'), item.mode)
			assert.equal(item.proof, null, item.mode)
			assert.equal(item.diagnostic.packageSha256, '1'.repeat(64))
			assert.equal(item.diagnostic.maximumMeanChannelDifference, 8)
			assert.equal(item.diagnostic.requiredStablePasses, 2)
			assert.ok(item.diagnostic.attempts.length >= 1 && item.diagnostic.attempts.length <= 30)
			const serialized = JSON.stringify(item.diagnostic)
			for (const forbidden of ['RAW_POSTER_MARKER', 'SECRET_PRIVATE_PATH', 'posterBase64', 'modelBase64', root]) assert.equal(serialized.includes(forbidden), false, forbidden)
		}
		const mismatch = byMode.get('poster-mismatch').diagnostic
		assert.equal(mismatch.termination, 'attempt_budget')
		assert.equal(mismatch.finalState, 'appearance_rejected')
		assert.equal(mismatch.stablePasses, 0)
		assert.equal(mismatch.attempts[0].targets[0].premultipliedPosterDifference, 21.5)
		assert.equal(mismatch.attempts[0].targets[0].posterMatched, false)
		assert.equal(mismatch.attempts[0].targets[0].slideCoreMatched, true)
		const core = byMode.get('core-mismatch').diagnostic.attempts[0].targets[0]
		assert.equal(core.posterMatched, true)
		assert.equal(core.slideCoreMatched, false)
		assert.equal(byMode.get('blank').diagnostic.attempts[0].targets[0].informative, false)
		const unstable = byMode.get('unstable').diagnostic
		assert.equal(unstable.termination, 'attempt_budget')
		assert.equal(unstable.finalState, 'insufficient_stability')
		assert.equal(unstable.stablePasses, 1)
		assert.equal(unstable.attempts.length, 30)
		const budget = byMode.get('elapsed-budget').diagnostic
		assert.equal(budget.termination, 'elapsed_budget')
		assert.equal(budget.finalState, 'insufficient_stability')
		assert.equal(budget.attempts.length, 1)
		assert.equal(budget.stablePasses, 1)
		assert.equal(budget.attempts[0].ready, true, 'time budget is not falsely described as a measured raster mismatch')
		assert.equal(byMode.get('export-error').diagnostic.attempts[0].targets[0].exportExceptionCategory, 'isolated_shape_export')
		const success = byMode.get('success')
		assert.equal(success.failure, null)
		assert.equal(success.diagnostic, null, 'successful public proof does not carry private sidecar diagnostics')
		assert.equal(native3dStaticAppearanceProofComplete(success.proof, 1, '1'.repeat(64)), true)
		assert.equal(success.proof.stablePasses, 2)
		assert.equal(success.proof.nativeHydration, 'unverified')
		assert.equal(success.proof.playback, 'not-verified')
	} finally {
		assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
		assert.ok(path.basename(root).startsWith('betterpptx-native3d-static-sidecar-'))
		await fs.rm(root, { recursive: true, force: true })
	}
})
