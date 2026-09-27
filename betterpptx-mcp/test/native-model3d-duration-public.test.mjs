import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { validateAnimationFormatOptions } from '../animation-format-catalog.mjs'
import { validateAnimationAuthoringOperationArgs } from '../animation-authoring-operation-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { artEmphasisForSpec } from '../ir/layout-engine.mjs'

// Public dispatcher boundary, not an HTTP/Office proof. Catalog assets are
// read-only and authored decks stay in memory. Source mode is opt-in; otherwise
// the MCP dispatcher must use the actual shipped runtime without rebuilding it.
process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '0'
if (process.env.BETTERPPTX_TEST_NATIVE_SOURCE === '1') {
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
	const require = createRequire(import.meta.url), ts = require('typescript'), previous = require.extensions['.ts']
	const sourceRoot = new URL('../../src/', import.meta.url).href
	const hook = registerHooks({ resolve(specifier, context, nextResolve) {
		if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
			const typed = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL)
			if (existsSync(fileURLToPath(typed))) return nextResolve(fileURLToPath(typed), context)
		}
		return nextResolve(specifier, context)
	} })
	require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
	try { globalThis[Symbol.for('betterpptx.test.model3d-duration-public')] = require('../../src/pptxgen.ts').default } finally {
		hook.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.model3d-duration-public')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
}
Object.assign(process.env, { BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_FREE_PREVIEW_SLIDES: '99' })
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const presets = [
	{ effect: 'arrive', type: 'entrance', defaultMs: 1000, behaviors: 6 },
	{ effect: 'turntable', type: 'emphasis', defaultMs: 2000, behaviors: 1 },
	{ effect: 'swing', type: 'emphasis', defaultMs: 1000, behaviors: 1 },
	{ effect: 'jumpandturn', type: 'emphasis', defaultMs: 1000, behaviors: 5 },
	{ effect: 'leave', type: 'exit', defaultMs: 1000, behaviors: 6 },
]
const clocks = [
	{ id: 'short', options: { duration: 650 }, ms: 650 },
	{ id: 'long-alias', options: { durationMs: 5000, autoReverse: false }, ms: 5000 },
	{ id: 'omitted', options: {}, ms: null },
	{ id: 'null-reset', options: { duration: null, autoReverse: null }, ms: null },
	{ id: 'zero', options: { duration: 0 }, ms: 0 },
	{ id: 'one-alias', options: { durationMs: 1 }, ms: 1 },
	{ id: 'repeat-reverse', options: { durationMs: 650, repeatCount: 2, autoReverse: true }, ms: 650 },
]
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }
const nodes = (root, tag) => Array.from(root.getElementsByTagName(tag))
const privateDetails = /PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/]/
const publicResult = result => { assert.doesNotMatch(JSON.stringify(result), privateDetails); return result }
const makeMcp = () => createMcpToolDispatcher({ sessionId: `model3d-duration-${Date.now()}-${Math.random()}`, clientInfo: { name: 'native-duration-contract-test', version: '1' }, blackBox: true })
const create = (mcp, spec, extra = {}) => mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, ...extra })

async function catalogModels(mcp) {
	const handles = []
	for (const query of ['pyramid', 'easel']) {
		const catalog = dataOf(publicResult(await mcp.call('betterpptx.assets.catalog', { kind: 'model3d', query, maxResults: 1 })))
		const handle = catalog.assets?.[0]?.handle
		assert.match(handle, /^asset:\/\/catalog\/model3d\//)
		handles.push(handle)
	}
	assert.notEqual(handles[0], handles[1], 'contrasting source models use independent opaque handles')
	return handles
}

function fixture(handles, cases) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public native model duration controls', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'Presentation reviewers', outcome: 'Preserve authored native model timing.', remember: 'The next effect follows the complete native motion.' },
		visualDesign: { world: 'editorial', framing: 'An editable model and an independently timed label' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' }, motion: { autoSync: false },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: cases.map((_, index) => ({ name: `subject-${index}`, kind: 'model3d', assetRef: handles[index % handles.length], purpose: 'Read-only native model for independent timing verification' })) },
		slides: cases.map((row, index) => ({
			id: `${row.preset.effect}-${row.clock.id}`, title: 'Native model timing', layoutIntent: 'title-only',
			content: [
				{ kind: 'model3d', name: `subject-${index}`, modelAsset: handles[index % handles.length], nativeOnly: true, animation: [], pixelFrame: { x: 120, y: 150, w: 500, h: 550 }, altText: 'Editable native catalog model.' },
				{ kind: 'textBox', name: `marker-${index}`, text: 'Next animation', animation: [], pixelFrame: { x: 900, y: 340, w: 540, h: 100 }, style: { fontFace: 'Arial', fontSize: 28, color: '182E4A', margin: 0 } },
			],
			timeline: [
				{ id: `model-step-${index}`, objectName: `subject-${index}`, type: row.preset.type, effect: row.preset.effect, trigger: 'onClick', delayMs: 120, ...row.clock.options },
				{ id: `marker-step-${index}`, objectName: `marker-${index}`, type: 'entrance', effect: 'fade', trigger: 'afterPrevious', durationMs: 100, delayMs: 40 },
			],
		})),
	}
}

