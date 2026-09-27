#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.env.BETTERPPTX_FORCE_PLAN = 'premium'

const { callBetterPptxTool } = await import('./engine.mjs')

function fail(message, detail = {}) {
	console.error('JSON SPEC EDITION VERIFY: FAIL')
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

function wavSilence(durationMs = 600, sampleRate = 8000) {
	const samples = Math.max(1, Math.round(sampleRate * durationMs / 1000))
	const dataBytes = samples * 2
	const buffer = Buffer.alloc(44 + dataBytes)
	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + dataBytes, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate * 2, 28)
	buffer.writeUInt16LE(2, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(dataBytes, 40)
	return buffer
}

function findResult(results, key, predicate) {
	const match = results.find(predicate)
	if (!match) fail(`patch result missing ${key}.`, { results })
	return match
}

function assertNoUnsupported(findings = []) {
	if (findings.length) fail('patch returned unsupported findings.', findings)
}

async function withFreePlan(fn) {
	const forcePlan = process.env.BETTERPPTX_FORCE_PLAN
	const premium = process.env.BETTERPPTX_PREMIUM
	delete process.env.BETTERPPTX_FORCE_PLAN
	delete process.env.BETTERPPTX_PREMIUM
	try {
		return await fn()
	} finally {
		if (forcePlan === undefined) delete process.env.BETTERPPTX_FORCE_PLAN
		else process.env.BETTERPPTX_FORCE_PLAN = forcePlan
		if (premium === undefined) delete process.env.BETTERPPTX_PREMIUM
		else process.env.BETTERPPTX_PREMIUM = premium
	}
}

async function addSlide(context, deckId, deckVersion, label, background, text) {
	const slide = okResult(`${label} slide.add`, await callBetterPptxTool('betterpptx.slide.add', {
		deckId,
		deckVersion,
		background,
		notes: `${label} notes`,
	}, context))
	const textResult = okResult(`${label} slide.add_text`, await callBetterPptxTool('betterpptx.slide.add_text', {
		deckId,
		deckVersion: slide.deckVersion,
		slideIndex: slide.slideIndex,
		text,
		options: {
			x: 0.5,
			y: 0.4,
			w: 5.6,
			h: 0.45,
			fontSize: 18,
			color: '111827',
			objectName: `${label}.title`,
		},
	}, context))
	return { slideIndex: slide.slideIndex, deckVersion: textResult.deckVersion }
}

async function createSimpleThreeSlideDeck(context) {
	const deck = okResult('free gate deck.new', await callBetterPptxTool('betterpptx.deck.new', {
		title: 'JSON Spec Free Edition Gate',
		directorMode: 'primitive-direct',
	}, context))
	let deckVersion = deck.deckVersion
	for (let i = 0; i < 3; i += 1) {
		const created = await addSlide(
			context,
			deck.deckId,
			deckVersion,
			`free${i}`,
			{ color: i === 0 ? 'FFFFFF' : (i === 1 ? 'F8FAFC' : 'EEF2FF') },
			`Free gate slide ${i + 1}`,
		)
		deckVersion = created.deckVersion
	}
	return { deckId: deck.deckId, deckVersion }
}

function assertFreeGate(label, result, expectedTool) {
	const details = result?.error?.details || {}
	const ok = result?.ok === false &&
		result.error?.code === 'REQUIRES_UPGRADE' &&
		details.status === 'spec_entitlement_required' &&
		details.tool === expectedTool &&
		details.requestedSlide === 3 &&
		details.mode === 'json_spec_patch'
	if (!ok) fail(`${label} did not return the JSON-spec free edit gate.`, result)
}

async function verifyFreePreviewEditGate() {
	const context = { sessionId: `verify-json-spec-edition-free-${Date.now()}` }
	const { deckId, deckVersion } = await createSimpleThreeSlideDeck(context)
	const exported = okResult('free full-spec baseline export', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId,
		detail: 'summary',
	}, context))
	const fullSpecPatch = cloneJson(exported.spec)
	fullSpecPatch.title = 'Free Full Spec Patch'
	fullSpecPatch.slides[0].content[0].text = 'Free full-spec slide 1 edit'
	let currentDeckVersion = deckVersion
	await withFreePlan(async () => {
		const fullPatchDryRun = okResult('free full-spec patch dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: currentDeckVersion,
			commitMode: 'patch',
			phase: 'dryRun',
			spec: fullSpecPatch,
			includePatchPlan: true,
		}, context))
		if (fullPatchDryRun.billing?.specEstimate?.mode !== 'skipped_for_json_spec_patch') {
			fail('patch dry-run still priced hypothetical full regeneration.', fullPatchDryRun.billing)
		}
		if (!Array.isArray(fullPatchDryRun.patchOperations) || fullPatchDryRun.patchOperations.length === 0) {
			fail('free full-spec patch dry-run did not include the changed slide 1 operation.', fullPatchDryRun)
		}
		if (fullPatchDryRun.patchOperations.some(item => Number(item.slideIndex) >= 2)) {
			fail('free full-spec patch dry-run treated unchanged slide 3+ content as edits.', fullPatchDryRun.patchOperations)
		}
		const fullPatchCommit = okResult('free full-spec patch commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: currentDeckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: fullSpecPatch,
		}, context))
		currentDeckVersion = fullPatchCommit.deckVersion
		if (!fullPatchCommit.patchResults?.some(item => item.objectName === 'free0.title' && item.patchedKeys?.includes('text'))) {
			fail('free full-spec patch commit did not apply the slide 1 text edit.', fullPatchCommit)
		}

		const blockedShapePatch = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: currentDeckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				title: 'Blocked Free Patch',
				slides: [{
					id: 'slide-3',
					slideIndex: 2,
					layoutIntent: 'title-only',
					content: [{
						kind: 'text',
						name: 'blocked slide three text',
						objectName: 'free2.title',
						text: 'Should be blocked',
					}],
				}],
			},
		}, context)
		assertFreeGate('slide 3 shape patch', blockedShapePatch, 'betterpptx.slide.update_shape')

		const blockedReorder = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: currentDeckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				title: 'Blocked Free Reorder',
				edits: { reorderSlides: { fromIndex: 2, toIndex: 0 } },
				slides: [{
					id: 'slide-1',
					slideIndex: 0,
					layoutIntent: 'title-only',
					content: [],
				}],
			},
		}, context)
		assertFreeGate('slide 3 reorder', blockedReorder, 'betterpptx.slide.reorder')

		const blockedTransform = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: currentDeckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				title: 'Blocked Free Transform',
				edits: { transformShapes: { colorTransform: 'grayscale' } },
				slides: [{
					id: 'slide-1',
					slideIndex: 0,
					layoutIntent: 'title-only',
					content: [],
				}],
			},
		}, context)
		assertFreeGate('deck transform', blockedTransform, 'betterpptx.deck.transform_shapes')
	})
}

