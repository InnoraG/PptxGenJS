import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	CONNECTOR_STYLE_CONTRACT,
	CONNECTOR_STYLE_FORMATTING_SCHEMA,
	CONNECTOR_STYLE_OVERRIDE_FIELDS,
	CONNECTOR_STYLE_PARTITION_ASSERTION,
	CONNECTOR_STYLE_PRESET_IDS,
	CONNECTOR_STYLE_PUBLIC_PRESETS,
	CONNECTOR_STYLE_ROW_IDS,
	CONNECTOR_STYLE_ROW_RECORDS,
	CONNECTOR_STYLE_RUNTIME_GAPS,
	CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE,
	CONNECTOR_STYLE_STATE_VERSION,
	assertConnectorStyleContractPartition,
	buildConnectorStyleContract,
	connectorStyleCapabilityContractForEntry,
	connectorStylePublicReadback,
	normalizeConnectorLineOverrides,
	normalizeConnectorStyleFormatting,
	recoverConnectorStyleState,
	resolveConnectorStyleComposition,
} from '../connector-style-contract.mjs'
import { listOptionCatalog } from '../option-registry.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'
import deckSpecSchema from '../ir/deck-spec.v1.json' with { type: 'json' }
import {
	CONNECTOR_STYLE_PRESETS,
	applyConnectorStyleComposition,
	applyConnectorStylePreset,
	publicSourceApiGalleryPresets,
} from '../source-api-gallery-presets.mjs'

test('connector ribbon rows and presets form one exact 42-item identity map', () => {
	assert.deepEqual(assertConnectorStyleContractPartition(), CONNECTOR_STYLE_PARTITION_ASSERTION)
	assert.deepEqual(CONNECTOR_STYLE_PARTITION_ASSERTION, {
		rows: 42,
		presets: 42,
		capabilityStatus: 'executable-exact-structured',
		runtimeIntegrationComplete: true,
	})
	assert.equal(new Set(CONNECTOR_STYLE_ROW_IDS).size, 42)
	assert.equal(new Set(CONNECTOR_STYLE_PRESET_IDS).size, 42)
	assert.deepEqual(CONNECTOR_STYLE_PRESET_IDS, CONNECTOR_STYLE_PRESETS.map(preset => preset.id))
	assert.deepEqual(CONNECTOR_STYLE_ROW_RECORDS.map(record => record.label), CONNECTOR_STYLE_PRESETS.map(preset => preset.label))
	assert.equal(CONNECTOR_STYLE_ROW_RECORDS[0].rowId, 'cap_f7954e8f57ad8edc95c1')
	assert.equal(CONNECTOR_STYLE_ROW_RECORDS[41].rowId, 'cap_03dcee3316a492f9179e')
})

test('preset public truth contains IDs and parameter names but no raw or typed recipe payload', () => {
	const publicProjection = publicSourceApiGalleryPresets().filter(entry => entry.gallery === 'connector-styles')
	assert.equal(publicProjection.length, 42)
	assert.equal(CONNECTOR_STYLE_PUBLIC_PRESETS.length, 42)
	for (const entry of publicProjection) {
		assert.equal(Object.hasOwn(entry, 'recipe'), false)
		assert.equal(Object.hasOwn(entry, 'themeStyle'), false)
		assert.equal(Object.hasOwn(entry, 'lineDefaults'), false)
		assert.ok(entry.parameters.includes('line.endArrowLength'))
	}
	assert.doesNotMatch(JSON.stringify(publicProjection), /_rawConnector|<a:|<p:/i)
	assert.doesNotMatch(JSON.stringify(CONNECTOR_STYLE_PUBLIC_PRESETS), /themeStyle|lineDefaults|_rawConnector|<a:|<p:/i)
})