function parseXml(xml) {
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: value => errors.push(value), error: value => errors.push(value), fatalError: value => errors.push(value) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return doc
}

function startDelay(node) {
	let total = 0
	for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
		if (ancestor.tagName !== 'p:cTn') continue
		const conditions = Array.from(ancestor.childNodes).find(child => child.tagName === 'p:stCondLst')
		if (!conditions) continue
		const numeric = nodes(conditions, 'p:cond').filter(condition => condition.hasAttribute('delay') && Number.isFinite(Number(condition.getAttribute('delay'))))
		assert.ok(numeric.length <= 1)
		if (numeric.length) total += Number(numeric[0].getAttribute('delay'))
	}
	return total
}

async function inspectGenerated(deckId, cases) {
	const zip = await JSZip.loadAsync(await getDeck(deckId).pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	// Independent package gate: every XML part parses and every internal
	// relationship resolves. No serializer output is patched for inspection.
	for (const file of Object.values(zip.files).filter(file => !file.dir && (file.name.endsWith('.xml') || file.name.endsWith('.rels')))) {
		const doc = parseXml(await file.async('string'))
		if (!file.name.endsWith('.rels')) continue
		const origin = file.name === '_rels/.rels' ? '' : path.posix.dirname(path.posix.dirname(file.name))
		for (const relation of nodes(doc, 'Relationship')) {
			if (relation.getAttribute('TargetMode') === 'External') continue
			const target = relation.getAttribute('Target')
			const resolved = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(origin, target))
			assert.ok(zip.file(resolved), `${file.name}: ${target}`)
		}
	}
	const signatures = []
	for (const [index, row] of cases.entries()) {
		const doc = parseXml(await zip.file(`ppt/slides/slide${index + 1}.xml`).async('string'))
		assert.equal(nodes(doc, 'am3d:model3d').length, 1, 'the MCP target remains a native model')
		const ids = new Map(nodes(doc, 'p:cNvPr').map(node => [node.getAttribute('name'), node.getAttribute('id')]))
		const owners = nodes(doc, 'p:cTn').filter(node => node.hasAttribute('presetID'))
		const ownerFor = name => {
			const names = [...ids.keys()].filter(candidate => candidate === name || candidate.endsWith(`.${name}.model3d`) || candidate.endsWith(`.${name}.textBox`))
			assert.equal(names.length, 1, `unique semantic target ${name}`)
			const matches = owners.filter(owner => nodes(owner, 'p:spTgt').some(target => target.getAttribute('spid') === ids.get(names[0])))
			assert.equal(matches.length, 1, `one explicit timeline effect on ${name}`)
			return matches[0]
		}
		const owner = ownerFor(`subject-${index}`), marker = ownerFor(`marker-${index}`)
		assert.ok(owner, JSON.stringify({ index, names: [...ids], timingOwners: owners.map(node => ({ preset: node.getAttribute('presetID'), targets: nodes(node, 'p:spTgt').map(target => target.getAttribute('spid')) })) })); assert.ok(marker)
		const durations = [], delays = [], expectedMs = row.clock.ms ?? row.preset.defaultMs
		let simpleSpan = 0
		for (const behavior of nodes(owner, 'p:cBhvr')) {
			const timing = nodes(behavior, 'p:cTn')[0], visibility = behavior.parentNode.tagName === 'p:set'
			const duration = Number(timing.getAttribute('dur')), delay = Number(nodes(timing, 'p:cond')[0]?.getAttribute('delay') || 0)
			assert.equal(duration, visibility ? 1 : expectedMs, `${row.preset.effect}/${row.clock.id}`)
			if (visibility) assert.equal(delay, row.preset.effect === 'leave' ? Math.max(0, expectedMs - 1) : 0)
			durations.push(duration); delays.push(delay); simpleSpan = Math.max(simpleSpan, delay + duration)
		}
		assert.equal(durations.length, row.preset.behaviors)
		assert.equal(startDelay(owner), 120)
		const factor = (row.clock.options.repeatCount ?? 1) * (row.clock.options.autoReverse ? 2 : 1)
		assert.equal(startDelay(marker), 120 + simpleSpan * factor + 40, `${row.preset.effect}/${row.clock.id} next effect`)
		assert.equal(owner.getAttribute('repeatCount'), row.clock.options.repeatCount ? String(row.clock.options.repeatCount * 1000) : '')
		assert.equal(owner.getAttribute('autoRev'), row.clock.options.autoReverse ? '1' : '')
		for (const target of nodes(doc, 'p:spTgt')) assert.ok([...ids.values()].includes(target.getAttribute('spid')))
		signatures.push({ durations, delays, markerStart: startDelay(marker), repeat: owner.getAttribute('repeatCount'), reverse: owner.getAttribute('autoRev') })
	}
	return signatures
}

