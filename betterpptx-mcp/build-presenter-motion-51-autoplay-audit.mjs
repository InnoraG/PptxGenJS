#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import PptxGenJS from '../dist/pptxgen.cjs.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const assets = path.join(here, 'assets')

const valueAfter = flag => {
	const index = process.argv.indexOf(flag)
	return index >= 0 ? process.argv[index + 1] : null
}

const manifestPath = path.resolve(valueAfter('--manifest') || path.join(repo, 'outputs', 'mixamo', 'presenter-motion-51-source-first', 'source-first-manifest.json'))
const outputPath = path.resolve(valueAfter('--output') || path.join(repo, 'outputs', 'mixamo', 'presenter-motion-autoplay-audit', 'all-presenters-all-51-motions-mixamo-only-autoplay.pptx'))
const requestedSlides = String(valueAfter('--slides') || '').split(',')
	.map(value => value.trim())
	.filter(Boolean)
	.map(Number)
	.filter(Number.isInteger)
const autoplayEnabled = !process.argv.includes('--no-autoplay')
const preRollMs = Number(valueAfter('--preroll-ms') || 800)
if (!Number.isFinite(preRollMs) || preRollMs < 0) throw new Error(`invalid --preroll-ms value: ${preRollMs}`)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const motions = requestedSlides.length
	? requestedSlides.map(index => manifest.motions.find(motion => motion.index === index)).filter(Boolean)
	: manifest.motions
const identities = ['joe', 'louise', 'pete']
const labels = { joe: 'JOE', louise: 'LOUISE', pete: 'PETE' }
const modelByBank = new Map(manifest.models.map(model => [`${model.bank}:${model.identity}`, model.path]))
const posterByIdentity = Object.fromEntries(identities.map(identity => [identity, manifest.posters?.[identity] || path.join(assets, `default-presenter-${identity}.png`)]))

const C = {
	white: 'FFFFFF', ink: '0B1425', navy: '516179', blue: '448CFF', violet: '7657E8',
	panel: 'EAF4FB', border: 'B9C4D0', rule: 'AAB5C4',
}

const titleCase = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
const sourceColor = provider => provider === 'mixamo' ? C.blue : C.violet

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.author = 'BetterPPTX'
pptx.company = 'BetterPPTX'
pptx.subject = 'Native PowerPoint 3D presenter motion visual audit'
pptx.title = 'Joe, Louise, and Pete — 51 motion autoplay audit'
pptx.lang = 'en-US'
pptx.theme = {
	headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US',
	fontFace: 'Aptos',
}
pptx.showSettings = { useTimings: true, showAnimation: true, loop: true, mode: 'present', showMediaControls: false }

