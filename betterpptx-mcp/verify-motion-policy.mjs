// D5 GATE: full / reduced / static motion policy + the sole-carrier doctrine. Unit-tests the
// transform on an expanded-spec shape (synergy-injected 3D + interaction target motion), plus the
// "presenter is never the sole carrier" report. Pure. Run: node betterpptx-mcp/verify-motion-policy.mjs
import { normalizeMotionPolicy, motionPolicyResolutionForSpec, applyMotionPolicy, soleCarrierReport, MOTION_POLICIES } from './ir/motion-policy.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

// an expanded-spec fixture: a presenter block (playScene + travel), an interaction target with a
// pushed motion, and real content that carries meaning.
const expanded = () => ({
	motion: { sequences: [{ slideId: 's0', objectName: 'rev', type: 'emphasis', effect: 'pulse' }] },
	slides: [{
		id: 's0', title: 'Revenue',
		presenterMotion: { motionId: 'motion.ordinary.greet', narrationCue: { phrase: 'welcome' } },
		timeline: [{ objectName: 'rev', type: 'entrance', effect: 'fade' }],
		narration: { script: 'Welcome to the revenue result.', cues: [{ atPhrase: 'revenue', target: 'rev' }] },
		content: [
			{ kind: 'title', name: 't', text: 'Revenue tripled', animation: { type: 'entrance', effect: 'fade' } },
			{ kind: 'chart-panel', name: 'rev', objectName: 'rev', options: { animation: { type: 'emphasis', effect: 'pulse' } } },
			{ kind: 'model3d', name: 'presenter', objectName: 'presenter', morphName: 'presenter', scene: { animId: 3, loop: true }, motion: { path: 'right' },
				_presenterMotionId: 'motion.ordinary.greet', _presenterNarrationCue: { phrase: 'welcome' },
				animation: [{ type: 'emphasis', effect: 'playScene', animId: 3, trigger: 'withPrevious', delay: 0, duration: 2500 }, { type: 'motion', pathData: 'M 0 0 L 0.2 0 E', trigger: 'withPrevious', delay: 0, duration: 1200 }] },
			{ kind: 'shape', name: 'metric', objectName: 'metric', animation: [{ type: 'motion', pathData: 'M 0 0 L 0.026 -1 E', trigger: 'withPrevious', delay: 2640, duration: 600 }] },
		],
	}],
})

ok('normalize: default full', normalizeMotionPolicy({}) === 'full')
ok('normalize: static', normalizeMotionPolicy({ motionPolicy: 'static' }) === 'static')
ok('normalize: accessibility.reducedMotion -> reduced', normalizeMotionPolicy({ accessibility: { reducedMotion: true } }) === 'reduced')
const explicitFullConflict = motionPolicyResolutionForSpec({ motionPolicy: 'full', accessibility: { reducedMotion: true } })
ok('normalize: explicit motionPolicy remains authoritative', explicitFullConflict.policy === 'full')
ok('normalize: explicit/accessibility conflict is surfaced', explicitFullConflict.issues.some(issue => issue.code === 'MOTION_POLICY_CONFLICT' && issue.severity === 'error'))
ok('normalize: applied metadata cannot override explicit motionPolicy', normalizeMotionPolicy({ motionPolicy: 'full', _motionPolicyApplied: { policy: 'reduced' } }) === 'full')
ok('normalize: unknown -> full', normalizeMotionPolicy({ motionPolicy: 'wild' }) === 'full')

// FULL — unchanged
const full = applyMotionPolicy(expanded(), 'full')
ok('full: presenter keeps its playScene + motion', full.slides[0].content[2].animation.length === 2)

// STATIC — presenter becomes a poster still, interaction target motion removed
const stat = applyMotionPolicy(expanded(), 'static')
const sPres = stat.slides[0].content[2], sMetric = stat.slides[0].content[3]
ok('static: presenter animation stripped (poster still)', !sPres.animation && sPres._staticPoster === true)
ok('static: presenter travel/motion cue stripped', !sPres.motion)
ok('static: presenter narration-binding metadata stripped', sPres._presenterMotionId === undefined && sPres._presenterNarrationCue === undefined)
ok('static: interaction target motion removed (object stays)', !sMetric.animation || (Array.isArray(sMetric.animation) && sMetric.animation.length === 0) || sMetric.animation === undefined)
ok('static: all ordinary content animations are stripped', stat.slides[0].content.every(block => block?.animation === undefined && block?.animations === undefined && block?.options?.animation === undefined && block?.options?.animations === undefined))
ok('static: slide/deck timelines and presenter beats are stripped', stat.slides[0].timeline === undefined && stat.slides[0].presenterMotion === undefined && stat.motion?.sequences === undefined)
ok('static: narration cues are stripped while script remains', stat.slides[0].narration?.script === 'Welcome to the revenue result.' && stat.slides[0].narration?.cues === undefined)
ok('static: real content (title + chart) preserved', stat.slides[0].content.some(b => b.kind === 'title') && stat.slides[0].content.some(b => b.kind === 'chart-panel'))
ok('static: records what it changed', stat._motionPolicyApplied.policy === 'static' && stat._motionPolicyApplied.changes.length === 1)

