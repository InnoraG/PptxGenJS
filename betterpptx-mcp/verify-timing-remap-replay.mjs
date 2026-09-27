#!/usr/bin/env node
// Cross-session replay test: prove the identity manifest survives export_spec -> replay
// (carried opaquely through the nativeTimingPreservation handle) and that the replay-path
// remap hook keeps preserved timing pointing at live shapes (no dangling targets).
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_FORCE_PLAN = 'premium'

let failures = 0
const check = (label, cond, detail) => {
	if (cond) { console.log(`  ok  ${label}`); return }
	failures++
	console.error(`  FAIL ${label}`)
	if (detail !== undefined) console.error('       ' + JSON.stringify(detail).slice(0, 700))
}
const data = r => { if (!r?.ok) { console.error('tool failed', JSON.stringify(r).slice(0, 900)); process.exit(1) } return r.data }

async function slideXml(filePath) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	return await zip.file('ppt/slides/slide1.xml').async('string')
}
const spidsIn = xml => [...String(xml).matchAll(/\bspid\s*=\s*"(\d+)"/g)].map(m => m[1])
const shapeIdsIn = xml => [...String(xml).matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => m[1])

async function main() {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'remap-replay-'))
	const srcPath = path.join(tmp, 'src.pptx')
	const outPath = path.join(tmp, 'replayed.pptx')
	const ctx = { sessionId: `remap-replay-${Date.now()}` }

	// Session 1: build + save a deck with a timed object.
	const gen = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		phase: 'commit',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Replay Remap Source',
			slides: [{
				id: 's1', layoutIntent: 'title-body',
				content: [{ kind: 'textBox', objectName: 'hero', text: 'Hero', bbox: { x: 1, y: 2, w: 6, h: 1 } }],
				timeline: [{ objectName: 'hero', type: 'entrance', effect: 'fade', trigger: 'onClick', durationMs: 700 }],
			}],
		},
	}, ctx))
	data(await callBetterPptxTool('betterpptx.deck.save', { deckId: gen.deckId, fileName: srcPath }, ctx))

	// Open + export the spec (the public-safe representation that carries the timing handle).
	const bytes = await fs.readFile(srcPath)
	const opened = data(await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'src.pptx', preserveTiming: true,
	}, ctx))
	const exported = data(await callBetterPptxTool('betterpptx.deck.export_spec', { deckId: opened.deckId, detail: 'full' }, ctx))
	const handle = exported.spec?.slides?.[0]?.nativeTimingPreservation?.handle
	check('exported spec carries nativeTimingPreservation handle', !!handle, exported.spec?.slides?.[0]?.nativeTimingPreservation)
	// Privacy: the public spec must not leak raw spids / timing XML.
	check('exported spec has no raw spid / p:timing leak', !/spid=|<p:timing/.test(JSON.stringify(exported.spec)))

	// Edit the exported spec: opt into remap and prepend a spacer object so the timed
	// object is regenerated at a DIFFERENT shape id than the imported original.
	const replaySpec = JSON.parse(JSON.stringify(exported.spec))
	replaySpec.timingRemap = 'auto'
	replaySpec.title = 'Replayed With Remap'
	const slide0 = replaySpec.slides[0]
	slide0.content = [
		{ kind: 'textBox', objectName: 'spacer', text: 'Spacer', bbox: { x: 0.5, y: 0.5, w: 3, h: 0.6 } },
		...(slide0.content || []),
	]

	// Session 2 (fresh deck): replay. The handle restores timing + manifest; the hook remaps.
	const replay = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: replaySpec, phase: 'commit', validateAfterCompile: true,
	}, ctx))
	check('replay ran the timing remap hook (manifest survived export->replay)', Array.isArray(replay.timingRemapReports) && replay.timingRemapReports.length >= 1, { timingRemapReports: replay.timingRemapReports })
	const rep = (replay.timingRemapReports || [])[0]
	check('no stale targets on replay (hero matched)', rep && rep.stale.length === 0, rep)

	data(await callBetterPptxTool('betterpptx.deck.validate', { deckId: replay.deckId }, ctx))
	data(await callBetterPptxTool('betterpptx.deck.save', { deckId: replay.deckId, fileName: outPath }, ctx))

	// Correctness invariant: every preserved timing target resolves to a live shape id.
	const xml = await slideXml(outPath)
	const timingMatch = xml.match(/<p:timing[\s\S]*?<\/p:timing>/)
	check('replayed deck serialized p:timing', !!timingMatch, { hasTiming: !!timingMatch })
	const liveIds = new Set(shapeIdsIn(xml))
	const timingTargets = spidsIn(timingMatch ? timingMatch[0] : '')
	check('every timing target resolves to a live shape (no dangling spid)', timingTargets.length > 0 && timingTargets.every(s => liveIds.has(s)), { timingTargets, liveIds: [...liveIds] })

	if (failures) { console.error(`\nTIMING REMAP REPLAY: FAIL (${failures})`); process.exit(1) }
	console.log('\nTIMING REMAP REPLAY: PASS')
}
main().catch(e => { console.error('ERROR', e?.stack || e); process.exit(1) })
