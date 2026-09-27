import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import { classifyCatalogEntry } from '../capability-truth.mjs'
import {
	MASTER_PRESET_CONTRACT_ROWS,
	masterPresetCapabilityContractForEntry,
	masterPresetContractById,
} from '../master-preset-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { resolveLayoutThemeMasterSpec } from '../source-api-gallery-presets.mjs'

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

function specimenSpec(masterPresetId, { slideIndex } = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native master selector lifecycle',
		masterPresetId,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'PowerPoint authors', outcome: 'prove exact master selection', remember: 'master selector state round-trips' },
		visualDesign: { world: 'native master proof', framing: 'one editable native master' },
		motionTime: { masterClock: 'static', timingSource: 'without narration', syncPolicy: 'static' },
		layout: 'LAYOUT_WIDE',
		styleIntent: { mode: 'light', density: 'focused' },
		autoplay: { enabled: false },
		slides: [{
			id: 'master-proof',
			...(Number.isInteger(slideIndex) ? { slideIndex } : {}),
			title: 'Master proof',
			role: 'capability-proof',
			message: 'The exact native master remains editable and durable.',
			layoutIntent: 'title-body',
			content: [],
		}],
	}
}

test('the exact contract owns two frozen master IDs and only masterPresetId', () => {
	assert.equal(MASTER_PRESET_CONTRACT_ROWS.length, 2)
	assert.equal(new Set(MASTER_PRESET_CONTRACT_ROWS.map(row => row.id)).size, 2)
	assert.deepEqual(new Set(MASTER_PRESET_CONTRACT_ROWS.map(row => row.parameter)), new Set(['masterPresetId']))
	assert.equal(masterPresetContractById('master-office-baseline-wide-001')?.templatePresetId, 'template-office-baseline-wide-001')
	assert.equal(masterPresetContractById('master-corporate-reference-wide-001')?.templatePresetId, 'template-corporate-reference-wide-001')

	const entry = {
		id: 'cap-master-proof',
		label: 'Office Baseline Wide Master -> master-office-baseline-wide-001',
		family: 'layouts-themes-masters',
		sourceKind: 'native-gallery-style',
		status: 'implemented',
	}
	const contract = masterPresetCapabilityContractForEntry(entry)
	assert.deepEqual(contract.overrideFields, ['masterPresetId'])
	assert.equal(contract.capabilityMode, 'discrete')
	assert.equal(contract.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(classifyCatalogEntry(entry).overrideFields, ['masterPresetId'])

	const presetIds = new Set(MASTER_PRESET_CONTRACT_ROWS.map(row => row.id))
	const projected = publicBaselineCatalog({ family: 'layouts-themes-masters', limit: 500 }).entries
		.filter(item => presetIds.has(item.selection?.executableId))
	assert.equal(projected.length, 2)
	assert.ok(projected.every(item => item.capabilityMode === 'discrete'))
	assert.ok(projected.every(item => item.capabilityStatus === 'executable-exact-structured'))
	assert.ok(projected.every(item => item.selection.semanticPath === 'masterPresetId'))
	assert.ok(projected.every(item => item.selection.executableValue === item.selection.executableId))
})

test('schema and resolver close the master selector and reject conflicting resources', () => {
	assert.deepEqual(schema.properties.masterPresetId.enum, [
		'master-office-baseline-wide-001',
		'master-corporate-reference-wide-001',
	])
	assert.equal(validate(specimenSpec('master-office-baseline-wide-001')), true, JSON.stringify(validate.errors))
	assert.equal(validate(specimenSpec(null)), false)
	assert.equal(validate(specimenSpec('master-office-baseline-wide-999')), false)

	const resolved = resolveLayoutThemeMasterSpec(specimenSpec('master-office-baseline-wide-001'))
	assert.equal(resolved.masterPresetId, 'master-office-baseline-wide-001')
	assert.equal(resolved.template.templatePresetId, 'template-office-baseline-wide-001')
	assert.throws(() => resolveLayoutThemeMasterSpec(specimenSpec(null)), /must be one of the non-null bundled master preset IDs/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({
		...specimenSpec('master-office-baseline-wide-001'),
		template: { templatePresetId: 'template-corporate-reference-wide-001' },
	}), /different template resources/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({
		...specimenSpec('master-office-baseline-wide-001'),
		slides: [{ ...specimenSpec('master-office-baseline-wide-001').slides[0], layoutPresetId: 'layout-corporate-reference-wide-001' }],
	}), /different template resources/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({
		...specimenSpec('master-office-baseline-wide-001'),
		masterPresetId: 'theme-office-001',
	}), /masterPresetId must identify a master gallery preset/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({
		...specimenSpec('master-office-baseline-wide-001'),
		themePresetId: 'master-office-baseline-wide-001',
	}), /themePresetId must identify a theme gallery preset/i)
})

test('compiler lowers the master selector to its exact bundled template resource', () => {
	for (const [masterPresetId, templatePresetId] of [
		['master-office-baseline-wide-001', 'template-office-baseline-wide-001'],
		['master-corporate-reference-wide-001', 'template-corporate-reference-wide-001'],
	]) {
		const compiled = buildSpecOperationPlan(specimenSpec(masterPresetId), { plan: 'premium' })
		const slideAdd = compiled.operations.find(operation => operation.tool === 'betterpptx.slide.add')
		assert.equal(slideAdd?.args?.templatePresetId, templatePresetId)
	}
})

test('master selection persists, exports, replays, and refuses in-place replacement without mutation', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `master-preset-contract-${Date.now()}`,
		clientInfo: { name: 'master-preset-contract-test', version: '1' },
		blackBox: false,
	})
	const deckIds = []
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specimenSpec('master-office-baseline-wide-001'),
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(committed.deckId)
		let entry = getDeck(committed.deckId)
		assert.equal(entry._betterpptxMasterPresetId, 'master-office-baseline-wide-001')
		assert.equal(entry._betterpptxTemplatePresetId, 'template-office-baseline-wide-001')

		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.masterPresetId, 'master-office-baseline-wide-001')
		assert.deepEqual(exported.spec.template, { templatePresetId: 'template-office-baseline-wide-001' })
		assert.equal(Object.hasOwn(exported.spec, 'theme'), false)
		assert.equal(Object.hasOwn(exported.spec, 'layouts'), false)
		assert.equal(Object.hasOwn(exported.spec, 'masters'), false)

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec('master-office-baseline-wide-001', { slideIndex: 0 }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		entry = getDeck(committed.deckId)
		const beforeVersion = entry.deckVersion
		const beforeMaster = entry._betterpptxMasterPresetId

		const crossResource = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec('master-corporate-reference-wide-001', { slideIndex: 0 }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(crossResource.ok, false)
		assert.equal(crossResource.error?.code, 'LAYOUT_PRESET_CROSS_RESOURCE_PATCH')
		assert.equal(getDeck(committed.deckId).deckVersion, beforeVersion)
		assert.equal(getDeck(committed.deckId)._betterpptxMasterPresetId, beforeMaster)

		const nullReset = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			spec: specimenSpec(null, { slideIndex: 0 }),
			phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
		})
		assert.equal(nullReset.ok, false)
		assert.equal(getDeck(committed.deckId).deckVersion, beforeVersion)
		assert.equal(getDeck(committed.deckId)._betterpptxMasterPresetId, beforeMaster)

		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported.spec,
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replayed.deckId)
		const replayExport = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: replayed.deckId, detail: 'full' }))
		assert.equal(replayExport.spec.masterPresetId, 'master-office-baseline-wide-001')
		assert.equal(replayExport.spec.template.templatePresetId, 'template-office-baseline-wide-001')
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
