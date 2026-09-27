#!/usr/bin/env node
// End-to-end PUBLIC tool-path test for the smart timing remap hook in
// generate_from_spec patch mode. Proves: (a) default off = legacy (no remap reports),
// (b) opt-in benign edit = no-op preserve, (c) opt-in delete of a timed object surfaces
// NATIVE_TIMING_STALE and drops the orphaned timing.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_FORCE_PLAN = 'premium'

let failures = 0
const check = (label, cond, detail) => {
	if (cond) { console.log(`  ok  ${label}`); return }
	failures++
	console.error(`  FAIL ${label}`)
	if (detail !== undefined) console.error('       ' + JSON.stringify(detail).slice(0, 600))
}
const data = r => { if (!r?.ok) { console.error('tool failed', JSON.stringify(r).slice(0, 800)); process.exit(1) } return r.data }

async function openTimed(ctx, tmp, label) {
	const srcPath = path.join(tmp, `${label}.pptx`)
	const gen = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		phase: 'commit',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: label,
			slides: [{
				id: 's1', layoutIntent: 'title-body',
				content: [{ kind: 'textBox', objectName: 'hero', text: 'Hero', bbox: { x: 1, y: 1, w: 5, h: 1 } }],
				timeline: [{ objectName: 'hero', type: 'entrance', effect: 'fade', trigger: 'onClick', durationMs: 700 }],
			}],
		},
	}, ctx))
	data(await callBetterPptxTool('betterpptx.deck.save', { deckId: gen.deckId, fileName: srcPath }, ctx))
	const bytes = await fs.readFile(srcPath)
	const opened = data(await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: `${label}.pptx`, preserveTiming: true,
	}, ctx))
	const summary = data(await callBetterPptxTool('betterpptx.deck.summary', { deckId: opened.deckId }, ctx))
	return { deckId: opened.deckId, deckVersion: summary.deckVersion }
}

async function main() {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'remap-toolpath-'))
	const ctx = { sessionId: `remap-toolpath-${Date.now()}` }

	console.log('CASE A: default (no timingRemap) = legacy, no remap reports')
	{
		const deck = await openTimed(ctx, tmp, 'caseA')
		const patched = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'commit', billingConfirmed: true,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1', title: 'caseA',
				slides: [{ id: 's1', slideIndex: 0, layoutIntent: 'title-body', content: [{ objectName: 'hero', kind: 'textBox', patch: { text: 'Hero edited' } }] }],
			},
		}, ctx))
		check('no timingRemapReports when not opted in', patched.timingRemapReports === undefined, { has: !!patched.timingRemapReports })
		check('no remap/stale warning emitted', !(patched.warnings || []).some(w => w.code === 'TIMING_REMAPPED' || w.code === 'NATIVE_TIMING_STALE'))
	}

	console.log('CASE B: timingRemap:"auto" + benign edit = no-op preserve')
	{
		const deck = await openTimed(ctx, tmp, 'caseB')
		const patched = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'commit', billingConfirmed: true,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1', title: 'caseB', timingRemap: 'auto',
				slides: [{ id: 's1', slideIndex: 0, layoutIntent: 'title-body', content: [{ objectName: 'hero', kind: 'textBox', patch: { text: 'Hero edited' } }] }],
			},
		}, ctx))
		const rep = (patched.timingRemapReports || [])[0]
		check('hook ran (report present)', !!rep, patched.timingRemapReports)
		check('no remap and no stale (spid stable)', rep && rep.remapped.length === 0 && rep.stale.length === 0, rep)
		check('no NATIVE_TIMING_STALE warning', !(patched.warnings || []).some(w => w.code === 'NATIVE_TIMING_STALE'))
		data(await callBetterPptxTool('betterpptx.deck.validate', { deckId: deck.deckId }, ctx))
	}

	console.log('CASE C: timingRemap:"auto" + delete timed object = prune + NATIVE_TIMING_STALE')
	{
		const deck = await openTimed(ctx, tmp, 'caseC')
		const patched = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'commit', billingConfirmed: true,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1', title: 'caseC', timingRemap: 'auto',
				slides: [{ id: 's1', slideIndex: 0, layoutIntent: 'title-body', content: [{ objectName: 'hero', kind: 'textBox', delete: true }] }],
			},
		}, ctx))
		check('NATIVE_TIMING_STALE surfaced for deleted target', (patched.warnings || []).some(w => w.code === 'NATIVE_TIMING_STALE' && w.objectName === 'hero'), patched.warnings)
		const rep = (patched.timingRemapReports || [])[0]
		check('report shows a pruned component', rep && rep.prunedComponents.length >= 1, rep)
		data(await callBetterPptxTool('betterpptx.deck.validate', { deckId: deck.deckId }, ctx))
	}

	if (failures) { console.error(`\nTIMING REMAP TOOLPATH: FAIL (${failures})`); process.exit(1) }
	console.log('\nTIMING REMAP TOOLPATH: PASS')
}
main().catch(e => { console.error('ERROR', e?.stack || e); process.exit(1) })
