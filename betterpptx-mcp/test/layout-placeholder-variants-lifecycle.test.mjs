import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Ajv from 'ajv'
import JSZip from 'jszip'

import {
	HEADER_FOOTER_POLICY_SCHEMA,
	HEADER_VISIBILITY_CONTRACT,
	HEADER_VISIBILITY_ROW_ID,
	LAYOUT_MASTER_COMPONENT_LIFECYCLE,
	LAYOUT_PLACEHOLDER_VARIANT_ROWS,
	LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS,
	LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT,
	LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION,
	SLIDE_NUMBER_FIELD_CONTRACT,
	SLIDE_NUMBER_FIELD_ROW_ID,
	importedPlaceholderRoleFromNative,
	nativePlaceholderType,
	normalizeHeaderFooterPolicy,
	normalizePlaceholderBinding,
	normalizePlaceholderDefinition,
	normalizeSlideNumberField,
	publicPlaceholderBindingFromNative,
	semanticPlaceholderType,
} from '../layout-placeholder-variants-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'

const require = createRequire(import.meta.url)
const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

function baseSpec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Placeholder variant lifecycle proof',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: 'Placeholder variants', layoutIntent: 'title-only', content: [] }],
		...overrides,
	}
}

test('the unit partitions seven physical selector rows, header visibility policy, and the separate slide-number field', () => {
	assert.equal(LAYOUT_PLACEHOLDER_VARIANT_ROWS.length, 7)
	assert.equal(new Set(LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS).size, 7)
	assert.deepEqual(LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT.rowIds, LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS)
	assert.deepEqual(LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT.excludedRowIds, [HEADER_VISIBILITY_ROW_ID, SLIDE_NUMBER_FIELD_ROW_ID])
	assert.deepEqual(HEADER_VISIBILITY_CONTRACT.rowIds, [HEADER_VISIBILITY_ROW_ID])
	assert.deepEqual(SLIDE_NUMBER_FIELD_CONTRACT.rowIds, [SLIDE_NUMBER_FIELD_ROW_ID])
	assert.ok(!LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS.includes(SLIDE_NUMBER_FIELD_ROW_ID))
	assert.ok(!LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS.includes(HEADER_VISIBILITY_ROW_ID))
	assert.deepEqual({
		rows: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION.rows,
		physical: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION.physicalPlaceholderRows,
		header: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION.headerVisibilityRows,
		slideNumber: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION.slideNumberFieldRows,
	}, { rows: 9, physical: 7, header: 1, slideNumber: 1 })
	for (const contract of [LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT, HEADER_VISIBILITY_CONTRACT, SLIDE_NUMBER_FIELD_CONTRACT]) {
		assert.equal(contract.runtimeReady, true)
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.ok(contract.componentOwnership.length > 0)
		assert.ok(contract.overrideFields.length > 0)
		assert.ok(contract.precedence.length > 0)
		assert.ok(contract.legalCombinations.length > 0)
	}
})

test('public discovery exposes exact executable selections for all nine frozen rows', async () => {
	const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')
	const entries = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries
	const byId = new Map(entries.map(entry => [entry.id, entry]))
	const expected = new Map([
		...LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => [row.id, { value: row.semanticType, path: 'content[].placeholderBinding.type' }]),
		[HEADER_VISIBILITY_ROW_ID, { value: true, path: 'layouts[].headerFooter.header' }],
		[SLIDE_NUMBER_FIELD_ROW_ID, { value: 'slidenum', path: 'layouts[].slideNumber' }],
	])
	assert.equal(expected.size, 9)
	for (const [rowId, selection] of expected) {
		const entry = byId.get(rowId)
		assert.ok(entry, `missing public catalog row ${rowId}`)
		assert.equal(entry.capabilityMode, 'parameterized')
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(entry.selection.executableValue, selection.value)
		assert.equal(entry.selection.semanticPath, selection.path)
		assert.ok(entry.componentOwnership.length > 0)
		assert.ok(entry.overrideFields.length > 0)
		assert.ok(entry.precedence.length > 0)
		assert.ok(entry.legalCombinations.length > 0)
	}
})