test('shared animation timing validation preserves booleans/null and rejects reverse-playback coercion', () => {
	for (const autoReverse of [true, false, null, undefined]) {
		const animation = { type: 'emphasis', effect: 'swing', autoReverse }
		assert.equal(validateAnimationFormatOptions(animation).autoReverse, autoReverse)
		assert.equal(validateAnimationAuthoringOperationArgs({ names: ['subject'], animation }).animation.autoReverse, autoReverse)
	}
	for (const autoReverse of ['true', 'false', 0, 1, [], {}]) {
		const animation = { type: 'emphasis', effect: 'swing', autoReverse }
		assert.throws(() => validateAnimationFormatOptions(animation), /autoReverse must be a boolean or null/)
		assert.throws(() => validateAnimationAuthoringOperationArgs({ names: ['subject'], animation }), /autoReverse must be a boolean or null/)
		const spec = fixture(['asset://catalog/model3d/test'], [{ preset: presets[2], clock: { id: 'invalid-reverse', options: { animation }, ms: 650 } }])
		assert.throws(() => buildSpecOperationPlan(spec), /autoReverse must be a boolean or null/)
	}
})

test('named effects retain native clocks while effect-less steps inherit only their selected world clock', () => {
	const worlds = ['editorial', 'luxe', 'brutalist'], defaultClocks = new Set()
	const forms = [
		[{}, undefined], [{ duration: 650 }, 650], [{ durationMs: 5000 }, 5000],
		[{ duration: 0 }, 0], [{ duration: null }, null],
		[{ duration: 0, durationMs: 5000 }, 0], [{ duration: null, durationMs: 5000 }, null],
		[{ animation: { durationMs: 5000 } }, 5000], [{ animation: { durationMs: 0 } }, 0], [{ animation: { durationMs: null } }, null],
		[{ duration: 650, animation: { durationMs: 5000 } }, 5000], [{ durationMs: 5000, animation: { duration: 0 } }, 0],
	]
	const named = [...presets, { type: 'emphasis', effect: 'spin' }, { type: 'emphasis', effect: 'pulse' }]
	for (const world of worlds) for (const preset of [...named, { type: 'emphasis' }]) for (const effectSource of ['step', 'animation', 'sequence']) for (const [options, expected] of forms) {
		const spec = fixture(['asset://catalog/model3d/test'], [{ preset: { ...preset, effect: preset.effect || 'fallback' }, clock: { id: 'clock', options, ms: null } }])
		spec.styleIntent.artDirection = world
		const step = spec.slides[0].timeline[0]
		delete step.effect
		if (effectSource === 'step') step.effect = preset.effect
		if (effectSource === 'animation') step.animation = { ...step.animation, effect: preset.effect }
		spec.slides[0].timeline = effectSource === 'sequence' ? [{ type: preset.type, effect: preset.effect, steps: [step] }] : [step]
		const animation = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' }).operations.find(operation => operation.tool === 'betterpptx.slide.animate_shapes').args.animation
		const fallback = artEmphasisForSpec(spec)
		defaultClocks.add(fallback.durationMs)
		assert.equal(animation.effect.toLowerCase(), (preset.effect || fallback.effect).toLowerCase())
		assert.equal(animation.duration, expected === undefined && !preset.effect ? fallback.durationMs : expected, `${world}/${preset.effect || 'default'}/${effectSource}/${JSON.stringify(options)}`)
		assert.equal(animation.durationMs, undefined)
	}
	assert.ok(defaultClocks.size > 1, 'contrasting worlds carry different authored defaults')
})

