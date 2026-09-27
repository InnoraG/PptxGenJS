import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import JSZip from 'jszip'
import { inspectMaterialProfile } from './assets/glb-material-profile.mjs'
import { parseGlb } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')

const outputDir = path.resolve(process.env.LOUISE_PARITY_VISUAL_OUT || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'mixamo-parity-powerpoint-gate'))
const sourceSpecularGlb = path.resolve(process.env.LOUISE_SOURCE_SPECULAR_GLB || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'louise-mixamo-parity-source-specular-512.glb'))
const strictMatteGlb = path.resolve(process.env.LOUISE_STRICT_MATTE_GLB || path.join(repo, 'outputs', 'kimodo', 'louise-original-preserved-v3', 'louise-mixamo-parity-strict-matte-512.glb'))
const poster = path.resolve(process.env.LOUISE_POSTER || path.join(here, 'assets', 'default-presenter-louise.png'))
const outputPptx = path.join(outputDir, 'louise-mixamo-parity-powerpoint-gate.pptx')

fs.mkdirSync(outputDir, { recursive: true })
for (const file of [sourceSpecularGlb, strictMatteGlb, poster]) {
	if (!fs.existsSync(file)) throw new Error(`Missing Louise parity visual-gate input: ${file}`)
}

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const variants = [
	{
		id: 'source-specular',
		label: 'SOURCE-AWARE · dielectric fabric · low Mixamo specular retained',
		glb: sourceSpecularGlb,
		expectSpecular: true,
	},
	{
		id: 'strict-matte',
		label: 'STRICT MATTE · dielectric fabric · PowerPoint-safe',
		glb: strictMatteGlb,
		expectSpecular: false,
	},
].map(variant => {
	const bytes = fs.readFileSync(variant.glb)
	const parsed = parseGlb(bytes)
	const materials = inspectMaterialProfile(bytes)
	if (!materials.length || materials.some(material =>
		material.metallicFactor !== 0 ||
		material.roughnessFactor !== 1 ||
		material.hasMetallicRoughnessTexture ||
		material.hasSpecularExtension !== variant.expectSpecular
	)) throw new Error(`Unexpected ${variant.id} material profile: ${JSON.stringify(materials)}`)
	const channelTargets = (parsed.json.animations || []).map(animation =>
		(animation.channels || []).reduce((counts, channel) => {
			const target = channel.target?.path || 'unknown'
			counts[target] = (counts[target] || 0) + 1
			return counts
		}, {})
	)
	if (!channelTargets.length || channelTargets.some(counts =>
		(counts.translation || 0) !== 0 || (counts.scale || 0) !== 0 || (counts.rotation || 0) < 1
	)) throw new Error(`${variant.id} contains unsafe animation translation/scale channels.`)
	return {
		...variant,
		bytes,
		sha256: sha256(bytes),
		materials,
		counts: {
			meshes: parsed.json.meshes?.length || 0,
			nodes: parsed.json.nodes?.length || 0,
			skins: parsed.json.skins?.length || 0,
			animations: parsed.json.animations?.length || 0,
		},
		channelTargets,
	}
})

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native 3D visual gate'
pptx.subject = 'Louise Mixamo material and original-proportion verification'
pptx.title = 'Louise · Mixamo parity · PowerPoint-safe'
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const frame = { x: 4.86, y: 1.25, w: 3.9, h: 3.9 }
const viewport = Math.round(frame.h * 1454545 / 1.18)
const cases = variants.flatMap(variant => [
	{ variant, mode: 'rest', animId: null, label: 'REST / ORIGINAL PROPORTIONS' },
	{ variant, mode: 'motion', animId: variant.id === 'strict-matte' ? 5 : 13, label: variant.id === 'strict-matte' ? 'MOTION / REACH HIGH RIGHT' : 'MOTION / BREATHING IDLE' },
])

