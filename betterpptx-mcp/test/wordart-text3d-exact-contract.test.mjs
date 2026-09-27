import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import JSZip from 'jszip'

import { GENERIC_OPTIONS_SCHEMA } from '../blackbox.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { applyText3DOverridesToRaw } from '../native-effect-presets.mjs'
import { listOptionCatalog } from '../option-registry.mjs'
import {
	TEXT_3D_PUBLIC_SCHEMA,
	WORDART_TEXT3D_CONTRACT,
	WORDART_TEXT3D_ROW_IDS,
	WORDART_TEXT3D_RUNTIME_READY,
	normalizeText3DOptions,
} from '../wordart-text3d-contract.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

function baseSpec(content, title = 'WordArt Text3D exact contract') {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Prove native WordArt and Text3D.', remember: 'Every owned leaf remains editable.' },
		handshake: { audience: 'maintainers', promise: 'Keep native text effects exact.', proof: ['One editable WordArt object.'], bar: 'Package and semantic state agree.' },
		visualDesign: { world: 'Editorial', framing: 'One native proof object', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '6D28D9', '38BDF8', 'F59E0B'], fontFace: 'Aptos Display' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 'proof', title, message: 'Native WordArt and Text3D proof.', role: 'evidence', layoutIntent: 'title-only', content }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

