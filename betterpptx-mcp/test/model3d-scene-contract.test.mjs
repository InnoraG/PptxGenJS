import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function spec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Repair-safe native model scene',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation reviewers', outcome: 'Use repair-safe native 3-D playback.', remember: 'Static posture comes from the asset base pose.' },
		handshake: { audience: 'presentation reviewers', promise: 'Use repair-safe native 3-D playback.', proof: ['The unsupported poster selector blocks before commit.'], bar: 'The rendered static pose and native playback must both pass PowerPoint review.' },
		visualDesign: { world: 'Technical stage', framing: 'One native model', tone: 'clear' },
		styleIntent: { artDirection: 'blueprint', mode: 'dark' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic motion plan', syncPolicy: 'single deck clock' },
		selectionManifest: { schemaVersion: 'betterpptx.ai-selection-manifest.v1', enforcement: 'required', selections: [{ slideId: 'scene', target: 'actor', capability: 'model3d', representation: 'native', selectors: { model3dViewPresetId: 'model3d-view-012' }, coherenceReason: 'The explicit native view keeps the rigged actor legible.' }] },
		layout: 'LAYOUT_WIDE',
		slides: [{ id: 'scene', title: 'Repair-safe native model scene', message: 'The timing tree selects motion; the GLB base pose owns static view.', role: 'proof', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'scene-title', text: 'Repair-safe native model scene' },
			{ kind: 'model3d', name: 'actor', modelAsset: 'model3d://microsoft-stock/example/rigged-actor', model3dViewPresetId: 'model3d-view-012', scene: { animId: 0, loop: true, posterAnimId: 1 }, altText: 'Editable rigged native 3-D actor.' },
		] }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

test('public dry-run blocks the non-executable model poster animation selector', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `model-scene-block-${Date.now()}`, clientInfo: { name: 'model-scene-verifier', version: '1' }, blackBox: true })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: spec(), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	const finding = result?.error?.details?.errors?.find(item => item.code === 'MODEL3D_POSTER_ANIMATION_UNSUPPORTED')
	assert.equal(result?.ok, false)
	assert.equal(finding?.severity, 'error')
	assert.equal(finding?.evidence?.unsupportedField, 'scene.posterAnimId')
	assert.equal(finding?.evidence?.engineAction, 'block-without-emitting-unsafe-package-state')
	assert.equal(result?.error?.next_actions?.[0]?.type, 'remove_unsupported_model3d_poster_animation')
	assert.equal(result?.deckId, undefined)
})

test('public dry-run accepts the repair-safe timing-tree scene fields', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `model-scene-safe-${Date.now()}`, clientInfo: { name: 'model-scene-verifier', version: '1' }, blackBox: true })
	const authored = spec()
	delete authored.slides[0].content[1].scene.posterAnimId
	const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: authored, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	assert.equal(result?.ok, true, JSON.stringify(result))
	const data = result.data || result
	assert.equal([...(data.errors || []), ...(data.warnings || [])].some(item => item.code === 'MODEL3D_POSTER_ANIMATION_UNSUPPORTED'), false)
	assert.equal(data.mutationFree, true)
	assert.equal(data.deckId, undefined)
})
