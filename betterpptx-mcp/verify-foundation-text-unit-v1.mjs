#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

import { normalizeRichRunOptions } from './option-registry.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

export const FOUNDATION_TEXT_UNIT_ID = 'impl-b-57c2c34fa9b72ee0'
export const FOUNDATION_TEXT_ROWS = Object.freeze([
	['cap_04c289f99bb1fc26716d', 'East Asian vertical eaVert'],
	['cap_1027890d81e90c60217c', 'complex-script flags'],
	['cap_111ca5906406e8b708c7', 'baseline'],
	['cap_14bde8bc2cf0bcf267fe', 'text boxes'],
	['cap_20cd40de40986dee6195', 'line breaks'],
	['cap_2e1dcb1c24be6e0e3c1a', 'bidirectional text'],
	['cap_2f51c6bf475248715239', 'shrink text'],
	['cap_3c98ac90b03728ee4134', 'font face'],
	['cap_46070c0141facf98a7b9', 'soft breaks'],
	['cap_467b402dbb9b048264e9', 'bullet STAR'],
	['cap_58efd3a179a8bad6821c', 'Mongolian vertical mongolianVert'],
	['cap_7fedac9c2c15e8b012e2', 'bullet TRIANGLE'],
	['cap_8447cabb8c034846ef06', 'fields'],
	['cap_b4dbbaefec9d67dbb15b', 'non-breaking spaces'],
	['cap_bc55b4ec5510ad2efd6c', 'bullet DEFAULT'],
	['cap_c7feeda9c2e1e1715a3f', 'bullet CHECK'],
	['cap_d0874657dba2bd79dd74', 'italic'],
	['cap_d30c891080b2157a5fb3', 'font size'],
	['cap_daed5870b5a407642542', 'RTL text'],
	['cap_eb812ec514ff5e5316cf', 'bold'],
	['cap_ee8187d330d6ebb91d54', 'font color'],
	['cap_f3ce1c4fff45a491558e', 'hyperlinks'],
])

const EXTERNAL_URLS = Object.freeze({
	initial: 'https://example.com/foundation-text?state=initial&proof=1',
	switched: 'https://example.org/foundation-text?state=switched&proof=2',
	reedited: 'https://example.net/foundation-text?state=reedited&proof=3',
})

const FIELD_DEFINITIONS = Object.freeze([
	Object.freeze({ marker: '42', id: '{11111111-2222-4333-8444-555555555555}', type: 'slidenum' }),
	Object.freeze({ marker: '2026-08-28', id: '{AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE}', type: 'datetime1' }),
])

const BULLETS = Object.freeze([
	Object.freeze({ marker: 'DEFAULT bullet', code: '2022' }),
	Object.freeze({ marker: 'CHECK bullet', code: '2713' }),
	Object.freeze({ marker: 'STAR bullet', code: '2605' }),
	Object.freeze({ marker: 'TRIANGLE bullet', code: '25B6' }),
])

export function assertFoundationTextValidationContracts() {
	const cases = [
		{
			label: 'field id',
			options: { field: { id: 'not-a-guid', type: 'slidenum' } },
			expected: /field\.id must be a GUID/,
		},
		{
			label: 'field type',
			options: { field: { id: FIELD_DEFINITIONS[0].id, type: '' } },
			expected: /field\.type must be a non-empty native field type/,
		},
		{
			label: 'baseline with subscript',
			options: { baseline: -25, subscript: true },
			expected: /baseline cannot be combined with superscript or subscript/,
		},
		{
			label: 'baseline with superscript',
			options: { baseline: 25, superscript: true },
			expected: /baseline cannot be combined with superscript or subscript/,
		},
	]
	for (const validationCase of cases) {
		assert.throws(
			() => normalizeRichRunOptions(validationCase.options, `proof.${validationCase.label}`, { text: validationCase.label }),
			validationCase.expected,
			`${validationCase.label} must be rejected before serialization`,
		)
	}
	return cases.map(item => item.label)
}

function unwrap(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

function decodeXml(value = '') {
	return String(value)
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&')
}

function parseAttributes(source = '') {
	return Object.fromEntries(
		[...String(source).matchAll(/([A-Za-z_][\w:.-]*)="([^"]*)"/g)]
			.map(match => [match[1], decodeXml(match[2])]),
	)
}

function elementBlocks(xml, tagName) {
	const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return [...String(xml).matchAll(new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, 'g'))].map(match => match[0])
}

