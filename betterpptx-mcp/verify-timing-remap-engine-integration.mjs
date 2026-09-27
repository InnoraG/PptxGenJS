#!/usr/bin/env node
// White-box integration test for the engine-level smart-remap path:
// import (manifest capture) -> simulate object regenerate (spid lost) ->
// finalizeSlideShapeIds -> applySmartTimingRemap -> serialize, asserting the
// preserved native timing now targets the regenerated object's frozen spid.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import {
	callBetterPptxTool,
	getSlide,
	applySmartTimingRemap,
} from './engine.mjs'

process.env.BETTERPPTX_FORCE_PLAN = 'premium'

let failures = 0
const check = (label, cond, detail) => {
	if (cond) { console.log(`  ok  ${label}`); return }
	failures++
	console.error(`  FAIL ${label}`)
	if (detail !== undefined) console.error('       ' + JSON.stringify(detail).slice(0, 600))
}
const data = r => { if (!r?.ok) { console.error('tool failed', JSON.stringify(r).slice(0, 800)); process.exit(1) } return r.data }

async function slideTimingXml(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const f = zip.file('ppt/slides/slide1.xml')
	const xml = f ? await f.async('string') : ''
	const m = xml.match(/<p:timing[\s\S]*?<\/p:timing>/)
	return m ? m[0] : ''
}
function spidsIn(xml) {
	return [...String(xml).matchAll(/\bspid\s*=\s*"(\d+)"/g)].map(m => m[1])
}

async function main() {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'remap-engine-'))
	const srcPath = path.join(tmp, 'src.pptx')
	const outPath = path.join(tmp, 'remapped.pptx')
	const ctx = { sessionId: `remap-engine-${Date.now()}` }

	// 1. Generate a deck with one timed object and save it.
	const gen = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		phase: 'commit',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Remap Engine Source',
			slides: [{
				id: 's1',
				layoutIntent: 'title-body',
				content: [{ kind: 'textBox', objectName: 'hero', text: 'Hero', bbox: { x: 1, y: 1, w: 5, h: 1 } }],
				timeline: [{ objectName: 'hero', type: 'entrance', effect: 'fade', trigger: 'onClick', durationMs: 700 }],
			}],
		},
	}, ctx))
	data(await callBetterPptxTool('betterpptx.deck.save', { deckId: gen.deckId, fileName: srcPath }, ctx))
	const srcTiming = await slideTimingXml(srcPath)
	check('source deck serialized p:timing', srcTiming.includes('<p:spTgt'), { srcTiming: srcTiming.slice(0, 200) })

	// 2. Open the saved deck with timing preservation -> manifest is captured.
	const bytes = await fs.readFile(srcPath)
	const opened = data(await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'src.pptx',
		preserveTiming: true,
	}, ctx))
	const slide = getSlide(opened.deckId, 0)
	check('opened slide has preserved _rawTimingXml', typeof slide._rawTimingXml === 'string' && slide._rawTimingXml.includes('<p:spTgt'))
	check('manifest captured at import', !!slide._nativeTimingManifest?.targets && Object.keys(slide._nativeTimingManifest.targets).length > 0, slide._nativeTimingManifest)

	const originalTargetSpids = spidsIn(slide._rawTimingXml)
	const heroObj = (slide._slideObjects || []).find(o => o.options?.objectName === 'hero')
	check('hero object present after import', !!heroObj)
	const originalSpid = String(heroObj.options.spid)
	check('manifest maps original spid -> hero', slide._nativeTimingManifest.targets[originalSpid]?.objectName === 'hero', slide._nativeTimingManifest.targets)

	// 3. Simulate a regenerate that preserved objectName but landed on a new shape id
	// (as a replaced/recreated object would). 999 is distinct from the imported spid.
	heroObj.options.spid = 999

	// 4. Run smart remap (auto). finalize assigns a fresh spid; remap follows objectName.
	const result = applySmartTimingRemap(slide, { mode: 'auto' })
	check('remap applied', result.applied === true, result)
	check('remap changed timing', result.changed === true, result)
	check('exactly one remap, no prune/stale', result.remappedCount === 1 && result.prunedCount === 0 && result.staleCount === 0, result)
	const newSpid = String(heroObj.options.spid)
	check('hero got a fresh frozen spid', newSpid && newSpid !== originalSpid, { originalSpid, newSpid })
	const remappedTargetSpids = spidsIn(slide._rawTimingXml)
	check('timing now targets the new spid', remappedTargetSpids.includes(newSpid), { remappedTargetSpids, newSpid })
	check('timing no longer references the stale original spid', !remappedTargetSpids.includes(originalSpid), { originalTargetSpids, remappedTargetSpids })

	// 5. Save and confirm the serialized timing + shape ids agree (no PowerPoint repair risk).
	data(await callBetterPptxTool('betterpptx.deck.validate', { deckId: opened.deckId }, ctx))
	data(await callBetterPptxTool('betterpptx.deck.save', { deckId: opened.deckId, fileName: outPath }, ctx))
	const outTiming = await slideTimingXml(outPath)
	check('saved timing targets the regenerated shape id', spidsIn(outTiming).includes(newSpid), { savedSpids: spidsIn(outTiming), newSpid })

	// 6. Negative: a legacy slide with no manifest must NOT remap.
	const noManifest = applySmartTimingRemap({ _rawTimingXml: '<p:timing><p:spTgt spid="3"/></p:timing>' }, { mode: 'auto' })
	check('no-manifest slide is left to legacy preserve/prune', noManifest.applied === false && noManifest.reason === 'no-manifest-legacy', noManifest)

	if (failures) { console.error(`\nTIMING REMAP ENGINE INTEGRATION: FAIL (${failures})`); process.exit(1) }
	console.log('\nTIMING REMAP ENGINE INTEGRATION: PASS')
}
main().catch(e => { console.error('ERROR', e?.stack || e); process.exit(1) })
