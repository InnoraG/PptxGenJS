import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { inspectMaterialProfile } from './assets/glb-material-profile.mjs'
import { parseGlb } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const repo = path.resolve(here, '..')
const outputDir = path.resolve(process.env.LOUISE_VISUAL_OUT || path.join(repo, 'outputs', 'kimodo', 'louise-original-lineage-matte-trs-v1', 'powerpoint-visual-gate'))
const originalGlb = path.resolve(process.env.LOUISE_ORIGINAL_GLB || path.join(here, 'assets', 'default-presenter-louise.glb'))
const candidateGlb = path.resolve(process.env.LOUISE_CANDIDATE_GLB || path.join(repo, 'outputs', 'kimodo', 'louise-original-lineage-matte-trs-v1', 'louise-original-lineage-matte-kimodo-trs-candidate.glb'))
const poster = path.resolve(process.env.LOUISE_POSTER || path.join(here, 'assets', 'default-presenter-louise.png'))
const outputPptx = path.join(outputDir, 'louise-matte-kimodo-visual-gate.pptx')
const skipControl = process.env.LOUISE_SKIP_CONTROL === '1'

fs.mkdirSync(outputDir, { recursive: true })
for (const file of [originalGlb, candidateGlb, poster]) {
	if (!fs.existsSync(file)) throw new Error(`Missing Louise visual-gate input: ${file}`)
}

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const originalBytes = fs.readFileSync(originalGlb)
const candidateBytes = fs.readFileSync(candidateGlb)
const originalAnimationCount = parseGlb(originalBytes).json.animations?.length || 0
const candidateMaterials = inspectMaterialProfile(candidateBytes)
if (!candidateMaterials.length || candidateMaterials.some(material =>
	material.metallicFactor !== 0 || material.roughnessFactor !== 1 || material.hasMetallicRoughnessTexture || material.hasSpecularExtension
)) throw new Error('Louise candidate is not structurally matte.')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native 3D visual gate'
pptx.subject = 'Marker-free Louise mesh and matte verification'
pptx.title = 'Louise original lineage · matte Kimodo visual gate'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = {
	headFontFace: 'Aptos Display',
	bodyFontFace: 'Aptos',
	lang: 'en-US',
}

const cases = [
	...(!skipControl ? [{ label: originalAnimationCount ? 'CONTROL · original Louise · idle' : 'CONTROL · original Louise · static base', glb: originalGlb, animId: originalAnimationCount ? 0 : null }] : []),
	{ label: 'CANDIDATE · matte Louise · breathing idle', glb: candidateGlb, animId: 13 },
	{ label: 'CANDIDATE · matte Louise · reach high right', glb: candidateGlb, animId: 5 },
	{ label: 'CANDIDATE · matte Louise · walk turn', glb: candidateGlb, animId: 12 },
]

for (const [index, item] of cases.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: '263B55' }
	slide.addText(item.label, {
		x: 0.35, y: 0.18, w: 6.8, h: 0.35,
		fontFace: 'Aptos', fontSize: 13, bold: true, color: 'EAF2F8',
		margin: 0, breakLine: false,
	})
	const name = `louise-visual-gate-${index + 1}`
	slide.addModel3D({
		glbFile: item.glb,
		rasterFile: poster,
		x: 4.5, y: 0.35, w: 4.35, h: 6.85,
		objectName: name,
		altText: item.label,
		objViewport: 9963633,
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 2700000 },
		trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
		ambientLight: { color: { r: 80000, g: 80000, b: 80000 }, illuminance: 0.5 },
		ptLights: [
			{ color: { r: 100000, g: 75000, b: 50000 }, intensity: 9.765625, pos: { x: 22000000, y: 71000000, z: 16000000 } },
			{ color: { r: 40000, g: 60000, b: 95000 }, intensity: 12.25, pos: { x: -38000000, y: 51000000, z: 58000000 } },
			{ color: { r: 87000, g: 73000, b: 100000 }, intensity: 3.125, pos: { x: -38000000, y: 58000000, z: -35000000 } },
		],
		...(Number.isInteger(item.animId) ? { scene: { animId: item.animId, loop: true } } : {}),
	})
	if (Number.isInteger(item.animId)) {
		slide.addAnimation(name, {
			type: 'emphasis', effect: 'playScene', animId: item.animId,
			loop: true, trigger: 'withPrevious', delay: 0, duration: 9000,
		})
	}
}

await pptx.writeFile({ fileName: outputPptx })

const packageZip = await JSZip.loadAsync(fs.readFileSync(outputPptx), { checkCRC32: true })
const embeddedGlbs = []
for (const name of Object.keys(packageZip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name)).sort()) {
	const bytes = await packageZip.file(name).async('nodebuffer')
	embeddedGlbs.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
}
const expectedHashes = new Set([sha256(originalBytes), sha256(candidateBytes)])
if (!embeddedGlbs.length || embeddedGlbs.some(item => !expectedHashes.has(item.sha256))) {
	throw new Error(`PowerPoint package embedded an unexpected GLB: ${JSON.stringify(embeddedGlbs)}`)
}

const report = {
	schemaVersion: 'betterpptx.louise-kimodo-matte-visual-gate.v1',
	status: 'PENDING_LIVE_POWERPOINT_REVIEW',
	markerFree: true,
	skipControl,
	background: '263B55',
	inputs: {
		original: { path: originalGlb, bytes: originalBytes.length, sha256: sha256(originalBytes) },
		candidate: { path: candidateGlb, bytes: candidateBytes.length, sha256: sha256(candidateBytes) },
		poster,
	},
	candidateMaterials,
	pptx: outputPptx,
	embeddedGlbs,
	cases,
}
fs.writeFileSync(path.join(outputDir, 'visual-gate-build-report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