test('semantic placeholder labels lower to native tokens and native readback returns canonical semantic inputs', () => {
	for (const row of LAYOUT_PLACEHOLDER_VARIANT_ROWS) {
		assert.equal(nativePlaceholderType(row.semanticType), row.nativeType)
		assert.equal(semanticPlaceholderType(row.nativeType), row.semanticType)
		assert.deepEqual(normalizePlaceholderBinding({ type: row.semanticType, phType: row.nativeType, idx: 0 }), {
			placeholder: row.nativeType, phType: row.nativeType, phIdx: 0,
		})
		assert.deepEqual(publicPlaceholderBindingFromNative({ phType: row.nativeType, phIdx: '0', phHasCustomPrompt: '0' }), {
			type: row.semanticType, idx: 0, hasCustomPrompt: false,
		})
	}
	for (const token of ['false', 'off', 'no', '0', 0, false]) {
		assert.equal(publicPlaceholderBindingFromNative({ phType: 'dt', phHasCustomPrompt: token }).hasCustomPrompt, false)
	}
	for (const token of ['true', 'on', 'yes', '1', 1, true]) {
		assert.equal(publicPlaceholderBindingFromNative({ phType: 'dt', phHasCustomPrompt: token }).hasCustomPrompt, true)
	}
	assert.deepEqual(publicPlaceholderBindingFromNative({ hasBarePh: true }), { bare: true })
	assert.equal(publicPlaceholderBindingFromNative({ phType: 'hdr', phIdx: 0 }), undefined)
	assert.equal(importedPlaceholderRoleFromNative('hdr'), 'header')
	assert.throws(() => nativePlaceholderType('header'), /use headerFooter\.header/)
	assert.throws(() => nativePlaceholderType('hdr'), /use headerFooter\.header/)
})

test('all compatibility alias pairs agree or fail closed without truthy precedence', () => {
	assert.deepEqual(normalizePlaceholderDefinition({
		name: 'date-slot', placeholder: 'date-slot', type: 'date', phType: 'dt',
		idx: 0, phIdx: 0, size: 'half', phSz: 'half', orient: 'vert', phOrient: 'vert',
		hasCustomPrompt: false, customPrompt: false, x: 1, y: 1, w: 4, h: 2,
	}), {
		name: 'date-slot', type: 'dt', idx: 0, size: 'half', orient: 'vert', hasCustomPrompt: false,
		x: 1, y: 1, w: 4, h: 2,
	})
	for (const [value, pattern] of [
		[{ name: 'a', placeholder: 'b' }, /aliases name, placeholder must agree/],
		[{ type: 'date', phType: 'ftr' }, /aliases type, phType must agree/],
		[{ idx: 0, phIdx: 1 }, /aliases idx, phIdx must agree/],
		[{ size: 'half', phSz: 'full' }, /aliases size, phSz must agree/],
		[{ orient: 'horz', phOrient: 'vert' }, /aliases orient, phOrient must agree/],
		[{ hasCustomPrompt: false, customPrompt: true }, /aliases hasCustomPrompt, customPrompt must agree/],
	]) assert.throws(() => normalizePlaceholderBinding(value), pattern)
	assert.throws(() => normalizePlaceholderBinding({ type: 'clipArt', phOrient: 'vert' }), /not applicable.*canonicalizes/i)
	assert.throws(() => normalizePlaceholderBinding({ type: 'date', privateXml: '<p:ph\/>' }), /not part of the public/)
})

test('deck schema closes placeholder/layout/master components and documents collection reset semantics', () => {
	const valid = baseSpec({
		layouts: [{
			name: 'SEMANTIC_LAYOUT', width: 13.333, height: 7.5,
			placeholders: [{ name: 'date-slot', type: 'date', phType: 'dt', idx: 0, phIdx: 0 }],
			objects: null, slideNumber: null,
			headerFooter: { footer: false, showFooter: false, slideNumber: true, showSlideNumber: true },
		}],
		masters: [{ title: 'SEMANTIC_MASTER', placeholders: null, objects: null, slideNumber: null, headerFooter: null }],
		slides: [{ id: 's1', title: 'Placeholder variants', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'date-text', text: 'Date', placeholderBinding: { type: 'date', idx: 0 } }] }],
	})
	assert.equal(validateDeck(valid), true, JSON.stringify(validateDeck.errors))
	assert.equal(validateDeck(baseSpec({ layouts: null, masters: null })), true, JSON.stringify(validateDeck.errors))
	assert.equal(LAYOUT_MASTER_COMPONENT_LIFECYCLE.layouts.null, 'restore the deck layout collection to its imported/default baseline')
	assert.equal(LAYOUT_MASTER_COMPONENT_LIFECYCLE.masters.emptyArray, 'clear all authored custom master definitions')
	assert.equal(LAYOUT_MASTER_COMPONENT_LIFECYCLE.placeholders.null, 'restore the named carrier placeholder component to its inherited/source default')

	const unknownPlaceholder = structuredClone(valid)
	unknownPlaceholder.layouts[0].placeholders[0].rawXml = '<p:ph/>'
	assert.equal(validateDeck(unknownPlaceholder), false)
	const unknownLayout = structuredClone(valid)
	unknownLayout.layouts[0].privateCarrier = true
	assert.equal(validateDeck(unknownLayout), false)
	const unsafeHeaderPlaceholder = structuredClone(valid)
	unsafeHeaderPlaceholder.layouts[0].placeholders[0].type = 'header'
	delete unsafeHeaderPlaceholder.layouts[0].placeholders[0].phType
	assert.equal(validateDeck(unsafeHeaderPlaceholder), false)
	assert.equal(HEADER_FOOTER_POLICY_SCHEMA.oneOf[1].additionalProperties, false)
})