test('public dispatcher preserves all five native clocks through strict dryRun, commit and authored replay', async () => {
	const mcp = makeMcp(), owned = []
	try {
		const handles = await catalogModels(mcp), cases = presets.flatMap(preset => clocks.map(clock => ({ preset, clock })))
		const spec = fixture(handles, cases), before = structuredClone(spec)
		const dry = dataOf(publicResult(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict' })))
		assert.equal(dry.mutationFree, true); assert.equal(dry.deckId, undefined); assert.equal(dry.slideCount, cases.length)
		const committed = dataOf(publicResult(await create(mcp, spec))); owned.push(committed.deckId)
		const expected = await inspectGenerated(committed.deckId, cases)
		const exported = dataOf(publicResult(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'authoredInput', detail: 'full' })))
		for (const [index, row] of cases.entries()) {
			const authored = exported.spec.slides[index].timeline[0]
			for (const [key, value] of Object.entries(row.clock.options)) assert.deepEqual(authored[key], value)
			if (row.clock.id === 'omitted') assert.equal(authored.duration, undefined)
		}
		const replay = dataOf(publicResult(await create(mcp, exported.spec))); owned.push(replay.deckId)
		assert.deepEqual(await inspectGenerated(replay.deckId, cases), expected)
		assert.deepEqual(spec, before)
	} finally { for (const deckId of owned) dataOf(await mcp.call('betterpptx.deck.dispose', { deckId })) }
})

test('public native duration and timing errors reject before dryRun or patch mutation', async () => {
	const mcp = makeMcp(), owned = []
	try {
		const handles = await catalogModels(mcp), cases = presets.map(preset => ({ preset, clock: clocks[0] }))
		const spec = fixture(handles, cases)
		const committed = dataOf(publicResult(await create(mcp, spec))); owned.push(committed.deckId)
		const entry = getDeck(committed.deckId), version = entry.deckVersion
		const animationSnapshot = () => entry.pptx.slides.map(slide => slide._animations.map(({ shapeId, animation }) => ({ shapeId, animation: structuredClone(animation) })))
		const prior = animationSnapshot()
		const invalid = [{ duration: -1 }, { duration: 86400001 }, { duration: '650' }, { durationMs: 0.5 }, { delayMs: -1 }, { repeatCount: 0 }, { repeatCount: 1.5 }, { autoReverse: 'true' }, { trigger: 'never' }]
		for (const preset of presets) for (const options of invalid) {
			const bad = fixture(handles, [{ preset, clock: { id: 'invalid', options, ms: null } }]), before = structuredClone(bad)
			const result = publicResult(await mcp.call('betterpptx.deck.generate_from_spec', { spec: bad, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' }))
			assert.equal(result.ok, false, `${preset.effect}/${JSON.stringify(options)}`)
			assert.equal(result.data?.deckId, undefined)
			assert.match(JSON.stringify(result), new RegExp(Object.keys(options)[0].replace('Ms', ''), 'i'))
			assert.deepEqual(bad, before)
		}
		for (const [index, preset] of presets.entries()) {
			const bad = structuredClone(spec); bad.slides[index].timeline[0].duration = -1
			const result = publicResult(await create(mcp, bad, { deckId: committed.deckId, commitMode: 'patch' }))
			assert.equal(result.ok, false, preset.effect)
			assert.equal(getDeck(committed.deckId).deckVersion, version)
			assert.deepEqual(animationSnapshot(), prior)
		}
	} finally { for (const deckId of owned) dataOf(await mcp.call('betterpptx.deck.dispose', { deckId })) }
})