async function main() {
	const context = { sessionId: `verify-json-spec-edition-${Date.now()}` }
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-edition-'))
	const audioPath = path.join(tempDir, 'clip.wav')
	await fs.writeFile(audioPath, wavSilence())

	const deck = okResult('deck.new', await callBetterPptxTool('betterpptx.deck.new', {
		title: 'JSON Spec Edition Source',
		directorMode: 'primitive-direct',
	}, context))
	const deckId = deck.deckId
	let deckVersion = deck.deckVersion

	const slide0 = await addSlide(context, deckId, deckVersion, 'slide0', { color: 'FFFFFF' }, 'Patch source')
	deckVersion = slide0.deckVersion
	const slide1 = await addSlide(context, deckId, deckVersion, 'slide1', { color: 'F8FAFC' }, 'Stable slide')
	deckVersion = slide1.deckVersion
	const slide2 = await addSlide(context, deckId, deckVersion, 'slide2', { color: 'EEF2FF' }, 'Delete candidate')
	deckVersion = slide2.deckVersion

	deckVersion = okResult('slide.add_shape delete target', await callBetterPptxTool('betterpptx.slide.add_shape', {
		deckId,
		deckVersion,
		slideIndex: 0,
		shapeName: 'rect',
		options: { x: 0.5, y: 1.0, w: 1.4, h: 0.5, fill: { color: 'FEE2E2' }, line: { color: 'EF4444' }, objectName: 'delete-me' },
		text: 'delete',
	}, context)).deckVersion
	deckVersion = okResult('slide.add_shape reorder target', await callBetterPptxTool('betterpptx.slide.add_shape', {
		deckId,
		deckVersion,
		slideIndex: 0,
		shapeName: 'roundRect',
		options: { x: 2.1, y: 1.0, w: 1.6, h: 0.5, fill: { color: 'DBEAFE' }, line: { color: '2563EB' }, objectName: 'reorder-me' },
		text: 'reorder',
	}, context)).deckVersion
	deckVersion = okResult('slide.add_chart', await callBetterPptxTool('betterpptx.slide.add_chart', {
		deckId,
		deckVersion,
		slideIndex: 0,
		chartType: 'bar',
		data: [{ name: 'Series 1', labels: ['Q1', 'Q2'], values: [1, 2] }],
		options: { x: 0.5, y: 1.8, w: 3.0, h: 1.4, objectName: 'sales-chart' },
	}, context)).deckVersion
	deckVersion = okResult('slide.add_table', await callBetterPptxTool('betterpptx.slide.add_table', {
		deckId,
		deckVersion,
		slideIndex: 0,
		rows: [['Metric', 'Value'], ['Old', '1']],
		options: { x: 0.5, y: 3.4, w: 3.0, h: 0.9, objectName: 'sales-table' },
	}, context)).deckVersion
	deckVersion = okResult('slide.add_equation', await callBetterPptxTool('betterpptx.slide.add_equation', {
		deckId,
		deckVersion,
		slideIndex: 0,
		source: 'a+b=c',
		sourceFormat: 'unicodeMath',
		x: 4.0,
		y: 0.5,
		w: 2.4,
		h: 0.6,
		objectName: 'equation-main',
	}, context)).deckVersion
	deckVersion = okResult('slide.add_smartart', await callBetterPptxTool('betterpptx.slide.add_smartart', {
		deckId,
		deckVersion,
		slideIndex: 0,
		mode: 'native',
		layout: 'process',
		nodes: ['Old step', 'Old outcome'],
		x: 4.0,
		y: 1.5,
		w: 3.0,
		h: 1.2,
		objectName: 'process-flow',
	}, context)).deckVersion
	deckVersion = okResult('slide.add_media', await callBetterPptxTool('betterpptx.slide.add_media', {
		deckId,
		deckVersion,
		slideIndex: 0,
		options: { type: 'audio', path: audioPath, extn: 'wav', x: 4.0, y: 3.0, w: 0.4, h: 0.3, objectName: 'audio-clip' },
	}, context)).deckVersion

	const patchSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'JSON Spec Edition Patch',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		edits: {
			transformShapes: { colorTransform: 'grayscale' },
			reorderSlides: { fromIndex: 2, toIndex: 1 },
		},
		sections: [],
		assets: [],
		data: [],
		slides: [
			{
				id: 'slide-1',
				slideIndex: 0,
				title: 'Patch Surface',
				layoutIntent: 'title-body',
				background: { color: 'F8FAFC' },
				transition: { type: 'fade', speed: 'medium' },
				notes: 'Patched slide notes.',
				duplicate: {
					count: 1,
					transition: { type: 'morph', option: 'byObject', duration: 800 },
				},
				content: [
					{
						kind: 'text',
						name: 'title patch',
						objectName: 'slide0.title',
						text: 'Patched title',
						style: { color: '2563EB', bold: true },
					},
					{
						kind: 'shape',
						name: 'delete target',
						objectName: 'delete-me',
						delete: true,
					},
					{
						kind: 'shape',
						name: 'reorder target',
						objectName: 'reorder-me',
						position: 'back',
					},
					{
						kind: 'chart-panel',
						name: 'chart',
						objectName: 'sales-chart',
						chartType: 'line',
						data: [{ name: 'Series 1', labels: ['Q1', 'Q2'], values: [3, 5] }],
						patch: { optionsPatch: { showLegend: false } },
					},
					{
						kind: 'table-panel',
						name: 'table',
						objectName: 'sales-table',
						rows: [['Metric', 'Value'], ['New', '5']],
					},
					{
						kind: 'equation',
						name: 'equation',
						objectName: 'equation-main',
						source: 'x^2+y^2=z^2',
						sourceFormat: 'unicodeMath',
						style: { color: '2563EB', fontSize: 18 },
					},
					{
						kind: 'smartart',
						name: 'smartart',
						objectName: 'process-flow',
						nodes: ['New step', 'New outcome'],
						layout: 'process',
					},
					{
						kind: 'media',
						name: 'media',
						objectName: 'audio-clip',
						volume: 0.4,
						command: 'playFrom(0.0)',
						replaceExistingCommands: true,
					},
				],
			},
			{
				id: 'slide-2',
				slideIndex: 1,
				layoutIntent: 'title-only',
				hidden: true,
				notes: 'Second slide was also patched.',
				content: [],
			},
			{
				id: 'slide-3',
				slideIndex: 2,
				layoutIntent: 'title-only',
				delete: true,
				content: [],
			},
		],
	}
	const patchDryRun = okResult('deck.generate_from_spec patch dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId,
		deckVersion,
		commitMode: 'patch',
		phase: 'dryRun',
		spec: patchSpec,
		includePatchPlan: true,
	}, context))
	const patchEstimate = patchDryRun.billing?.patchEstimate
	if (!patchEstimate || patchEstimate.operationCount < 10) fail('patch dry-run did not report patch operation estimate.', patchDryRun)
	if (!patchEstimate.operations.some(item => item.tool === 'betterpptx.deck.transform_shapes' && Number(item.estimatedCredits) > 0)) {
		fail('patch dry-run did not report billable deck transform estimate.', patchEstimate)
	}
	if (!Array.isArray(patchDryRun.patchOperations) || !patchDryRun.patchOperations.some(item => item.tool === 'betterpptx.deck.transform_shapes')) {
		fail('patch dry-run did not expose requested patch operation plan.', patchDryRun)
	}

	const patched = okResult('deck.generate_from_spec patch', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId,
		deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: patchSpec,
		billingConfirmed: true,
	}, context))
	const results = patched.patchResults || []
	findResult(results, 'deck transform', item => Number.isInteger(item.shapesTouched) && item.shapesTouched > 0)
	findResult(results, 'slide duplicate', item => Array.isArray(item.newSlideIndexes) && item.newSlideIndexes.length === 1)
	findResult(results, 'slide update', item => Array.isArray(item.updated) && item.updated.includes('notes') && item.updated.includes('transition'))
	findResult(results, 'shape text update', item => Array.isArray(item.patchedKeys) && item.objectName === 'slide0.title' && item.patchedKeys.includes('text'))
	findResult(results, 'shape delete', item => item.deletedCount === 1 && Array.isArray(item.deleted) && item.deleted.some(x => x.objectName === 'delete-me'))
	findResult(results, 'shape reorder', item => item.objectName === 'reorder-me' && Number.isInteger(item.fromIndex) && Number.isInteger(item.toIndex))
	findResult(results, 'chart update', item => item.chartType === 'line' && item.seriesCount === 1)
	findResult(results, 'table update', item => item.rows === 2 && item.columns === 2)
	findResult(results, 'equation update', item => Array.isArray(item.patchedKeys) && item.patchedKeys.includes('source'))
	findResult(results, 'smartart update', item => item.nodeCount >= 2)
	findResult(results, 'media update', item => item.animationAdded === true && Number.isInteger(item.mediaVolume))
	findResult(results, 'slide delete', item => item.deletedCount === 1 && item.slideCount === 3)
	findResult(results, 'slide reorder', item => Array.isArray(item.order) && item.slideCount === 3)
	assertNoUnsupported(patched.unsupportedFindings || [])

	const summary = okResult('deck.summary after patch', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId,
	}, context))
	if (summary.slideCount !== 3) fail('patch lifecycle operations left the wrong slide count.', summary)
	const slide0Inspect = okResult('slide.inspect after patch', await callBetterPptxTool('betterpptx.slide.inspect', {
		deckId,
		slideIndex: 0,
	}, context))
	if (slide0Inspect.notes !== 'Patched slide notes.') fail('slide notes were not patched through JSON spec.', slide0Inspect)
	const validate = okResult('deck.validate', await callBetterPptxTool('betterpptx.deck.validate', {
		deckId,
	}, context))
	await verifyFreePreviewEditGate()

	console.log('JSON SPEC EDITION VERIFY: PASS')
	console.log(JSON.stringify({
		deckId,
		patchResults: results.length,
		patchEstimateCredits: patchEstimate.estimatedCredits,
		slideCount: summary.slideCount,
		chartType: findResult(results, 'chart update', item => item.chartType === 'line').chartType,
		validateOk: !!validate,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
