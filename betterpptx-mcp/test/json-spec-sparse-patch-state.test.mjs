import assert from 'node:assert/strict'
import test from 'node:test'

import { calibrationCases } from '../../tools/build-first-time-right-calibration-specs.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dataOf = result => {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function laneESpec() {
	const source = calibrationCases.find(item => item.id === 'lane-e-board-churn-revision-generated')?.spec
	assert.ok(source, 'Lane E calibration spec is unavailable')
	return structuredClone(source)
}

function sparsePatchSpec(source, { selectionManifest } = {}) {
	return {
		schemaVersion: source.schemaVersion,
		title: source.title,
		authoringContract: structuredClone(source.authoringContract),
		contentStory: structuredClone(source.contentStory),
		handshake: structuredClone(source.handshake),
		visualDesign: structuredClone(source.visualDesign),
		styleIntent: structuredClone(source.styleIntent),
		motionTime: structuredClone(source.motionTime),
		validation: structuredClone(source.validation),
		...(selectionManifest ? { selectionManifest } : {}),
		slides: [{
			id: 'operating-loop',
			slideIndex: 4,
			layoutIntent: 'process-flow',
			content: [{
				kind: 'smartart',
				name: 'retention-smartart',
				objectName: 'operating-loop.retention-smartart.smartart',
				patch: {
					nodeIndex: 2,
					text: 'INTERVENE\nOwner, deadline, and action',
				},
				style: { textColorRole: 'onDark' },
				verified: true,
				evidenceSource: 'bounded retention operating-loop semantic revision',
				altText: 'Native four-step retention operating loop.',
			}],
		}],
	}
}

test('sparse JSON-spec patch preserves full-deck Director and AI-selection state', async () => {
	const source = laneESpec()
	const mcp = createMcpToolDispatcher({
		sessionId: `json-spec-sparse-patch-state-${Date.now()}`,
		clientInfo: { name: 'json-spec-sparse-patch-state-test', version: '1' },
		blackBox: false,
	})
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: source,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		detail: 'full',
	}))
	const deckId = committed.deckId
	try {
		const before = getDeck(deckId)
		assert.equal(before.pptx.slides.length, 10)
		assert.equal(before.director.specCompiled.slideCount, 10)
		assert.equal(before.aiSelectionManifest.source, 'ai-authored')
		assert.equal(before.aiSelectionManifest.enforcement, 'required')
		assert.equal(before.aiSelectionManifest.selectionCount, 4)
		assert.equal(before.aiSelectionManifest.compiledCount, 4)
		const beforeSelections = structuredClone(before.aiSelectionManifest)
		const beforeSemanticContract = structuredClone(before.authoredSemanticContract)
		const beforeSmartArt = before.pptx.slides[4]._slideObjects.find(object => object.options?.objectName === 'operating-loop.retention-smartart.smartart')
		const beforeSmartArtStyle = Object.fromEntries(['fontFace', 'fontSize', 'color', 'textColors', 'palette', 'fill', 'line', 'shadow', 'rightToLeft', 'title', 'altText'].filter(key => beforeSmartArt.options?.[key] !== undefined).map(key => [key, structuredClone(beforeSmartArt.options[key])]))

		const patchSpec = sparsePatchSpec(source)
		const dryRun = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: before.deckVersion,
			commitMode: 'patch',
			phase: 'dryRun',
			spec: patchSpec,
			includePatchPlan: true,
			detail: 'full',
		}))
		assert.equal(dryRun.patchOperations.length, 1, JSON.stringify(dryRun.patchOperations))
		assert.equal(dryRun.patchOperations[0].tool, 'betterpptx.slide.update_smartart')
		assert.equal(dryRun.patchOperations[0].slideIndex, 4)
		assert.equal(dryRun.patchOperations[0].objectName, 'operating-loop.retention-smartart.smartart')
		assert.deepEqual(dryRun.unsupportedFindings || [], [])

		const patched = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: before.deckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: patchSpec,
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		assert.equal(patched.patchResults.length, 1)
		assert.deepEqual(patched.unsupportedFindings || [], [])
		assert.equal(patched.slideCount, 10)
		assert.equal(patched.selectionManifest.source, 'ai-authored')
		assert.equal(patched.selectionManifest.enforcement, 'required')
		assert.equal(patched.selectionManifest.selectionCount, 4)
		assert.equal(patched.selectionManifest.compiledCount, 4)
		assert.deepEqual(patched.semanticRoundtrip, beforeSemanticContract)
		assert.equal(patched.patchSlideCount, 1)
		assert.ok(patched.objectCount > patched.patchObjectCount)

		const after = getDeck(deckId)
		assert.equal(after.pptx.slides.length, 10)
		assert.equal(after.director.specCompiled.slideCount, 10)
		assert.equal(after.director.specCompiled.patchCount, 1)
		assert.equal(after.director.specCompiled.lastPatch.sparseSlideCount, 1)
		assert.deepEqual(after.aiSelectionManifest, beforeSelections)
		assert.deepEqual(after.authoredSemanticContract, beforeSemanticContract)
		const afterSmartArt = after.pptx.slides[4]._slideObjects.find(object => object.options?.objectName === 'operating-loop.retention-smartart.smartart')
		const afterSmartArtStyle = Object.fromEntries(Object.keys(beforeSmartArtStyle).map(key => [key, structuredClone(afterSmartArt.options[key])]))
		assert.deepEqual(afterSmartArtStyle, beforeSmartArtStyle)

		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
		assert.equal(exported.spec.slides.length, 10)
		assert.equal(exported.spec.selectionManifest.enforcement, 'required')
		assert.equal(exported.spec.selectionManifest.selections.length, 4)
		assert.deepEqual(exported.spec.selectionManifest.selections.map(item => item.slideId).sort(), ['cohort-proof', 'operating-loop', 'retention-thesis', 'risk-table'])
		const revisedSmartArt = exported.spec.slides[4].content.find(block => block.objectName === 'operating-loop.retention-smartart.smartart')
		assert.ok(revisedSmartArt)
		assert.equal(revisedSmartArt.nodes[2]?.text ?? revisedSmartArt.nodes[2], 'INTERVENE\nOwner, deadline, and action', JSON.stringify(revisedSmartArt.nodes))

		const explicitSelection = structuredClone(source.selectionManifest)
		explicitSelection.selections = explicitSelection.selections.filter(item => item.slideId === 'operating-loop')
		explicitSelection.selections[0].coherenceReason = 'The AI retains the exact native process treatment while authoring a more accountable intervention checkpoint.'
		const secondPatchSpec = sparsePatchSpec(source, { selectionManifest: explicitSelection })
		const second = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: after.deckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: secondPatchSpec,
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		assert.equal(second.patchResults.length, 1)
		const merged = getDeck(deckId).aiSelectionManifest
		assert.equal(merged.enforcement, 'required')
		assert.equal(merged.selectionCount, 4)
		assert.equal(merged.compiledCount, 4)
		const smartArtSelection = merged.selections.find(item => item.capability === 'smartart')
		assert.equal(smartArtSelection.slideIndex, 4)
		assert.match(smartArtSelection.coherenceReason, /more accountable intervention checkpoint/)
		assert.deepEqual(merged.selections.filter(item => item.capability !== 'smartart'), beforeSelections.selections.filter(item => item.capability !== 'smartart'))
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})