test('compiler preserves first-class layout/master placeholder components, aliases, resets, and inherited suppression', () => {
	const content = LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => ({
		kind: 'textBox', name: row.semanticType, text: row.label,
		placeholderBinding: { type: row.semanticType, phType: row.nativeType, idx: 0, phIdx: 0, hasCustomPrompt: false, customPrompt: false },
	}))
	content.push({ kind: 'textBox', name: 'explicit-reset', text: 'No inherited placeholder', role: 'inherited', placeholderBinding: null })
	content.push({ kind: 'textBox', name: 'inherited', text: 'Inherited placeholder', role: 'inherited' })
	const spec = baseSpec({
		layoutContract: { placeholderBindings: { inherited: { type: 'footer', idx: 4 } } },
		layouts: [{
			name: 'SEMANTIC_LAYOUT', width: 13.333, height: 7.5,
			placeholders: LAYOUT_PLACEHOLDER_VARIANT_ROWS.map((row, index) => ({ name: `${row.semanticType}-slot`, type: row.semanticType, idx: index })),
			headerFooter: { header: true, showHeader: true, footer: false, showFooter: false },
			slideNumber: { x: '90%', y: 7, w: 1, h: 0.3, align: 'right', fontFace: 'Aptos', fontSize: 10, color: '#112233', bold: false },
		}],
		masters: [{
			title: 'SEMANTIC_MASTER', objects: [{ text: { text: 'Master mark', options: { x: 1, y: 1, w: 2, h: 0.3 } } }],
			placeholders: [{ name: 'footer-slot', type: 'footer', phType: 'ftr', idx: 0, phIdx: 0 }],
			headerFooter: { slideNumber: true, showSlideNumber: true },
		}],
		slides: [{ id: 's1', title: 'Placeholder variants', layoutIntent: 'title-only', content }],
	})
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const layout = plan.operations.find(operation => operation.tool === 'betterpptx.deck.define_layout')
	assert.deepEqual(layout.args.placeholders.map(item => item.type), LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => row.nativeType))
	assert.deepEqual(layout.args.headerFooter, { header: true, footer: false })
	assert.deepEqual(layout.args.slideNumber, { x: '90%', y: 7, w: 1, h: 0.3, align: 'right', fontFace: 'Aptos', fontSize: 10, color: '112233', bold: false })
	const master = plan.operations.find(operation => operation.tool === 'betterpptx.deck.define_master').args.master
	assert.deepEqual(master.placeholders, [{ name: 'footer-slot', type: 'ftr', idx: 0 }])
	assert.equal(master.objects.length, 1)
	assert.ok(!master.objects.some(item => item?.placeholder), 'placeholder component must not be flattened into master.objects')
	assert.deepEqual(master.headerFooter, { slideNumber: true })

	const textOperations = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_text')
	for (const row of LAYOUT_PLACEHOLDER_VARIANT_ROWS) {
		const operation = textOperations.find(item => item.objectName.includes(`.${row.semanticType}.`))
		assert.equal(operation?.args?.options?.phType, row.nativeType, row.semanticType)
		assert.equal(operation?.args?.options?.phIdx, 0, row.semanticType)
		assert.equal(operation?.args?.options?.hasCustomPrompt, false, row.semanticType)
	}
	assert.equal(textOperations.find(item => item.objectName.includes('.explicit-reset.'))?.args?.options?.phType, undefined)
	assert.equal(textOperations.find(item => item.objectName.includes('.inherited.'))?.args?.options?.phType, 'ftr')

	const resetPlan = buildSpecOperationPlan(baseSpec({
		layouts: [{ name: 'RESET_LAYOUT', width: 13.333, height: 7.5, placeholders: null, objects: null, slideNumber: null, headerFooter: null }],
		masters: [{ title: 'RESET_MASTER', placeholders: null, objects: null, slideNumber: null, headerFooter: null }],
	}), { dryRun: true, plan: 'premium' })
	const resetLayout = resetPlan.operations.find(operation => operation.tool === 'betterpptx.deck.define_layout').args
	assert.equal(resetLayout.placeholders, null)
	assert.equal(resetLayout.objects, null)
	assert.equal(resetLayout.slideNumber, null)
	assert.equal(resetLayout.headerFooter, null)
	const resetMaster = resetPlan.operations.find(operation => operation.tool === 'betterpptx.deck.define_master').args.master
	assert.equal(resetMaster.placeholders, null)
	assert.equal(resetMaster.objects, null)
	assert.equal(resetMaster.slideNumber, null)
	assert.equal(resetMaster.headerFooter, null)
})