function relationships(xml) {
	return [...String(xml).matchAll(/<Relationship\b([^>]*)\/>/g)].map(match => parseAttributes(match[1]))
}

function sourcePartForRelationships(relsPart) {
	if (relsPart === '_rels/.rels') return ''
	const match = relsPart.match(/^(.*)\/_rels\/([^/]+)\.rels$/)
	return match ? path.posix.join(match[1], match[2]) : ''
}

function resolveRelationshipTarget(sourcePart, target) {
	const decoded = decodeXml(target)
	if (!sourcePart) return decoded.replace(/^\/+/, '')
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart), decoded)).replace(/^\/+/, '')
}

function relationshipPartFor(sourcePart) {
	return path.posix.join(path.posix.dirname(sourcePart), '_rels', `${path.posix.basename(sourcePart)}.rels`)
}

function shapeBlockByName(slideXml, objectName) {
	return elementBlocks(slideXml, 'p:sp').find(block => {
		const cNvPr = block.match(/<p:cNvPr\b([^>]*)\/?>(?:<\/p:cNvPr>)?/)
		return cNvPr && parseAttributes(cNvPr[1]).name === objectName
	})
}

function shapeNameEndingWith(slide, suffix) {
	const objects = slide?._slideObjects || []
	const matches = objects.filter(object => {
		const name = String(object?.options?.objectName || '')
		return name === suffix || name.endsWith(`.${suffix}`) || name.includes(`.${suffix}.`)
	})
	assert.equal(matches.length, 1, `expected one shape for ${suffix}; available: ${objects.map(object => object?.options?.objectName).filter(Boolean).join(', ')}`)
	return matches[0].options.objectName
}

function textWithHyperlinks(state) {
	if (state === 'reset') {
		return [
			{ text: 'External link reset', options: { inline: true, hyperlink: null } },
			{ text: ' · ', options: { inline: true } },
			{ text: 'Internal link reset', options: { inline: true, hyperlink: null } },
		]
	}
	const internalSlide = state === 'switched' ? 3 : 2
	return [
		{ text: `External ${state}`, options: { inline: true, hyperlink: { url: EXTERNAL_URLS[state], tooltip: `${state} external` } } },
		{ text: ' · ', options: { inline: true } },
		{ text: `Internal ${state}`, options: { inline: true, hyperlink: { slide: internalSlide, tooltip: `${state} internal` } } },
	]
}