function xmlDocument(xml, label = 'XML') {
	const errors = []
	const document = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label} must be well formed: ${errors.join('; ')}`)
	return document
}

function localSignature(node) {
	if (!node) return '<absent>'
	if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue || ''
	if (node.nodeType !== 1) return ''
	const attributes = Array.from(node.attributes || []).filter(attribute => attribute.name !== 'xmlns' && attribute.prefix !== 'xmlns').map(attribute => `${attribute.localName}=${attribute.value}`).sort()
	const children = Array.from(node.childNodes || []).map(localSignature).filter(Boolean)
	return `${node.localName}[${attributes.join(',')}]{${children.join('')}}`
}

async function body3DSignature(fileName) {
	const zip = await JSZip.loadAsync(await fs.readFile(fileName), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const document = xmlDocument(xml, path.basename(fileName))
	const bodyPr = document.getElementsByTagNameNS(DRAWING_NS, 'bodyPr')[0]
	return Array.from(bodyPr.childNodes).filter(node => node.nodeType === 1 && ['prstTxWarp', 'scene3d', 'sp3d'].includes(node.localName)).map(localSignature)
}

test('generated aggregate contract promotes only after the exact runtime gate and projects all three rows', () => {
	assert.equal(WORDART_TEXT3D_RUNTIME_READY, true)
	assert.equal(WORDART_TEXT3D_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(TEXT_3D_PUBLIC_SCHEMA.additionalProperties, false)
	assert.equal(TEXT_3D_PUBLIC_SCHEMA.properties.extrusion.oneOf[1].additionalProperties, false)
	assert.match(TEXT_3D_PUBLIC_SCHEMA.properties.extrusionColor.oneOf[0].pattern, /#\?/)
	assert.deepEqual(GENERIC_OPTIONS_SCHEMA.properties.text3D, JSON.parse(JSON.stringify(TEXT_3D_PUBLIC_SCHEMA)))
	const entries = publicBaselineCatalog({ family: 'wordart-text3d', limit: 500 }).entries
	for (const id of WORDART_TEXT3D_ROW_IDS) assert.equal(entries.find(entry => entry.id === id)?.capabilityStatus, 'executable-exact-structured', id)
	const surface = listOptionCatalog({ surface: 'text3DShape', format: 'full' }).surfaces.find(item => item.id === 'text3DShape')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.ok(surface.overrideFields.includes('perspective'))
})

test('closed Text3D normalizer is alias-aware, resettable, native-resolution exact, and fail-closed', () => {
	assert.deepEqual(normalizeText3DOptions({
		bevel: { type: 'circle', w: 4, h: 3 },
		bevelBottom: { type: null, width: null, height: 2 },
		extrusion: { depth: 8, color: '#6d28d9' },
		contourWidth: 1,
		contourColor: { hex: '38bdf8' },
		material: 'warmMatte',
		lightRig: { name: 'threePt', direction: 45 },
		rotationX: 8,
		rotationY: -12,
		rotationZ: 0,
		perspective: 60,
	}), {
		bevel: { type: 'circle', width: 4, height: 3 },
		bevelBottom: { type: null, width: null, height: 2 },
		extrusion: 8,
		contourWidth: 1,
		contourColor: '38BDF8',
		material: 'warmMatte',
		lightRig: 'threePt',
		rotationX: 8,
		rotationY: -12,
		rotationZ: 0,
		perspective: 60,
		extrusionColor: '6D28D9',
		lightDirection: 45,
	})
	assert.equal(normalizeText3DOptions(null), null)
	for (const [value, pattern] of [
		[{ invented: true }, /not part of the public Text3D contract/],
		[{ bevel: { type: 'invented' } }, /must be one of/],
		[{ extrusionColor: '12345678' }, /6-digit RGB/],
		[{ material: 'invented' }, /must be one of/],
		[{ lightRig: 'invented' }, /must be one of/],
		[{ perspective: 121 }, /between 0 and 120/],
		[{ extrusion: 5001 }, /between 0 and 5000/],
		[{ bevel: { width: 1.000001 } }, /native step/],
	]) assert.throws(() => normalizeText3DOptions(value), pattern)
})

test('narrow DOM takeover edits only owned 3D leaves and preserves unmodeled native payload', () => {
	const raw = '<a:noAutofit/>' +
		'<a:scene3d><a:camera prst="isometricLeftUp" zoom="125000"><a:rot lat="60000" lon="120000" rev="180000"/></a:camera><a:lightRig rig="twoPt" dir="br"><a:rot lat="240000" lon="300000" rev="360000"/></a:lightRig><a:backdrop anchor="1"/></a:scene3d>' +
		'<a:sp3d z="42" extrusionH="12700"><a:bevelT h="38100"/><a:extrusionClr><a:schemeClr val="accent2"><a:tint val="20000"/></a:schemeClr></a:extrusionClr><a:extLst/></a:sp3d>' +
		'<a:extLst><a:ext uri="keep"/></a:extLst>'
	const merged = applyText3DOverridesToRaw(raw, { extrusion: 8, contourWidth: 2, contourColor: 'ABCDEF', perspective: 60, rotationY: null })
	assert.match(merged, /zoom="125000"/)
	assert.match(merged, /prst="perspectiveFront"/)
	assert.match(merged, /dir="br"/)
	assert.match(merged, /lat="240000" lon="300000" rev="360000"/)
	assert.match(merged, /z="42"/)
	assert.match(merged, /<a:bevelT h="38100"\/>/)
	assert.match(merged, /<a:schemeClr val="accent2"><a:tint val="20000"\/><\/a:schemeClr>/)
	assert.match(merged, /extrusionH="101600"/)
	assert.match(merged, /contourW="25400"/)
	assert.match(merged, /<a:contourClr><a:srgbClr val="ABCDEF"\/><\/a:contourClr>/)
	assert.ok(merged.indexOf('<a:noAutofit') < merged.indexOf('<a:scene3d'))
	assert.ok(merged.indexOf('<a:scene3d') < merged.indexOf('<a:sp3d'))
	assert.ok(merged.indexOf('<a:sp3d') < merged.lastIndexOf('<a:extLst'))
	const reset = applyText3DOverridesToRaw(merged, null)
	assert.match(reset, /<a:noAutofit/)
	assert.match(reset, /uri="keep"/)
	assert.doesNotMatch(reset, /scene3d|sp3d/)
})

test('compiler preserves explicit null and last-wins WordArt/Text3D precedence', () => {
	const full = baseSpec([{ kind: 'wordart', name: 'proof', text: 'EXACT', wordArt: { transform: 'textArchUp', adjustments: [50000] }, wordArtStylePresetId: 'wordart-style-007', textEffectPresetIds: ['text-effect-preset-002'], style: { wordArt: { transform: 'textWave1' }, text3D: { extrusion: 8, material: 'metal', perspective: 60 } } }])
	let operation = buildSpecOperationPlan(full, { dryRun: true, plan: 'premium' }).operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.args.options.wordArt)
	assert.deepEqual(operation.args.options.wordArt, { transform: 'textArchUp', adjustments: [50000] })
	assert.deepEqual(operation.args.options.text3D, { extrusion: 8, material: 'metal', perspective: 60 })
	assert.equal(operation.args.options.fit, 'none')
	const reset = structuredClone(full)
	reset.slides[0].content[0].wordArt = null
	reset.slides[0].content[0].style.text3D = null
	operation = buildSpecOperationPlan(reset, { dryRun: true, plan: 'premium' }).operations.find(item => item.tool === 'betterpptx.slide.add_text')
	assert.equal(operation.args.options.wordArt, null)
	assert.equal(operation.args.options.text3D, null)
	assert.throws(() => buildSpecOperationPlan(baseSpec([{ kind: 'wordart', name: 'unsafe', text: 'unsafe', fit: 'resize', wordArt: { transform: 'textArchUp' }, style: { text3D: { extrusion: 4 } } }]), { dryRun: true, plan: 'premium' }), /renders that native carrier invisible/)
})

test('direct library serialization is closed, emits independent colors, and uses a perspective camera', { timeout: 120000 }, async t => {
	const output = process.env.BETTERPPTX_WORDART_TEXT3D_PROOF_OUTPUT || path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-wordart-text3d-')), 'wordart-text3d-proof.pptx')
	await fs.mkdir(path.dirname(output), { recursive: true })
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	slide.background = { color: '0B1220' }
	slide.addText('NATIVE DEPTH', { x: 0.8, y: 1.2, w: 11.7, h: 1.7, fontFace: 'Aptos Display', fontSize: 42, bold: true, align: 'center', color: 'FFFFFF', wordArt: { transform: 'textArchUp' }, fit: 'none', text3D: { bevel: { type: 'circle', width: 4, height: 3 }, bevelBottom: { type: 'angle', width: 2, height: 2 }, extrusion: 8, extrusionColor: '6D28D9', contourWidth: 1, contourColor: '38BDF8', material: 'warmMatte', lightRig: 'threePt', lightDirection: 45, rotationX: 8, rotationY: 12, rotationZ: 2, perspective: 60 } })
	slide.addText('INDEPENDENT COLORS', { x: 2, y: 4.2, w: 9.3, h: 1, fontSize: 26, bold: true, align: 'center', color: 'F8FAFC', wordArt: { transform: 'textArchDown', adjustments: [50000] }, fit: 'none', text3D: { extrusionColor: 'F59E0B', contourColor: '22D3EE' } })
	await pptx.writeFile({ fileName: output, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(output), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	xmlDocument(xml, 'serialized WordArt/Text3D slide')
	assert.match(xml, /<a:camera prst="perspectiveFront" fov="3600000">/)
	assert.match(xml, /<a:rot lat="720000" lon="21120000" rev="21480000"\/>/)
	assert.match(xml, /<a:prstTxWarp prst="textArchDown"><a:avLst><a:gd name="adj" fmla="val 50000"\/><\/a:avLst><\/a:prstTxWarp>/)
	assert.match(xml, /extrusionH="101600"/)
	assert.match(xml, /<a:extrusionClr><a:srgbClr val="F59E0B"\/><\/a:extrusionClr>/)
	assert.match(xml, /<a:contourClr><a:srgbClr val="22D3EE"\/><\/a:contourClr>/)
	assert.ok(xml.indexOf('<a:prstTxWarp') < xml.indexOf('<a:scene3d'))
	if (xml.includes('<a:noAutofit')) {
		assert.ok(xml.indexOf('<a:prstTxWarp') < xml.indexOf('<a:noAutofit'))
		assert.ok(xml.indexOf('<a:noAutofit') < xml.indexOf('<a:scene3d'))
	}
	const mutantPath = path.join(path.dirname(output), 'wordart-text3d-mutant.pptx')
	const mutantZip = await JSZip.loadAsync(await fs.readFile(output), { checkCRC32: true })
	const mutantDocument = xmlDocument(await mutantZip.file('ppt/slides/slide1.xml').async('string'), 'mutant source')
	const mutantSp3d = Array.from(mutantDocument.getElementsByTagNameNS(DRAWING_NS, 'sp3d')).find(node => node.parentNode?.localName === 'bodyPr')
	assert.ok(mutantSp3d)
	mutantSp3d.setAttribute('extrusionH', '114300')
	mutantZip.file('ppt/slides/slide1.xml', new XMLSerializer().serializeToString(mutantDocument))
	await fs.writeFile(mutantPath, await mutantZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
	const comparatorRunDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-wordart-comparator-'))
	t.after(() => fs.rm(comparatorRunDir, { recursive: true, force: true }))
	const comparison = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1'), '-Reference', output, '-Generated', mutantPath, '-Slides', '1', '-IncludeTextEffects'], { cwd: comparatorRunDir, encoding: 'utf8', timeout: 120000 })
	assert.equal(comparison.status, 1, `${comparison.stdout}\n${comparison.stderr}`)
	assert.match(`${comparison.stdout}\n${comparison.stderr}`, /Text 3D semantic payload mismatch/)
	await fs.rm(mutantPath, { force: true })
	const invalid = new PptxGenJS()
	invalid.addSlide().addText('bad', { x: 1, y: 1, w: 2, h: 1, text3D: { material: '\"><bad' } })
	await assert.rejects(() => invalid.writeFile({ fileName: path.join(path.dirname(output), 'invalid-text3d.pptx') }), /supported native material/)
	if (process.env.BETTERPPTX_WORDART_TEXT3D_PROOF_OUTPUT) t.diagnostic(`proof=${output}`)
})

test('engine semantic patch, preset override/reset, reverse re-edit, and export share authored state', { timeout: 120000 }, async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `wordart-text3d-${Date.now()}`, blackBox: false })
	const authored = { bevel: { type: 'circle', width: 4, height: 3 }, bevelBottom: { type: 'angle', width: 2, height: 2 }, extrusion: 8, extrusionColor: '6D28D9', contourWidth: 1, contourColor: '38BDF8', material: 'warmMatte', lightRig: 'threePt', lightDirection: 45, rotationX: 8, rotationY: 12, perspective: 60 }
	const spec = baseSpec([{ kind: 'wordart', name: 'wordart-proof', text: 'EXACT', wordArt: { transform: 'textArchUp', adjustments: [50000] }, wordArtStylePresetId: 'wordart-style-007', textEffectPresetIds: ['text-effect-preset-002'], style: { text3D: authored } }])
	let deckId = null
	try {
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(committed?.ok, true, JSON.stringify(committed))
		deckId = (committed.data || committed).deckId
		const findTarget = () => getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.wordArt?.transform === 'textArchUp')
		let target = findTarget()
		assert.ok(target)
		assert.deepEqual(target.options.text3D, authored)
		assert.match(target.options._rawBodyPrChildXml, /scene3d/)
		const patchSpec = style => baseSpec([{ kind: 'wordart', name: 'wordart-proof', objectName: target.options.objectName, style }], 'WordArt Text3D patch')
		const commitPatch = async style => mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, spec: patchSpec(style), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' })
		let result = await commitPatch({ text3D: { contourColor: null, bevelBottom: null, rotationY: 24 } })
		assert.equal(result?.ok, true, JSON.stringify(result))
		target = findTarget()
		assert.equal(target.options.text3D.contourColor, undefined)
		assert.equal(target.options.text3D.bevelBottom, undefined)
		assert.equal(target.options.text3D.rotationY, 24)
		assert.match(target.options._rawBodyPrChildXml, /lat="1440000"/)
		result = await commitPatch({ text3D: null })
		assert.equal(result?.ok, true, JSON.stringify(result))
		target = findTarget()
		assert.equal(target.options.text3D, undefined)
		assert.match(target.options._rawBodyPrChildXml, /scene3d/)
		result = await commitPatch({ text3D: { material: 'metal', extrusion: 12, extrusionColor: 'F59E0B', perspective: 45 } })
		assert.equal(result?.ok, true, JSON.stringify(result))
		target = findTarget()
		assert.equal(target.options.text3D.material, 'metal')
		assert.equal(target.options.text3D.extrusion, 12)
		const exported = await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })
		assert.equal(exported?.ok, true, JSON.stringify(exported))
		assert.match(JSON.stringify(exported.data || exported), /"text3D":\{"material":"metal","extrusion":12/)
		result = await commitPatch({ textEffectPresetIds: null, text3D: null, wordArt: null, wordArtStylePresetId: null })
		assert.equal(result?.ok, true, JSON.stringify(result))
		target = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.objectName?.includes('wordart-proof'))
		assert.equal(target.options.text3D, undefined)
		assert.equal(target.options._rawBodyPrChildXml, undefined)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('decypher replay retains typed WordArt guide and every emitted Text3D leaf', { timeout: 120000 }, async t => {
	const tempRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), 'test-wordart-text3d-'))
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }))
	const sourcePath = path.join(tempRoot, 'source.pptx')
	const outputRoot = path.join(tempRoot, 'output')
	const summaryPath = path.join(tempRoot, 'summary.json')
	const regeneratedPath = path.join(tempRoot, 'regenerated.pptx')
	const pptx = new PptxGenJS()
	pptx.addSlide().addText('ROUND TRIP', { x: 1, y: 1, w: 10, h: 2, fontSize: 38, wordArt: { transform: 'textArchUp', adjustments: [50000] }, fit: 'none', text3D: { bevel: { type: 'circle', width: 4, height: 3 }, bevelBottom: { type: 'angle', width: 2, height: 2 }, extrusion: 8, extrusionColor: '6D28D9', contourWidth: 1, contourColor: '38BDF8', material: 'warmMatte', lightRig: 'threePt', lightDirection: 45, rotationX: 8, rotationY: 12, rotationZ: 2, perspective: 60 } })
	await pptx.writeFile({ fileName: sourcePath, compression: false })
	const decypher = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-summary', summaryPath], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000 })
	assert.equal(decypher.status, 0, `${decypher.stdout}\n${decypher.stderr}`)
	const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
	const generatorText = await fs.readFile(summary.generatorPath, 'utf8')
	for (const pattern of [/wordArtAdjustments/, /50000/, /bevelBottom/, /extrusionColor/, /contourColor/, /lightDirection/, /rotationZ/, /perspective/]) assert.match(generatorText, pattern)
	const regenerate = spawnSync(process.execPath, [summary.generatorPath, '--out', regeneratedPath], { cwd: summary.outputFolder, encoding: 'utf8', timeout: 120000 })
	assert.equal(regenerate.status, 0, `${regenerate.stdout}\n${regenerate.stderr}`)
	assert.deepEqual(await body3DSignature(regeneratedPath), await body3DSignature(sourcePath))
})
