#!/usr/bin/env node
// Cold public-MCP proof for Authoring-v3 motion discovery and exact execution.

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('./engine.mjs')
const { TOOLS } = await import('./tools.mjs')

const mcp = createMcpToolDispatcher({
	sessionId: `public-authoring-motion-${Date.now()}`,
	clientInfo: { name: 'public-authoring-motion-verifier', version: '1' },
	blackBox: true,
})

const failures = []
let passed = 0
function ok(label, condition, detail = '') {
	if (condition) {
		passed += 1
		console.log(`PASS ${label}`)
	} else {
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
		console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
	}
}
function data(result) { return result?.data || result }

function specFor(selectedMotionIds, motionId = selectedMotionIds[0]) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Cold public semantic motion proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'presentation authors', outcome: 'prove semantic motion execution', remember: 'the AI chooses and the engine executes exactly' },
		visualDesign: { world: 'luxe', framing: 'native presenter plus one proof statement' },
		styleIntent: { artDirection: 'luxe', mode: 'dark' },
		narration: { voiceId: 'en_US-ljspeech-high' },
		presenter: { id: 'host', identity: 'joe' },
		motionTime: {
			masterClock: 'narration-text', timingSource: 'authored narration', syncPolicy: 'one narration-led clock',
			kineticSelection: { presenters: [{ presenterId: 'host', selectedMotionIds }] },
		},
		slides: [{
			id: 'proof', title: 'Exact public motion', role: 'proof', message: 'One semantic ID drives one native presenter scene.', layoutIntent: 'title-body',
			narration: { script: 'Now reveal the exact motion that the AI selected.' },
			presenterMotion: { presenterId: 'host', motionId, narrationCue: 'reveal the exact motion' },
			content: [{ kind: 'body', name: 'proof-copy', text: 'AI-selected semantic motion. Engine-executed native scene.' }],
		}],
	}
}

const catalogResult = await mcp.call('betterpptx.authoring.catalog', { family: 'presenter-motion', limit: 500 })
const catalog = data(catalogResult)
const motionIds = (catalog.entries || []).map(entry => entry.id).filter(id => /^motion\./.test(id))
ok('public catalog returns the 56 currently executable Mixamo semantic motion IDs', catalogResult.ok === true && catalog.pagination?.total === 56 && motionIds.length === 56, JSON.stringify(catalog.pagination))
ok('catalog declares AI authority and executor-only engine role', catalog.principle?.aiIsDesignMaster === true && catalog.principle?.catalogDoesNotSelect === true && catalog.principle?.engineRole === 'expose-and-execute', JSON.stringify(catalog.principle))

const chosen = ['motion.ordinary.talk', 'motion.kinetic.magical-reveal', 'motion.kinetic.victory-jump']
const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: specFor(chosen, chosen[1]), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const dry = data(dryResult)
const motionReadback = dry.authoringContracts?.motionSelection
const gesture = dry.appliedDefaults?.presenter?.gestures?.[0]
const roundtripMotion = dry.semanticRoundtrip?.slides?.motions?.[0]
const generationOutput = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')?.outputSchema
const appliedDefaultsSchema = generationOutput?.properties?.data?.properties?.appliedDefaults || generationOutput?.properties?.appliedDefaults
const gestureOutputProperties = appliedDefaultsSchema?.properties?.presenter?.properties?.gestures?.items?.properties
const storyboardPlayOutputProperties = appliedDefaultsSchema?.properties?.storyboard?.items?.properties?.plays?.items?.properties
const narrationBeatOutputProperties = generationOutput?.properties?.data?.properties?.narrationTimeline?.properties?.slides?.items?.properties?.beats?.items?.properties
	|| generationOutput?.properties?.narrationTimeline?.properties?.slides?.items?.properties?.beats?.items?.properties