test('structural sparse patch refuses to stale a required selection manifest', async () => {
	const source = laneESpec()
	const mcp = createMcpToolDispatcher({
		sessionId: `json-spec-structural-patch-refusal-${Date.now()}`,
		clientInfo: { name: 'json-spec-structural-patch-refusal-test', version: '1' },
		blackBox: false,
	})
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: source, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	const deckId = committed.deckId
	try {
		const before = getDeck(deckId)
		const firstSlideId = before.pptx.slides[0]._betterpptxSlideId
		const beforeSelections = structuredClone(before.aiSelectionManifest)
		const patchSpec = sparsePatchSpec(source)
		patchSpec.title = 'Unsafe reorder'
		patchSpec.slides[0].reorderToIndex = 0
		const dryRun = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: before.deckVersion, commitMode: 'patch', phase: 'dryRun', spec: patchSpec, includePatchPlan: true, detail: 'full',
		}))
		assert.equal(dryRun.patchOperations.length, 0)
		assert.equal(dryRun.patchUnsupportedFindings[0].code, 'AI_SELECTION_MANIFEST_REINDEX_REQUIRED')
		const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: before.deckVersion, commitMode: 'patch', phase: 'commit', spec: patchSpec, plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(rejected.ok, false)
		assert.equal(rejected.error?.code, 'AI_SELECTION_MANIFEST_REINDEX_REQUIRED')
		const after = getDeck(deckId)
		assert.equal(after.pptx.slides[0]._betterpptxSlideId, firstSlideId)
		assert.deepEqual(after.aiSelectionManifest, beforeSelections)
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})

test('explicit sparse patch upgrades legacy selection state without misplacing the live slide', async () => {
	const source = laneESpec()
	delete source.selectionManifest
	const mcp = createMcpToolDispatcher({
		sessionId: `json-spec-sparse-patch-upgrade-${Date.now()}`,
		clientInfo: { name: 'json-spec-sparse-patch-upgrade-test', version: '1' },
		blackBox: false,
	})
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: source,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		detail: 'full',
	}))
	const deckId = committed.deckId
	try {
		const before = getDeck(deckId)
		assert.equal(before.aiSelectionManifest.source, 'legacy-implicit')
		assert.equal(before.aiSelectionManifest.enforcement, 'advisory')
		const originalLaneE = laneESpec()
		const explicitSelection = structuredClone(originalLaneE.selectionManifest)
		explicitSelection.selections = explicitSelection.selections.filter(item => item.slideId === 'operating-loop')
		const patchSpec = sparsePatchSpec(originalLaneE, { selectionManifest: explicitSelection })
		const patched = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: before.deckVersion,
			commitMode: 'patch',
			phase: 'commit',
			spec: patchSpec,
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		assert.equal(patched.slideCount, 10)
		assert.equal(patched.selectionManifest.source, 'ai-authored')
		assert.equal(patched.selectionManifest.enforcement, 'required')
		assert.equal(patched.selectionManifest.selectionCount, 1)
		assert.equal(patched.selectionManifest.compiledCount, 1)
		assert.equal(patched.selectionManifest.selections[0].slideIndex, 4)
		assert.equal(patched.selectionManifest.selections[0].resolvedObjectName, 'operating-loop.retention-smartart.smartart')
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
