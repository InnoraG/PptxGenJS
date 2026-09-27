import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import { classifyCatalogEntry } from '../capability-truth.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import {
	LAYOUT_PRESET_CONTRACT_ROWS,
	layoutPresetCapabilityContractForEntry,
	layoutPresetContractById,
} from '../layout-preset-contract.mjs'
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

function specimenSpec(layoutPresetId, { slideIndex } = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native layout selector lifecycle',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'PowerPoint authors', outcome: 'prove exact layout selection', remember: 'layout selector state round-trips' },
		visualDesign: { world: 'native layout proof', framing: 'one editable native layout' },
		motionTime: { masterClock: 'static', timingSource: 'without narration', syncPolicy: 'static' },
		layout: 'LAYOUT_WIDE',
		styleIntent: { mode: 'light', density: 'focused' },
		autoplay: { enabled: false },
		slides: [{
			id: 'layout-proof',
			...(Number.isInteger(slideIndex) ? { slideIndex } : {}),
			title: 'Layout proof',
			role: 'capability-proof',
			message: 'The exact native layout remains editable and durable.',
			layoutIntent: 'title-body',
			layoutPresetId,
			content: [],
		}],
	}
}

test('the exact contract owns thirty layout IDs and only the canonical slide selector', () => {
	assert.equal(LAYOUT_PRESET_CONTRACT_ROWS.length, 30)
	assert.equal(new Set(LAYOUT_PRESET_CONTRACT_ROWS.map(row => row.id)).size, 30)
	assert.deepEqual(new Set(LAYOUT_PRESET_CONTRACT_ROWS.map(row => row.parameter)), new Set(['slides[].layoutPresetId']))
	assert.equal(layoutPresetContractById('layout-office-baseline-wide-004')?.layoutName, 'Two Content')
	assert.equal(layoutPresetContractById('layout-corporate-reference-wide-019')?.layoutName, 'CORP_APPENDIX_DENSE')

	const entry = {
		id: 'cap-layout-proof',
		label: 'Two Content -> layout-office-baseline-wide-004',
		family: 'layouts-themes-masters',
		sourceKind: 'native-gallery-style',
		status: 'implemented',
	}
	const contract = layoutPresetCapabilityContractForEntry(entry)
	assert.deepEqual(contract.overrideFields, ['slides[].layoutPresetId'])
	assert.equal(contract.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(classifyCatalogEntry(entry).overrideFields, ['slides[].layoutPresetId'])

	const layoutIds = new Set(LAYOUT_PRESET_CONTRACT_ROWS.map(row => row.id))
	const projected = publicBaselineCatalog({ family: 'layouts-themes-masters', limit: 500 }).entries
		.filter(item => layoutIds.has(item.selection?.executableId))
	assert.equal(projected.length, 30)
	assert.ok(projected.every(item => item.capabilityStatus === 'executable-exact-structured'))
	assert.ok(projected.every(item => JSON.stringify(item.overrideFields) === JSON.stringify(['slides[].layoutPresetId'])))
})

test('the schema teaches canonical nested template and slide layout selector identities', () => {
	assert.equal(schema.$defs.templateContract.properties.templatePresetId.type[0], 'string')
	assert.equal(schema.$defs.slide.properties.layoutPresetId.enum.filter(Boolean).length, 30)
	const valid = specimenSpec('layout-office-baseline-wide-004')
	valid.template = { templatePresetId: 'template-office-baseline-wide-001' }
	assert.equal(validate(valid), true, JSON.stringify(validate.errors))

	const invalidLayout = specimenSpec('layout-office-baseline-wide-999')
	assert.equal(validate(invalidLayout), false)
	const invalidTemplate = specimenSpec('layout-office-baseline-wide-004')
	invalidTemplate.template = { templatePresetId: 'template-unknown-001' }
	assert.equal(validate(invalidTemplate), false)
})

test('resolver rejects conflicting layoutPresetId and layoutName before compilation', () => {
	assert.throws(() => resolveLayoutThemeMasterSpec({
		slides: [{ layoutPresetId: 'layout-office-baseline-wide-004', layoutName: 'Blank' }],
	}), /conflicting slide layout selectors/i)
	assert.throws(() => resolveLayoutThemeMasterSpec({
		slides: [{ layoutPresetId: null, layoutName: 'Blank' }],
	}), /layoutPresetId null requests the template default/i)
	const resolved = resolveLayoutThemeMasterSpec({
		slides: [{ layoutPresetId: 'layout-office-baseline-wide-004', layoutName: 'Two Content' }],
	})
	assert.equal(resolved.template.templatePresetId, 'template-office-baseline-wide-001')
	assert.equal(resolved.slides[0].layoutName, 'Two Content')
})

test('current export, same-resource patch, null reset, re-edit, and recompile preserve selector state', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `layout-preset-contract-${Date.now()}`,
		clientInfo: { name: 'layout-preset-contract-test', version: '1' },
		blackBox: false,
	})
	const deckIds = []
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specimenSpec('layout-office-baseline-wide-004'),
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(committed.deckId)
		let entry = getDeck(committed.deckId)
		assert.equal(entry._betterpptxTemplatePresetId, 'template-office-baseline-wide-001')
		assert.equal(entry._betterpptxLayoutPresetResourceKey, 'office-baseline-wide')
		assert.equal(entry.pptx.slides[0]._betterpptxLayoutPresetId, 'layout-office-baseline-wide-004')

		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.deepEqual(exported.spec.template, { templatePresetId: 'template-office-baseline-wide-001' })
		assert.equal(exported.spec.slides[0].layoutPresetId, 'layout-office-baseline-wide-004')

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: specimenSpec('layout-office-baseline-wide-006', { slideIndex: 0 }),
		}))
		entry = getDeck(committed.deckId)
		assert.equal(entry.pptx.slides[0]._betterpptxLayoutPresetId, 'layout-office-baseline-wide-006')
		assert.equal(entry.pptx.slides[0]._rawSlideLayoutNumber, 6)
		assert.equal(entry.pptx.slides[0]._slideLayout, entry.pptx.slides[0]._betterpptxBaseSlideLayout)
		assert.notEqual(entry.pptx.slides[0]._slideLayout?._name, 'Title Only')

		const crossResource = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: specimenSpec('layout-corporate-reference-wide-001', { slideIndex: 0 }),
		})
		assert.equal(crossResource.ok, false)
		assert.equal(crossResource.error?.code, 'LAYOUT_PRESET_CROSS_RESOURCE_PATCH')
		assert.equal(getDeck(committed.deckId).pptx.slides[0]._betterpptxLayoutPresetId, 'layout-office-baseline-wide-006')

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: specimenSpec(null, { slideIndex: 0 }),
		}))
		entry = getDeck(committed.deckId)
		assert.equal(entry.pptx.slides[0]._betterpptxLayoutPresetId, undefined)
		assert.equal(entry.pptx.slides[0]._rawSlideLayoutNumber, 2)
		assert.equal(entry.pptx.slides[0]._betterpptxLayoutName, 'Title and Content')
		assert.equal(entry.pptx.slides[0]._slideLayout, entry.pptx.slides[0]._betterpptxBaseSlideLayout)
		assert.notEqual(entry.pptx.slides[0]._slideLayout?._name, 'Title and Content')
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.template.templatePresetId, 'template-office-baseline-wide-001')
		assert.equal(Object.hasOwn(exported.spec.slides[0], 'layoutPresetId'), false)
		assert.equal(exported.spec.slides[0].layoutName, 'Title and Content')

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: specimenSpec('layout-office-baseline-wide-003', { slideIndex: 0 }),
		}))
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assert.equal(exported.spec.slides[0].layoutPresetId, 'layout-office-baseline-wide-003')

		const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported.spec,
			phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckIds.push(replayed.deckId)
		const replayExport = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: replayed.deckId, detail: 'full' }))
		assert.equal(replayExport.spec.template.templatePresetId, 'template-office-baseline-wide-001')
		assert.equal(replayExport.spec.slides[0].layoutPresetId, 'layout-office-baseline-wide-003')
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
