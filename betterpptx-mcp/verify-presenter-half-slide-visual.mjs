import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import JSZip from 'jszip'
import { parseGlb } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')

const outputDir = path.resolve(process.env.PRESENTER_HALF_SLIDE_OUT || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'powerpoint-half-slide-gate'))
const louiseGlb = path.resolve(process.env.LOUISE_HALF_SLIDE_GLB || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'louise-half-slide.glb'))
const joeGlb = path.resolve(process.env.JOE_HALF_SLIDE_GLB || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'joe-half-slide.glb'))
const louisePoster = path.resolve(process.env.LOUISE_POSTER || path.join(here, 'assets', 'default-presenter-louise.png'))
const joePoster = path.resolve(process.env.JOE_POSTER || path.join(repo, 'research-demos', '2026-07-10-presenter-roster', 'joe-presenter_front.png'))
const outputPptx = path.join(outputDir, 'presenter-half-slide-powerpoint-gate.pptx')

fs.mkdirSync(outputDir, { recursive: true })
for (const file of [louiseGlb, joeGlb, louisePoster, joePoster]) {
	if (!fs.existsSync(file)) throw new Error(`Missing half-slide visual-gate input: ${file}`)
}

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const assets = [
	{ id: 'louise', label: 'Louise · original persona · 512 px tier', glb: louiseGlb, poster: louisePoster, animId: 13 },
	{ id: 'joe', label: 'Joe · original persona · 512 px tier', glb: joeGlb, poster: joePoster, animId: 0 },
].map(asset => {
	const bytes = fs.readFileSync(asset.glb)
	const parsed = parseGlb(bytes)
	return {
		...asset,
		bytes,
		sha256: sha256(bytes),
		counts: {
			meshes: parsed.json.meshes?.length || 0,
			nodes: parsed.json.nodes?.length || 0,
			skins: parsed.json.skins?.length || 0,
			animations: parsed.json.animations?.length || 0,
		},
	}
})

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native 3D visual gate'
pptx.subject = 'Original-proportion half-slide presenter verification'
pptx.title = 'Louise and Joe · safe half-slide optimization'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const frameH = 3.55
const frameW = 3.55
const frameY = 1.68
const positions = [1.35, 8.43]
const viewport = Math.round(frameH * 1454545 / 1.18)

function addPresenter(slide, asset, x, animated) {
	const objectName = `${asset.id}-${animated ? 'motion' : 'rest'}`
	slide.addShape(pptx.ShapeType.rect, {
		x, y: frameY, w: frameW, h: frameH,
		line: { color: '607A9B', width: 1 },
		fill: { color: '1B2B3F', transparency: 35 },
	})
	slide.addText(asset.label, {
		x: x - 0.05, y: 5.45, w: frameW + 0.1, h: 0.36,
		fontFace: 'Aptos', fontSize: 11, bold: true, align: 'center',
		color: 'EAF2F8', margin: 0,
	})
	slide.addModel3D({
		glbFile: asset.glb,
		rasterFile: asset.poster,
		x, y: frameY, w: frameW, h: frameH,
		objectName,
		altText: asset.label,
		objViewport: viewport,
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
		trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
		ambientLight: { color: { r: 80000, g: 80000, b: 80000 }, illuminance: 0.5 },
		ptLights: [
			{ color: { r: 100000, g: 75000, b: 50000 }, intensity: 9.765625, pos: { x: 22000000, y: 71000000, z: 16000000 } },
			{ color: { r: 40000, g: 60000, b: 95000 }, intensity: 12.25, pos: { x: -38000000, y: 51000000, z: 58000000 } },
		],
		...(animated ? { scene: { animId: asset.animId, loop: true } } : {}),
	})
	if (animated) {
		slide.addAnimation(objectName, {
			type: 'emphasis', effect: 'playScene', animId: asset.animId,
			loop: true, trigger: 'withPrevious', delay: 0, duration: 15000,
		})
	}
}

for (const animated of [false, true]) {
	const slide = pptx.addSlide()
	slide.background = { color: '263B55' }
	slide.addText(animated ? 'MOTION · native skeletal clips · half-slide target' : 'REST · native 3D · half-slide target', {
		x: 0.42, y: 0.28, w: 8.3, h: 0.42,
		fontFace: 'Aptos Display', fontSize: 20, bold: true, color: 'FFFFFF', margin: 0,
	})
	slide.addText('Square PowerPoint frames preserve the fallback poster aspect; viewport metadata fits the live 3D body without rescaling its mesh or rig.', {
		x: 0.42, y: 0.82, w: 12.15, h: 0.46,
		fontFace: 'Aptos', fontSize: 11.5, color: 'C8D6E5', margin: 0,
	})
	assets.forEach((asset, index) => addPresenter(slide, asset, positions[index], animated))
}

await pptx.writeFile({ fileName: outputPptx })

const zip = await JSZip.loadAsync(fs.readFileSync(outputPptx), { checkCRC32: true })
const embedded = []
for (const name of Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name)).sort()) {
	const bytes = await zip.file(name).async('nodebuffer')
	embedded.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
}
const expectedHashes = new Set(assets.map(asset => asset.sha256))
if (embedded.length !== assets.length || embedded.some(item => !expectedHashes.has(item.sha256))) {
	throw new Error(`Unexpected embedded presenter GLB set: ${JSON.stringify(embedded)}`)
}

const report = {
	schemaVersion: 'betterpptx.presenter-half-slide-powerpoint-gate.v1',
	status: 'PENDING_LIVE_POWERPOINT_REVIEW',
	frame: { widthIn: frameW, heightIn: frameH, square: true, objViewport: viewport, viewportMargin: 1.18 },
	assets: assets.map(({ bytes, ...asset }) => ({ ...asset, bytes: bytes.length })),
	pptx: outputPptx,
	embedded,
}
fs.writeFileSync(path.join(outputDir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
