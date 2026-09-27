// IMG4 deterministic evaluator gate. Uses local synthetic fixtures only; no network/GPU.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality, hamming } from './quality/image-quality-gates.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const imagePath = path.join(root, 'deploy', 'image-edit-worker', 'canary-multi-reference.png')
const buffer = fs.readFileSync(imagePath)
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}

console.log('IMG4 DETERMINISTIC IMAGE QUALITY (CPU/offline):')
const positive = await evaluateImageQuality(buffer, {
	aspect: 'square',
	minWidth: 512,
	minHeight: 512,
	focalRegion: { x: 45, y: 8, w: 50, h: 55 },
	quietRegion: { x: 0, y: 0, w: 42, h: 38 },
	noText: true,
	ocr: { status: 'complete', text: '' },
	palette: ['#f5f0e6', '#184d3b', '#de5d48', '#d9a441'],
	minPaletteCoverage: 0.35,
	actualGpuSeconds: 14.967,
	usdPerGpuSecond: 0.000542,
	costCeilingUsd: 0.10,
})
const singleBuffer = fs.readFileSync(path.join(root, 'deploy', 'image-edit-worker', 'canary-output.png'))
const single = await evaluateImageQuality(singleBuffer, { aspect: 'square' })
const nativeLandscape = await sharp({ create: { width: 1280, height: 768, channels: 3, background: '#203040' } }).composite([{ input: Buffer.from('<svg width="1280" height="768"><circle cx="900" cy="360" r="220" fill="#d9a441"/></svg>'), blend: 'over' }]).png().toBuffer()
const nativeLandscapeQuality = await evaluateImageQuality(nativeLandscape, { aspect: 'landscape', minEntropy: 0.3, minStdev: 2 })
ok('owned-synthetic multi-reference output passes deterministic geometry/content gates', positive.status === 'pass')
ok('payload, dimensions, aspect and minimum resolution pass', positive.checks.validPayload && positive.checks.dimensionsPresent && positive.checks.requestedAspectHonored && positive.checks.minimumResolution)
ok('minimum visual information passes', positive.checks.minimumVisualInformation)
ok('deterministic focus metric is present and finite', Number.isFinite(positive.measurements.sharpness) && positive.measurements.sharpness >= 0)
ok('focal and quiet-space regions pass the declared slide frame', positive.checks.focalRegionPresent && positive.checks.quietSpace)
ok('declared World palette is represented in the output', positive.checks.paletteCompatible && positive.measurements.paletteCoverage >= 0.35)
ok('completed empty OCR result passes no-text hard gate', positive.checks.ocrCompleted && positive.checks.noReadableText)
ok('actual GPU cost stays within the accepted ceiling', positive.checks.costWithinCeiling && positive.measurements.actualGpuCostUsd === 0.00811211)

const ocrMissing = await evaluateImageQuality(buffer, { aspect: 'square', noText: true })
ok('no-text gate fails closed when OCR did not run', ocrMissing.status === 'fail' && ocrMissing.blockingIssues.includes('OCRCOMPLETED'))
const duplicate = await evaluateImageQuality(buffer, { aspect: 'square', existingHashes: [positive.measurements.averageHash] })
ok('duplicate gate rejects an identical perceptual hash', duplicate.status === 'fail' && duplicate.blockingIssues.includes('NOTDUPLICATE'))
ok('perceptual hash distance is deterministic', hamming(positive.measurements.averageHash, positive.measurements.averageHash) === 0)
ok('distinct accepted canary visuals are not falsely identical', hamming(positive.measurements.averageHash, single.measurements.averageHash) > 4)
ok('landscape alias matches the generator native 1280×768 canvas', nativeLandscapeQuality.checks.requestedAspectHonored === true)

const blank = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' } }).png().toBuffer()
const blankResult = await evaluateImageQuality(blank, { aspect: 'square', minEntropy: 1.2, minStdev: 4 })
ok('seeded blank negative fails visual-information gate', blankResult.status === 'fail' && blankResult.blockingIssues.includes('MINIMUMVISUALINFORMATION'))
const wrongAspect = await evaluateImageQuality(buffer, { aspect: 'wide' })
ok('seeded wrong-aspect negative fails aspect gate', wrongAspect.status === 'fail' && wrongAspect.blockingIssues.includes('REQUESTEDASPECTHONORED'))
const wrongPalette = await evaluateImageQuality(buffer, { aspect: 'square', palette: ['#101010', '#202020'], minPaletteCoverage: 0.7, paletteDistance: 20 })
ok('seeded incompatible palette fails the palette gate', wrongPalette.status === 'fail' && wrongPalette.blockingIssues.includes('PALETTECOMPATIBLE'))
const blurredBuffer = await sharp(buffer).blur(8).png().toBuffer()
const blurred = await evaluateImageQuality(blurredBuffer, { aspect: 'square' })
ok('focus metric ranks the sharper raster above a blurred raster', positive.measurements.sharpness > blurred.measurements.sharpness)

const cutout = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 24, g: 77, b: 59, alpha: 0 } } }).composite([{ input: Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="92" fill="#de5d48"/></svg>'), blend: 'over' }]).png().toBuffer()
const cutoutResult = await evaluateImageQuality(cutout, { aspect: 'square', cutout: true, minWidth: 128, minHeight: 128, minEntropy: 0.5 })
ok('transparent synthetic cutout passes alpha topology', cutoutResult.status === 'pass' && cutoutResult.measurements.alphaCoverage > 0.01 && cutoutResult.measurements.alphaCoverage < 0.995)
const opaqueCutout = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#de5d48' } }).png().toBuffer()
const opaqueResult = await evaluateImageQuality(opaqueCutout, { aspect: 'square', cutout: true, minWidth: 128, minHeight: 128 })
ok('opaque seeded negative fails cutout alpha gate', opaqueResult.status === 'fail' && opaqueResult.blockingIssues.includes('ALPHAINTEGRITY'))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