test('selector and typed line normalization accept canonical vectors and fail closed', () => {
	assert.equal(CONNECTOR_STYLE_FORMATTING_SCHEMA.additionalProperties, false)
	assert.deepEqual(normalizeConnectorStyleFormatting({
		connectorStylePresetId: 'connector-ribbon-028',
		line: { type: 'solid', color: '38BDF8', width: 2, transparency: 12.5, dash: 'dashDot', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' },
	}), {
		connectorStylePresetId: 'connector-ribbon-028',
		line: { type: 'solid', color: '38BDF8', width: 2, transparency: 12.5, dashType: 'dashDot', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' },
	})
	assert.equal(normalizeConnectorStyleFormatting(null), null)
	assert.deepEqual(normalizeConnectorLineOverrides(null), null)
	assert.throws(() => normalizeConnectorStyleFormatting({ connectorStylePresetId: 'connector-ribbon-999' }), /42 public connector ribbon IDs/)
	assert.throws(() => normalizeConnectorStyleFormatting({ connectorStylePresetId: 'connector-ribbon-001', privateRecipe: true }), /not part of the public connector style contract/)
	assert.throws(() => normalizeConnectorLineOverrides({ endArrowWidth: 'xl' }), /not supported/)
	assert.throws(() => normalizeConnectorLineOverrides({ dash: 'dash', dashType: 'dot' }), /cannot conflict/)
	assert.throws(() => normalizeConnectorLineOverrides({ width: 1 / 1000 }), /must use a .* step/)
})

test('composition state owns preset base, explicit overrides, precedence, patch reset, and readback separately', () => {
	const initial = resolveConnectorStyleComposition({
		connectorStylePresetId: 'connector-ribbon-036',
		line: { endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' },
	})
	assert.equal(initial.schemaVersion, CONNECTOR_STYLE_STATE_VERSION)
	assert.deepEqual(initial.presetLineDefaults, { beginArrowType: 'triangle', endArrowType: 'triangle' })
	assert.deepEqual(initial.authoredLineOverrides, { endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' })
	assert.deepEqual(initial.effectiveLine, { beginArrowType: 'triangle', endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' })

	const componentReset = resolveConnectorStyleComposition({ line: { endArrowType: null, beginArrowWidth: 'lg' } }, initial, { mode: 'patch' })
	assert.deepEqual(componentReset.authoredLineOverrides, { endArrowWidth: 'lg', endArrowLength: 'sm', beginArrowWidth: 'lg' })
	assert.deepEqual(componentReset.effectiveLine, { beginArrowType: 'triangle', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm', beginArrowWidth: 'lg' })

	const selectorReset = resolveConnectorStyleComposition({ connectorStylePresetId: null }, componentReset, { mode: 'patch' })
	assert.equal(selectorReset.themeStyle, null)
	assert.deepEqual(selectorReset.effectiveLine, selectorReset.authoredLineOverrides)
	assert.deepEqual(connectorStylePublicReadback(selectorReset), { connectorStylePresetId: null, line: selectorReset.authoredLineOverrides })
	assert.doesNotMatch(JSON.stringify(connectorStylePublicReadback(selectorReset)), /themeStyle|presetLineDefaults|effectiveLine|_rawConnector/)

	const fullReset = resolveConnectorStyleComposition({ line: null }, selectorReset, { mode: 'patch' })
	assert.deepEqual(fullReset.authoredLineOverrides, {})
	assert.deepEqual(fullReset.effectiveLine, {})
})

test('applicator carries normalized state for compiler and engine integration', () => {
	const state = resolveConnectorStyleComposition({ connectorStylePresetId: 'connector-ribbon-023', line: { dashType: 'sysDash', width: 2 } })
	const applied = applyConnectorStyleComposition({ x: 1, y: 2, w: 3, h: 1 }, state)
	assert.equal(applied.preset.id, 'connector-ribbon-023')
	assert.deepEqual(applied.options._connectorStyleState, state)
	assert.deepEqual(applied.options.line, { dashType: 'sysDash', width: 2 })
	assert.match(applied.options._rawConnectorStyleXml, /schemeClr val="accent1"/)
	assert.match(applied.options._rawConnectorLineXml, /prstDash val="dash"/)

	const legacy = applyConnectorStylePreset({}, 'connector-ribbon-036')
	assert.equal(legacy.state.connectorStylePresetId, 'connector-ribbon-036')
	assert.deepEqual(legacy.state.authoredLineOverrides, {})
	assert.deepEqual(legacy.state.effectiveLine, { beginArrowType: 'triangle', endArrowType: 'triangle' })
})

test('opened exact gallery connectors recover typed selector state without exposing raw XML', () => {
	for (const preset of CONNECTOR_STYLE_PRESETS) {
		const recovered = recoverConnectorStyleState({ ...preset.recipe })
		assert.ok(recovered, preset.id)
		assert.equal(recovered.connectorStylePresetId, preset.id)
		assert.deepEqual(recovered.authoredLineOverrides, {})
		assert.deepEqual(connectorStylePublicReadback(recovered), { connectorStylePresetId: preset.id, line: {} })
	}
	assert.equal(recoverConnectorStyleState({ _rawConnectorStyleXml: '<p:style/>', _rawConnectorLineXml: '<a:ln/>' }), null)
	assert.equal(recoverConnectorStyleState({ _rawConnectorStyleXml: CONNECTOR_STYLE_PRESETS[0].recipe._rawConnectorStyleXml }), null)
})

test('tool and deck-spec schemas project the exact generated selector and line contract', () => {
	const add = TOOLS.find(tool => tool.name === 'betterpptx.slide.add_connector')
	const update = TOOLS.find(tool => tool.name === 'betterpptx.slide.update_shape')
	assert.ok(add)
	assert.ok(update)
	assert.deepEqual(add.inputSchema.properties.connectorStylePresetId.oneOf[1].enum, CONNECTOR_STYLE_PRESET_IDS)
	assert.deepEqual(add.inputSchema.properties.options.properties.connectorStylePresetId.oneOf[1].enum, CONNECTOR_STYLE_PRESET_IDS)
	assert.deepEqual(update.inputSchema.properties.patch.properties.connectorStylePresetId.oneOf[1].enum, CONNECTOR_STYLE_PRESET_IDS)
	assert.equal(add.inputSchema.properties.line.oneOf[1].additionalProperties, false)
	assert.equal(update.inputSchema.properties.patch.properties.line.oneOf[1].properties.width.multipleOf, 1 / 12700)
	assert.deepEqual(deckSpecSchema.$defs.connectorStylePresetId.oneOf[1].enum, CONNECTOR_STYLE_PRESET_IDS)
	assert.equal(deckSpecSchema.$defs.connectorLine.oneOf[1].additionalProperties, false)
	assert.ok(deckSpecSchema.$defs.contentBlock.properties.kind.enum.includes('connector'))
})

test('compiler maps all 42 selectors and keeps generic fallback line out of authored state', () => {
	const planFor = content => buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'connector contract', layout: 'LAYOUT_WIDE',
		slides: [{ id: 's1', title: 'Connector contract', message: 'Native connector proof', layoutIntent: 'title-body', content }],
	}, { plan: 'premium', dryRun: true })
	for (const presetId of CONNECTOR_STYLE_PRESET_IDS) {
		const plan = planFor([{ kind: 'connector', name: presetId, connectorStylePresetId: presetId, style: { line: { width: 2, endArrowType: 'oval' } } }])
		const op = plan.operations.find(item => item.tool === 'betterpptx.slide.add_connector' && item.objectName?.includes(presetId))
		assert.ok(op, presetId)
		assert.equal(op.args.options._connectorStyleState.connectorStylePresetId, presetId)
		assert.deepEqual(op.args.options._connectorStyleState.authoredLineOverrides, { width: 2, endArrowType: 'oval' })
	}
	const generic = planFor([{ kind: 'connector', name: 'generic' }]).operations.find(item => item.tool === 'betterpptx.slide.add_connector' && item.objectName?.includes('generic'))
	assert.ok(generic)
	assert.equal(generic.args.options._connectorStyleState, undefined)
	assert.ok(generic.args.options.line)
	assert.throws(() => planFor([{ kind: 'connector', name: 'bad', connectorStylePresetId: 'connector-ribbon-999' }]), /42 public connector ribbon IDs/)
	assert.throws(() => planFor([{ kind: 'connector', name: 'bad-line', connectorStylePresetId: 'connector-ribbon-001', style: { line: { endArrowWidth: 'xl' } } }]), /not supported|must be one of/)
})

test('engine add, sparse re-edit, reset, and semantic export retain connector style ownership', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `connector-style-${Date.now()}`, blackBox: false })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Connector style lifecycle', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Prove connector style lifecycle.', remember: 'Sparse overrides remain independent.' },
		handshake: { audience: 'maintainers', promise: 'Keep connector formatting semantic.', proof: ['One editable native connector.'], bar: 'Reset leaves no stale preset line.' },
		visualDesign: { world: 'Editorial', framing: 'One native connector', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		slides: [{ id: 'proof', title: 'Connector formatting', message: 'Preset and sparse override proof.', role: 'evidence', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Connector formatting' },
			{ kind: 'connector', name: 'connector-proof', connectorStylePresetId: 'connector-ribbon-036', style: { line: { width: 2, endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' } } },
		] }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
	let deckId = null
	try {
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(committed?.ok, true, JSON.stringify(committed))
		deckId = (committed.data || committed).deckId
		let connector = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object?._type === 'connector')
		assert.ok(connector)
		assert.equal(connector.options._connectorStyleState.connectorStylePresetId, 'connector-ribbon-036')
		assert.deepEqual(connector.options._connectorStyleState.authoredLineOverrides, { width: 2, endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' })
		assert.equal(connector.options.line.beginArrowType, 'triangle')
		assert.equal(connector.options.line.endArrowType, 'oval')

		const exported = await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })
		assert.equal(exported?.ok, true, JSON.stringify(exported))
		const exportedConnector = (exported.data || exported).spec.slides[0].content.find(block => block.kind === 'connector')
		assert.equal(exportedConnector.connectorStylePresetId, 'connector-ribbon-036')
		assert.deepEqual(exportedConnector.style.line, { width: 2, endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' })
		assert.doesNotMatch(JSON.stringify(exportedConnector), /_connectorStyleState|_rawConnector|themeStyle|effectiveLine/)

		const patchSpec = patch => ({
			...structuredClone(spec),
			slides: [{ id: 'proof', slideIndex: 0, title: 'Connector formatting', message: 'Preset and sparse override proof.', role: 'evidence', layoutIntent: 'title-body', content: [
				{ kind: 'connector', name: 'connector-proof', objectName: connector.options.objectName, patch },
			] }],
		})
		const patch = async value => {
			const result = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, spec: patchSpec(value), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' })
			assert.equal(result?.ok, true, JSON.stringify(result))
			connector = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object?._type === 'connector')
			return connector
		}
		await patch({ line: { endArrowType: null, beginArrowWidth: 'lg' } })
		assert.deepEqual(connector.options._connectorStyleState.authoredLineOverrides, { width: 2, endArrowWidth: 'lg', endArrowLength: 'sm', beginArrowWidth: 'lg' })
		assert.equal(connector.options.line.endArrowType, 'triangle')
		await patch({ connectorStylePresetId: null })
		assert.equal(connector.options._connectorStyleState.connectorStylePresetId, null)
		assert.equal(connector.options._rawConnectorStyleXml, undefined)
		assert.equal(connector.options.line.beginArrowType, undefined)
		await patch({ line: null })
		assert.deepEqual(connector.options._connectorStyleState.authoredLineOverrides, {})
		assert.deepEqual(connector.options.line, {})
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('live capability truth and option help promote only after runtime integration proof', () => {
	assert.equal(CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE, true)
	assert.equal(CONNECTOR_STYLE_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(CONNECTOR_STYLE_CONTRACT.overrideFields, CONNECTOR_STYLE_OVERRIDE_FIELDS)
	assert.deepEqual(CONNECTOR_STYLE_CONTRACT.completionGaps, {})
	assert.ok(CONNECTOR_STYLE_RUNTIME_GAPS.missingFields.length > 0, 'historical inventory remains available as proof metadata')
	assert.equal(buildConnectorStyleContract({ runtimeIntegrationComplete: true }).capabilityStatus, 'executable-exact-structured')
	assert.equal(buildConnectorStyleContract({ runtimeIntegrationComplete: false }).capabilityStatus, 'structured-partial')

	for (const record of CONNECTOR_STYLE_ROW_RECORDS) {
		const entry = { id: record.rowId, family: 'structural', sourceKind: 'native-gallery-style', label: `${record.label} -> ${record.presetId}`, implemented: true }
		assert.equal(connectorStyleCapabilityContractForEntry(entry), CONNECTOR_STYLE_CONTRACT)
		const truth = applyCatalogTruth(entry)
		assert.equal(truth.capabilityStatus, 'executable-exact-structured')
		assert.deepEqual(truth.overrideFields, CONNECTOR_STYLE_OVERRIDE_FIELDS)
	}

	const surface = listOptionCatalog({ surface: 'connectorStylePreset', format: 'full' }).surfaces.find(item => item.id === 'connectorStylePreset')
	assert.ok(surface)
	assert.equal(surface.canonical.length, 42)
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(surface.precedence, CONNECTOR_STYLE_CONTRACT.precedence)
	assert.doesNotMatch(JSON.stringify(surface), /_rawConnector|<a:|<p:/i)

	const publicRows = publicBaselineCatalog({ family: 'structural', limit: 500 }).entries.filter(entry => String(entry.selection?.executableId || '').startsWith('connector-ribbon-'))
	assert.equal(publicRows.length, 42)
	assert.ok(publicRows.every(entry => entry.capabilityStatus === 'executable-exact-structured'))
})
