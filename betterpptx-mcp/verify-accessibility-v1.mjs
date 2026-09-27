#!/usr/bin/env node
import fs from 'node:fs/promises'
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'

function fail(message, detail = {}) {
	console.error('ACCESSIBILITY V1 VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

async function main() {
	const context = { sessionId: `verify-accessibility-${Date.now()}` }
	const spec = JSON.parse(await fs.readFile('betterpptx-mcp/ir/examples/creation-executive.v1.json', 'utf8'))
	const generated = okResult('generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec,
		validateAfterCompile: false,
	}, context))
	const good = okResult('validate_accessibility generated', await callBetterPptxTool('betterpptx.deck.validate_accessibility', {
		deckId: generated.deckId,
	}, context))
	if (good.passed !== true || good.score !== 100 || good.findings.length !== 0) fail('generated spec deck should pass basic accessibility.', good)

	const deck = okResult('bad deck.new', await callBetterPptxTool('betterpptx.deck.new', { title: 'Accessibility Fixture' }, context))
	let deckVersion = deck.deckVersion
	const message = okResult('bad deck message architecture', await callBetterPptxTool('betterpptx.deck.define_message_architecture', {
		deckId: deck.deckId,
		deckVersion,
		audience: 'Verifier',
		deliveryMode: 'test',
		thesis: 'Accessibility fixture intentionally omits the slide title.',
		slides: [{ index: 0, message: 'Missing title fixture.' }],
	}, context))
	deckVersion = message.deckVersion
	const roles = okResult('bad deck roles', await callBetterPptxTool('betterpptx.deck.assign_slide_roles', {
		deckId: deck.deckId,
		deckVersion,
		roles: [{ slideIndex: 0, role: 'fixture', purpose: 'Accessibility negative test.' }],
	}, context))
	deckVersion = roles.deckVersion
	const design = okResult('bad deck design system', await callBetterPptxTool('betterpptx.deck.define_design_system', {
		deckId: deck.deckId,
		deckVersion,
		structuralArchitecture: { grid: 'simple fixture grid' },
		semanticColorArchitecture: { base: 'FFFFFF', text: '111827', accent: '2563EB' },
		typographicHierarchy: { heading: 'Aptos Display', body: 'Aptos' },
		visualAssetEcosystem: { geometry: 'plain rectangles' },
		dataVisualizationSystems: { charts: 'none' },
		motionTransitionDynamics: { transitions: ['none'] },
		packagingPackout: { output: 'pptx', validation: ['validate_accessibility'] },
	}, context))
	deckVersion = design.deckVersion
	const slide = okResult('bad slide.add', await callBetterPptxTool('betterpptx.slide.add', {
		deckId: deck.deckId,
		deckVersion,
	}, context))
	okResult('bad slide.add_shape', await callBetterPptxTool('betterpptx.slide.add_shape', {
		deckId: deck.deckId,
		deckVersion: slide.deckVersion,
		slideIndex: 0,
		shapeName: 'rect',
		options: { x: 1, y: 1, w: 2, h: 1, objectName: 'a11y.body-box' },
	}, context))
	const bad = okResult('validate_accessibility bad', await callBetterPptxTool('betterpptx.deck.validate_accessibility', {
		deckId: deck.deckId,
	}, context))
	const titleFinding = (bad.findings || []).find(item => item.code === 'MISSING_SLIDE_TITLE')
	if (!titleFinding) fail('accessibility fixture did not detect missing slide title.', bad)
	if (titleFinding.recommendedTool !== 'betterpptx.deck.revise' || !titleFinding.examplePatch) fail('accessibility finding missing fix guidance.', titleFinding)

	console.log('ACCESSIBILITY V1 VERIFY: PASS')
	console.log(JSON.stringify({
		generatedDeckId: generated.deckId,
		generatedScore: good.score,
		fixtureFindings: bad.findings.length,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