export function proofSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Foundation text package lifecycle proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'package-integrity reviewers',
			outcome: 'Prove text carriers and hyperlink relationships remain closed through lifecycle edits.',
			remember: 'Text semantics are native, editable, repair-free, and do not imply font embedding.',
		},
		visualDesign: { world: 'editorial', framing: 'A compact native text atlas', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'none', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		theme: { name: 'Foundation text proof', palette: ['F8FAFC', '0F172A', '2563EB', '059669', 'D97706'], fontFace: 'Aptos' },
		slides: [
			{
				id: 'links-fields', title: 'Relationships and fields', role: 'proof', message: 'Hyperlinks and field runs use closed native carriers.', layoutIntent: 'title-body',
				content: [
					{ kind: 'textBox', name: 'links', text: textWithHyperlinks('initial'), style: { fontFace: 'Aptos', fontSize: 18, color: '1D4ED8', fit: 'shrink' } },
					{
						kind: 'textBox', name: 'fields',
						text: [
							{ text: FIELD_DEFINITIONS[0].marker, options: { inline: true, field: { id: FIELD_DEFINITIONS[0].id, type: FIELD_DEFINITIONS[0].type }, bold: true } },
							{ text: ' · ', options: { inline: true } },
							{ text: FIELD_DEFINITIONS[1].marker, options: { inline: true, field: { id: FIELD_DEFINITIONS[1].id, type: FIELD_DEFINITIONS[1].type }, italic: true } },
						],
						style: { fontFace: 'Aptos', fontSize: 18, color: '0F172A', fit: 'shrink' },
					},
				],
			},
			{
				id: 'glyphs-style', title: 'Bullets, baseline, and style', role: 'proof', message: 'Glyph and run style values serialize exactly.', layoutIntent: 'title-body',
				content: [
					{
						kind: 'textBox', name: 'bullets',
						text: BULLETS.map(item => ({ text: item.marker, options: { bullet: { characterCode: item.code, font: 'Arial' } } })),
						style: { fontFace: 'Arial', fontSize: 17, color: '0F172A', fit: 'shrink' },
					},
					{
						kind: 'textBox', name: 'baseline-basic',
						text: [
							{ text: 'baseline-negative', options: { inline: true, baseline: -25 } },
							{ text: ' baseline-zero ', options: { inline: true, baseline: 0 } },
							{ text: 'baseline-positive', options: { inline: true, baseline: 25, bold: true, italic: true, fontFace: 'Arial', fontSize: 18, color: '336699' } },
						],
						style: { fontFace: 'Aptos', fontSize: 16, color: '0F172A', fit: 'shrink' },
					},
				],
			},
			{
				id: 'localization-breaks', title: 'Localization, breaks, and fitting', role: 'proof', message: 'Vertical, bidi, break, and shrink carriers remain distinct.', layoutIntent: 'comparison',
				content: [
					{ kind: 'textBox', name: 'ea-vertical', text: '東アジア縦書き', style: { fontFace: 'Yu Gothic', fontSize: 18, vert: 'eaVert', fit: 'shrink' } },
					{ kind: 'textBox', name: 'mongolian-vertical', text: 'ᠮᠣᠩᠭᠣᠯ', style: { fontFace: 'Mongolian Baiti', fontSize: 18, vert: 'mongolianVert', fit: 'shrink' } },
					{
						kind: 'textBox', name: 'rtl-complex',
						text: [
							{ text: 'مرحبا', options: { inline: true, rtl: true, rtlMode: true, lang: 'ar-SA', fontFace: 'Aptos', fontFaceComplexScript: 'Arial' } },
							{ text: ' שלום', options: { inline: true, rtl: true, lang: 'he-IL', fontFaceComplexScript: 'Arial' } },
						],
						style: { fontFace: 'Aptos', fontSize: 18, rtlMode: true, fit: 'shrink' },
					},
					{
						kind: 'textBox', name: 'breaks-nbsp',
						text: [
							{ text: 'Hard-A', options: { breakLine: true } },
							{ text: 'Hard-B', options: { inline: true } },
							{ text: 'Soft-B', options: { inline: true, softBreakBefore: true } },
							{ text: ' NBSP\u00a0Value', options: { inline: true } },
						],
						style: { fontFace: 'Aptos', fontSize: 16, fit: 'shrink' },
					},
					{ kind: 'textBox', name: 'shrink-target', text: 'Shrink fitting remains native and editable after reset and re-edit.', style: { fontFace: 'Aptos', fontSize: 22, fit: 'shrink' } },
				],
			},
		],
	}
}

