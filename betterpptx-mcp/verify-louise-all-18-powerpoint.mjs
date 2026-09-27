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
const clipContractPath = path.resolve(process.env.PRESENTER_CLIP_CONTRACT || path.join(here, 'deploy', 'model3d-worker', 'canonical', 'canonical-clipmap.json'))
const clipContract = JSON.parse(fs.readFileSync(clipContractPath, 'utf8'))
const contractClipNames = Array.isArray(clipContract.clipNames)
	? clipContract.clipNames
	: (clipContract.slots || []).map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`)

const identity = String(process.env.PRESENTER_ALL18_IDENTITY || 'louise').trim().toLowerCase()
const actorName = String(process.env.PRESENTER_ACTOR_NAME || `${identity.slice(0, 1).toUpperCase()}${identity.slice(1)}`)
const outputDir = path.resolve(process.env.PRESENTER_ALL18_OUT || process.env.LOUISE_ALL18_OUT || path.join(repo, 'outputs', 'kimodo', `${identity}-original-preserved`, 'all-18-powerpoint-final'))
const glbPath = path.resolve(process.env.PRESENTER_ALL18_GLB || process.env.LOUISE_ALL18_GLB || path.join(here, 'assets', `default-presenter-${identity}.glb`))
const posterPath = path.resolve(process.env.PRESENTER_ALL18_POSTER || process.env.LOUISE_ALL18_POSTER || path.join(here, 'assets', `default-presenter-${identity}.png`))
const outputPptx = path.join(outputDir, 'clip-timelines.pptx')
fs.mkdirSync(outputDir, { recursive: true })
for (const file of [glbPath, posterPath]) if (!fs.existsSync(file)) throw new Error(`Missing ${actorName} all-18 input: ${file}`)

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const bytes = fs.readFileSync(glbPath)
const parsed = parseGlb(bytes)
const animations = parsed.json.animations || []
const expectedClipCount = contractClipNames.length
if (animations.length !== expectedClipCount) throw new Error(`Expected ${expectedClipCount} ${actorName} animations, found ${animations.length}`)
const animationNames = animations.map(animation => animation.name)
if (JSON.stringify(animationNames) !== JSON.stringify(contractClipNames)) {
	throw new Error(`${actorName} clip order drift: ${JSON.stringify(animationNames)}`)
}
const nativeAnimationDurationsMs = animations.map(animation => Math.round(1000 * Math.max(0, ...(
	animation.samplers || []
).map(sampler => Number(parsed.json.accessors?.[sampler.input]?.max?.[0] || 0)))))
const fixedDurationMs = Number(process.env.PRESENTER_DURATION_MS || 0)
const playbackDurationsMs = nativeAnimationDurationsMs.map(durationMs => fixedDurationMs > 0 ? fixedDurationMs : durationMs)
if (playbackDurationsMs.some(durationMs => !Number.isFinite(durationMs) || durationMs <= 0)) {
	throw new Error(`${actorName} animation duration drift: ${JSON.stringify(playbackDurationsMs)}`)
}
const channelTargets = animations.map(animation =>
	(animation.channels || []).reduce((counts, channel) => {
		const target = channel.target?.path || 'unknown'
		counts[target] = (counts[target] || 0) + 1
		return counts
	}, {})
)
const expectedChannels = {
	rotation: Number(process.env.PRESENTER_EXPECT_ROTATION_CHANNELS || (identity === 'joe' ? 65 : 22)),
	translation: Number(process.env.PRESENTER_EXPECT_TRANSLATION_CHANNELS || (identity === 'joe' ? 65 : 0)),
	scale: Number(process.env.PRESENTER_EXPECT_SCALE_CHANNELS || (identity === 'joe' ? 65 : 0)),
}
if (channelTargets.some(counts =>
	(counts.rotation || 0) !== expectedChannels.rotation ||
	(counts.translation || 0) !== expectedChannels.translation ||
	(counts.scale || 0) !== expectedChannels.scale
)) throw new Error(`${actorName} animation channel profile drift: expected=${JSON.stringify(expectedChannels)} actual=${JSON.stringify(channelTargets)}`)
const materials = inspectMaterialProfile(bytes)
const requireStrictMatte = ['1', 'true', 'yes', 'on'].includes(String(process.env.PRESENTER_REQUIRE_STRICT_MATTE || (identity === 'louise' ? '1' : '')).trim().toLowerCase())
if (requireStrictMatte && (!materials.length || materials.some(material =>
	material.metallicFactor !== 0 || material.roughnessFactor !== 1 || material.hasMetallicRoughnessTexture || material.hasSpecularExtension
))) throw new Error(`${actorName} all-18 model is not strict matte: ${JSON.stringify(materials)}`)
if (!requireStrictMatte && identity === 'joe' && (!materials.length || materials.some(material =>
	material.metallicFactor !== 0 || material.roughnessFactor !== 1 || material.hasMetallicRoughnessTexture
))) throw new Error(`${actorName} source material response drift: ${JSON.stringify(materials)}`)

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX native 3D visual gate'
pptx.subject = `${actorName} original-proportion ${expectedClipCount}-clip PowerPoint proof`
pptx.title = `${actorName} · ${expectedClipCount} presenter motions · PowerPoint-safe`
pptx.company = 'BetterPPTX'
pptx.lang = 'en-US'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }

const frame = { x: 4.78, y: 1.42, w: 3.72, h: 3.72 }
const viewport = Math.round(frame.h * 1454545 / 1.14)
for (let animId = 0; animId < animations.length; animId++) {
	const slide = pptx.addSlide()
	slide.background = { color: '263B55' }
	const clipName = animationNames[animId]
	slide.addText(`${actorName} · native presenter motion`, {
		x: 0.45, y: 0.35, w: 6.4, h: 0.48,
		fontFace: 'Aptos Display', fontSize: 23, bold: true, color: 'FFFFFF', margin: 0,
	})
	slide.addText(`${String(animId).padStart(2, '0')}  ${clipName.replaceAll('_', ' ')}`, {
		x: 0.48, y: 1.52, w: 3.55, h: 0.78,
		fontFace: 'Aptos', fontSize: 18, bold: true, color: 'DCEBFA', margin: 0,
		breakLine: false,
	})
	slide.addText(process.env.PRESENTER_MOTION_DESCRIPTION || (requireStrictMatte
		? 'Strict matte · original Mixamo proportions · joint rotations only'
		: 'Source-preserved material · original proportions · native same-rig animation channels'), {
		x: 0.48, y: 2.63, w: 3.5, h: 1.08,
		fontFace: 'Aptos', fontSize: 12.5, color: 'BBD0E4', margin: 0,
	})
	slide.addText('Native PowerPoint 3D · half-slide display tier', {
		x: 0.48, y: 5.63, w: 3.8, h: 0.36,
		fontFace: 'Aptos', fontSize: 11, bold: true, color: '8EABC8', margin: 0,
	})
	slide.addShape(pptx.ShapeType.rect, {
		...frame,
		line: { color: '7189A4', width: 1 },
		fill: { color: '1C2D42', transparency: 28 },
	})
	const objectName = `${identity}-clip-${animId}`
	slide.addModel3D({
		glbFile: glbPath,
		rasterFile: posterPath,
		...frame,
		objectName,
		altText: `${actorName} presenter motion ${clipName}`,
		objViewport: viewport,
		camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
		trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
		ambientLight: { color: { r: 80000, g: 80000, b: 80000 }, illuminance: 0.5 },
		ptLights: [
			{ color: { r: 100000, g: 75000, b: 50000 }, intensity: 9.765625, pos: { x: 22000000, y: 71000000, z: 16000000 } },
			{ color: { r: 40000, g: 60000, b: 95000 }, intensity: 12.25, pos: { x: -38000000, y: 51000000, z: 58000000 } },
		],
		scene: { animId, loop: true },
	})
	slide.addAnimation(objectName, {
		type: 'emphasis', effect: 'playScene', animId,
		loop: true, trigger: 'withPrevious', delay: 0, duration: playbackDurationsMs[animId],
	})
}

await pptx.writeFile({ fileName: outputPptx })
const zip = await JSZip.loadAsync(fs.readFileSync(outputPptx), { checkCRC32: true })
const embeddedModels = Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name))
if (embeddedModels.length !== 1) throw new Error(`Expected one deduplicated ${actorName} GLB, found ${embeddedModels.length}`)
const embedded = await zip.file(embeddedModels[0]).async('nodebuffer')
if (sha256(embedded) !== sha256(bytes)) throw new Error(`Embedded ${actorName} GLB hash mismatch`)

const report = {
	schemaVersion: 'betterpptx.presenter-all-18-powerpoint-gate.v2',
	status: 'PENDING_LIVE_POWERPOINT_REVIEW',
	identity,
	model: { path: glbPath, bytes: bytes.length, sha256: sha256(bytes) },
	poster: { path: posterPath, bytes: fs.statSync(posterPath).size, sha256: sha256(fs.readFileSync(posterPath)) },
	frame: { ...frame, square: true, objViewport: viewport, target: 'half-slide display' },
	materials,
	animationNames,
	nativeAnimationDurationsMs,
	playbackDurationsMs,
	channelTargets,
	expectedChannels,
	clipContractPath,
	pptx: { path: outputPptx, bytes: fs.statSync(outputPptx).size, sha256: sha256(fs.readFileSync(outputPptx)), slides: expectedClipCount },
	embeddedModel: { name: embeddedModels[0], bytes: embedded.length, sha256: sha256(embedded) },
}
fs.writeFileSync(path.join(outputDir, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
