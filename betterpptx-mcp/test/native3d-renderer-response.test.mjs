import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import { NATIVE3D_PREVIEW_HYDRATION_POWERSHELL } from '../quality/native3d-preview-hydration.mjs'
import { NATIVE3D_RENDERER_RESPONSE_POWERSHELL } from '../quality/native3d-renderer-response.mjs'

test('reversible renderer-response probe rejects static pictures and restores view after success or failure', { skip: process.platform !== 'win32' }, async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-native3d-response-test-'))
	try {
		const baseline = path.join(dir, 'baseline.png')
		const changed = path.join(dir, 'changed.png')
		const raster = async (file, offset) => {
			const pixels = Buffer.alloc(128 * 128 * 4)
			for (let y = 10; y < 119; y++) for (let x = 40 + offset; x < 81 + offset; x++) { const p = (y * 128 + x) * 4; pixels[p] = x + 80; pixels[p + 1] = y + 60; pixels[p + 2] = 175; pixels[p + 3] = 255 }
			await sharp(pixels, { raw: { width: 128, height: 128, channels: 4 } }).png().toFile(file)
		}
		await raster(baseline, 0)
		await raster(changed, 24)
		const script = `${NATIVE3D_PREVIEW_HYDRATION_POWERSHELL}\n${NATIVE3D_RENDERER_RESPONSE_POWERSHELL}
function Start-Sleep { param($Milliseconds) }
$script:mode = 'responsive'
$model = [pscustomobject]@{ RotationX=0; RotationY=0; RotationZ=0; CameraPositionX=0; CameraPositionY=0; CameraPositionZ=10; LookAtPointX=0; LookAtPointY=0; LookAtPointZ=0; FieldOfView=45; AutoFit=0 }
$shape = [pscustomobject]@{ Id=91; Model3D=$model; Left=12; Top=13; Width=300; Height=492; Rotation=0 }
$shape | Add-Member ScriptMethod Export { param($file, $filter, $width, $height, $mode); if ($script:mode -eq 'throws' -and $this.Model3D.RotationY -ne 0) { throw 'probe export failed' }; $source = if ($script:mode -eq 'responsive' -and $this.Model3D.RotationY -ne 0) { $env:RESPONSE_CHANGED } else { $env:RESPONSE_BASELINE }; [IO.File]::Copy($source, $file, $true) }
$proof = Test-Native3dRendererResponse $shape $env:RESPONSE_BASELINE 1672 941 $env:RESPONSE_DIR
$responsiveRestored = $model.RotationY -eq 0 -and $shape.Width -eq 300 -and $shape.Height -eq 492
$script:mode = 'static'; $staticRejected = $false
try { Test-Native3dRendererResponse $shape $env:RESPONSE_BASELINE 1672 941 $env:RESPONSE_DIR | Out-Null } catch { $staticRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$staticRestored = $model.RotationY -eq 0
$script:mode = 'throws'; $failureRejected = $false
try { Test-Native3dRendererResponse $shape $env:RESPONSE_BASELINE 1672 941 $env:RESPONSE_DIR | Out-Null } catch { $failureRejected = $true }
[pscustomobject]@{ proof=$proof; responsiveRestored=$responsiveRestored; staticRejected=$staticRejected; staticRestored=$staticRestored; failureRejected=$failureRejected; failureRestored=($model.RotationY -eq 0) } | ConvertTo-Json -Depth 8 -Compress
`
		const stdout = execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', timeout: 30000, env: { ...process.env, RESPONSE_DIR: dir, RESPONSE_BASELINE: baseline, RESPONSE_CHANGED: changed } })
		const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
		assert.equal(result.proof.status, 'verified')
		assert.equal(result.proof.changedViewStablePasses, 2)
		assert.equal(result.proof.restoredStablePasses, 2)
		for (const field of ['responsiveRestored', 'staticRejected', 'staticRestored', 'failureRejected', 'failureRestored']) assert.equal(result[field], true, field)
	} finally { await fs.rm(dir, { recursive: true, force: true }) }
})
