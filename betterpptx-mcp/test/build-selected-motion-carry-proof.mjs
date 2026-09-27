// Local maintainer fixture: exercise shared selected-motion composition and
// carry staging with caller-supplied prepared bundles. It does not alter source
// assets, select product defaults, certify playback, or automate PowerPoint.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { normalizePresenterPerformance } from '../presenter-performance-contract.mjs'
import { composePresenterPerformance } from '../ir/presenter-performance-composer.mjs'
import { performanceCarryHandSamples } from '../ir/presenter-performance-carry.mjs'
import { expandPresenterPerformances } from '../ir/presenter-director.mjs'

const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
const manifestPath = argument('--manifest'), casesPath = argument('--cases'), outputDir = argument('--outdir')
assert.ok(manifestPath && casesPath && outputDir, 'Supply --manifest, --cases and --outdir.')
const manifest = JSON.parse(await fs.readFile(path.resolve(manifestPath), 'utf8')), cases = JSON.parse(await fs.readFile(path.resolve(casesPath), 'utf8'))
assert.ok(Array.isArray(cases) && cases.length > 0)
const output = path.resolve(outputDir); await fs.mkdir(output, { recursive: true })
const require = createRequire(import.meta.url), PptxGenJS = require('../../dist/pptxgen.cjs.js')
const pptx = new PptxGenJS(), size = { w: 16, h: 9 }
pptx.defineLayout({ name: 'CarryProofWide', width: size.w, height: size.h }); pptx.layout = 'CarryProofWide'
pptx.showSettings = { useTimings: true, showAnimation: true, loop: false, mode: 'present', showMediaControls: false }
pptx.author = 'BetterPPTX'; pptx.title = 'Native selected-motion carry proof'; pptx.subject = 'Editable projected hand-following targets'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const results = [], excerpts = []
for (const [index, item] of cases.entries()) {
	const bundle = manifest.bundles.find(bundle => bundle.identity === item.identity && Object.hasOwn(bundle.motionIdToAnimId, item.motionId))
	assert.ok(bundle, `No prepared bundle contains the requested identity and motion: ${item.identity}/${item.motionId}`)
	const source = await fs.readFile(bundle.glbFile), sourceSha256 = sha(source)
	const actorId = `carrier-${index + 1}`, targetName = `cargo-${index + 1}`
	const authored = { actor: actorId, startMs: 800, blendMs: 0,
		actions: [{ id: 'transfer', motionId: item.motionId, durationMs: item.durationMs }],
		travel: [{ atMs: 0, stage: 'center' }, { atMs: item.grabMs, stage: 'center' }, { atMs: item.dropMs, stage: item.stageTo || 'right' }],
		interactions: [{ actionId: 'transfer', verb: 'carry', target: targetName, hand: item.hand, grabMs: item.grabMs, dropMs: item.dropMs }],
	}
	const performance = normalizePresenterPerformance(authored)
	const composed = composePresenterPerformance({ glbBytes: source, clipMap: bundle.motionIdToAnimId, performance })
	const glbFile = path.join(output, `carry-${index + 1}.glb`); await fs.writeFile(glbFile, composed.glbBytes)
	const hand = performanceCarryHandSamples({ action: composed.report.actions[0], ...performance.interactions[0] })[0].normalizedPosition
	const renderedH = size.h * .46, stageCenter = { x: size.w * .5, y: size.h * .84 - renderedH / 2 }
	const box = { x: stageCenter.x + hand.x * renderedH - .13, y: stageCenter.y + (.5 - hand.yAboveFloor) * renderedH - .13, w: .26, h: .26 }
	const spec = { title: 'Transfer the value', slides: [{ id: `carry-${index + 1}`, content: [{ kind: 'shape', shapeName: 'roundRect', name: targetName, objectName: targetName, bbox: box }] }] }
	const expanded = expandPresenterPerformances(spec, { slideSize: size, performances: [{ slideIndex: 0, performance, actor: { id: actorId, identity: item.identity, stage: 'center', faceRotationY: 0, stageTreatment: 'none' }, handle: `fixture-model-${index + 1}`, report: composed.report }] })
	const slide = pptx.addSlide(); slide.background = { color: '111722' }
	slide.addText('Transfer the value.', { x: .7, y: .45, w: 14.6, h: .7, fontFace: 'Aptos Display', fontSize: 32, bold: true, color: 'F6F3EC', margin: 0 })
	slide.addText('A named editable object follows one selected hand, on its exact clock.', { x: .73, y: 1.25, w: 14.4, h: .4, fontFace: 'Aptos', fontSize: 16, color: 'A6B6C9', margin: 0 })
	slide.addText(`${item.identity.toUpperCase()}  /  ${item.motionId}`, { x: .73, y: 8.3, w: 14.4, h: .3, fontFace: 'Aptos', fontSize: 11, color: 'A6B6C9', margin: 0 })
	const model = expanded.slides[0].content.find(block => block.kind === 'model3d'), prop = expanded.slides[0].content.find(block => block.name === targetName)
	slide.addModel3D({ glbFile, rasterFile: bundle.posterPath, nativeOnly: false, ...model.bbox, objectName: actorId, camera: model.camera, trans: model.trans, objViewport: model.objViewport, scene: model.scene })
	slide.addShape(pptx.ShapeType.roundRect, { ...prop.bbox, objectName: targetName, rectRadius: .04, fill: { color: '55E4CC' }, line: { color: 'B0FFF1', width: 1 } })
	for (const animation of model.animation) slide.addAnimation(actorId, animation)
	for (const animation of prop.animation) slide.addAnimation(targetName, animation)
	slide.transition = { type: 'cut', advanceOnClick: false, advanceAfterTime: performance.startMs + performance.durationMs + 1200 }
	slide.addNotes(`A native 3D performance of ${item.motionId}. The editable target follows its ${item.hand} hand from action-local ${item.grabMs} ms to ${item.dropMs} ms. This demonstrates projected hand-following transport, not rigid-body physics. Native PowerPoint playback still requires visual review.`)
	assert.equal(sha(await fs.readFile(bundle.glbFile)), sourceSha256, 'Source bundle changed during the proof')
	results.push({ ...item, slide: index + 1, sourceSha256, composedSha256: sha(composed.glbBytes), glbFile, timedSegments: prop.animation.length, visibleStageFrame: model._presenterPerformanceEntry?.stageFrame || model.bbox, readback: expanded._presenterPerformancePlan.performances[0], sourceUnchanged: true })
	excerpts.push({ presenter: { id: actorId, identity: item.identity, faceRotationY: 0 }, presenterPerformance: authored, targetName, maintainerFixtureTargetBox: box })
}
const pptxFile = path.join(output, 'selected-motion-carry-proof.pptx')
await pptx.writeFile({ fileName: pptxFile, compression: true })
await fs.writeFile(path.join(output, 'carry-authoring-excerpts.json'), JSON.stringify(excerpts, null, 2))
const report = { schemaVersion: 'betterpptx.selected-motion-carry-proof.v1', status: 'PACKAGE_GENERATED_AWAITING_NATIVE_REVIEW', pptxFile, cases: results, nativePlaybackReviewed: false, sourceAssetsUnchanged: true }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
const oracleManifest = { schemaVersion: 'betterpptx.motion-story-proof.v1', privateMaintainerEvidence: true,
	purpose: 'Selected-motion native carry timing and contact review; this two-case fixture is not a 96-motion coverage claim.',
	pptxPath: pptxFile, sourceSha256: sha(await fs.readFile(pptxFile)), slideSize: size, requireNoManualAdvance: true,
	expectedCatalogCount: results.length, expectedCatalogIds: results.map(item => item.motionId),
	slides: results.map(item => ({ slideIndex: item.slide, title: 'Transfer the value.', motionId: item.motionId, identity: item.identity,
		modelName: item.readback.actor, modelFrame: item.visibleStageFrame, modelSha256: item.composedSha256,
		animationName: 'Continuous presenter performance', animId: 0, startMs: item.readback.startMs, durationMs: item.durationMs,
		dwellMs: item.readback.startMs + item.durationMs + 1200, carry: item.readback.interactions[0], targetName: `cargo-${item.slide}`, timedSegments: item.timedSegments })),
}
await fs.writeFile(path.join(output, 'selected-motion-carry-proof.manifest.json'), JSON.stringify(oracleManifest, null, 2))
console.log(JSON.stringify({ pptxFile, slides: cases.length, cases: results.map(item => ({ identity: item.identity, motionId: item.motionId, timedSegments: item.timedSegments })) }, null, 2))
