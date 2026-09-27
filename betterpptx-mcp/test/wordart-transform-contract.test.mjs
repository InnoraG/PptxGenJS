import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { listOptionCatalog } from '../option-registry.mjs'
import {
	WORDART_ADJUSTMENT_TRANSFORMS,
	WORDART_ADJUSTMENT_TRANSFORM_SET,
	WORDART_TRANSFORM_ALIASES,
	WORDART_TRANSFORM_CONTRACT,
	WORDART_TRANSFORM_PUBLIC_SCHEMA,
	WORDART_TRANSFORM_ROW_ID_BY_VALUE,
	WORDART_TRANSFORMS,
	normalizeWordArtOptions,
	normalizeWordArtPatch,
	normalizeWordArtTransform,
} from '../wordart-transform-contract.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('canonical WordArt contract owns the complete 41-selector domain and 32/9 guide partition', () => {
	assert.equal(WORDART_TRANSFORMS.length, 41)
	assert.equal(new Set(WORDART_TRANSFORMS).size, 41)
	assert.equal(WORDART_ADJUSTMENT_TRANSFORMS.length, 32)
	assert.equal(WORDART_TRANSFORMS.filter(value => !WORDART_ADJUSTMENT_TRANSFORM_SET.has(value)).length, 9)
	assert.deepEqual(Object.keys(WORDART_TRANSFORM_ROW_ID_BY_VALUE).sort(), [...WORDART_TRANSFORMS].sort())
	assert.equal(new Set(Object.values(WORDART_TRANSFORM_ROW_ID_BY_VALUE)).size, 41)
	assert.equal(WORDART_TRANSFORM_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(WORDART_TRANSFORM_PUBLIC_SCHEMA.properties.transform.enum, WORDART_TRANSFORMS)
	assert.equal(WORDART_TRANSFORM_PUBLIC_SCHEMA.properties.adjustments.maxItems, 1)
	assert.deepEqual(WORDART_TRANSFORM_PUBLIC_SCHEMA.properties.adjustments.applicability, WORDART_ADJUSTMENT_TRANSFORMS)
})

test('normalization is exhaustive, alias-aware, bounded, and fail-closed', () => {
	for (const transform of WORDART_TRANSFORMS) {
		assert.equal(normalizeWordArtTransform(transform), transform)
		assert.deepEqual(normalizeWordArtOptions({ transform }), { transform })
	}
	assert.equal(normalizeWordArtTransform('textDoubleWave2'), WORDART_TRANSFORM_ALIASES.textDoubleWave2)
	assert.equal(normalizeWordArtTransform('textChevronDown'), WORDART_TRANSFORM_ALIASES.textChevronDown)
	assert.equal(WORDART_TRANSFORMS.includes('textDoubleWave2'), false)
	assert.equal(WORDART_TRANSFORMS.includes('textChevronDown'), false)
	assert.equal(normalizeWordArtTransform('textNotReal'), null)
	assert.throws(() => normalizeWordArtOptions({ transform: 'textArchUp', invented: true }), /not a supported WordArt field/)
	assert.throws(() => normalizeWordArtOptions({ transform: 'textArchUp', adjustments: [1, 2] }), /second adj1 guide/)
	assert.throws(() => normalizeWordArtOptions({ transform: 'textArchUp', adjustments: [-1] }), /between 0 and 100000/)
	assert.throws(() => normalizeWordArtOptions({ transform: 'textArchUp', adjustments: [100001] }), /between 0 and 100000/)
	for (const transform of WORDART_TRANSFORMS) {
		if (WORDART_ADJUSTMENT_TRANSFORM_SET.has(transform)) {
			for (const value of [0, 50000, 100000]) assert.deepEqual(normalizeWordArtOptions({ transform, adjustments: [value] }), { transform, adjustments: [value] })
		} else {
			assert.throws(() => normalizeWordArtOptions({ transform, adjustments: [50000] }), /does not expose a persisted native adjustment guide/)
		}
	}
	assert.deepEqual(normalizeWordArtPatch({ adjustments: [75000] }, 'wordArt', 'textChevron'), { adjustments: [75000] })
	assert.throws(() => normalizeWordArtPatch({ adjustments: [75000] }, 'wordArt', 'textWave1'), /does not expose/)
	assert.throws(() => normalizeWordArtPatch({ adjustments: [75000] }), /requires a transform in the patch or an existing WordArt transform/)
	assert.deepEqual(normalizeWordArtPatch({ adjustments: null }, 'wordArt', 'textArchUp'), { adjustments: null })
	assert.equal(normalizeWordArtPatch(null), null)
})

