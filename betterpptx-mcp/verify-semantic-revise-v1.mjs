#!/usr/bin/env node
import fs from 'node:fs/promises'
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'

function fail(message, detail = {}) {
	console.error('SEMANTIC REVISE V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

async function main() {
	const context = { sessionId: `verify-semantic-revise-${Date.now()}` }
	const spec = JSON.parse(await fs.readFile('betterpptx-mcp/ir/examples/creation-executive.v1.json', 'utf8'))
	const dry = okResult('dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec,
		dryRun: true,
		detail: 'full',
	}, context))
	const target = dry.slides
		.flatMap(slide => slide.objects.map(object => ({ ...object, slideIndex: slide.slideIndex })))
		.find(object => object.objectName.endsWith('.decision-summary.text'))
	if (!target?.editHandle) fail('dryRun did not expose target editHandle.', dry)

	const commit = okResult('commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec,
		detail: 'full',
		validateAfterCompile: false,
	}, context))
	let deckVersion = commit.deckVersion

	const first = okResult('slide.revise first', await callBetterPptxTool('betterpptx.slide.revise', {
		deckId: commit.deckId,
		deckVersion,
		slideIndex: target.slideIndex,
		target: { editHandle: target.editHandle },
		patch: {
			text: 'Revised decision summary with a concise action focus.',
			fit: 'shrink',
			emphasis: 'high',
		},
	}, context))
	deckVersion = first.deckVersion
	if (first.objectName !== target.objectName) fail('slide.revise targeted the wrong object.', { first, target })
	if (first.next?.recommendedTool !== 'betterpptx.slide.preview') fail('slide.revise did not return preview next action.', first)

	const second = okResult('slide.revise replay patch', await callBetterPptxTool('betterpptx.slide.revise', {
		deckId: commit.deckId,
		deckVersion,
		slideIndex: target.slideIndex,
		target: { editHandle: target.editHandle },
		patch: {
			text: 'Revised decision summary with a concise action focus.',
			fit: 'shrink',
			emphasis: 'high',
		},
	}, context))
	deckVersion = second.deckVersion
	if (second.objectName !== target.objectName) fail('Repeated semantic patch drifted target.', { second, target })

	const deckPatch = okResult('deck.revise batch', await callBetterPptxTool('betterpptx.deck.revise', {
		deckId: commit.deckId,
		deckVersion,
		patches: [
			{
				slideIndex: 0,
				target: { objectName: 'exec-title.main-title.title' },
				patch: { style: { color: '2563EB' }, fit: 'shrink' },
			},
		],
	}, context))
	if (deckPatch.patchCount !== 1) fail('deck.revise did not report one patch.', deckPatch)
	if (deckPatch.next?.recommendedTool !== 'betterpptx.deck.preview') fail('deck.revise did not return deck preview next action.', deckPatch)

	console.log('SEMANTIC REVISE V1 VERIFY: PASS')
	console.log(JSON.stringify({
		deckId: commit.deckId,
		target: target.objectName,
		editHandle: target.editHandle,
		finalDeckVersion: deckPatch.deckVersion,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