ok('public dry-run accepts exact AI selection', dryResult.ok === true && motionReadback?.selectionAuthority === 'AI' && motionReadback?.presenters?.[0]?.noSilentSubstitution === true, JSON.stringify(dryResult?.error || motionReadback))
ok('public readback preserves exact ordered IDs and 3-of-18 budget', JSON.stringify(motionReadback?.presenters?.[0]?.selectedMotionIds) === JSON.stringify(chosen) && motionReadback?.presenters?.[0]?.bundleBudget?.used === 3 && motionReadback?.presenters?.[0]?.bundleBudget?.maximum === 18 && motionReadback?.presenters?.[0]?.bundleBudget?.remaining === 15, JSON.stringify(motionReadback))
ok('slide readback keeps semantic motion and narration cue', gesture?.motionId === chosen[1] && gesture?.from === 'author' && gesture?.narrationCue === 'reveal the exact motion', JSON.stringify(gesture))
ok('public output schema accepts semantic motion and narration cue readback', gestureOutputProperties?.motionId?.type === 'string' && gestureOutputProperties?.narrationCue != null, JSON.stringify(gestureOutputProperties))
ok('public storyboard schema accepts the same semantic motion readback', storyboardPlayOutputProperties?.motionId?.type === 'string' && storyboardPlayOutputProperties?.narrationCue != null, JSON.stringify(storyboardPlayOutputProperties))
ok('public real-clock timeline schema accepts presenter motion cue readback', narrationBeatOutputProperties?.presenterMotion?.type === 'boolean' && narrationBeatOutputProperties?.motionId?.type === 'string', JSON.stringify(narrationBeatOutputProperties))
ok('semantic roundtrip persists AI-owned slide motion without private slots', dry.semanticRoundtrip?.selectionAuthority === 'AI' && roundtripMotion?.presenterId === 'host' && roundtripMotion?.motionId === chosen[1] && roundtripMotion?.narrationCue === 'reveal the exact motion' && !Object.hasOwn(roundtripMotion || {}, 'animId'), JSON.stringify(dry.semanticRoundtrip))

const serialized = JSON.stringify(dryResult)
const forbiddenKeys = ['animId', 'clipMap', 'motionIdToAnimId', 'sourceSlug', 'privateEvidence', 'transplant', 'bundleHandle', 'catalogFingerprint']
const leakPaths = []
const findLeaks = (value, current = '$') => {
	if (Array.isArray(value)) return value.forEach((item, index) => findLeaks(item, `${current}[${index}]`))
	if (!value || typeof value !== 'object') return
	for (const [key, child] of Object.entries(value)) {
		if (forbiddenKeys.includes(key)) leakPaths.push(`${current}.${key}`)
		findLeaks(child, `${current}.${key}`)
	}
}
findLeaks(dryResult)
const privateVocabularyMatches = [
	...(serialized.match(/[A-Z]:\\[^" ]*/g) || []),
	...(serialized.match(/[^" ]*\.glb\b/gi) || []),
	...(serialized.match(/node_modules/gi) || []),
]
ok('public motion readback hides private bundle realization', leakPaths.length === 0 && privateVocabularyMatches.length === 0, [...leakPaths, ...privateVocabularyMatches.slice(0, 10)].join(','))

const over = await mcp.call('betterpptx.deck.generate_from_spec', { spec: specFor(motionIds.slice(0, 19)), phase: 'dryRun', commitMode: 'createNew' })
ok('public route rejects motion 19 before mutation', over.ok === false && over.error?.code === 'MOTION_BUNDLE_LIMIT_EXCEEDED', JSON.stringify(over.error))
const unknown = await mcp.call('betterpptx.deck.generate_from_spec', { spec: specFor(['motion.unknown.nope']), phase: 'dryRun', commitMode: 'createNew' })
ok('public route rejects unknown IDs explicitly', unknown.ok === false && unknown.error?.code === 'MOTION_ID_UNKNOWN', JSON.stringify(unknown.error))
const absent = await mcp.call('betterpptx.deck.generate_from_spec', { spec: specFor([chosen[0]], chosen[1]), phase: 'dryRun', commitMode: 'createNew' })
ok('public route rejects slide motion absent from selected bundle', absent.ok === false && absent.error?.code === 'MOTION_NOT_IN_BUNDLE', JSON.stringify(absent.error))
const rawMappingSpec = specFor([chosen[0]], chosen[0])
rawMappingSpec.presenter.clipMap = { talk: 0 }
const rawMapping = await mcp.call('betterpptx.deck.generate_from_spec', { spec: rawMappingSpec, phase: 'dryRun', commitMode: 'createNew' })
ok('public route rejects private clip maps and animation-slot authoring', rawMapping.ok === false && rawMapping.error?.details?.code === 'DIRECTOR_RAW_MOTION_MAPPING_FORBIDDEN' && rawMapping.error?.details?.issues?.[0]?.fix?.includes('exact public motion IDs'), JSON.stringify(rawMapping.error))

console.log(`PUBLIC AUTHORING MOTION GATE: ${passed} passed, ${failures.length} failed`)
if (failures.length) {
	console.error(failures.join('\n'))
	process.exitCode = 1
}