test('compiler and public catalog derive every selector from the same contract', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'WordArt transform exhaustive contract',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{
			id: 'wordart-contract',
			title: 'WordArt transforms',
			layoutIntent: 'title-only',
			content: WORDART_TRANSFORMS.map(transform => ({ kind: 'wordart', name: `warp-${transform}`, text: transform, wordArt: { transform } })),
		}],
	}
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const authored = plan.operations
		.filter(operation => operation.tool === 'betterpptx.slide.add_text' && String(operation.objectName || '').includes('.warp-'))
		.map(operation => operation.args.options.wordArt.transform)
	assert.deepEqual(authored, WORDART_TRANSFORMS)

	const surface = listOptionCatalog({ surface: 'wordArt', format: 'full' }).surfaces.find(item => item.id === 'wordArtTransform')
	assert.equal(surface.capabilityStatus, WORDART_TRANSFORM_CONTRACT.capabilityStatus)
	assert.deepEqual(surface.schema.properties.transform.enum, WORDART_TRANSFORMS)
	assert.deepEqual(surface.precedence, WORDART_TRANSFORM_CONTRACT.precedence)

	const entries = publicBaselineCatalog({ family: 'wordart-text3d', limit: 500 }).entries
	const exactRows = entries.filter(entry => Object.values(WORDART_TRANSFORM_ROW_ID_BY_VALUE).includes(entry.id))
	assert.equal(exactRows.length, 41)
	assert.ok(exactRows.every(entry => entry.capabilityStatus === 'executable-exact-structured'))
	assert.deepEqual(exactRows.map(entry => entry.selection.executableValue).sort(), [...WORDART_TRANSFORMS].sort())
	for (const label of ['betterpptx-mcp.object.apply_wordart', 'text 3D', 'WordArt and Text3D']) {
		assert.equal(entries.find(entry => entry.label === label)?.capabilityStatus, 'executable-exact-structured')
	}
})

test('public Text3D validation rejects package-unsafe RGB and FOV values', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `wordart-text3d-validation-${Date.now()}`, blackBox: false })
	const specFor = text3D => ({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Text3D validation boundary',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Reject package-unsafe Text3D values.', remember: 'Text3D inputs stay inside DrawingML bounds.' },
		handshake: { audience: 'maintainers', promise: 'Keep Text3D package-safe.', proof: ['One editable native WordArt object.'], bar: 'Unsafe color and field-of-view values fail closed.' },
		visualDesign: { world: 'Editorial', framing: 'One native WordArt object', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: '3D', layoutIntent: 'title-only', content: [{ kind: 'wordart', name: 'target', text: '3D', wordArt: { transform: 'textArchUp' }, style: { text3D } }] }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	})
	for (const [text3D, expected] of [
		[{ extrusion: 4, extrusionColor: '11223344' }, /6-digit RGB/],
		[{ perspective: -1, material: 'metal' }, /between 0 and 120/],
		[{ perspective: 121, material: 'metal' }, /between 0 and 120/],
	]) {
		const result = await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: specFor(text3D),
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		})
		assert.notEqual(result?.ok, true, JSON.stringify(result))
		assert.match(JSON.stringify(result), expected)
	}
})

