import assert from 'node:assert/strict'
import test from 'node:test'

import {
	applyShapeFormattingToOptions,
	publicShapeFormattingReadback,
	resolveShapeFormatting,
	SHAPE_EFFECT_PRESET_IDS,
	SHAPE_FORMATTING_CONTRACT,
	SHAPE_FORMATTING_SCHEMA,
	SHAPE_GEOMETRY_ALIASES,
	SHAPE_PRESET_GEOMETRIES,
	SHAPE_STYLE_PRESET_IDS,
} from '../native-formatting-contract.mjs'
import { shapeStylePresetById } from '../native-style-presets.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'

test('shared shape formatting contract is generated from executable native catalogs', () => {
	assert.equal(SHAPE_FORMATTING_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(SHAPE_PRESET_GEOMETRIES.length, 180)
	assert.equal(SHAPE_STYLE_PRESET_IDS.length, 77)
	assert.equal(SHAPE_EFFECT_PRESET_IDS.length, 136)
	assert.equal(SHAPE_GEOMETRY_ALIASES.RECTANGLE, 'rect')
	assert.deepEqual(SHAPE_FORMATTING_SCHEMA.properties.shapeStylePresetId.oneOf[1].enum, SHAPE_STYLE_PRESET_IDS)
	assert.deepEqual(SHAPE_FORMATTING_SCHEMA.properties.shapeEffectPresetIds.oneOf[1].items.enum, SHAPE_EFFECT_PRESET_IDS)
	assert.throws(() => resolveShapeFormatting({ shapeStylePresetId: 'shape-style-999' }), /unknown/)
	assert.throws(() => resolveShapeFormatting({ fill: { type: 'gradient', gradientStops: [{ color: 'FFFFFF' }] } }), /at least two stops/)
})

test('add and update tool schemas project the generated contract', () => {
	const add = TOOLS.find(tool => tool.name === 'betterpptx.slide.add_shape')
	const update = TOOLS.find(tool => tool.name === 'betterpptx.slide.update_shape')
	assert.deepEqual(add.inputSchema.properties.shapeName.enum, SHAPE_PRESET_GEOMETRIES)
	assert.deepEqual(add.inputSchema.properties.options.properties.shapeStylePresetId.oneOf[1].enum, SHAPE_STYLE_PRESET_IDS)
	assert.deepEqual(add.inputSchema.properties.options.properties.shapeEffectPresetIds.oneOf[1].items.enum, SHAPE_EFFECT_PRESET_IDS)
	assert.equal(update.inputSchema.properties.patch.properties.fill.oneOf[0].type, 'null')
})

test('resolver applies style base, ordered effect bases, then authored overrides', () => {
	const result = resolveShapeFormatting({
		shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0],
		shapeEffectPresetIds: SHAPE_EFFECT_PRESET_IDS.slice(0, 2),
		fill: { type: 'solid', color: '2563EB' },
		line: { color: 'FFFFFF', width: 2 },
	})
	assert.equal(result.effectiveOptions.fill.color, '2563EB')
	assert.equal(result.effectiveOptions.line.width, 2)
	assert.equal(result.state.shapeStylePresetId, SHAPE_STYLE_PRESET_IDS[0])
	assert.deepEqual(result.state.shapeEffectPresetIds, SHAPE_EFFECT_PRESET_IDS.slice(0, 2))
	assert.deepEqual(publicShapeFormattingReadback(result.effectiveOptions), {
		shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0],
		shapeEffectPresetIds: SHAPE_EFFECT_PRESET_IDS.slice(0, 2),
		fill: { type: 'solid', color: '2563EB' },
		line: { color: 'FFFFFF', width: 2 },
	})
})

test('component and nested-leaf null reset authored state without stale preset recipes', () => {
	const initial = resolveShapeFormatting({
		shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0],
		fill: { color: 'FFFFFF' },
		line: { color: '111111', width: 3 },
	})
	const leafReset = resolveShapeFormatting({ line: { color: null } }, initial.state, { mode: 'patch' })
	assert.deepEqual(leafReset.state.authoredOverrides.line, { width: 3 })
	const componentReset = resolveShapeFormatting({ fill: null }, leafReset.state, { mode: 'patch' })
	assert.equal(componentReset.state.authoredOverrides.fill, undefined)
	assert.equal(componentReset.effectiveOptions.fill, undefined)
	assert.equal(componentReset.effectiveOptions._rawFillXml, shapeStylePresetById(SHAPE_STYLE_PRESET_IDS[0]).recipe._rawFillXml)
})

test('preset replacement and removal recompute effective options from a clean base', () => {
	const first = resolveShapeFormatting({ shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0] })
	const second = resolveShapeFormatting({ shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[1] }, first.state, { mode: 'patch' })
	assert.equal(second.effectiveOptions._rawShapeStyleXml, shapeStylePresetById(SHAPE_STYLE_PRESET_IDS[1]).recipe._rawShapeStyleXml)
	assert.notEqual(second.effectiveOptions._rawShapeStyleXml, shapeStylePresetById(SHAPE_STYLE_PRESET_IDS[0]).recipe._rawShapeStyleXml)
	const removed = resolveShapeFormatting({ shapeStylePresetId: null }, second.state, { mode: 'patch' })
	assert.equal(removed.state.shapeStylePresetId, null)
	assert.equal(removed.effectiveOptions._rawShapeStyleXml, undefined)
	assert.equal(removed.effectiveOptions._rawLineXml, undefined)
})