test('media compiler lowers canonical top-level placeholder bindings and honors explicit reset', () => {
	const mediaSource = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
	const plan = buildSpecOperationPlan(baseSpec({
		slides: [{
			id: 's1', title: 'Media placeholders', layoutIntent: 'title-only', content: [
				{
					kind: 'media', name: 'bound-media', mediaOptions: { type: 'audio', source: mediaSource, extn: 'wav' },
					placeholderBinding: { type: 'media', phType: 'media', idx: 0, phIdx: 0, hasCustomPrompt: false, customPrompt: false },
				},
				{
					kind: 'media', name: 'reset-media', mediaOptions: { type: 'audio', source: mediaSource, extn: 'wav' },
					role: 'inherited-media', placeholderBinding: null,
				},
			],
		}],
		layoutContract: { placeholderBindings: { 'inherited-media': { type: 'media', idx: 9 } } },
	}), { dryRun: true, plan: 'premium' })
	const mediaOperations = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_media')
	const bound = mediaOperations.find(operation => operation.objectName.includes('.bound-media.'))?.args?.options
	assert.equal(bound?.placeholder, 'media')
	assert.equal(bound?.phType, 'media')
	assert.equal(bound?.phIdx, 0)
	assert.equal(bound?.hasCustomPrompt, false)
	const reset = mediaOperations.find(operation => operation.objectName.includes('.reset-media.'))?.args?.options
	for (const key of ['placeholder', 'phType', 'phIdx', 'phSz', 'phOrient', 'hasCustomPrompt']) assert.equal(reset?.[key], undefined, key)
})

test('native addMedia retains placeholder state and emits the strict media tuple in package XML', async () => {
	const PptxGenJS = require('../../dist/pptxgen.cjs.js')
	const mediaData = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
	const mediaCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='
	const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'betterpptx-media-placeholder-'))
	const pptxPath = path.join(tempDir, 'media-placeholder.pptx')
	try {
		const pptx = new PptxGenJS()
		pptx.layout = 'LAYOUT_WIDE'
		const slide = pptx.addSlide()
		slide.addMedia({
			type: 'audio', data: mediaData, cover: mediaCover,
			x: 0.5, y: 0.5, w: 1, h: 1, objectName: 'media-placeholder-zero',
			placeholder: 'media', phType: 'media', phIdx: 0, phSz: 'half', phOrient: 'horz', hasCustomPrompt: false,
		})
		slide.addMedia({
			type: 'audio', data: mediaData, cover: mediaCover,
			x: 2, y: 0.5, w: 1, h: 1, objectName: 'media-placeholder-strict',
			placeholder: 'media', phType: 'media', phIdx: 7, phSz: 'half', phOrient: 'horz', hasCustomPrompt: true,
		})
		const zeroCarrier = slide._slideObjects.find(item => item.options?.objectName === 'media-placeholder-zero')
		assert.equal(zeroCarrier?.options?.phIdx, 0)
		assert.equal(zeroCarrier?.options?.phHasCustomPrompt, false)
		await pptx.writeFile({ fileName: pptxPath, compression: false })
		const zip = await JSZip.loadAsync(await fsPromises.readFile(pptxPath), { checkCRC32: true })
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		const strictCarrier = slideXml.match(/<p:pic>\s*<p:nvPicPr>.*?name="media-placeholder-strict".*?<\/p:pic>/s)?.[0]
		assert.ok(strictCarrier, 'strict media picture carrier must exist')
		assert.match(strictCarrier, /<p:ph type="media" sz="half" hasCustomPrompt="1" idx="7"\/>/)
	} finally {
		await fsPromises.rm(tempDir, { recursive: true, force: true })
	}
})

