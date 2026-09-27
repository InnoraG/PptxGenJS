import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import sharp from 'sharp'
import { readNative3dPreviewRequirements, native3dHydrationProofComplete, NATIVE3D_PREVIEW_HYDRATION_VERSION, NATIVE3D_PREVIEW_HYDRATION_POWERSHELL } from '../quality/native3d-preview-hydration.mjs'
import { native3dStaticAppearanceProofComplete, NATIVE3D_STATIC_APPEARANCE_POWERSHELL } from '../quality/native3d-static-appearance.mjs'

test('model readiness requires two stable non-fallback passes, not a render hash alone', () => {
	const proof = { schemaVersion: NATIVE3D_PREVIEW_HYDRATION_VERSION, status: 'verified', modelCount: 2, verifiedModelCount: 2, stablePasses: 2, fallbackGuard: 'checked', slideContentMatch: 'verified' }
	assert.equal(native3dHydrationProofComplete(undefined, 0), true)
	assert.equal(native3dHydrationProofComplete(proof, 2), true)
	for (const invalid of [undefined, {}, { ...proof, status: 'fallback' }, { ...proof, stablePasses: 1 }, { ...proof, fallbackGuard: 'unchecked' }, { ...proof, slideContentMatch: 'unverified' }, { ...proof, verifiedModelCount: 1 }]) {
		assert.equal(native3dHydrationProofComplete(invalid, 2), false)
	}
	const clipped = { ...proof, viewportFrameMatch: 'verified', fullyClippedModelCount: 1, partiallyClippedModelCount: 0, clippedAbsenceCheck: 'pixel-identical-with-target-hidden' }
	assert.equal(native3dHydrationProofComplete(clipped, 2), true)
	for (const invalid of [{ ...clipped, viewportFrameMatch: 'unchecked' }, { ...clipped, fullyClippedModelCount: 3 }, { ...clipped, clippedAbsenceCheck: 'not-needed' }, { ...clipped, partiallyClippedModelCount: -1 }]) assert.equal(native3dHydrationProofComplete(invalid, 2), false)
})