test('deck-spec shapes carry semantic state while retaining effective native options', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'formatting contract', layout: 'LAYOUT_WIDE',
		slides: [{ id: 's1', title: 'Shape contract', message: 'Native shape proof', layoutIntent: 'title-body', content: [{
			kind: 'shape', name: 'proof', shapeName: 'roundRect', rect: { x: 1, y: 1, w: 3, h: 1.5 },
			shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0],
			shapeEffectPresetIds: SHAPE_EFFECT_PRESET_IDS.slice(0, 2),
			style: { fill: { color: '38BDF8' }, line: { color: 'FFFFFF', width: 2 } },
		}], }],
	}, { plan: 'premium', dryRun: true })
	const shape = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_shape' && operation.objectName?.endsWith('.proof.shape'))
	assert.ok(shape)
	assert.equal(shape.args.options.fill.color, '38BDF8')
	assert.equal(shape.args.options._shapeFormattingState.shapeStylePresetId, SHAPE_STYLE_PRESET_IDS[0])
	assert.deepEqual(shape.args.options._shapeFormattingState.shapeEffectPresetIds, SHAPE_EFFECT_PRESET_IDS.slice(0, 2))
	assert.deepEqual(publicShapeFormattingReadback(shape.args.options).fill, { color: '38BDF8' })
})

test('apply helper preserves ordinary shape options outside formatting state', () => {
	const applied = applyShapeFormattingToOptions({
		x: 1, y: 2, w: 3, h: 4, objectName: 'proof',
		shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0],
		fill: { color: 'ABCDEF' },
	})
	assert.equal(applied.options.objectName, 'proof')
	assert.equal(applied.options.x, 1)
	assert.equal(applied.options.fill.color, 'ABCDEF')
	assert.equal(applied.options._shapeFormattingState.schemaVersion, 'betterpptx.shape-formatting-state.v1')
})

test('engine add, update, and export share semantic preset/reset state', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `shared-shape-formatting-${Date.now()}`, clientInfo: { name: 'shared-shape-formatting-test', version: '1' }, blackBox: false })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Shared shape formatting lifecycle', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Prove shared shape resets.', remember: 'Preset recipes never become stale authored state.' },
		handshake: { audience: 'maintainers', promise: 'Keep shape formatting semantic.', proof: ['One editable native shape.'], bar: 'Preset reset leaves no expanded residue.' },
		visualDesign: { world: 'Editorial', framing: 'One native shape', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		slides: [{ id: 'proof', title: 'Shared shape formatting', message: 'Preset reset proof.', role: 'evidence', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Shared shape formatting' },
			{ kind: 'shape', name: 'shape-proof', shapeName: 'roundRect', decorative: true, keep: true, shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0], style: { fill: { color: '38BDF8' }, line: { color: 'FFFFFF', width: 2 } } },
		] }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
	let deckId = null
	try {
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(committed?.ok, true, JSON.stringify(committed))
		deckId = (committed.data || committed).deckId
		const deck = getDeck(deckId)
		let shape = deck.pptx.slides[0]._slideObjects.find(object => object.options?.objectName?.endsWith('.shape-proof.shape'))
		assert.ok(shape)
		assert.equal(shape.options._shapeFormattingState.shapeStylePresetId, SHAPE_STYLE_PRESET_IDS[0])
		const sparsePatchSpec = patch => ({
			...structuredClone(spec),
			slides: [{ id: 'proof', slideIndex: 0, title: 'Shared shape formatting', message: 'Preset reset proof.', role: 'evidence', layoutIntent: 'title-body', content: [
				{ kind: 'shape', name: 'shape-proof', objectName: shape.options.objectName, patch },
			] }],
		})
		const resetFill = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: deck.deckVersion, commitMode: 'patch', phase: 'commit', spec: sparsePatchSpec({ fill: null }), plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(resetFill?.ok, true, JSON.stringify(resetFill))
		const resetData = resetFill.data || resetFill
		assert.equal(resetData.patchResults?.length, 1, JSON.stringify(resetData))
		assert.deepEqual(resetData.unsupportedFindings || [], [], JSON.stringify(resetData))
		shape = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.objectName?.endsWith('.shape-proof.shape'))
		assert.equal(shape.options._shapeFormattingState.authoredOverrides.fill, undefined, JSON.stringify({ patchResult: resetData.patchResults?.[0], kind: shape.type || shape._type, state: shape.options._shapeFormattingState }))
		assert.equal(shape.options.shapeStylePresetId, SHAPE_STYLE_PRESET_IDS[0])
		const removePreset = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, commitMode: 'patch', phase: 'commit', spec: sparsePatchSpec({ shapeStylePresetId: null }), plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(removePreset?.ok, true, JSON.stringify(removePreset))
		shape = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.objectName?.endsWith('.shape-proof.shape'))
		assert.equal(shape.options._rawShapeStyleXml, undefined)
		const exported = await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })
		assert.equal(exported?.ok, true, JSON.stringify(exported))
		assert.doesNotMatch(JSON.stringify(exported.data || exported), /_shapeFormattingState|_rawShapeStyleXml/)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
