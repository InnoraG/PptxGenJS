import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import { classifyCatalogEntry } from '../capability-truth.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { resolveLayoutThemeMasterSpec } from '../source-api-gallery-presets.mjs'
import {
	OFFICE_THEME_PRESET_ID,
	THEME_PRESET_CONTRACT_ROW,
	THEME_PRESET_ROW_ID,
	themePresetCapabilityContractForEntry,
	themePresetContractById,
} from '../theme-preset-contract.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validate = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dataOf = result => {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function specimenSpec(themePresetId, options = {}) {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: options.title || 'Native Office Theme selector lifecycle',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'PowerPoint authors', outcome: 'prove exact semantic theme selection', remember: 'theme and source carrier identities round-trip' },
		visualDesign: { world: 'native theme proof', framing: 'one resource-scoped Office Theme' },
		motionTime: { masterClock: 'static', timingSource: 'without narration', syncPolicy: 'static' },
		layout: 'LAYOUT_WIDE',
		styleIntent: { mode: 'light', density: 'focused' },
		autoplay: { enabled: false },
		slides: [{
			id: 'theme-proof',
			...(Number.isInteger(options.slideIndex) ? { slideIndex: options.slideIndex } : {}),
			title: 'Office Theme proof',
			role: 'capability-proof',
			message: 'The semantic theme and its resource carrier remain durable.',
			layoutIntent: 'title-body',
			content: [],
		}],
	}
	if (themePresetId !== undefined) spec.themePresetId = themePresetId
	if (options.masterPresetId !== undefined) spec.masterPresetId = options.masterPresetId
	if (options.templatePresetId !== undefined) spec.template = { templatePresetId: options.templatePresetId }
	if (Object.prototype.hasOwnProperty.call(options, 'theme')) spec.theme = options.theme
	return spec
}

