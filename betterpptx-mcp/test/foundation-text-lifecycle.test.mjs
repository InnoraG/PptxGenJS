import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'
import JSZip from 'jszip'

import { RICH_TEXT_SCHEMA, TEXT_RUN_OPTIONS_SCHEMA } from '../blackbox.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import {
	TEXT_BULLET_GLYPHS,
	normalizeBulletOptions,
	normalizeRichRunOptions,
	normalizeTextField,
} from '../option-registry.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)
const validatePublicRichText = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(RICH_TEXT_SCHEMA)

const {
	createMcpToolDispatcher,
	getDeck,
	handleDeleteShapesForTest,
	handleUpdateShapeForTest,
} = await import('../engine.mjs')

const FIELD_GUID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/

function dataOf(result, label = 'tool') {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function richTextSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Public rich text lifecycle',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'presentation authors',
			outcome: 'Prove exact native rich-text authoring and readback.',
			remember: 'Text remains editable after reset and replay.',
		},
		visualDesign: { world: 'Editorial text proof', framing: 'One native text box', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
		slides: [{
			id: 'proof',
			title: 'Rich text lifecycle',
			message: 'Every modeled run and body property stays editable.',
			layoutIntent: 'title-body',
			content: [{
				kind: 'textBox',
				name: 'rich-copy',
				altText: 'Editable native rich text proof',
				text: [
					{
						text: 'Hard paragraph',
						options: {
							fontFace: 'Aptos', color: '123456', fontSize: 20, bold: true, italic: false,
							baseline: 12.345, bullet: { glyph: 'CHECK' }, rtlMode: true, breakLine: true,
						},
					},
					{ text: 'Line\u00A0with NBSP', options: { italic: true, strike: 'dblStrike', color: '000000' } },
					{
						text: 'Soft field link',
						options: {
							softBreakBefore: true,
							rtl: true,
							fontFaceComplexScript: 'Noto Naskh Arabic',
							field: { type: 'slidenum' },
							hyperlink: { url: 'https://example.com/rich', tooltip: 'Open rich-text proof' },
						},
					},
				],
				style: { vert: 'eaVert', fit: 'shrink', wrap: true },
			}],
		}],
	}
}

function richBlock(spec) {
	return spec.slides.flatMap(slide => slide.content || []).find(block => String(block.name || block.objectName || '').includes('rich-copy'))
}

function richNativeObject(entry) {
	return entry.pptx.slides[0]._slideObjects.find(obj => String(obj?.options?.objectName || '').includes('rich-copy'))
}

function hyperlinkRelationships(entry) {
	return entry.pptx.slides[0]._rels.filter(rel => rel?.type === 'hyperlink')
}

async function packageParts(entry) {
	const bytes = await entry.pptx.write({ outputType: 'nodebuffer', compression: false })
	const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
	return {
		bytes,
		slideXml: await zip.file('ppt/slides/slide1.xml').async('string'),
		relsXml: await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'),
	}
}

test('deck and public schemas expose one closed typed rich-text vocabulary', () => {
	const content = schema.$defs.contentBlock.properties
	assert.equal(content.text.$ref, '#/$defs/richText')
	assert.equal(schema.$defs.richTextRunOptions.additionalProperties, false)
	assert.equal(TEXT_RUN_OPTIONS_SCHEMA.additionalProperties, false)
	for (const key of ['fontFace', 'fontFaceComplexScript', 'fontSize', 'color', 'bold', 'italic', 'baseline', 'bullet', 'rtl', 'rtlMode', 'softBreakBefore', 'field', 'hyperlink']) {
		assert.ok(schema.$defs.richTextRunOptions.properties[key], `missing richTextRunOptions.${key}`)
		assert.ok(TEXT_RUN_OPTIONS_SCHEMA.properties[key], `missing public run option ${key}`)
	}
	for (const key of ['vert', 'fit', 'wrap']) assert.ok(content.style.properties[key], `missing content style ${key}`)

	const spec = richTextSpec()
	assert.equal(validateDeck(spec), true, JSON.stringify(validateDeck.errors))
	assert.equal(validatePublicRichText(richBlock(spec).text), true, JSON.stringify(validatePublicRichText.errors))

	const unknown = structuredClone(spec)
	unknown.slides[0].content[0].text[0].options.privateCarrier = '<a:rPr/>'
	assert.equal(validateDeck(unknown), false)
	assert.match(JSON.stringify(validateDeck.errors), /additionalProperties|privateCarrier/)

	const conflictingLink = structuredClone(spec)
	conflictingLink.slides[0].content[0].text[2].options.hyperlink.slide = 2
	assert.equal(validateDeck(conflictingLink), false)

	const invalidField = structuredClone(spec)
	invalidField.slides[0].content[0].text[2].options.field.id = 'not-a-guid'
	assert.equal(validateDeck(invalidField), false)

	const impreciseBaseline = structuredClone(spec)
	impreciseBaseline.slides[0].content[0].text[0].options.baseline = 12.3456
	assert.equal(validateDeck(impreciseBaseline), false)
})