async function packageFixture({ rotated = false } = {}) {
	// XML carrier fragments only: not a constructed or saved presentation.
	const zip = new JSZip()
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12230822" cy="6883594"/></p:presentation>')
	zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Target="slides/slide9.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>')
	zip.file('ppt/slides/slide2.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
	zip.file('ppt/slides/slide9.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"><p:cSld><p:spTree><mc:AlternateContent><mc:Choice Requires="am3d"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="91" name="Any model"/></p:nvGraphicFramePr><p:xfrm${rotated ? ' rot="600000"' : ''}><a:off x="9445750" y="1901952"/><a:ext cx="2194560" cy="3599078"/></p:xfrm><a:graphic><a:graphicData><am3d:model3d r:embed="rId3"/></a:graphicData></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback><p:pic><p:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="9445750" y="1901952"/><a:ext cx="2194560" cy="3599078"/></a:xfrm></p:spPr></p:pic></mc:Fallback></mc:AlternateContent></p:spTree></p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide9.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId4" Target="../media/poster.png"/></Relationships>')
	zip.file('ppt/media/poster.png', Buffer.from('poster fixture bytes'))
	return zip.generateAsync({ type: 'nodebuffer' })
}

test('requirements follow presentation relationship ordering and exact frozen fallback bytes', async () => {
	const requirements = await readNative3dPreviewRequirements(await packageFixture(), [0, 1])
	assert.deepEqual(requirements.slides.map(slide => slide.targets.length), [1, 0])
	assert.equal(requirements.slides[0].targets[0].shapeId, 91)
	assert.equal(Buffer.from(requirements.slides[0].targets[0].posterBase64, 'base64').toString(), 'poster fixture bytes')
	assert.deepEqual(requirements.slides[0].targets[0].frameEmu, { x: 9445750, y: 1901952, w: 2194560, h: 3599078 })
	const counts = await readNative3dPreviewRequirements(await packageFixture({ rotated: true }), [0], { includePosterData: false })
	assert.equal(counts.slides[0].targets.length, 1)
	await assert.rejects(async () => readNative3dPreviewRequirements(await packageFixture(), [2]), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
})

test('unhandled fallback effects fail closed rather than proving a different picture is native', async () => {
	const bytes = await packageFixture({ rotated: true })
	await assert.rejects(() => readNative3dPreviewRequirements(bytes, [0]), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
})

test('invalid slide viewport dimensions fail before native crop arithmetic', async () => {
	const zip = await JSZip.loadAsync(await packageFixture())
	const xml = await zip.file('ppt/presentation.xml').async('string')
	zip.file('ppt/presentation.xml', xml.replace('cx="12230822"', 'cx="0"'))
	const bytes = await zip.generateAsync({ type: 'nodebuffer' })
	await assert.rejects(() => readNative3dPreviewRequirements(bytes, [0]), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
})

test('native-only compatibility anchors are checked and inherited native models cannot look like zero-model slides', async () => {
	const zip = await JSZip.loadAsync(await packageFixture())
	const slidePart = 'ppt/slides/slide9.xml'
	const source = await zip.file(slidePart).async('string')
	zip.file(slidePart, source.replace('<am3d:model3d r:embed="rId3"/>', '<am3d:model3d r:embed="rId3"><am3d:blip r:embed="rId4"/></am3d:model3d>').replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/, ''))
	const anchored = await readNative3dPreviewRequirements(await zip.generateAsync({ type: 'nodebuffer' }), [0])
	assert.equal(Buffer.from(anchored.slides[0].targets[0].posterBase64, 'base64').toString(), 'poster fixture bytes')
	zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>')
	zip.file('ppt/slideLayouts/layout1.xml', '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"><am3d:model3d/></p:sldLayout>')
	const inheritedBytes = await zip.generateAsync({ type: 'nodebuffer' })
	await assert.rejects(() => readNative3dPreviewRequirements(inheritedBytes, [1]), { code: 'POWERPOINT_PREVIEW_3D_NOT_READY' })
})

test('actual Windows raster detector rejects stretched posters and waits for native readiness', { skip: process.platform !== 'win32' }, async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-native3d-raster-test-'))
	try {
		const sourcePixels = Buffer.alloc(128 * 128 * 4)
		const nativePixels = Buffer.alloc(128 * 128 * 4)
		for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
			const p = (y * 128 + x) * 4
			if (x >= 52 && x <= 77 && y >= 15 && y <= 75) { sourcePixels[p] = 100 + x; sourcePixels[p + 1] = y + 60; sourcePixels[p + 2] = 160; sourcePixels[p + 3] = 255 }
			if (x >= 35 && x <= 94 && y >= 5 && y <= 122) { nativePixels[p] = 100 + x; nativePixels[p + 1] = y + 60; nativePixels[p + 2] = 160; nativePixels[p + 3] = 255 }
		}
		const source = path.join(dir, 'poster.png')
		const stretched = path.join(dir, 'stretched.png')
		const native = path.join(dir, 'native.png')
		const blank = path.join(dir, 'blank.png')
		const partial = path.join(dir, 'partial.png')
		await sharp(sourcePixels, { raw: { width: 128, height: 128, channels: 4 } }).png().toFile(source)
		await sharp(source).resize(300, 492, { fit: 'fill' }).png().toFile(stretched)
		await sharp(nativePixels, { raw: { width: 128, height: 128, channels: 4 } }).png().toFile(native)
		await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(blank)
		const rightHalf = await sharp(native).extract({ left: 64, top: 0, width: 64, height: 128 }).png().toBuffer()
		await sharp(blank).composite([{ input: rightHalf, left: 0, top: 0 }]).png().toFile(partial)
		const script = `${NATIVE3D_PREVIEW_HYDRATION_POWERSHELL}
${NATIVE3D_STATIC_APPEARANCE_POWERSHELL}
$poster = [Convert]::ToBase64String([IO.File]::ReadAllBytes($env:NATIVE_TEST_POSTER))
$stretched = [BetterPptxNativeRaster]::Inspect($env:NATIVE_TEST_STRETCHED, $poster)
$native = [BetterPptxNativeRaster]::Inspect($env:NATIVE_TEST_NATIVE, $poster)
$blank = [BetterPptxNativeRaster]::Inspect($env:NATIVE_TEST_BLANK, $poster)
function Start-Sleep { param($Milliseconds) }
$script:exportCount = 0
$script:alwaysFallback = $true
$script:staleSlide = $false
$script:clipped = $false
$script:blankNative = $false
$fakeShape = [pscustomobject]@{ Id = 91; Type = 30; Left = 0; Top = 0; Width = (128.0 / 12700); Height = (128.0 / 12700); Visible = -1 }
$fakeShape | Add-Member ScriptMethod Export { param($file, $filter, $width, $height, $mode); $script:exportCount++; $rasterSource = if ($script:blankNative) { $env:NATIVE_TEST_BLANK } elseif ($script:alwaysFallback -or $script:exportCount -le 2) { $env:NATIVE_TEST_POSTER } else { $env:NATIVE_TEST_NATIVE }; [IO.File]::Copy($rasterSource, $file, $true) }
$fakeShapes = [pscustomobject]@{ Count = 1; Shape = $fakeShape }
$fakeShapes | Add-Member ScriptMethod Item { param($index); return $this.Shape }
$fakeSlide = [pscustomobject]@{ SlideIndex = 1; Shapes = $fakeShapes }
$fakeSlide | Add-Member ScriptMethod Export { param($file, $filter, $width, $height); $rasterSource = if ($script:clipped -or $fakeShape.Visible -eq 0) { $env:NATIVE_TEST_BLANK } elseif ($script:staleSlide -or $script:alwaysFallback -or $script:exportCount -le 2) { $env:NATIVE_TEST_POSTER } else { $env:NATIVE_TEST_NATIVE }; [IO.File]::Copy($rasterSource, $file, $true) }
$requirement = [pscustomobject]@{ targets = @([pscustomobject]@{ shapeId = 91; posterBase64 = $poster; frameEmu = [pscustomobject]@{ x=0; y=0; w=128; h=128 } }) }
$size = [pscustomobject]@{ w=128; h=128 }
$fallbackRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $fallbackRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$fallbackAttempts = $script:exportCount
$script:alwaysFallback = $false; $script:exportCount = 0
$ready = Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR
$script:staleSlide = $true; $script:exportCount = 0
$staleSlideRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $staleSlideRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$script:staleSlide = $false; $script:clipped = $true; $script:exportCount = 100
$requirement.targets[0].frameEmu.y = -256; $fakeShape.Top = -256.0 / 12700
$clippedReady = Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'clipped-slide.png') 128 128 $env:NATIVE_TEST_DIR
$visibilityRestored = $fakeShape.Visible -eq -1
$script:clipped = $false
$unexpectedVisibleRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'wrong-visible.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $unexpectedVisibleRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$script:clipped = $true; $fakeShape.Top = 0
$wrongFrameRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'wrong-frame.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $wrongFrameRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$fakeShape.Top = -256.0 / 12700; $script:blankNative = $true
$clippedBlankRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'clipped-blank.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $clippedBlankRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$script:blankNative = $false; $script:alwaysFallback = $true
$clippedFallbackRejected = $false
try { Export-Native3dReadySlide $fakeSlide $requirement $size (Join-Path $env:NATIVE_TEST_DIR 'clipped-fallback.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $clippedFallbackRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$partialMatches = [BetterPptxNativeRaster]::SlideMatchesNative($env:NATIVE_TEST_PARTIAL, $env:NATIVE_TEST_NATIVE, -64, 0, 128, 128)
$partialWrongRejected = -not [BetterPptxNativeRaster]::SlideMatchesNative($env:NATIVE_TEST_POSTER, $env:NATIVE_TEST_NATIVE, -64, 0, 128, 128)
$emptyComparisonRejected = -not [BetterPptxNativeRaster]::SlideMatchesNative($env:NATIVE_TEST_BLANK, $env:NATIVE_TEST_NATIVE, 0, -256, 128, 128)
$invalidViewportRejected = [BetterPptxNativeRaster]::ViewportIntersection(0, 0, 128, 128, 0, 128) -eq -1
$script:clipped = $false; $fakeShape.Top = 0; $requirement.targets[0].frameEmu.y = 0
$script:staleSlide = $false; $script:alwaysFallback = $true; $script:exportCount = 0
$staticUnboundRejected = $false
try { Export-Native3dStaticAppearanceSlide $fakeSlide $requirement $size ('a' * 64) (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $staticUnboundRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
$trusted = [pscustomobject]@{ posterSha256=('b' * 64); bindingSha256=('c' * 64); sourcePackageSha256=('d' * 64); receiptSha256=('e' * 64) }
$requirement.targets[0] | Add-Member NoteProperty trustedStaticPoster $trusted
$staticReady = Export-Native3dStaticAppearanceSlide $fakeSlide $requirement $size ('a' * 64) (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR
$script:alwaysFallback = $false; $script:exportCount = 100
$staticWrongAppearanceRejected = $false
try { Export-Native3dStaticAppearanceSlide $fakeSlide $requirement $size ('a' * 64) (Join-Path $env:NATIVE_TEST_DIR 'slide.png') 128 128 $env:NATIVE_TEST_DIR | Out-Null } catch { $staticWrongAppearanceRejected = $_.Exception.Message.StartsWith('POWERPOINT_PREVIEW_3D_NOT_READY:') }
[pscustomobject]@{ stretched=$stretched; native=$native; blank=$blank; fallbackRejected=$fallbackRejected; fallbackAttempts=$fallbackAttempts; staleSlideRejected=$staleSlideRejected; ready=$ready; clippedReady=$clippedReady; visibilityRestored=$visibilityRestored; unexpectedVisibleRejected=$unexpectedVisibleRejected; wrongFrameRejected=$wrongFrameRejected; clippedBlankRejected=$clippedBlankRejected; clippedFallbackRejected=$clippedFallbackRejected; partialMatches=$partialMatches; partialWrongRejected=$partialWrongRejected; emptyComparisonRejected=$emptyComparisonRejected; invalidViewportRejected=$invalidViewportRejected; staticUnboundRejected=$staticUnboundRejected; staticReady=$staticReady; staticWrongAppearanceRejected=$staticWrongAppearanceRejected } | ConvertTo-Json -Depth 8 -Compress
`
		const stdout = execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-STA', '-Command', script], {
			encoding: 'utf8', timeout: 60000, env: { ...process.env, NATIVE_TEST_DIR: dir, NATIVE_TEST_POSTER: source, NATIVE_TEST_STRETCHED: stretched, NATIVE_TEST_NATIVE: native, NATIVE_TEST_BLANK: blank, NATIVE_TEST_PARTIAL: partial },
		})
		const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
		assert.equal(result.stretched.FallbackMatch, true, JSON.stringify(result.stretched))
		assert.equal(result.native.FallbackMatch, false)
		assert.equal(result.blank.Informative, false)
		assert.equal(result.fallbackRejected, true)
		assert.equal(result.fallbackAttempts, 30)
		assert.equal(result.staleSlideRejected, true, 'a native isolated probe must not approve a stale slide-level fallback')
		assert.equal(native3dHydrationProofComplete(result.ready, 1), true)
		assert.ok(result.ready.rejectedFallbackFrames >= 2)
		assert.ok(result.ready.attempts >= 4)
		assert.equal(native3dHydrationProofComplete(result.clippedReady, 1), true)
		assert.equal(result.clippedReady.fullyClippedModelCount, 1)
		assert.equal(result.clippedReady.clippedAbsenceCheck, 'pixel-identical-with-target-hidden')
		for (const key of ['visibilityRestored', 'unexpectedVisibleRejected', 'wrongFrameRejected', 'clippedBlankRejected', 'clippedFallbackRejected', 'partialMatches', 'partialWrongRejected', 'emptyComparisonRejected', 'invalidViewportRejected']) assert.equal(result[key], true, key)
		assert.equal(result.staticUnboundRejected, true)
		assert.equal(native3dStaticAppearanceProofComplete(result.staticReady, 1, 'a'.repeat(64)), true)
		assert.equal(native3dHydrationProofComplete(result.staticReady, 1), false)
		assert.equal(result.staticWrongAppearanceRejected, true)
	} finally { await fs.rm(dir, { recursive: true, force: true }) }
})