function assertPrivateStateIsNotExported(spec) {
	const privatePaths = []
	const visit = (value, valuePath) => {
		if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${valuePath}[${index}]`))
		if (!value || typeof value !== 'object') return
		for (const [key, item] of Object.entries(value)) {
			const childPath = `${valuePath}.${key}`
			if (key.startsWith('_') || ['rawPackageParts', 'rawPresentationFonts'].includes(key)) privatePaths.push(childPath)
			visit(item, childPath)
		}
	}
	visit(spec, 'spec')
	assert.deepEqual(privatePaths, [], `exported spec leaked private fields: ${privatePaths.join(', ')}`)
	const serialized = JSON.stringify(spec)
	assert.doesNotMatch(serialized, /(?:[A-Za-z]:\\|\/Users\/|\/home\/|ppt\/slides\/|\.fntdata)/i, 'exported spec must not leak filesystem or package internals')
}

async function zipText(zip, name) {
	const file = zip.file(name)
	return file ? file.async('string') : ''
}

async function inspectPackage(buffer, expectation) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const slideParts = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
	assert.equal(slideParts.length, 3, `${expectation.state}: expected three slides`)

	for (const relsPart of names.filter(name => name.endsWith('.rels'))) {
		const sourcePart = sourcePartForRelationships(relsPart)
		const rels = relationships(await zipText(zip, relsPart))
		assert.equal(new Set(rels.map(rel => rel.Id)).size, rels.length, `${expectation.state}: ${relsPart} has duplicate relationship IDs`)
		for (const rel of rels) {
			if (rel.TargetMode === 'External') continue
			const targetPart = resolveRelationshipTarget(sourcePart, rel.Target)
			assert.ok(nameSet.has(targetPart), `${expectation.state}: dangling ${relsPart} ${rel.Id} -> ${targetPart}`)
		}
	}

	const contentTypes = await zipText(zip, '[Content_Types].xml')
	assert.ok(contentTypes, `${expectation.state}: [Content_Types].xml missing`)
	for (const match of contentTypes.matchAll(/<Override\b([^>]*)\/>/g)) {
		const attrs = parseAttributes(match[1])
		assert.ok(nameSet.has(String(attrs.PartName || '').replace(/^\//, '')), `${expectation.state}: content-type override target missing ${attrs.PartName}`)
	}
	assert.equal(names.some(name => name.startsWith('ppt/fonts/') || name.endsWith('.fntdata')), false, `${expectation.state}: fontFace must not create embedded-font parts`)
	assert.doesNotMatch(contentTypes, /fontdata|fntdata/i, `${expectation.state}: fontFace must not create embedded-font content types`)
	const presentationXml = await zipText(zip, 'ppt/presentation.xml')
	const presentationRels = await zipText(zip, 'ppt/_rels/presentation.xml.rels')
	assert.doesNotMatch(presentationXml, /<p:embeddedFontLst\b/, `${expectation.state}: fontFace must not create embeddedFontLst`)
	assert.doesNotMatch(presentationRels, /relationships\/font"/, `${expectation.state}: fontFace must not create font relationships`)

	const allSlideXml = []
	for (const slidePart of slideParts) allSlideXml.push(await zipText(zip, slidePart))
	const slide1Part = slideParts[0]
	const slide1Xml = allSlideXml[0]
	const slide1Rels = relationships(await zipText(zip, relationshipPartFor(slide1Part)))
	const hyperlinkRels = slide1Rels.filter(rel => rel.Type?.endsWith('/hyperlink'))
	const slideLinkRels = slide1Rels.filter(rel => rel.Type?.endsWith('/slide') && /^slide\d+\.xml$/.test(rel.Target || ''))
	const hyperlinkCarriers = [...slide1Xml.matchAll(/<a:hlinkClick\b([^>]*)\/?>(?:<\/a:hlinkClick>)?/g)].map(match => parseAttributes(match[1]))
	const carrierIds = hyperlinkCarriers.map(attrs => attrs['r:id'])
	assert.equal(new Set(carrierIds).size, carrierIds.length, `${expectation.state}: hyperlink carriers must use distinct relationship IDs`)
	for (const id of carrierIds) {
		assert.equal(slide1Rels.filter(rel => rel.Id === id).length, 1, `${expectation.state}: carrier ${id} must resolve exactly once`)
	}
	const ownedHyperlinkRels = [...hyperlinkRels, ...slideLinkRels.filter(rel => carrierIds.includes(rel.Id))]
	assert.deepEqual(new Set(ownedHyperlinkRels.map(rel => rel.Id)), new Set(carrierIds), `${expectation.state}: hyperlink relationship set must exactly equal carrier set`)

	if (expectation.links === 'none') {
		assert.equal(hyperlinkCarriers.length, 0, `${expectation.state}: reset/deleted link shape must have no hyperlink carriers`)
		assert.equal(hyperlinkRels.length, 0, `${expectation.state}: reset/deleted link shape must have no external hyperlink relationships`)
		assert.equal(slideLinkRels.filter(rel => carrierIds.includes(rel.Id)).length, 0, `${expectation.state}: reset/deleted link shape must have no internal hyperlink relationships`)
	} else {
		assert.equal(hyperlinkCarriers.length, 2, `${expectation.state}: expected external and internal run hyperlink carriers`)
		assert.equal(hyperlinkRels.length, 1, `${expectation.state}: expected one external hyperlink relationship`)
		assert.equal(hyperlinkRels[0].Target, expectation.externalUrl, `${expectation.state}: external hyperlink target`)
		assert.equal(hyperlinkRels[0].TargetMode, 'External', `${expectation.state}: external hyperlink TargetMode`)
		const internal = slideLinkRels.find(rel => carrierIds.includes(rel.Id))
		assert.ok(internal, `${expectation.state}: internal slide hyperlink relationship missing`)
		assert.equal(resolveRelationshipTarget(slide1Part, internal.Target), `ppt/slides/slide${expectation.internalSlide}.xml`, `${expectation.state}: internal slide target`)
		const internalCarrier = hyperlinkCarriers.find(attrs => attrs['r:id'] === internal.Id)
		assert.equal(internalCarrier?.action, 'ppaction://hlinksldjump', `${expectation.state}: internal hyperlink action`)
	}

	if (expectation.features !== false) {
		const joined = allSlideXml.join('\n')
		for (const item of BULLETS) {
			assert.match(joined, new RegExp(`<a:buChar\\b[^>]*char="(?:&#x${item.code};|${String.fromCodePoint(Number.parseInt(item.code, 16))})"`, 'i'), `${expectation.state}: ${item.marker} glyph`)
		}
		assert.match(joined, /<a:bodyPr\b[^>]*\bvert="eaVert"/, `${expectation.state}: eaVert body carrier`)
		assert.match(joined, /<a:bodyPr\b[^>]*\bvert="mongolianVert"/, `${expectation.state}: mongolianVert body carrier`)
		assert.match(joined, /<a:pPr\b[^>]*\brtl="1"/, `${expectation.state}: paragraph RTL carrier`)
		if (!expectation.officeNormalized) assert.match(joined, /<a:rPr\b[^>]*\brtl="1"/, `${expectation.state}: run RTL carrier`)
		else assert.match(joined, /<a:t>(?:مرحبا| שלום)<\/a:t>/, `${expectation.state}: PowerPoint must retain bidi run text when it normalizes redundant run rtl into paragraph rtl`)
		assert.match(joined, /<a:cs\b[^>]*typeface="Arial"/, `${expectation.state}: complex-script typeface carrier`)
		for (const baseline of ['-25000', '0', '25000']) assert.match(joined, new RegExp(`<a:rPr\\b[^>]*\\bbaseline="${baseline}"`), `${expectation.state}: baseline ${baseline}`)
		const basicRun = elementBlocks(joined, 'a:r').find(block => block.includes('baseline-positive'))
		assert.ok(basicRun, `${expectation.state}: styled baseline run missing`)
		assert.match(basicRun, /<a:rPr\b[^>]*\bsz="1800"[^>]*\bb="1"[^>]*\bi="1"|<a:rPr\b(?=[^>]*\bsz="1800")(?=[^>]*\bb="1")(?=[^>]*\bi="1")/, `${expectation.state}: basic size/bold/italic style`)
		assert.match(basicRun, /<a:srgbClr\b[^>]*\bval="336699"/, `${expectation.state}: basic font color`)

		const hardParagraph = elementBlocks(joined, 'a:p').find(block => block.includes('Hard-A'))
		const mixedParagraph = elementBlocks(joined, 'a:p').find(block => block.includes('Hard-B'))
		assert.ok(hardParagraph && !hardParagraph.includes('Hard-B'), `${expectation.state}: hard break must form a separate paragraph`)
		assert.ok(mixedParagraph?.includes('<a:br') && mixedParagraph.includes('Soft-B'), `${expectation.state}: soft break must remain a:br inside the paragraph`)
		assert.ok(mixedParagraph.includes('\u00a0'), `${expectation.state}: NBSP code point must survive in a:t`)

		for (const field of FIELD_DEFINITIONS) {
			const fieldBlock = elementBlocks(joined, 'a:fld').find(block => block.includes(`id="${field.id}"`))
			assert.ok(fieldBlock, `${expectation.state}: field ${field.id} missing`)
			assert.match(fieldBlock, new RegExp(`<a:fld\\b[^>]*type="${field.type}"`), `${expectation.state}: field ${field.id} type`)
			assert.ok(fieldBlock.indexOf('<a:rPr') < fieldBlock.indexOf('<a:t>') && fieldBlock.indexOf('<a:t>') < fieldBlock.indexOf('</a:fld>'), `${expectation.state}: field child order must be rPr then t`)
			if (!expectation.officeNormalized) assert.ok(fieldBlock.includes(`<a:t>${field.marker}</a:t>`), `${expectation.state}: field ${field.id} display text`)
			else assert.match(fieldBlock, /<a:t>[^<]+<\/a:t>/, `${expectation.state}: PowerPoint must retain a recalculated field display value`)
		}

		const shrinkName = expectation.shrinkObjectName
		if (shrinkName) {
			const shrinkBlock = allSlideXml.map(xml => shapeBlockByName(xml, shrinkName)).find(Boolean)
			assert.ok(shrinkBlock, `${expectation.state}: shrink target shape missing`)
			const fitCount = ['<a:normAutofit', '<a:spAutoFit', '<a:noAutofit'].reduce((sum, token) => sum + (shrinkBlock.split(token).length - 1), 0)
			if (expectation.shrink === true) {
				assert.match(shrinkBlock, /<a:normAutofit\s*\/>/, `${expectation.state}: shrink must serialize as normAutofit`)
				assert.equal(fitCount, 1, `${expectation.state}: shrink target must have exactly one autofit choice`)
			} else {
				assert.equal(fitCount, 0, `${expectation.state}: reset shrink target must have no authored autofit choice`)
			}
		}
	}

	return {
		state: expectation.state,
		sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
		parts: names.length,
		slides: slideParts.length,
		hyperlinkCarriers: hyperlinkCarriers.length,
		hyperlinkRelationships: ownedHyperlinkRels.length,
		embeddedFonts: 0,
		officeNormalized: expectation.officeNormalized === true,
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

function powerpointRequested() {
	return ['1', 'true', 'yes'].includes(String(process.env.BETTERPPTX_FOUNDATION_TEXT_OFFICE || '').trim().toLowerCase())
}

function runProcess(command, args, options = {}) {
	const { timeoutMs = 120000, ...spawnOptions } = options
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { windowsHide: true, ...spawnOptions })
		let stdout = ''
		let stderr = ''
		child.stdout?.on('data', chunk => { stdout += chunk })
		child.stderr?.on('data', chunk => { stderr += chunk })
		const timeout = setTimeout(() => {
			child.kill()
			reject(new Error(`${command} timed out`))
		}, timeoutMs)
		child.on('error', error => { clearTimeout(timeout); reject(error) })
		child.on('close', code => {
			clearTimeout(timeout)
			if (code !== 0) reject(new Error(`${command} exited ${code}: ${stderr || stdout}`))
			else resolve({ stdout, stderr })
		})
	})
}

async function runPowerPointSaveCopy(inputPath, outputPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const scriptPath = path.join(path.dirname(outputPath), 'foundation-text-savecopyas.ps1')
	const script = String.raw`$ErrorActionPreference = 'Stop'
$existing = @(Get-Process POWERPNT -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) { throw 'PowerPoint is already running; isolated SaveCopyAs proof aborted.' }
$inputPath = [IO.Path]::GetFullPath($env:BETTERPPTX_FOUNDATION_TEXT_INPUT)
$outputPath = [IO.Path]::GetFullPath($env:BETTERPPTX_FOUNDATION_TEXT_SAVECOPY)
$app = $null
$presentation = $null
$reopened = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $presentation = $app.Presentations.Open($inputPath, $true, $false, $false)
  $sourceSlides = [int]$presentation.Slides.Count
  $presentation.SaveCopyAs($outputPath, 24)
  $presentation.Close()
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
  $presentation = $null
  $reopened = $app.Presentations.Open($outputPath, $true, $false, $false)
  $reopenedSlides = [int]$reopened.Slides.Count
  [ordered]@{ status = 'passed'; sourceSlides = $sourceSlides; reopenedSlides = $reopenedSlides; saveCopyPath = $outputPath } | ConvertTo-Json -Compress
}
finally {
  if ($reopened) { try { $reopened.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reopened) } catch {} }
  if ($presentation) { try { $presentation.Close() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) } catch {} }
  if ($app) { try { $app.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) } catch {} }
}`
	await fs.writeFile(scriptPath, script, 'utf8')
	const shell = process.env.ComSpec ? 'powershell.exe' : 'powershell'
	try {
		const result = await runProcess(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
			env: { ...process.env, BETTERPPTX_FOUNDATION_TEXT_INPUT: inputPath, BETTERPPTX_FOUNDATION_TEXT_SAVECOPY: outputPath },
			timeoutMs: 120000,
		})
		const jsonLine = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
		const parsed = JSON.parse(jsonLine)
		assert.equal(parsed.sourceSlides, 3, 'PowerPoint source slide count')
		assert.equal(parsed.reopenedSlides, 3, 'PowerPoint reopened slide count')
		return parsed
	} finally {
		await fs.rm(scriptPath, { force: true }).catch(() => {})
	}
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export async function runFoundationTextPackageLifecycleProof({ outputDir = null, office = false } = {}) {
	const validationRejections = assertFoundationTextValidationContracts()
	const {
		createMcpToolDispatcher,
		getDeck,
		handleUpdateShapeForTest,
		handleDeleteShapesForTest,
	} = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-text-package-${Date.now()}`,
		clientInfo: { name: 'foundation-text-package-verifier', version: '1' },
		blackBox: false,
	})
	const deckIds = []
	const lifecycle = []
	let finalBuffer
	let replayBuffer
	try {
		const committed = unwrap('initial commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: proofSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(committed.deckId)
		const entry = getDeck(committed.deckId)
		const linkObjectName = shapeNameEndingWith(entry.pptx.slides[0], 'links')
		const shrinkObjectName = shapeNameEndingWith(entry.pptx.slides[2], 'shrink-target')

		let buffer = await pptxBuffer(entry)
		lifecycle.push(await inspectPackage(buffer, { state: 'initial', links: 'present', externalUrl: EXTERNAL_URLS.initial, internalSlide: 2, shrink: true, shrinkObjectName }))

		await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: linkObjectName }, patch: { text: textWithHyperlinks('switched') } })
		buffer = await pptxBuffer(entry)
		lifecycle.push(await inspectPackage(buffer, { state: 'switched', links: 'present', externalUrl: EXTERNAL_URLS.switched, internalSlide: 3, shrink: true, shrinkObjectName }))

		await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: linkObjectName }, patch: { text: textWithHyperlinks('reset') } })
		await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 2, target: { objectName: shrinkObjectName }, patch: { fit: null } })
		buffer = await pptxBuffer(entry)
		lifecycle.push(await inspectPackage(buffer, { state: 'reset', links: 'none', shrink: false, shrinkObjectName }))

		await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: linkObjectName }, patch: { text: textWithHyperlinks('reedited') } })
		await handleUpdateShapeForTest({ deckId: committed.deckId, slideIndex: 2, target: { objectName: shrinkObjectName }, patch: { fit: 'shrink' } })
		finalBuffer = await pptxBuffer(entry)
		lifecycle.push(await inspectPackage(finalBuffer, { state: 'reedited', links: 'present', externalUrl: EXTERNAL_URLS.reedited, internalSlide: 2, shrink: true, shrinkObjectName }))

		const exported = unwrap('current-spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assertPrivateStateIsNotExported(exported.spec)
		const exportedLinks = exported.spec.slides[0].content.find(block => Array.isArray(block.text) && block.text.some(run => run?.options?.hyperlink))
		assert.ok(exportedLinks && Array.isArray(exportedLinks.text), 'current-spec export must retain rich hyperlink runs')
		assert.equal(exportedLinks.text[0].options.hyperlink.url, EXTERNAL_URLS.reedited, 'current-spec export external hyperlink')
		assert.equal(exportedLinks.text[2].options.hyperlink.slide, 2, 'current-spec export internal hyperlink')
		const expectedAuthoredMarkers = ['External reedited', '42', 'DEFAULT bullet', 'baseline-negative', '東アジア', 'ᠮᠣᠩᠭᠣᠯ', 'مرحبا', 'Hard-A', 'Shrink fitting']
		const exportedAuthoredText = exported.spec.slides.flatMap(slide => slide.content || [])
			.filter(block => block.kind !== 'opaqueNative')
			.map(block => Array.isArray(block.text) ? block.text.map(run => run?.text ?? '').join('') : String(block.text || ''))
			.join('\n')
		for (const marker of expectedAuthoredMarkers) assert.ok(exportedAuthoredText.includes(marker), `current-spec export must retain authored marker ${marker}`)
		const opaqueBlocks = exported.spec.slides.flatMap(slide => slide.content || []).filter(block => block.kind === 'opaqueNative')
		assert.ok(opaqueBlocks.every(block => String(block.objectName || block.name || '').includes('slide-title')), 'only engine-owned title placeholders may require opaque scaffold preservation')
		const portableCurrentSpec = {
			...exported.spec,
			nativePackagePreservation: false,
			slides: exported.spec.slides.map(slide => {
				const { nativeTimingPreservation, ...portableSlide } = slide
				return {
					...portableSlide,
					content: (slide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
						const { nativePreservation, preservationHandle, ...semanticBlock } = block
						return semanticBlock
					}),
				}
			}),
		}

		const replay = unwrap('current-spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portableCurrentSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(replay.deckId)
		const replayEntry = getDeck(replay.deckId)
		const replayShrinkName = shapeNameEndingWith(replayEntry.pptx.slides[2], 'shrink-target')
		replayBuffer = await pptxBuffer(replayEntry)
		lifecycle.push(await inspectPackage(replayBuffer, { state: 'recompiled', links: 'present', externalUrl: EXTERNAL_URLS.reedited, internalSlide: 2, shrink: true, shrinkObjectName: replayShrinkName }))

		await handleDeleteShapesForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: linkObjectName } })
		buffer = await pptxBuffer(entry)
		lifecycle.push(await inspectPackage(buffer, { state: 'deleted', links: 'none', shrink: true, shrinkObjectName }))

		let proofPaths = null
		let officeResult = { status: 'dependency-gated', reason: 'Set BETTERPPTX_FOUNDATION_TEXT_OFFICE=1 to run isolated PowerPoint SaveCopyAs/reopen.' }
		if (outputDir) {
			await fs.mkdir(outputDir, { recursive: true })
			const finalPath = path.join(outputDir, 'foundation-text-lifecycle-reedited.pptx')
			const replayPath = path.join(outputDir, 'foundation-text-current-spec-recompiled.pptx')
			await fs.writeFile(finalPath, finalBuffer)
			await fs.writeFile(replayPath, replayBuffer)
			proofPaths = { finalPath, replayPath }
			if (office) {
				const saveCopyPath = path.join(outputDir, 'foundation-text-lifecycle-reedited-savecopy.pptx')
				officeResult = await runPowerPointSaveCopy(finalPath, saveCopyPath)
				if (officeResult.status === 'passed') {
					const officeBuffer = await fs.readFile(saveCopyPath)
					officeResult.package = await inspectPackage(officeBuffer, { state: 'powerpoint-savecopy', links: 'present', externalUrl: EXTERNAL_URLS.reedited, internalSlide: 2, shrink: true, shrinkObjectName, officeNormalized: true })
				}
			}
		} else if (office) {
			throw new Error('Office proof requires an outputDir for the source and SaveCopyAs artifacts.')
		}

		return {
			schemaVersion: 'betterpptx.foundation-text-unit-proof.v1',
			unitId: FOUNDATION_TEXT_UNIT_ID,
			status: officeResult.status === 'passed' ? 'FOUNDATION_TEXT_PACKAGE_AND_OFFICE_VERIFIED' : 'FOUNDATION_TEXT_PACKAGE_VERIFIED_OFFICE_DEPENDENCY_GATED',
			rows: FOUNDATION_TEXT_ROWS.map(([id, label]) => ({ id, label })),
			checks: {
				rowCount: FOUNDATION_TEXT_ROWS.length === 22,
				carrierRelationshipClosure: true,
				hyperlinkLifecycle: true,
				bulletGlyphs: true,
				verticalAndBidiText: true,
				breakAndNbspSemantics: true,
				baselineAndBasicStyle: true,
				shrinkResetReedit: true,
				typedFieldOrder: true,
				noEmbeddedFontMisconception: true,
				currentSpecExportRecompile: true,
				privateStateNotExported: true,
				invalidFieldRejected: validationRejections.includes('field id') && validationRejections.includes('field type'),
				baselineScriptConflictRejected: validationRejections.includes('baseline with subscript') && validationRejections.includes('baseline with superscript'),
			},
			lifecycle,
			office: officeResult,
			proofPaths,
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const configuredOutput = String(process.env.BETTERPPTX_FOUNDATION_TEXT_OUTPUT || '').trim()
	const outputDir = configuredOutput
		? path.resolve(configuredOutput)
		: path.join(workspaceRoot, 'outputs', 'authoring-principle-corpus', 'per-tile-gallery-closure', timestamp(), 'foundation-text-unit')
	const result = await runFoundationTextPackageLifecycleProof({ outputDir, office: powerpointRequested() })
	const proofPath = path.join(outputDir, 'foundation-text-unit-proof.json')
	await fs.writeFile(proofPath, `${JSON.stringify({ ...result, proofPath }, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify({ ...result, proofPath }, null, 2))
}

if (path.resolve(process.argv[1] || '') === modulePath) {
	main().catch(error => {
		console.error(error?.stack || error)
		process.exitCode = 1
	})
}