test('normalization maps named glyphs, validates combinations, and supplies deterministic field GUIDs', () => {
	assert.deepEqual(TEXT_BULLET_GLYPHS, { DEFAULT: '2022', CHECK: '2713', STAR: '2605', TRIANGLE: '25B6' })
	for (const [glyph, characterCode] of Object.entries(TEXT_BULLET_GLYPHS)) {
		assert.deepEqual(normalizeBulletOptions({ glyph: glyph.toLowerCase() }), { glyph, characterCode })
		assert.deepEqual(normalizeBulletOptions({ characterCode }), { glyph, characterCode })
	}
	assert.throws(() => normalizeBulletOptions({ glyph: 'CHECK', characterCode: '2605' }), /must identify the same bullet/)
	assert.throws(() => normalizeBulletOptions({ type: 'number', glyph: 'STAR' }), /numbered bullet/)

	const first = normalizeTextField({ type: 'datetime' }, 'proof.text[2].options.field', { text: 'Generated field' })
	const repeat = normalizeTextField({ type: 'datetime' }, 'proof.text[2].options.field', { text: 'Generated field' })
	const other = normalizeTextField({ type: 'datetime' }, 'other.text[2].options.field', { text: 'Generated field' })
	assert.match(first.id, FIELD_GUID)
	assert.equal(first.id, repeat.id)
	assert.notEqual(first.id, other.id)

	assert.equal(normalizeRichRunOptions({ baseline: 0 }).baseline, 0)
	assert.equal(normalizeRichRunOptions({ baseline: -100 }).baseline, -100)
	assert.throws(() => normalizeRichRunOptions({ baseline: 100.001 }), /between -100 and 100/)
	assert.throws(() => normalizeRichRunOptions({ baseline: 1.2345 }), /0\.001 precision/)
	assert.throws(() => normalizeRichRunOptions({ baseline: 12, superscript: true }), /cannot be combined/)
	assert.throws(() => normalizeRichRunOptions({ hyperlink: { url: 'https://example.com', slide: 1 } }), /exactly one/)
})

test('compiler preserves hard, NBSP, and soft breaks while lowering canonical native options', () => {
	const compiled = buildSpecOperationPlan(richTextSpec(), { plan: 'premium' })
	assert.deepEqual(compiled.errors, [])
	const operation = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName.includes('rich-copy'))
	assert.ok(operation, JSON.stringify(compiled.operations))
	assert.equal(operation.args.options.vert, 'eaVert')
	assert.equal(operation.args.options.fit, 'shrink')
	assert.equal(operation.args.options.wrap, true)
	assert.equal(operation.args.text[0].options.breakLine, true)
	assert.equal(operation.args.text[0].options.baseline, 12.345)
	assert.deepEqual(operation.args.text[0].options.bullet, { glyph: 'CHECK', characterCode: '2713' })
	assert.equal(operation.args.text[1].text, 'Line\u00A0with NBSP')
	assert.equal(operation.args.text[1].options.breakLine, undefined)
	assert.equal(operation.args.text[2].options.softBreakBefore, true)
	assert.equal(operation.args.text[2].options.rtl, true)
	assert.equal(operation.args.text[2].options.fontFaceComplexScript, 'Noto Naskh Arabic')
	assert.match(operation.args.text[2].options.field.id, FIELD_GUID)
	assert.deepEqual(operation.args.text[2].options.hyperlink, { url: 'https://example.com/rich', tooltip: 'Open rich-text proof' })

	const inlineSpec = richTextSpec()
	inlineSpec.slides[0].content[0].text = [
		{ text: 'Inline one', options: { bold: true } },
		{ text: ' and two', options: { italic: true } },
		{ text: 'new paragraph', options: { breakLine: true } },
		{ text: 'final paragraph', options: {} },
	]
	const inlineCompiled = buildSpecOperationPlan(inlineSpec, { plan: 'premium' })
	assert.deepEqual(inlineCompiled.errors, [])
	const inlineOperation = inlineCompiled.operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName.includes('rich-copy'))
	assert.equal(inlineOperation.args.text[0].options.breakLine, undefined)
	assert.equal(inlineOperation.args.text[1].options.breakLine, undefined)
	assert.equal(inlineOperation.args.text[2].options.breakLine, true)
})

