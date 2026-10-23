// Regressions for engine bugs a blind AI-client test exposed on 2026-10-23:
// table column collapse after an export/patch round trip, UnicodeMath equations
// written as one literal run, dropped content[].textFill, patch-adds-slide
// passing dryRun, and export_spec mode:"current" ignoring download:true.
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'

import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const EMU = 914400

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result).slice(0, 1500)}`)
	return result.data || result
}

function dispatcher(label) {
	return createMcpToolDispatcher({
		sessionId: `blind-client-${label}-${Date.now()}`,
		clientInfo: { name: 'blind-client-engine-regressions', version: '1' },
		blackBox: false,
		__skipDurableOperationLedger: true,
		__skipDurableDeckPersistence: true,
	})
}

function deckSpec(slides) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Blind client regressions',
		layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		styleIntent: { artDirection: 'editorial', mode: 'light', tone: 'clear' },
		slides,
	}
}

const tableSlide = {
	id: 'owners',
	title: 'Owners',
	layoutIntent: 'title-only',
	content: [{
		kind: 'table-panel',
		name: 'owners-table',
		rect: { x: 0.9, y: 1.7, w: 11.5, h: 2.4 },
		rows: [['Workstream', 'Owner', 'Due date'], ['Build', 'Alex Kim', 'Nov 14'], ['Test', 'Priya Shah', 'Nov 28']],
		tableOptions: { headerRow: true, fontSize: 18 },
		summary: 'Build owned by Alex Kim due Nov 14; Test owned by Priya Shah due Nov 28.',
		verified: true,
		evidenceSource: 'Team plan.',
		altText: 'Table of workstreams with owners and due dates.',
	}],
}

async function createDeck(mcp, spec) {
	return dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'summary' })).deckId
}

async function slideXml(deckId, slideNumber = 1) {
	const zip = await JSZip.loadAsync(Buffer.from(await getDeck(deckId).pptx.write({ outputType: 'nodebuffer' })))
	return zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string')
}

function gridColumnWidths(xml) {
	return [...xml.matchAll(/<a:gridCol w="(\d+)"/g)].map(match => Number(match[1]))
}

test('table column widths survive export_spec(current) -> patch, and collapsed columns fail validation', { timeout: 120000 }, async () => {
	const mcp = dispatcher('table')
	const deckId = await createDeck(mcp, deckSpec([tableSlide]))
	const before = gridColumnWidths(await slideXml(deckId))
	assert.equal(before.length, 3)
	assert.ok(before.every(width => width > EMU), `created widths: ${before}`)

	const exported = dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current' }))
	const exportedTable = exported.spec.slides[0].content.find(block => block.kind === 'table-panel')
	assert.equal(exportedTable.bbox.w, 11.5, 'export reports table geometry in inches')
	const patchSpec = { ...exported.spec, slides: [{ ...exported.spec.slides[0], content: [exportedTable] }] }
	dataOf('patch dryRun', await mcp.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', detail: 'summary' }))
	dataOf('patch', await mcp.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'summary' }))
	const after = gridColumnWidths(await slideXml(deckId))
	assert.deepEqual(after, before, 'patched table keeps its inch-sized columns instead of gridCol w="4"')
	const table = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object._type === 'table')
	assert.equal(table.options.w, Math.round(11.5 * EMU), 'patched geometry is stored in EMU like addTable')

	const clean = dataOf('validate clean', await mcp.call('betterpptx.deck.validate', { deckId }))
	assert.equal((clean.findings || []).some(finding => finding.code === 'TABLE_COLUMN_WIDTH_COLLAPSED'), false)

	// The pre-fix state: inch geometry stored where EMU is expected.
	table.options.w = 11.5
	const broken = dataOf('validate collapsed', await mcp.call('betterpptx.deck.validate', { deckId }))
	const finding = (broken.findings || []).find(item => item.code === 'TABLE_COLUMN_WIDTH_COLLAPSED')
	assert.ok(finding, JSON.stringify(broken.findings))
	assert.equal(finding.severity, 'error')
	assert.equal(broken.valid, false)
	const quality = dataOf('quality collapsed', await mcp.call('betterpptx.deck.validate_quality', { deckId }))
	assert.equal(quality.checks.find(check => check.key === 'package').ok, false, 'validate_quality package gate blocks a collapsed table')
})

test('unicodeMath equations build up subscripts, fractions and superscripts', { timeout: 120000 }, async () => {
	const mcp = dispatcher('equation')
	const deckId = await createDeck(mcp, deckSpec([{
		id: 'cop',
		title: 'Coefficient of performance',
		layoutIntent: 'title-only',
		content: [
			{ kind: 'equation', name: 'cop-equation', source: 'COP=Q_h/W', sourceFormat: 'unicodeMath', rect: { x: 3.4, y: 1.9, w: 6.5, h: 1.8 }, options: { fontSize: 44 }, altText: 'COP equals Q h divided by W.' },
			{ kind: 'equation', name: 'energy', source: 'E=mc^2', sourceFormat: 'unicodeMath', rect: { x: 3.4, y: 4.2, w: 6.5, h: 1.2 }, altText: 'E equals m c squared.' },
		],
	}]))
	const xml = await slideXml(deckId)
	const cop = xml.split('<p:sp>').find(part => part.includes('cop-equation'))
	assert.ok(cop, 'COP equation shape exists')
	assert.match(cop, /<m:f>.*<m:num><m:sSub><m:e>.*>Q<\/m:t>.*<m:sub>.*>h<\/m:t>.*<\/m:sSub><\/m:num><m:den>.*>W<\/m:t>.*<\/m:den><\/m:f>/s)
	assert.doesNotMatch(cop, /<m:t>COP=Q_h\/W<\/m:t>/, 'not one literal linear-format run')
	const energy = xml.split('<p:sp>').find(part => part.includes('energy'))
	assert.match(energy, /<m:sSup><m:e>.*>c<\/m:t>.*<m:sup>.*>2<\/m:t>/s)

	const exported = dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current' }))
	const block = exported.spec.slides[0].content.find(item => item.kind === 'equation' && String(item.name || item.objectName).includes('cop-equation'))
	assert.equal(block?.source ?? block?.unicodeMath, 'COP=Q_h/W', 'the authored linear source round-trips unchanged')
})

test('UnicodeMath build-up covers radicals, n-ary limits, grouping and plain text', async () => {
	const PptxGenJS = createRequire(import.meta.url)('../../dist/pptxgen.cjs.js')
	const omml = async source => {
		const pptx = new PptxGenJS()
		pptx.addSlide().addEquation({ source, sourceFormat: 'unicodeMath', x: 1, y: 1, w: 6, h: 1 })
		const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }))
		const xml = await zip.file('ppt/slides/slide1.xml').async('string')
		return xml.match(/<m:oMath>.*<\/m:oMath>/s)[0].replace(/<a:rPr.*?<\/a:rPr>/g, '').replace(/<m:r><m:t(?: xml:space="preserve")?>(.*?)<\/m:t><\/m:r>/g, '"$1"')
	}
	assert.match(await omml('x=(-b±√(b^2-4ac))/(2a)'), /<m:f>.*<m:num>"-b±"<m:rad>.*<m:sSup><m:e>"b"<\/m:e><m:sup>"2"<\/m:sup><\/m:sSup>"-4ac"<\/m:e><\/m:rad><\/m:num><m:den>"2a"<\/m:den><\/m:f>/s)
	assert.match(await omml('∑_(i=1)^n i'), /<m:nary>.*<m:chr m:val="∑"\/>.*<m:sub>"i=1"<\/m:sub><m:sup>"n"<\/m:sup><m:e>"i"<\/m:e><\/m:nary>/s)
	assert.match(await omml('(a+b)/(c+d)'), /<m:f>.*<m:num>"a\+b"<\/m:num><m:den>"c\+d"<\/m:den><\/m:f>/s, 'operand parentheses are removed')
	assert.match(await omml('T_max'), /<m:sSub><m:e>"T"<\/m:e><m:sub>"max"<\/m:sub><\/m:sSub>/)
	assert.match(await omml('√(3&x)'), /<m:rad><m:radPr\/><m:deg>"3"<\/m:deg><m:e>"x"<\/m:e><\/m:rad>/)
	assert.equal(await omml('plain text'), '<m:oMath>"plain text"</m:oMath>')
	assert.equal(await omml('((1)'), '<m:oMath>"("<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>"1"</m:e></m:d></m:oMath>', 'unbalanced input stays literal')

	const pptx = new PptxGenJS()
	pptx.addSlide().addEquation({ source: 'Q_h/W', sourceFormat: 'plain', x: 1, y: 1, w: 6, h: 1 })
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }))
	assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /<m:t>Q_h\/W<\/m:t>/, 'sourceFormat plain stays literal')
})

test('content[].textFill is honored on title and text blocks, not only style.textFill', { timeout: 120000 }, async () => {
	const mcp = dispatcher('text-fill')
	const gradient = { type: 'gradient', gradientDirection: 'linear', gradientAngle: 0, gradientStops: [{ position: 0, color: '1F4E79' }, { position: 100, color: '00A3A1' }] }
	const deckId = await createDeck(mcp, deckSpec([{
		id: 'title',
		title: 'Northwind Robotics Q3 2026',
		layoutIntent: 'title-only',
		content: [
			{ kind: 'title', name: 'headline', text: 'Northwind Robotics Q3 2026', rect: { x: 0.9, y: 2.3, w: 11.5, h: 1.6 }, options: { fontSize: 54, bold: true }, textFill: gradient },
			{ kind: 'textBox', name: 'kicker', text: 'QUARTERLY UPDATE', rect: { x: 0.9, y: 4.2, w: 8, h: 0.6 }, options: { fontSize: 24 }, textFill: { type: 'solid', color: 'B91C1C' } },
		],
	}]))
	const xml = await slideXml(deckId)
	const headline = xml.split('<p:sp>').find(part => part.includes('headline'))
	assert.match(headline, /<a:rPr[^>]*>(?:(?!<\/a:rPr>).)*<a:gradFill[^>]*><a:gsLst><a:gs pos="0"><a:srgbClr val="1F4E79"\/><\/a:gs><a:gs pos="100000"><a:srgbClr val="00A3A1"\/>/s)
	const kicker = xml.split('<p:sp>').find(part => part.includes('kicker'))
	assert.match(kicker, /<a:rPr[^>]*><a:solidFill><a:srgbClr val="B91C1C"\/>/)
})

test('patch that adds a slide fails at dryRun with an actionable PATCH_SLIDE_NOT_FOUND pointing to append', { timeout: 120000 }, async () => {
	const mcp = dispatcher('patch-add-slide')
	const spec = deckSpec([tableSlide])
	const deckId = await createDeck(mcp, spec)
	const patchSpec = { ...spec, slides: [...spec.slides, { id: 'next-steps', title: 'Next steps', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'body', text: 'Ship it', rect: { x: 1, y: 2, w: 8, h: 1 } }] }] }
	const dry = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', detail: 'summary' })
	assert.equal(dry.ok, false, 'dryRun must reject what commit would reject')
	assert.equal(dry.error.code, 'PATCH_SLIDE_NOT_FOUND')
	assert.match(dry.error.message, /slides\[1\] \(id "next-steps"\)/)
	assert.match(dry.error.message, /commitMode:"append"/)
	assert.equal(dry.error.details.correction.commitMode, 'append')
	assert.equal(getDeck(deckId).pptx.slides.length, 1, 'deck unchanged')

	dataOf('append', await mcp.call('betterpptx.deck.generate_from_spec', { deckId, spec: { ...spec, slides: [patchSpec.slides[1]] }, phase: 'commit', commitMode: 'append', plan: 'premium', billingConfirmed: true, detail: 'summary' }))
	assert.equal(getDeck(deckId).pptx.slides.length, 2, 'the suggested append route adds the slide')
})

test('export_spec mode:"current" with download:true publishes the exported spec', { timeout: 120000 }, async () => {
	const mcp = dispatcher('export-download')
	const deckId = await createDeck(mcp, deckSpec([tableSlide]))
	const exported = dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: true, fileName: `blind-client-current-${Date.now()}` }))
	assert.ok(exported.artifact, 'download:true returns an artifact')
	assert.equal(exported.artifact.stage, 'current')
	assert.match(exported.artifact.artifactId, /^spec:\/\/sha256\/[0-9a-f]{64}$/)
	const filePath = exported.artifact.filePath
	assert.ok(exported.artifact.downloadUrl || filePath, 'artifact is downloadable or archived locally')
	if (filePath) {
		try {
			const written = JSON.parse(await fs.readFile(filePath, 'utf8'))
			assert.equal(written.slides.length, exported.spec.slides.length)
			assert.equal(written.title, exported.spec.title)
		} finally {
			await fs.rm(filePath, { force: true })
		}
	}
	const withoutDownload = dataOf('export plain', await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current' }))
	assert.equal(withoutDownload.artifact, undefined)
})

test('editorial rule-style table headers keep readable ink after the default header fill is dropped', { timeout: 120000 }, async () => {
	const mcp = dispatcher('rule-header')
	const deckId = await createDeck(mcp, deckSpec([tableSlide]))
	const table = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object._type === 'table')
	const header = table.arrTabRows[0][0].options
	assert.equal(header.fill, undefined, 'rule headers are typographic: no fill')
	assert.notEqual(String(header.color).toUpperCase(), 'FFFFFF', 'no white text on the light table fill')
	assert.equal(header.bold, true)
})
