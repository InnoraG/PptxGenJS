import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import JSZip from 'jszip'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const outputDir = path.join(repo, 'outputs', 'kimodo', 'final-presenter-roster-v1', 'zoom-safe-static-gate')
const outputPptx = path.join(outputDir, 'presenter-base-poses.pptx')
const identities = ['joe', 'louise', 'pete']

fs.mkdirSync(outputDir, { recursive: true })
const assets = identities.map(identity => ({
	identity,
	name: identity.slice(0, 1).toUpperCase() + identity.slice(1),
	glb: path.join(here, 'assets', `default-presenter-${identity}.glb`),
	poster: path.join(here, 'assets', `default-presenter-${identity}.png`),
}))
for (const asset of assets) {
	for (const file of [asset.glb, asset.poster]) if (!fs.existsSync(file)) throw new Error(`Missing zoom-safe gate input: ${file}`)
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native 3D visual gate'
pptx.subject = 'Zoom-safe static presenter base-pose proof'
pptx.title = 'Joe, Louise, Pete · static native 3D base poses'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }
const frame = { x: 4.78, y: 1.42, w: 3.72, h: 3.72 }
const viewport = Math.round(frame.h * 1454545 / 1.14)

for (const asset of assets) {
	const slide = pptx.addSlide()
	slide.background = { color: '263B55' }
	slide.addText(`${asset.name} · zoom-safe base pose`, {
		x: 0.45, y: 0.35, w: 6.5, h: 0.48,
		fontFace: 'Aptos Display', fontSize: 23, bold: true, color: 'FFFFFF', margin: 0,
	})
	slide.addText('No scene animation is selected. This is the GLB node pose PowerPoint can reveal while rebuilding the native 3D viewport.', {
		x: 0.48, y: 1.65, w: 3.55, h: 1.5,
		fontFace: 'Aptos', fontSize: 15, color: 'DCEBFA', margin: 0,
	})
	slide.addText('Expected: neutral standing pose · arms lowered · normal proportions · matte material', {
		x: 0.48, y: 4.7, w: 3.55, h: 0.9,
		fontFace: 'Aptos', fontSize: 12, bold: true, color: '8EABC8', margin: 0,
	})
	slide.addShape(pptx.ShapeType.rect, {
		...frame,
		line: { color: '7189A4', width: 1 },
		fill: { color: '1C2D42', transparency: 28 },
	})
	slide.addModel3D({
		glbFile: asset.glb,
		rasterFile: asset.poster,
		...frame,
		objectName: `${asset.identity}-base-pose`,
		altText: `${asset.name} neutral static presenter pose`,
		objViewport: viewport,
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
		trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
		ambientLight: { color: { r: 80000, g: 80000, b: 80000 }, illuminance: 0.5 },
		ptLights: [
			{ color: { r: 100000, g: 75000, b: 50000 }, intensity: 9.765625, pos: { x: 22000000, y: 71000000, z: 16000000 } },
			{ color: { r: 40000, g: 60000, b: 95000 }, intensity: 12.25, pos: { x: -38000000, y: 51000000, z: 58000000 } },
		],
	})
}

await pptx.writeFile({ fileName: outputPptx })
const zip = await JSZip.loadAsync(fs.readFileSync(outputPptx), { checkCRC32: true })
const embeddedNames = Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name))
const embeddedHashes = []
for (const name of embeddedNames) embeddedHashes.push(sha256(await zip.file(name).async('nodebuffer')))
const sourceHashes = assets.map(asset => sha256(fs.readFileSync(asset.glb)))
if (embeddedNames.length !== assets.length || JSON.stringify([...embeddedHashes].sort()) !== JSON.stringify([...sourceHashes].sort())) {
	throw new Error(`Static-gate embedded GLBs drifted: embedded=${JSON.stringify(embeddedHashes)} source=${JSON.stringify(sourceHashes)}`)
}
const report = {
	schemaVersion: 'betterpptx.presenter-zoom-safe-static-gate.v1',
	status: 'PENDING_LIVE_POWERPOINT_REVIEW',
	pptx: { path: outputPptx, bytes: fs.statSync(outputPptx).size, sha256: sha256(fs.readFileSync(outputPptx)), slides: assets.length },
	embeddedModels: embeddedNames.map((name, index) => ({ name, sha256: embeddedHashes[index] })),
	sourceModels: assets.map((asset, index) => ({ identity: asset.identity, path: asset.glb, sha256: sourceHashes[index] })),
}
fs.writeFileSync(path.join(outputDir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
