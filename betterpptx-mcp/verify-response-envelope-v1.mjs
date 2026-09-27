#!/usr/bin/env node

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'

const { callBetterPptxTool } = await import('./engine.mjs')

function fail(message, detail = {}) {
	console.error('RESPONSE ENVELOPE V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function assertEnvelope(label, data) {
	if (data.schemaVersion !== 'tool-response.v1') fail(`${label} missing response schemaVersion.`, data)
	if (data.ok !== true) fail(`${label} missing ok=true envelope field.`, data)
	if (!Array.isArray(data.warnings)) fail(`${label} missing warnings array.`, data)
	if (!Array.isArray(data.artifacts)) fail(`${label} missing artifacts array.`, data)
	if (!data.next || typeof data.next !== 'object') fail(`${label} missing next action.`, data)
}

async function main() {
	const context = { sessionId: `verify-response-envelope-${Date.now()}` }
	const deck = okResult('deck.new', await callBetterPptxTool('betterpptx.deck.new', {
		title: 'Envelope Verify',
		directorMode: 'primitive-direct',
		idempotencyKey: 'envelope-deck',
	}, context))
	assertEnvelope('deck.new', deck)
	if (!deck.deckId || !Number.isInteger(deck.deckVersion)) fail('deck.new old fields were not preserved.', deck)
	const replay = okResult('deck.new replay', await callBetterPptxTool('betterpptx.deck.new', {
		title: 'Envelope Verify',
		directorMode: 'primitive-direct',
		idempotencyKey: 'envelope-deck',
	}, context))
	assertEnvelope('deck.new replay', replay)
	if (replay.deckId !== deck.deckId || replay.idempotentReplay !== true) fail('deck.new replay fields were not preserved.', replay)

	const slide = okResult('slide.add', await callBetterPptxTool('betterpptx.slide.add', {
		deckId: deck.deckId,
		deckVersion: deck.deckVersion,
		notes: 'Envelope verifier slide.',
	}, context))
	assertEnvelope('slide.add', slide)
	if (!Number.isInteger(slide.slideIndex) || !Number.isInteger(slide.deckVersion)) fail('slide.add old fields were not preserved.', slide)

	const text = okResult('slide.add_text', await callBetterPptxTool('betterpptx.slide.add_text', {
		deckId: deck.deckId,
		deckVersion: slide.deckVersion,
		slideIndex: slide.slideIndex,
		text: 'Envelope verified',
		options: { x: 1, y: 1, w: 5, h: 0.6, objectName: 'envelope.title' },
	}, context))
	assertEnvelope('slide.add_text', text)
	if (text.next?.recommendedTool !== 'betterpptx.slide.preview') fail('slide.add_text next action should recommend slide preview.', text)

	console.log('RESPONSE ENVELOPE V1 VERIFY: PASS')
	console.log(JSON.stringify({ deckId: deck.deckId, finalDeckVersion: text.deckVersion }, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