test('the exact row owns one semantic theme selector and two compatible resource carriers', () => {
	assert.equal(THEME_PRESET_CONTRACT_ROW.id, OFFICE_THEME_PRESET_ID)
	assert.equal(THEME_PRESET_CONTRACT_ROW.rowId, THEME_PRESET_ROW_ID)
	assert.equal(THEME_PRESET_CONTRACT_ROW.resources.length, 2)
	assert.deepEqual(new Set(THEME_PRESET_CONTRACT_ROW.resources.map(row => row.templatePresetId)), new Set([
		'template-office-baseline-wide-001',
		'template-corporate-reference-wide-001',
	]))
	assert.equal(themePresetContractById(OFFICE_THEME_PRESET_ID), THEME_PRESET_CONTRACT_ROW)

	const entry = { id: THEME_PRESET_ROW_ID, label: 'Office Theme -> theme-office-001', family: 'layouts-themes-masters', sourceKind: 'native-gallery-style', status: 'implemented' }
	const contract = themePresetCapabilityContractForEntry(entry)
	assert.equal(contract.capabilityMode, 'discrete')
	assert.equal(contract.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(contract.overrideFields, ['themePresetId'])
	assert.deepEqual(classifyCatalogEntry(entry).overrideFields, ['themePresetId'])

	const projected = publicBaselineCatalog({ family: 'layouts-themes-masters', limit: 500 }).entries
		.find(item => item.id === THEME_PRESET_ROW_ID)
	assert.equal(projected.capabilityMode, 'discrete')
	assert.equal(projected.capabilityStatus, 'executable-exact-structured')
	assert.equal(projected.selection.executableId, OFFICE_THEME_PRESET_ID)
	assert.equal(projected.selection.executableValue, OFFICE_THEME_PRESET_ID)
	assert.equal(projected.selection.semanticPath, 'themePresetId')
})

test('schema and resolver close the selector while preserving resource-scoped theme identity', () => {
	assert.deepEqual(schema.properties.themePresetId.enum, [OFFICE_THEME_PRESET_ID])
	assert.equal(validate(specimenSpec(OFFICE_THEME_PRESET_ID)), true, JSON.stringify(validate.errors))
	assert.equal(validate(specimenSpec(null)), false)
	assert.equal(validate(specimenSpec('theme-office-999')), false)

	const office = resolveLayoutThemeMasterSpec(specimenSpec(OFFICE_THEME_PRESET_ID))
	assert.equal(office.themePresetId, OFFICE_THEME_PRESET_ID)
	assert.equal(office.template.templatePresetId, 'template-office-baseline-wide-001')
	const corporate = resolveLayoutThemeMasterSpec(specimenSpec(OFFICE_THEME_PRESET_ID, {
		masterPresetId: 'master-corporate-reference-wide-001',
	}))
	assert.equal(corporate.themePresetId, OFFICE_THEME_PRESET_ID)
	assert.equal(corporate.template.templatePresetId, 'template-corporate-reference-wide-001')
	assert.throws(() => resolveLayoutThemeMasterSpec(specimenSpec(null)), /non-null bundled theme preset IDs/i)
	assert.throws(() => resolveLayoutThemeMasterSpec(specimenSpec('master-office-baseline-wide-001')), /themePresetId must identify a theme gallery preset/i)
})

test('compiler lowers theme-only and resource-qualified selection to the correct template carrier', () => {
	for (const [spec, templatePresetId] of [
		[specimenSpec(OFFICE_THEME_PRESET_ID), 'template-office-baseline-wide-001'],
		[specimenSpec(OFFICE_THEME_PRESET_ID, { masterPresetId: 'master-corporate-reference-wide-001' }), 'template-corporate-reference-wide-001'],
	]) {
		const compiled = buildSpecOperationPlan(spec, { plan: 'premium' })
		const slideAdd = compiled.operations.find(operation => operation.tool === 'betterpptx.slide.add')
		assert.equal(slideAdd?.args?.templatePresetId, templatePresetId)
	}
})

test('selector, override, source reset, re-edit, export, and replay retain both identities', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `theme-preset-contract-${Date.now()}`,
		clientInfo: { name: 'theme-preset-contract-test', version: '1' },
		blackBox: false,
	})
	const deckIds = []
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specimenSpec(OFFICE_THEME_PRESET_ID),
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(committed.deckId)
		let entry = getDeck(committed.deckId)
		assert.equal(entry._betterpptxThemePresetId, OFFICE_THEME_PRESET_ID)
		assert.equal(entry._betterpptxTemplatePresetId, 'template-office-baseline-wide-001')

		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.themePresetId, OFFICE_THEME_PRESET_ID)
		assert.deepEqual(exported.spec.template, { templatePresetId: 'template-office-baseline-wide-001' })
		assert.equal(Object.hasOwn(exported.spec, 'theme'), false)

		const override = { headFontFace: 'Georgia', bodyFontFace: 'Verdana', lang: 'fr-FR', colorScheme: { accent1: 'C026D3', accent6: '0F766E' } }
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0, theme: override }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.themePresetId, OFFICE_THEME_PRESET_ID)
		assert.equal(exported.spec.theme.headFontFace, 'Georgia')
		assert.equal(exported.spec.theme.colorScheme.accent1, 'C026D3')

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0, theme: null }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.themePresetId, OFFICE_THEME_PRESET_ID)
		assert.equal(Object.hasOwn(exported.spec, 'theme'), false)

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0, theme: { ...override, headFontFace: 'Trebuchet MS', colorScheme: { accent1: '0EA5E9' } } }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.theme.headFontFace, 'Trebuchet MS')
		assert.equal(exported.spec.theme.colorScheme.accent1, '0EA5E9')

		const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported.spec,
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replayed.deckId)
		const replayExport = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: replayed.deckId, detail: 'full' }))
		assert.equal(replayExport.spec.themePresetId, OFFICE_THEME_PRESET_ID)
		assert.equal(replayExport.spec.template.templatePresetId, 'template-office-baseline-wide-001')
		assert.equal(replayExport.spec.theme.headFontFace, 'Trebuchet MS')
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})

test('corporate resource reassertion is stable and invalid selector changes are mutation-free', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `theme-preset-negative-${Date.now()}`,
		clientInfo: { name: 'theme-preset-negative-test', version: '1' },
		blackBox: false,
	})
	const deckIds = []
	try {
		const corporate = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { masterPresetId: 'master-corporate-reference-wide-001' }),
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(corporate.deckId)
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: corporate.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0 }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: corporate.deckId, detail: 'full' }))
		assert.equal(exported.spec.themePresetId, OFFICE_THEME_PRESET_ID)
		assert.equal(exported.spec.template.templatePresetId, 'template-corporate-reference-wide-001')

		const beforeVersion = getDeck(corporate.deckId).deckVersion
		const conflict = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: corporate.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0, templatePresetId: 'template-office-baseline-wide-001' }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(conflict.ok, false)
		assert.equal(getDeck(corporate.deckId).deckVersion, beforeVersion)

		const plain = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specimenSpec(undefined),
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(plain.deckId)
		const plainVersion = getDeck(plain.deckId).deckVersion
		const unscoped = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: plain.deckId,
			spec: specimenSpec(OFFICE_THEME_PRESET_ID, { slideIndex: 0 }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(unscoped.ok, false)
		assert.equal(unscoped.error?.code, 'THEME_PRESET_PATCH_REQUIRES_BUNDLED_RESOURCE')
		assert.equal(getDeck(plain.deckId).deckVersion, plainVersion)

		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: corporate.deckId, detail: 'full' }))
		assert.equal(exported.spec.template.templatePresetId, 'template-corporate-reference-wide-001')
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