for (const motion of motions) {
	const slide = pptx.addSlide()
	slide.background = { color: C.white }
	const displayName = titleCase(motion.displayName || motion.motionId)
	const source = String(motion.sourceLabel || `SOURCE · ${String(motion.provider || '').toUpperCase()}`)
	const durationSec = (Number(motion.durationMs) / 1000).toFixed(1)
	const family = motion.family === 'ordinary' ? 'MIXAMO PRESENTER' : (motion.provider === 'mixamo' ? 'MIXAMO KINETIC' : 'KIMODO CUSTOM')
	const pageLabel = `${motion.index} / ${manifest.motions.length}`

	slide.addText(`${String(motion.index).padStart(2, '0')} · ${displayName}`, {
		x: 0.55, y: 0.22, w: 9.6, h: 0.58, margin: 0, fontFace: 'Aptos Display', fontSize: 25,
		bold: true, color: '000000', breakLine: false,
	})
	slide.addText(pageLabel, { x: 11.45, y: 0.3, w: 1.25, h: 0.28, margin: 0, fontSize: 13, bold: true, align: 'right', color: C.navy })
	slide.addText(`${family} · ${durationSec} SEC · AUTOPLAY · ${source}`, {
		x: 0.56, y: 1.02, w: 10.6, h: 0.34, margin: 0, fontSize: 13.5, bold: true, color: sourceColor(motion.provider),
	})
	slide.addShape(pptx.ShapeType.line, { x: 0.43, y: 1.34, w: 12.35, h: 0, line: { color: C.rule, width: 1 } })

	const cards = [0.57, 4.84, 9.11]
	for (let identityIndex = 0; identityIndex < identities.length; identityIndex += 1) {
		const identity = identities[identityIndex]
		const x = cards[identityIndex]
		slide.addText(labels[identity], { x, y: 1.48, w: 3.65, h: 0.26, margin: 0, align: 'center', fontSize: 13.5, bold: true, color: C.navy })
		slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.71, w: 3.65, h: 4.9, rectRadius: 0.06, fill: { color: C.panel }, line: { color: C.border, width: 1 } })
		const glbFile = motion.bank === 'ordinary'
			? manifest.ordinaryModels[identity]
			: modelByBank.get(`${motion.bank}:${identity}`)
		if (!glbFile || !fs.existsSync(glbFile)) throw new Error(`missing model for ${motion.bank}/${identity}: ${glbFile}`)
		const objectName = `${identity}-${motion.motionId}`
		slide.addModel3D({
			glbFile,
			rasterFile: posterByIdentity[identity],
			x: x + 0.08, y: 1.8, w: 3.49, h: 4.68,
			trans: { rot: {} },
			objectName,
			description: `${labels[identity]} performing ${displayName}; ${source}; actual take ${motion.sourceTake || motion.sourceSlug || motion.motionId}`,
			scene: { animId: motion.animId, length: motion.durationMs, loop: false },
		})
		if (autoplayEnabled) {
			slide.addAnimation(objectName, {
				type: 'emphasis', effect: 'playScene', animId: motion.animId,
				duration: motion.durationMs, loop: false, delay: preRollMs,
				trigger: identityIndex === 0 ? 'afterPrevious' : 'withPrevious',
			})
		}
	}

	slide.addShape(pptx.ShapeType.line, { x: 0.43, y: 6.97, w: 12.35, h: 0, line: { color: C.rule, width: 1 } })
	slide.addText('ONE COMPLETE CLIP PER SLIDE · NATIVE POWERPOINT 3D · NO T-POSE BOUNDARY KEYS', {
		x: 0.55, y: 7.15, w: 7.9, h: 0.2, margin: 0, fontSize: 8.4, bold: true, color: C.navy,
	})
	const sourceTake = motion.sourceTake || titleCase(motion.sourceSlug || motion.motionId)
	slide.addText(`${displayName} · ${sourceTake}${motion.inPlace === false ? ' · ROOT MOTION PRESERVED' : ''}`, {
		x: 8.5, y: 7.13, w: 4.25, h: 0.22, margin: 0, fontSize: 8.4, align: 'right', color: C.navy,
	})
	slide.addNotes(`Motion ${motion.index}: ${displayName}\nProvider: ${motion.provider}\nSource take: ${sourceTake}\nSource FBX: ${motion.sourceFbx || 'not recorded'}\nQualifier: ${motion.qualifier || ''}\nDuration: ${motion.durationMs} ms`)
	// Audit playback must never cross-fade two native 3D scenes: on sub-second
	// clips the overlap looks like vibration or a static double body. A cut keeps
	// the complete authored motion visible while retaining automatic advance.
	slide.transition = { type: 'cut', advanceOnClick: true, advanceAfterTime: preRollMs + Number(motion.durationMs) + 700 }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
await pptx.writeFile({ fileName: outputPath, compression: true })
const report = {
	status: 'PASS', outputPath, manifestPath, slides: motions.map(motion => motion.index),
	models: motions.length * identities.length, autoplayEnabled, preRollMs, providerCounts: manifest.providerCounts,
}
fs.writeFileSync(`${outputPath}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