test('sparse public WordArt guide patches validate the inherited target transform', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_PREMIUM = '1'
	const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `wordart-sparse-patch-${Date.now()}`, blackBox: false })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'WordArt sparse patch boundary',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.' },
		contentStory: { audience: 'maintainers', outcome: 'Keep sparse WordArt edits package-safe.', remember: 'A guide inherits and validates against the target transform.' },
		handshake: { audience: 'maintainers', promise: 'Keep sparse WordArt edits native.', proof: ['One editable native WordArt object.'], bar: 'Non-applicable inherited guides fail closed.' },
		visualDesign: { world: 'Editorial', framing: 'One native WordArt object', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		theme: { palette: ['FFFFFF', '0B1220', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: 'WordArt', layoutIntent: 'title-only', content: [{ kind: 'wordart', name: 'target', text: 'WordArt', wordArt: { transform: 'textWave1' } }] }],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
	let deckId = null
	try {
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })
		assert.equal(committed?.ok, true, JSON.stringify(committed))
		deckId = (committed.data || committed).deckId
		let target = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.wordArt?.transform === 'textWave1')
		assert.ok(target)
		const selector = { objectName: target.options.objectName }
		const patchSpec = patch => ({
			...structuredClone(spec),
			slides: [{ id: 's1', slideIndex: 0, title: 'WordArt', layoutIntent: 'title-only', content: [{ kind: 'wordart', name: 'target', objectName: selector.objectName, patch }] }],
		})
		const commitPatch = patch => mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, spec: patchSpec(patch), phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' })
		const rejected = await commitPatch({ wordArt: { adjustments: [50000] } })
		assert.notEqual(rejected?.ok, true, JSON.stringify(rejected))
		assert.match(JSON.stringify(rejected), /does not expose a persisted native adjustment guide/)
		const changed = await commitPatch({ wordArt: { transform: 'textArchUp', adjustments: [50000] } })
		assert.equal(changed?.ok, true, JSON.stringify(changed))
		const sparse = await commitPatch({ wordArt: { adjustments: [75000] } })
		assert.equal(sparse?.ok, true, JSON.stringify(sparse))
		target = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.objectName === selector.objectName)
		assert.deepEqual(target.options.wordArt, { transform: 'textArchUp', adjustments: [75000] })
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