test('compiler rejects relational conflicts that JSON Schema cannot express', () => {
	const conflict = pair => baseSpec({
		layouts: [{ name: 'CONFLICT', width: 13.333, height: 7.5, placeholders: [{ name: 'slot', type: 'date', ...pair }] }],
	})
	assert.throws(() => buildSpecOperationPlan(conflict({ phType: 'ftr' }), { dryRun: true, plan: 'premium' }), /aliases type, phType must agree/)
	assert.throws(() => buildSpecOperationPlan(conflict({ idx: 0, phIdx: 1 }), { dryRun: true, plan: 'premium' }), /aliases idx, phIdx must agree/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		layouts: [{ name: 'UNSAFE_HEADER', width: 13.333, height: 7.5, placeholders: [{ name: 'header-slot', type: 'header' }] }],
	}), { dryRun: true, plan: 'premium' }), /use headerFooter\.header/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		slides: [{ id: 's1', title: 'Unsafe header', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'header', text: 'Header', placeholderBinding: { type: 'hdr' } }] }],
	}), { dryRun: true, plan: 'premium' }), /use headerFooter\.header/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		layoutContract: { placeholderBindings: { inherited: { type: 'header' } } },
		slides: [{ id: 's1', title: 'Unsafe inherited header', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'header', text: 'Header', role: 'inherited' }] }],
	}), { dryRun: true, plan: 'premium' }), /use headerFooter\.header/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({
		masters: [{ title: 'HF_CONFLICT', headerFooter: { footer: false, showFooter: true } }],
	}), { dryRun: true, plan: 'premium' }), /aliases footer, showFooter must agree/)
	assert.throws(() => normalizeSlideNumberField({ color: 'not-a-color' }), /6-digit RGB/)
	assert.deepEqual(normalizeHeaderFooterPolicy({ date: false, showDate: false, slideNumber: true }), { date: false, slideNumber: true })
})

test('structured and main decyphers recover canonical semantic placeholder bindings', async () => {
	const PptxGenJS = require('../../dist/pptxgen.cjs.js')
	const { decypherToModel } = await import('../../dist/node/pptx-decypher/index.js')
	const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'betterpptx-placeholder-variants-'))
	const pptxPath = path.join(tempDir, 'placeholder-variants.pptx')
	try {
		const pptx = new PptxGenJS()
		pptx.layout = 'LAYOUT_WIDE'
		const slide = pptx.addSlide()
		LAYOUT_PLACEHOLDER_VARIANT_ROWS.forEach((row, index) => {
			slide.addText(row.label, {
				x: 0.5 + (index % 4) * 3.1, y: 0.6 + Math.floor(index / 4) * 2.3, w: 2.6, h: 0.8,
				objectName: `placeholder-${row.semanticType}`,
				placeholder: row.nativeType, phType: row.nativeType, phIdx: index,
				phSz: 'half', phOrient: 'vert', phHasCustomPrompt: false,
			})
		})
		slide.addText('Imported header metadata', {
			x: 0.5, y: 5.4, w: 3.2, h: 0.6, objectName: 'imported-header-placeholder',
			placeholder: 'hdr', phType: 'hdr', phIdx: 99,
		})
		await pptx.writeFile({ fileName: pptxPath, compression: false })
		const zip = await JSZip.loadAsync(await fsPromises.readFile(pptxPath), { checkCRC32: true })
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		for (const row of LAYOUT_PLACEHOLDER_VARIANT_ROWS) assert.match(slideXml, new RegExp(`<p:ph[^>]*type="${row.nativeType}"`))
		assert.match(slideXml, /<p:ph[^>]*type="hdr"/)

		for (const engine of ['structured', 'ultimate']) {
			const result = await decypherToModel({ pptxPath, sourceName: `placeholder-${engine}.pptx`, engine, outputDir: tempDir, timeoutMs: 120000 })
			assert.equal(result.success, true, `${engine}: ${JSON.stringify(result.errors)}`)
			for (const row of LAYOUT_PLACEHOLDER_VARIANT_ROWS) {
				const shape = result.model.slides[0].shapes.find(item => item.name === `placeholder-${row.semanticType}`)
				assert.ok(shape, `${engine} missing ${row.semanticType}`)
				assert.equal(shape.options?.placeholderBinding?.type, row.semanticType, `${engine} ${row.semanticType}`)
				assert.equal(shape.options?.placeholderBinding?.hasCustomPrompt, false, `${engine} ${row.semanticType} false`)
			}
			const importedHeader = result.model.slides[0].shapes.find(item => item.name === 'imported-header-placeholder')
			assert.ok(importedHeader, `${engine} missing imported hdr metadata`)
			assert.equal(importedHeader.options?.phType, 'hdr')
			assert.equal(importedHeader.options?.importedPlaceholderRole, 'header')
			assert.equal(importedHeader.options?.placeholderBinding, undefined)
		}
	} finally {
		await fsPromises.rm(tempDir, { recursive: true, force: true })
	}
})
