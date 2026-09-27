#!/usr/bin/env node
// Billing/entitlement behavior for smart timing remap (plan §8):
//  - dry-run surfaces a timingRemapPlan with component counts classified as animation
//    (draft-accrual: accrues to the deck.save checkpoint, not an immediate charge);
//  - no-op preserve is free and never gated;
//  - remap real-work is classified as animation for the free-preview boundary (the gate
//    reuses assertJsonSpecPatchPreviewBoundary — the same gate as every other patch op).
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { callBetterPptxTool } from './engine.mjs'

let failures = 0
const check = (label, cond, detail) => {
	if (cond) { console.log(`  ok  ${label}`); return }
	failures++
	console.error(`  FAIL ${label}`)
	if (detail !== undefined) console.error('       ' + JSON.stringify(detail).slice(0, 600))
}
const data = r => { if (!r?.ok) { console.error('tool failed', JSON.stringify(r).slice(0, 800)); process.exit(1) } return r.data }

async function openTimed(ctx, tmp, label) {
	process.env.BETTERPPTX_FORCE_PLAN = 'premium'
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

const benignEdit = mode => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'edit', ...(mode ? { timingRemap: mode } : {}),
	slides: [{ id: 's1', slideIndex: 0, layoutIntent: 'title-body', content: [{ objectName: 'hero', kind: 'textBox', patch: { text: 'Hero edited' } }] }],
})

async function main() {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'remap-billing-'))
	const ctx = { sessionId: `remap-billing-${Date.now()}` }

	console.log('CASE A: dry-run surfaces timingRemapPlan classified as animation (draft-accrual)')
	{
		const deck = await openTimed(ctx, tmp, 'billA')
		process.env.BETTERPPTX_FORCE_PLAN = 'premium'
		const dry = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'dryRun', includePatchPlan: true,
			spec: benignEdit('auto'),
		}, ctx))
		const plan = dry.timingRemapPlan
		check('timingRemapPlan present at dry-run', !!plan && plan.totalComponents >= 1, plan)
		check('eligible slide classified as animate_shapes / draft-accrual', !!plan && plan.slides[0]?.tool === 'betterpptx.slide.animate_shapes' && plan.slides[0]?.billingCategory === 'draft-accrual', plan?.slides)
	}

	console.log('CASE B: dry-run WITHOUT opt-in surfaces no remap plan (legacy)')
	{
		const deck = await openTimed(ctx, tmp, 'billB')
		process.env.BETTERPPTX_FORCE_PLAN = 'premium'
		const dry = data(await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'dryRun', includePatchPlan: true,
			spec: benignEdit(null),
		}, ctx))
		check('no timingRemapPlan when not opted in', dry.timingRemapPlan === undefined, { has: !!dry.timingRemapPlan })
	}

	console.log('CASE C: FREE tier — no-op preserve is free and not gated')
	{
		const deck = await openTimed(ctx, tmp, 'billC')
		process.env.BETTERPPTX_FORCE_PLAN = 'free'
		const patched = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId: deck.deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'commit', billingConfirmed: true,
			spec: benignEdit('auto'),
		}, ctx)
		check('free-tier no-op remap commit succeeds (slide within preview, no real work)', patched?.ok === true, patched?.error)
		const rep = (patched?.data?.timingRemapReports || [])[0]
		check('hook ran but did no real work (preserve)', rep && rep.remapped.length === 0 && rep.prunedComponents.length === 0, rep)
		check('no REQUIRES_UPGRADE for a no-op preserve', !(patched?.data?.warnings || []).some(w => w.code === 'REQUIRES_UPGRADE'))
		process.env.BETTERPPTX_FORCE_PLAN = 'premium'
	}

	if (failures) { console.error(`\nTIMING REMAP BILLING: FAIL (${failures})`); process.exit(1) }
	console.log('\nTIMING REMAP BILLING: PASS')
}
main().catch(e => { console.error('ERROR', e?.stack || e); process.exit(1) })