for (const [index, item] of cases.entries()) {
	const slide = pptx.addSlide()
	slide.background = { color: 'E8EFF5' }
	slide.addText('Louise · Mixamo parity', {
		x: 0.48, y: 0.34, w: 5.2, h: 0.52,
		fontFace: 'Aptos Display', fontSize: 24, bold: true, color: '102235', margin: 0,
	})
	slide.addText(item.variant.label, {
		x: 0.5, y: 1.31, w: 3.75, h: 0.74,
		fontFace: 'Aptos', fontSize: 15, bold: true, color: item.variant.id === 'strict-matte' ? '075985' : '334155', margin: 0,
		breakLine: false,
	})
	slide.addText(item.label, {
		x: 0.5, y: 2.27, w: 3.65, h: 0.38,
		fontFace: 'Aptos', fontSize: 12, bold: true, color: '475569', margin: 0,
	})
	slide.addText('Geometry, skin, skeleton, and original node transforms are preserved. Motion clips contain joint rotation only—no bone translation or scale.', {
		x: 0.5, y: 2.87, w: 3.65, h: 1.32,
		fontFace: 'Aptos', fontSize: 12, color: '475569', margin: 0.02, breakLine: false,
	})
	slide.addText('Native PowerPoint 3D · square half-slide frame', {
		x: 0.5, y: 5.66, w: 4.1, h: 0.38,
		fontFace: 'Aptos', fontSize: 11.5, bold: true, color: '64748B', margin: 0,
	})
	slide.addShape(pptx.ShapeType.rect, {
		...frame,
		line: { color: 'B5C5D5', width: 1 },
		fill: { color: 'DCE7EF', transparency: 6 },
	})
	const objectName = `louise-${item.variant.id}-${item.mode}-${index + 1}`
	slide.addModel3D({
		glbFile: item.variant.glb,
		rasterFile: poster,
		...frame,
		objectName,
		altText: `${item.variant.label}; ${item.label}`,
		objViewport: viewport,
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
		trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
		ambientLight: { color: { r: 100000, g: 100000, b: 100000 }, illuminance: 0.75 },
		ptLights: [
			{ color: { r: 100000, g: 100000, b: 100000 }, intensity: 5.5, pos: { x: 24000000, y: 56000000, z: 36000000 } },
			{ color: { r: 85000, g: 90000, b: 100000 }, intensity: 3.25, pos: { x: -34000000, y: 42000000, z: 48000000 } },
		],
		...(Number.isInteger(item.animId) ? { scene: { animId: item.animId, loop: true } } : {}),
	})
	if (Number.isInteger(item.animId)) {
		slide.addAnimation(objectName, {
			type: 'emphasis', effect: 'playScene', animId: item.animId,
			loop: true, trigger: 'withPrevious', delay: 0, duration: 20000,
		})
	}
}

await pptx.writeFile({ fileName: outputPptx })

const zip = await JSZip.loadAsync(fs.readFileSync(outputPptx), { checkCRC32: true })
const embedded = []
for (const name of Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name)).sort()) {
	const bytes = await zip.file(name).async('nodebuffer')
	embedded.push({ name, bytes: bytes.length, sha256: sha256(bytes) })
}
const expected = new Set(variants.map(variant => variant.sha256))
if (embedded.length !== variants.length || embedded.some(item => !expected.has(item.sha256))) {
	throw new Error(`Unexpected embedded Louise GLB set: ${JSON.stringify(embedded)}`)
}

const report = {
	schemaVersion: 'betterpptx.louise-mixamo-parity-powerpoint-gate.v1',
	status: 'PENDING_LIVE_POWERPOINT_REVIEW',
	frame: { ...frame, square: true, objViewport: viewport, target: 'approximately half slide height' },
	variants: variants.map(({ bytes, ...variant }) => ({ ...variant, bytes: bytes.length })),
	cases: cases.map(({ variant, ...item }) => ({ ...item, variant: variant.id })),
	pptx: outputPptx,
	embedded,
}
fs.writeFileSync(path.join(outputDir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