function parseXml(xml, label) {
	const errors = []
	const document = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label} must be well-formed: ${errors.join('; ')}`)
	return document
}

test('all selectors serialize in schema-valid bodyPr order across fit modes and Text3D composition', async () => {
	const pptx = new PptxGenJS()
	const fitModes = ['none', 'shrink', 'resize']
	for (const fit of fitModes) {
		const slide = pptx.addSlide()
		for (const [index, transform] of WORDART_TRANSFORMS.entries()) {
			slide.addText(transform, {
				x: 0.1,
				y: 0.1,
				w: 2,
				h: 0.2,
				fontSize: 8,
				fit,
				...(fit === 'none' ? { _nativeMinimal: true } : {}),
				wordArt: { transform },
				...(index === 0 ? {
					textGlow: { size: 4, color: '38BDF8', opacity: 0.5 },
					textShadow: { type: 'outer', color: '111827', opacity: 0.5, blur: 3, angle: 45, distance: 2 },
					textReflection: { opacity: 0.3, blur: 2, distance: 2 },
					highlight: 'FACC15',
					underline: { style: 'sng', color: 'F97316' },
				} : {}),
				...(fit !== 'resize' && index === 0 ? {
					text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 3, material: 'warmMatte', lightRig: 'threePt', rotationX: 8 },
				} : {}),
				...(fit !== 'resize' && index === 1 ? { text3D: { material: 'metal' } } : {}),
			})
		}
	}
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-wordart-contract-'))
	const fileName = path.join(outDir, 'wordart-contract.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName), { checkCRC32: true })
	const rank = { prstTxWarp: 1, noAutofit: 2, normAutofit: 2, spAutoFit: 2, scene3d: 3, sp3d: 4, flatTx: 5, extLst: 6 }
	const runRank = { ln: 1, noFill: 2, solidFill: 2, gradFill: 2, blipFill: 2, pattFill: 2, grpFill: 2, effectLst: 3, effectDag: 3, highlight: 4, uLnTx: 5, uLn: 5, uFillTx: 6, uFill: 6, latin: 7, ea: 7, cs: 7, sym: 7, hlinkClick: 8, hlinkMouseOver: 8, extLst: 9 }
	const effectRank = { blur: 1, fillOverlay: 2, glow: 3, innerShdw: 4, outerShdw: 5, prstShdw: 6, reflection: 7, softEdge: 8 }
	const expectedAutofit = { none: 'noAutofit', shrink: 'normAutofit', resize: 'spAutoFit' }
	for (const [slideIndex, fit] of fitModes.entries()) {
		const xml = await zip.file(`ppt/slides/slide${slideIndex + 1}.xml`).async('string')
		const document = parseXml(xml, `slide ${slideIndex + 1}`)
		const bodyProperties = Array.from(document.getElementsByTagName('a:bodyPr')).filter(node => node.getElementsByTagName('a:prstTxWarp').length)
		assert.equal(bodyProperties.length, WORDART_TRANSFORMS.length)
		for (const [index, bodyPr] of bodyProperties.entries()) {
			const warps = Array.from(bodyPr.childNodes).filter(node => node.nodeType === 1 && node.localName === 'prstTxWarp')
			assert.equal(warps.length, 1)
			assert.equal(warps[0].getAttribute('prst'), WORDART_TRANSFORMS[index])
			assert.ok(warps[0].getElementsByTagName('a:gd').length <= 1)
			const directChildren = Array.from(bodyPr.childNodes).filter(node => node.nodeType === 1)
			assert.equal(directChildren.filter(node => node.localName === expectedAutofit[fit]).length, 1)
			const ranks = directChildren.map(node => rank[node.localName]).filter(value => value !== undefined)
			assert.deepEqual(ranks, [...ranks].sort((left, right) => left - right), `${fit}:${WORDART_TRANSFORMS[index]} bodyPr child order`)
			if (fit !== 'resize' && index <= 1) {
				assert.equal(directChildren.filter(node => node.localName === 'scene3d').length, 1)
				assert.equal(directChildren.filter(node => node.localName === 'sp3d').length, 1)
			} else if (fit === 'resize') {
				assert.equal(directChildren.filter(node => node.localName === 'scene3d').length, 0)
				assert.equal(directChildren.filter(node => node.localName === 'sp3d').length, 0)
			}
		}
		const effectRuns = Array.from(document.getElementsByTagName('a:rPr')).filter(node => node.getElementsByTagName('a:effectLst').length)
		assert.equal(effectRuns.length, 1)
		const runChildren = Array.from(effectRuns[0].childNodes).filter(node => node.nodeType === 1)
		const runRanks = runChildren.map(node => runRank[node.localName]).filter(value => value !== undefined)
		assert.deepEqual(runRanks, [...runRanks].sort((left, right) => left - right), `${fit}:rPr child order`)
		const effectChildren = Array.from(effectRuns[0].getElementsByTagName('a:effectLst')[0].childNodes).filter(node => node.nodeType === 1)
		const effectRanks = effectChildren.map(node => effectRank[node.localName]).filter(value => value !== undefined)
		assert.deepEqual(effectRanks, [...effectRanks].sort((left, right) => left - right), `${fit}:effectLst child order`)
	}
})

test('direct library serialization rejects unsafe WordArt guide payloads', async () => {
	const cases = [
		{ transform: 'textArchUp', adjustments: [1, 2] },
		{ transform: 'textArchUp', adjustments: [100001] },
		{ transform: 'textWave1', adjustments: [50000] },
	]
	for (const [index, wordArt] of cases.entries()) {
		const pptx = new PptxGenJS()
		pptx.addSlide().addText('invalid guide', { x: 1, y: 1, w: 4, h: 1, wordArt })
		const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-wordart-invalid-'))
		await assert.rejects(() => pptx.writeFile({ fileName: path.join(outDir, `invalid-${index}.pptx`) }), /WordArt|guide|adjustment/)
	}
})

test('WordArt plus Text3D fails closed on PowerPoint-invisible resize autofit', async () => {
	const pptx = new PptxGenJS()
	pptx.addSlide().addText('invisible in PowerPoint', { x: 1, y: 1, w: 4, h: 1, fit: 'resize', wordArt: { transform: 'textArchUp' }, text3D: { extrusion: 4 } })
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-wordart-text3d-resize-invalid-'))
	await assert.rejects(() => pptx.writeFile({ fileName: path.join(outDir, 'invalid.pptx') }), /renders that native carrier invisible/)
})