// REDUCED — in-place playScene kept, travel/impact removed
const red = applyMotionPolicy(expanded(), 'reduced')
const rPres = red.slides[0].content[2]
const rAnims = Array.isArray(rPres.animation) ? rPres.animation : rPres.animation ? [rPres.animation] : []
ok('reduced: presenter keeps the in-place playScene', rAnims.some(a => String(a.effect).toLowerCase() === 'playscene'))
ok('reduced: presenter loses the travel motion', !rAnims.some(a => a.type === 'motion') && !rPres.motion)
ok('reduced: ordinary entrance/emphasis and semantic timelines remain', red.slides[0].content[0].animation?.type === 'entrance' && red.slides[0].content[1].options?.animation?.type === 'emphasis' && red.slides[0].timeline?.length === 1 && red.motion?.sequences?.length === 1)

// SOLE-CARRIER doctrine
const good = soleCarrierReport({ slides: [
	{ id: 'a', content: [{ kind: 'title', name: 't', text: 'T' }, { kind: 'chart-panel', name: 'c' }] },
	{ id: 'b', title: 'B', message: 'the point', narration: { text: 'spoken point' }, content: [{ kind: 'title', name: 't', text: 'B' }, { kind: 'body', name: 'visible', text: 'Visible static meaning.' }] },
] })
ok('sole-carrier: a slide with body content passes', good.slides[0].ok)
ok('sole-carrier: visible body plus narration passes', good.slides[1].ok)
const narrationOnly = soleCarrierReport({ slides: [
	{ id: 'n', title: 'Spoken only', message: 'the point', narration: { text: 'spoken point' }, content: [{ kind: 'title', name: 't', text: 'Spoken only' }] },
] })
ok('sole-carrier: title+narration without visible body FAILS static completeness', narrationOnly.ok === false && narrationOnly.slides[0].hasNarration === true && narrationOnly.slides[0].verdict.code === 'PRESENTER_SOLE_CARRIER')
const bad = soleCarrierReport({ slides: [
	{ id: 'p', content: [{ kind: 'model3d', name: 'presenter', objectName: 'presenter' }] },
] })
ok('sole-carrier: a presenter-ONLY slide FAILS (doctrine)', bad.ok === false && bad.slides[0].verdict.code === 'PRESENTER_SOLE_CARRIER')
ok('sole-carrier: the violation is actionable', !!bad.slides[0].verdict.fix && bad.slides[0].verdict.severity === 'error')

// determinism + non-mutation
const src = expanded()
const before = JSON.stringify(src)
applyMotionPolicy(src, 'static')
ok('applyMotionPolicy does not mutate the input', JSON.stringify(src) === before)

const compiledStatic = buildSpecOperationPlan({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Static policy operation proof',
	motionPolicy: 'static',
	presenter: { id: 'host', identity: 'joe', onSlides: [0] },
	motionTime: { kineticSelection: { presenters: [{ presenterId: 'host', selectedMotionIds: ['motion.ordinary.greet'] }] } },
	motion: { sequences: [{ slideId: 's0', objectName: 'proof', type: 'emphasis', effect: 'pulse' }] },
	slides: [{
		id: 's0', title: 'Static proof', message: 'The complete proof is visible.',
		presenterMotion: { presenterId: 'host', motionId: 'motion.ordinary.greet', narrationCue: { phrase: 'proof' } },
		timeline: [{ objectName: 'proof', type: 'entrance', effect: 'fade' }],
		narration: { script: 'The complete proof is visible. The supporting label is also visible.', cues: [{ atPhrase: 'proof', target: 'proof', type: 'emphasis' }] },
		content: [
			{ kind: 'title', name: 'title', text: 'Static proof', animation: { type: 'entrance', effect: 'fade' } },
			{ kind: 'body', name: 'proof', text: 'Complete visible evidence.', animation: { type: 'emphasis', effect: 'pulse' } },
			{ kind: 'callout', name: 'support', text: 'Supporting visible label.' },
		],
	}],
})
const compiledStaticMotionOps = compiledStatic.operations.filter(operation => operation.tool === 'betterpptx.slide.animate_shapes'
	|| operation.args?.options?.animation != null
	|| operation.args?.options?.animations != null
	|| /playscene/i.test(JSON.stringify(operation)))
const compiledStaticNarrationCues = compiledStatic.operations.filter(operation => /add_narration$/.test(operation.tool)).flatMap(operation => operation.args?.cues || [])
const compiledStaticPresenterOps = compiledStatic.operations.filter(operation => operation.tool === 'betterpptx.slide.add_model3d' && operation.objectName === 'presenter')
ok('compiled static plan has no runtime animation/playScene operations', compiledStaticMotionOps.length === 0, JSON.stringify(compiledStaticMotionOps))
ok('compiled static plan has no narration-driven audience-facing cues', compiledStaticNarrationCues.length === 0, JSON.stringify(compiledStaticNarrationCues))
ok('compiled static plan preserves the native presenter object under one static policy', compiledStaticPresenterOps.length === 1 && compiledStatic.presenterContract.executionPlan.motionPolicy === 'static' && compiledStatic.presenterRuntime.motionPolicy === 'static', JSON.stringify({ presenterOps: compiledStaticPresenterOps.length, contract: compiledStatic.presenterContract.executionPlan.motionPolicy, runtime: compiledStatic.presenterRuntime.motionPolicy }))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
