#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'

const { callBetterPptxTool } = await import('./engine.mjs')

function fail(message, detail = {}) {
	console.error('FROZEN REFERENCE SPEC EDIT LOOP VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value))
}

function collectStrings(value, out = []) {
	if (typeof value === 'string') out.push(value)
	else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out))
	else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, out))
	return out
}

function textLeaks(value) {
	const strings = collectStrings(value)
	const patterns = [
		/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/](?![\\/])/,
		/\/Users\//,
		/\/tmp\//,
		/\bnode_modules\b/i,
		/\bengine\.mjs\b/i,
		/\bspec-compiler\.mjs\b/i,
		/\bPptxGenJS\b/i,
		/<(?:p|a|r|pkg):/i,
	]
	return patterns.filter(rx => strings.some(text => rx.test(text))).map(String)
}

function minimalPatchSpec(exportedSpec) {
	const patchSpec = cloneJson(exportedSpec)
	patchSpec.title = `${exportedSpec.title || 'Frozen reference'} - patch smoke`
	patchSpec.edits = {
		transformShapes: {
			filter: { slideRange: [0, 1] },
			colorTransform: 'grayscale',
		},
	}
	patchSpec.slides = (exportedSpec.slides || []).slice(0, 2).map((slide, index) => ({
		id: slide.id || `slide-${index + 1}`,
		slideIndex: index,
		layoutIntent: slide.layoutIntent || 'title-body',
		content: [],
	}))
	return patchSpec
}

async function main() {
	const referencePath = path.resolve('3d-gradient-style-advertising-agency.pptx')
	const bytes = await fs.readFile(referencePath).catch(error => {
		fail('Frozen reference PPTX is missing or unreadable.', { referencePath, message: error?.message || String(error) })
	})
	const referenceHash = crypto.createHash('sha256').update(bytes).digest('hex')
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-frozen-reference-loop-'))
	const replayPath = path.join(tempDir, 'frozen-reference-replayed.pptx')
	const replacedPath = path.join(tempDir, 'frozen-reference-replaced.pptx')
	const patchedPath = path.join(tempDir, 'frozen-reference-patched.pptx')
	const context = { sessionId: `verify-frozen-reference-loop-${Date.now()}` }

	const opened = okResult('open frozen reference bytes', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: '3d-gradient-style-advertising-agency.pptx',
		preserveTiming: true,
	}, context))
	if (opened.slideCount !== 40) fail('Frozen reference corpus did not open as the expected 40-slide deck.', opened)

	const exported = okResult('export frozen reference spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: opened.deckId,
		detail: 'summary',
	}, context))
	if ((exported.spec?.slides || []).length !== 40) fail('export_spec did not include all frozen-reference slides.', exported)
	if (exported.privacy?.rawXmlIncluded !== false || exported.privacy?.localPathsIncluded !== false) fail('export_spec privacy flags are not public-safe.', exported.privacy)
	const leaks = textLeaks(exported.spec)
	if (leaks.length) fail('exported frozen-reference spec leaked private details.', { leaks })

	const replayDryRun = okResult('dry-run frozen reference spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: exported.spec,
		phase: 'dryRun',
		detail: 'summary',
	}, context))
	if (replayDryRun.requiresUpgrade === true || replayDryRun.billing?.estimate?.requiresUpgrade === true) {
		fail('Premium frozen-reference dry-run was incorrectly marked as requiring upgrade.', replayDryRun.billing?.estimate || replayDryRun)
	}
	if (replayDryRun.billing?.estimate?.mode !== 'premium') {
		fail('Premium frozen-reference dry-run did not use premium billing estimate mode.', replayDryRun.billing?.estimate || {})
	}

	const replayed = okResult('regenerate frozen reference spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: exported.spec,
		phase: 'commit',
		detail: 'summary',
		validateAfterCompile: true,
		billingConfirmed: true,
	}, context))
	const replayValidate = okResult('validate regenerated frozen reference', await callBetterPptxTool('betterpptx.deck.validate', {
		deckId: replayed.deckId,
	}, context))
	okResult('save regenerated frozen reference', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replayed.deckId,
		fileName: replayPath,
	}, context))

	const replaySummary = okResult('summary regenerated frozen reference', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: replayed.deckId,
	}, context))
	const replaced = okResult('replace regenerated deck from frozen spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: replayed.deckId,
		deckVersion: replaySummary.deckVersion,
		commitMode: 'replaceDeck',
		phase: 'commit',
		spec: exported.spec,
		detail: 'summary',
		validateAfterCompile: true,
		billingConfirmed: true,
	}, context))
	okResult('validate replaced frozen reference', await callBetterPptxTool('betterpptx.deck.validate', {
		deckId: replayed.deckId,
	}, context))
	okResult('save replaced frozen reference', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replayed.deckId,
		deckVersion: replaced.deckVersion,
		fileName: replacedPath,
	}, context))

	const replacedSummary = okResult('summary replaced frozen reference', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: replayed.deckId,
	}, context))
	const patchSpec = minimalPatchSpec(exported.spec)
	const patchDryRun = okResult('dry-run frozen reference patch', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: replayed.deckId,
		deckVersion: replacedSummary.deckVersion,
		commitMode: 'patch',
		phase: 'dryRun',
		spec: patchSpec,
		includePatchPlan: true,
	}, context))
	if (!patchDryRun.billing?.patchEstimate?.operations?.some(item => item.tool === 'betterpptx.deck.transform_shapes' && Number(item.estimatedCredits) > 0)) {
		fail('Frozen-reference patch dry-run did not expose billable transform estimate.', patchDryRun.billing?.patchEstimate || {})
	}
	const patched = okResult('commit frozen reference patch', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: replayed.deckId,
		deckVersion: replacedSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: patchSpec,
		billingConfirmed: true,
	}, context))
	if (!patched.patchResults?.some(item =>
		Number(item.shapesTouched) > 0 ||
		Number(item.rawXmlColorsRemapped) > 0 ||
		Number(item.rawPackagePartsTouched) > 0
	)) fail('Frozen-reference patch did not transform any preserved or semantic content.', patched)
	const patchValidate = okResult('validate patched frozen reference', await callBetterPptxTool('betterpptx.deck.validate', {
		deckId: replayed.deckId,
	}, context))
	okResult('save patched frozen reference', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replayed.deckId,
		deckVersion: patched.deckVersion,
		fileName: patchedPath,
	}, context))

	console.log('FROZEN REFERENCE SPEC EDIT LOOP VERIFY: PASS')
	console.log(JSON.stringify({
		referenceHash: referenceHash.slice(0, 16),
		openedDeckId: opened.deckId,
		replayedDeckId: replayed.deckId,
		exportedSlides: exported.spec.slides.length,
		byTier: exported.byTier,
		replayValidateOk: !!replayValidate,
		patchValidateOk: !!patchValidate,
		patchResults: patched.patchResults.length,
		patchEstimateCredits: patchDryRun.billing.patchEstimate.estimatedCredits,
		outputs: { replayPath, replacedPath, patchedPath },
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