test('engine serializes, imports, exports, recompiles, resets, re-edits, and deletes rich text without stale hyperlinks', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `foundation-text-${Date.now()}`, blackBox: false })
	const deckIds = []
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: richTextSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}), 'generate rich text')
		deckIds.push(committed.deckId)
		let entry = getDeck(committed.deckId)
		const objectName = richNativeObject(entry).options.objectName
		assert.equal(hyperlinkRelationships(entry).length, 1)

		const authoredPackage = await packageParts(entry)
		assert.match(authoredPackage.slideXml, /<a:bodyPr[^>]*\bvert="eaVert"[\s\S]*?<a:normAutofit\/>/)
		assert.match(authoredPackage.slideXml, /<a:pPr[^>]*\brtl="1"[^>]*>[\s\S]*?<a:buChar char="&#x2713;"\/>/)
		assert.match(authoredPackage.slideXml, /<a:rPr[^>]*\bbaseline="12345"/)
		assert.match(authoredPackage.slideXml, /<a:rPr[^>]*\bstrike="dblStrike"[^>]*>[\s\S]*?<a:srgbClr val="000000"\/>[\s\S]*?<a:t>Line\u00A0with NBSP<\/a:t>/)
		assert.match(authoredPackage.slideXml, /<a:t>Line\u00A0with NBSP<\/a:t><\/a:r><a:br\/>/)
		assert.match(authoredPackage.slideXml, /<a:fld id="\{[0-9A-F-]+\}" type="slidenum">/)
		assert.match(authoredPackage.slideXml, /<a:rPr[^>]*\brtl="1"[^>]*>[\s\S]*?<a:cs typeface="Noto Naskh Arabic"/)
		assert.match(authoredPackage.slideXml, /<a:hlinkClick r:id="rId\d+"[^>]*tooltip="Open rich-text proof"/)
		assert.match(authoredPackage.relsXml, /Type="[^"]+\/hyperlink" Target="https:\/\/example\.com\/rich" TargetMode="External"/)

		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }), 'export rich text').spec
		const exportedBlock = richBlock(exported)
		assert.ok(exportedBlock)
		assert.equal(exportedBlock.text[0].options.baseline, 12.345)
		assert.equal(exportedBlock.text[0].options.bullet.glyph, 'CHECK')
		assert.equal(exportedBlock.text[1].options.strike, 'dblStrike')
		assert.equal(exportedBlock.text[1].options.color, '000000')
		assert.equal(exportedBlock.text[2].options.softBreakBefore, true)
		assert.equal(exportedBlock.text[2].options.fontFaceComplexScript, 'Noto Naskh Arabic')
		assert.match(exportedBlock.text[2].options.field.id, FIELD_GUID)
		assert.deepEqual(exportedBlock.text[2].options.hyperlink, { url: 'https://example.com/rich', tooltip: 'Open rich-text proof' })
		assert.doesNotMatch(JSON.stringify(exportedBlock), /_rId|standaloneBreakParagraph|_rawRpr/)

		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}), 'recompile exported rich text')
		deckIds.push(replay.deckId)
		const replayPackage = await packageParts(getDeck(replay.deckId))
		assert.match(replayPackage.slideXml, /baseline="12345"/)
		assert.match(replayPackage.slideXml, /<a:fld id="\{[0-9A-F-]+\}" type="slidenum">/)
		assert.match(replayPackage.relsXml, /Target="https:\/\/example\.com\/rich"/)

		const opened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', {
			data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${authoredPackage.bytes.toString('base64')}`,
			fileName: 'foundation-rich-text.pptx',
		}), 'open uploaded rich text')
		deckIds.push(opened.deckId)
		const imported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: opened.deckId, detail: 'full' }), 'export imported rich text').spec
		const importedBlock = richBlock(imported)
		assert.ok(importedBlock)
		assert.equal(importedBlock.text.some(run => run.text === '' && run.options?.breakLine === true), false)
		assert.equal(importedBlock.text.find(run => run.text === 'Hard paragraph')?.options.breakLine, true)
		const importedBlackStrike = importedBlock.text.find(run => run.text === 'Line\u00A0with NBSP')
		assert.equal(importedBlackStrike?.options.strike, 'dblStrike')
		assert.equal(importedBlackStrike?.options.color, '000000')
		assert.equal(importedBlock.text.find(run => run.options?.baseline !== undefined)?.options.baseline, 12.345)
		const importedFieldRun = importedBlock.text.find(run => run.options?.field)
		assert.equal(importedFieldRun.options.field.type, 'slidenum')
		assert.match(importedFieldRun.options.field.id, FIELD_GUID)
		assert.equal(importedFieldRun.options.hyperlink.url, 'https://example.com/rich')
		assert.equal(importedFieldRun.options.fontFaceComplexScript, 'Noto Naskh Arabic')
		assert.equal(importedFieldRun.options.softBreakBefore, true)

		const previousRid = hyperlinkRelationships(entry)[0].rId
		dataOf(await handleUpdateShapeForTest({
			deckId: committed.deckId,
			slideIndex: 0,
			target: { objectName },
			patch: {
				text: [{ text: 'Reset text', options: { fontFace: null, fontSize: null, color: null, bold: null, italic: null, baseline: null, bullet: null, rtl: null, rtlMode: null, fontFaceComplexScript: null, softBreakBefore: null, field: null, hyperlink: null } }],
				vert: null, fit: null, wrap: null,
			},
		}), 'reset rich text')
		entry = getDeck(committed.deckId)
		assert.equal(hyperlinkRelationships(entry).some(rel => rel.rId === previousRid), false)
		assert.equal(hyperlinkRelationships(entry).length, 0)
		const resetPackage = await packageParts(entry)
		assert.doesNotMatch(resetPackage.slideXml, /<a:fld\b|<a:hlinkClick\b|\bbaseline=|<a:br\/>|vert="eaVert"|Noto Naskh Arabic/)
		assert.doesNotMatch(resetPackage.relsXml, /relationships\/hyperlink/)

		dataOf(await handleUpdateShapeForTest({
			deckId: committed.deckId,
			slideIndex: 0,
			target: { objectName },
			patch: {
				text: [{ text: 'Re-edited field', options: { baseline: -3.25, bullet: { glyph: 'STAR' }, rtl: true, fontFaceComplexScript: 'Arial', field: { type: 'datetime' }, hyperlink: { url: 'https://example.com/again' } } }],
				vert: 'mongolianVert', fit: 'shrink', wrap: true,
			},
		}), 're-edit rich text')
		entry = getDeck(committed.deckId)
		assert.equal(hyperlinkRelationships(entry).length, 1)
		assert.equal(hyperlinkRelationships(entry)[0].Target, 'https://example.com/again')
		const reeditedPackage = await packageParts(entry)
		assert.match(reeditedPackage.slideXml, /vert="mongolianVert"/)
		assert.match(reeditedPackage.slideXml, /baseline="-3250"/)
		assert.match(reeditedPackage.slideXml, /<a:buChar char="&#x2605;"\/>/)
		assert.match(reeditedPackage.slideXml, /<a:fld id="\{[0-9A-F-]+\}" type="datetime">/)
		assert.match(reeditedPackage.relsXml, /Target="https:\/\/example\.com\/again"/)

		dataOf(await handleDeleteShapesForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName } }), 'delete rich text')
		entry = getDeck(committed.deckId)
		assert.equal(richNativeObject(entry), undefined)
		assert.equal(hyperlinkRelationships(entry).length, 0)
		const deletedPackage = await packageParts(entry)
		assert.doesNotMatch(deletedPackage.relsXml, /relationships\/hyperlink/)
		assert.doesNotMatch(deletedPackage.slideXml, /Re-edited field/)
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
