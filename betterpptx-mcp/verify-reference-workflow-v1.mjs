#!/usr/bin/env node
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'

function fail(message, detail = {}) {
	console.error('REFERENCE WORKFLOW V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

async function main() {
	const context = { sessionId: `verify-reference-workflow-${Date.now()}` }
	const deck = okResult('reference deck.new', await callBetterPptxTool('betterpptx.deck.new', { title: 'Reference Workflow Source' }, context))
	const slide = okResult('reference slide.add', await callBetterPptxTool('betterpptx.slide.add', {
		deckId: deck.deckId,
		deckVersion: deck.deckVersion,
	}, context))
	const title = okResult('reference slide.add_text', await callBetterPptxTool('betterpptx.slide.add_text', {
		deckId: deck.deckId,
		deckVersion: slide.deckVersion,
		slideIndex: 0,
		text: 'Reference title',
		options: { x: 0.8, y: 0.6, w: 8.5, h: 0.6, fontSize: 28, objectName: 'reference.title' },
	}, context))
	const shape = okResult('reference slide.add_shape', await callBetterPptxTool('betterpptx.slide.add_shape', {
		deckId: deck.deckId,
		deckVersion: title.deckVersion,
		slideIndex: 0,
		shapeName: 'roundRect',
		text: 'Reference card',
		options: { x: 0.8, y: 1.6, w: 4.2, h: 1.1, objectName: 'reference.card', fill: { color: 'DBEAFE' }, line: { color: '2563EB' } },
	}, context))

	const analysis = okResult('analyze_reference', await callBetterPptxTool('betterpptx.deck.analyze_reference', {
		deckId: deck.deckId,
		detail: 'full',
	}, context))
	if (!/^ref_[A-Fa-f0-9]{20}$/.test(analysis.referenceHandle)) fail('reference handle is not opaque.', analysis)
	if (analysis.slideCount !== 1 || analysis.objectCount < 2) fail('reference analysis missed source objects.', analysis)
	const analysisText = JSON.stringify(analysis)
	if (/(C:\\|\/Users\/|node_modules|\.mjs|\.ts|pid|cwd|repo|git)/i.test(analysisText)) fail('reference analysis leaked implementation detail.', analysis)

	const dry = okResult('recreate_reference dryRun', await callBetterPptxTool('betterpptx.deck.recreate_reference', {
		referenceHandle: analysis.referenceHandle,
		dryRun: true,
		detail: 'full',
	}, context))
	if (dry.dryRun !== true || !dry.planDigest) fail('reference recreation dryRun missing plan.', dry)

	const recreated = okResult('recreate_reference commit', await callBetterPptxTool('betterpptx.deck.recreate_reference', {
		referenceHandle: analysis.referenceHandle,
		detail: 'summary',
	}, context))
	if (!recreated.deckId || recreated.referenceHandle !== analysis.referenceHandle) fail('reference recreation did not return candidate deck.', recreated)

	const comparison = okResult('compare_reference', await callBetterPptxTool('betterpptx.deck.compare_reference', {
		referenceHandle: analysis.referenceHandle,
		generatedDeckId: recreated.deckId,
	}, context))
	if (comparison.comparator?.mode !== 'public-safe-summary') fail('comparison did not use public-safe mode.', comparison)
	if (comparison.summary.referenceSlides !== 1 || comparison.summary.generatedSlides !== 1) fail('comparison slide summary is wrong.', comparison)
	if (!comparison.next?.recommendedTool) fail('comparison missing next action.', comparison)

	const saved = okResult('recreated deck.save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: recreated.deckId,
		deckVersion: recreated.deckVersion,
		fileName: 'verify-reference-workflow-v1.pptx',
	}, context))
	if (!saved.bytes || saved.slideCount !== 1) fail('recreated deck did not save repair-safely.', saved)

	console.log('REFERENCE WORKFLOW V1 VERIFY: PASS')
	console.log(JSON.stringify({
		referenceHandle: analysis.referenceHandle,
		recreatedDeckId: recreated.deckId,
		mismatches: comparison.summary.mismatchCount,
		savedBytes: saved.bytes,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
