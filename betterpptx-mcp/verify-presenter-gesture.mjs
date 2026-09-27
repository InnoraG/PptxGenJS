// Verify the presenter GESTURE INTELLIGENCE (L2 narration->intent classifier + intent-keyed clipMap + L3
// per-world dialects) — all GPU-free, pure MCP-side. Proves the presenter adapts its gesture to the NARRATION
// content and varies per world, instead of the old flat role->beat mapping.
//
// Run: `node betterpptx-mcp/verify-presenter-gesture.mjs`  (exit 0 = pass).
import {
	selectGestureIntent,
	classifyGesture,
	planPresenterGestures,
	gestureDialectFor,
	resolvePresenter,
	expandPresenterDirective,
	GESTURE_INTENTS,
} from './ir/presenter-director.mjs'

let passed = 0, failed = 0
const ok = (m) => { passed++; console.log('  ok   ' + m) }
const bad = (m) => { failed++; console.log('  FAIL ' + m) }
const eq = (got, want, m) => got === want ? ok(`${m} (=${got})`) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)

const sl = (script, role) => ({ role, narration: { script } })

// ---- 1) L2 classifier: narration CONTENT drives the intent ----------------------------------------
console.log('L2 classifier (content -> intent):')
eq(selectGestureIntent(sl('Welcome everyone, so glad you are here today.')), 'greet', 'greeting -> greet')
eq(selectGestureIntent(sl('First, we onboard. Second, we activate. Finally, we retain.')), 'enumerate', 'ordinals -> enumerate')
eq(selectGestureIntent(sl('Sales were flat, but however our margin doubled.')), 'contrast', 'but/however -> contrast')
eq(selectGestureIntent(sl('So why do we keep losing customers here?')), 'ask', 'question -> ask')
eq(selectGestureIntent(sl('Revenue doubled this year and grew every quarter.')), 'magnitude', 'doubled/grew -> magnitude')
eq(selectGestureIntent(sl('Take a look — this chart shows the whole story.')), 'point', 'look/this-chart -> point')
eq(selectGestureIntent(sl('This is the most critical thing to remember this year.')), 'emphasize', 'most/critical -> emphasize')
eq(selectGestureIntent(sl('Thank you for listening, and in conclusion we win.')), 'bow', 'thanks/conclusion -> bow')
// salience: bland narration earns NO gesture -> role tie-break prior, else talk
eq(selectGestureIntent(sl('We continued operating the platform as usual.', 'data')), 'emphasize', 'no cue -> role(data) tie-break')
eq(selectGestureIntent(sl('We continued operating the platform as usual.')), 'talk', 'no cue + no role -> talk')
eq(selectGestureIntent(sl('')), 'talk', 'empty narration -> talk')
// every produced intent is in the declared vocabulary
{
	const scripts = ['welcome', 'first second finally', 'but however', 'why?', 'doubled', 'look at this chart shows', 'most critical', 'thank you']
	const allInVocab = scripts.every((s) => GESTURE_INTENTS.includes(selectGestureIntent(sl(s))))
	allInVocab ? ok('all classifier outputs are in GESTURE_INTENTS') : bad('classifier produced an intent outside GESTURE_INTENTS')
}
// priority: a stronger cue outranks a weaker one in the same sentence
eq(selectGestureIntent(sl('First, notice this is the most important number.')), 'enumerate', 'enumerate(8) outranks point/emphasize')

// ---- 2) Determinism -------------------------------------------------------------------------------
console.log('Determinism:')
{
	const s = sl('First, we grew; but the most critical risk remains — why?')
	const a = selectGestureIntent(s), b = selectGestureIntent(s)
	a === b ? ok(`stable across calls (=${a})`) : bad(`non-deterministic: ${a} vs ${b}`)
}

// ---- 3) intent-keyed clipMap + legacy alias + safe fallback (via expand end-to-end) ----------------
console.log('clipMap resolution (intent -> animId):')
{
	// author supplies ONLY legacy beats -> new intents must ALIAS to a real legacy clip, never a stray id.
	const legacy = { greet: 1, point: 2, emphasize: 3, talk: 0, bow: 4 }
	const spec = {
		presenter: { model: 'gen://trellis/rigged3d/abc', clipMap: legacy },
		slides: [
			sl('Welcome everyone!', 'opener'),                                    // greet -> 1
			sl('First we ship, second we measure, finally we iterate.', 'body'),  // enumerate -> alias point -> 2
			sl('Revenue doubled and grew all year.', 'data'),                     // magnitude -> alias emphasize -> 3
			sl('Thanks for your time, in summary we win.', 'closer'),             // bow -> 4
		],
	}
	const out = expandPresenterDirective(spec, {})
	const pres = out.slides.map((s) => s.content.find((c) => c && c.name === 'presenter'))
	eq(pres.length, 4, 'a presenter injected per slide')
	eq(pres[0]._presenterIntent, 'greet', 'slide0 intent greet'); eq(pres[0].scene.animId, 1, 'slide0 animId (greet=1)')
	eq(pres[1]._presenterIntent, 'enumerate', 'slide1 intent enumerate'); eq(pres[1].scene.animId, 2, 'slide1 animId (enumerate->point=2)')
	eq(pres[2]._presenterIntent, 'magnitude', 'slide2 intent magnitude'); eq(pres[2].scene.animId, 3, 'slide2 animId (magnitude->emphasize=3)')
	eq(pres[3]._presenterIntent, 'bow', 'slide3 intent bow'); eq(pres[3].scene.animId, 4, 'slide3 animId (bow=4)')
	// a DISTINCT clip is actually chosen across the deck (not the old all-zero collapse)
	const distinct = new Set(pres.map((p) => p.scene.animId))
	distinct.size >= 3 ? ok(`deck uses ${distinct.size} distinct clips (was 1)`) : bad(`only ${distinct.size} distinct clip(s) — selection not adapting`)
}
{
	// no clipMap at all -> every intent safely resolves to 0 (never a non-existent clip)
	const spec = { presenter: { model: 'gen://x' }, slides: [sl('First, second, finally.'), sl('Why?'), sl('doubled')] }
	const out = expandPresenterDirective(spec, {})
	const ids = out.slides.map((s) => s.content.find((c) => c && c.name === 'presenter').scene.animId)
	ids.every((n) => n === 0) ? ok('no clipMap -> all animId 0 (safe, no phantom clip)') : bad(`unsafe animId with no clipMap: ${ids}`)
}

// ---- 4) L3 per-world dialects: same narration performs differently per world -----------------------
console.log('L3 world dialects (same narration, different world):')
{
	const dNar = gestureDialectFor('narrator'), dCmd = gestureDialectFor('commander'), dHost = gestureDialectFor('host')
	dNar.energy !== dCmd.energy ? ok(`narrator(${dNar.energy}) != commander(${dCmd.energy}) style`) : bad('personas share a style')
	dNar.bias.emphasize === 'talk' ? ok('narrator softens emphasize -> talk') : bad('narrator bias missing')
	dCmd.bias.talk === 'emphasize' ? ok('commander sharpens talk -> emphasize') : bad('commander bias missing')

	const script = 'This is the most critical point of the entire year.' // -> emphasize
	const model = 'gen://trellis/rigged3d/host'
	const clipMap = { emphasize: 3, talk: 0, greet: 1, point: 2, bow: 4 }
	const mk = (persona) => expandPresenterDirective(
		{ presenter: { model, clipMap }, slides: [sl(script, 'data')] },
		{ worldPresenter: { model, persona } },
	).slides[0].content.find((c) => c && c.name === 'presenter')

	const host = mk('host'), narrator = mk('narrator')
	eq(host._presenterIntent, 'emphasize', 'host keeps emphasize')
	eq(narrator._presenterIntent, 'talk', 'narrator re-biases emphasize -> talk')
	host.scene.animId !== narrator.scene.animId
		? ok(`same script -> different clip per world (host=${host.scene.animId}, narrator=${narrator.scene.animId})`)
		: bad('world dialect did not change the selected clip')
	// dialect style params ride along for the author-time bake (L5)
	narrator._gestureStyle && typeof narrator._gestureStyle.amplitude === 'number'
		? ok(`_gestureStyle recorded (amplitude=${narrator._gestureStyle.amplitude})`) : bad('_gestureStyle missing')
	host._presenterPersona === 'host' ? ok('persona recorded on block') : bad('persona not recorded')
}

// ---- 5) merge precedence DEFAULT <- world <- author ------------------------------------------------
console.log('resolve precedence:')
{
	const P = resolvePresenter(
		{ model: 'gen://a', clipMap: { greet: 9 }, choreography: 'energetic' },       // author
		{ model: 'gen://b', persona: 'narrator', clipMap: { greet: 1, point: 5 } },   // world
	)
	eq(P.clipMap.greet, 9, 'author clipMap wins over world')
	eq(P.clipMap.point, 5, 'world clipMap fills where author is silent')
	eq(P.choreography, 'energetic', 'author choreography wins')
	eq(P.persona, 'narrator', 'world persona used when author omits')
}

// ---- 6) classifyGesture reports the SOURCE of the choice (narration | role | default) --------------
console.log('classifyGesture (intent + from):')
{
	const a = classifyGesture(sl('First, then second, finally third.'))
	eq(a.intent, 'enumerate', 'content -> intent'); eq(a.from, 'narration', 'content -> from=narration')
	const b = classifyGesture(sl('We kept the lights on.', 'data'))
	eq(b.intent, 'emphasize', 'no cue + role -> role beat'); eq(b.from, 'role', 'no cue + role -> from=role')
	const c = classifyGesture(sl('We kept the lights on.'))
	eq(c.intent, 'talk', 'no cue + no role -> talk'); eq(c.from, 'default', 'no cue + no role -> from=default')
}

// ---- 7) planPresenterGestures: appliedDefaults per-slide report (matches what the expander injects) --
console.log('planPresenterGestures (appliedDefaults report):')
{
	const model = 'gen://trellis/rigged3d/demo'
	const clipMap = { greet: 1, point: 2, emphasize: 3, talk: 0, bow: 4 }
	const spec = {
		presenter: { model, clipMap },
		slides: [
			sl('Welcome everyone!', 'opener'),                       // greet, from narration
			sl('The platform ran as usual.', 'data'),               // no cue -> role(data)=emphasize
			sl('Revenue doubled and grew all year.', 'body'),       // magnitude -> emphasize clip
		],
	}
	const plan = planPresenterGestures(spec, {})
	plan ? ok('plan returned when presenter active') : bad('plan null despite active presenter')
	eq(plan.perSlide.length, 3, 'one entry per target slide')
	eq(plan.perSlide[0].intent, 'greet', 's0 intent'); eq(plan.perSlide[0].from, 'narration', 's0 from')
	eq(plan.perSlide[1].intent, 'emphasize', 's1 intent'); eq(plan.perSlide[1].from, 'role', 's1 from=role')
	eq(plan.perSlide[2].intent, 'magnitude', 's2 intent'); eq(plan.perSlide[2].animId, 3, 's2 animId (magnitude->emphasize=3)')

	// DRIFT CHECK: the report must equal what expandPresenterDirective actually injects.
	const injected = expandPresenterDirective(spec, {}).slides
		.map((s) => s.content.find((c) => c && c.name === 'presenter'))
		.filter(Boolean)
		.map((c) => ({ intent: c._presenterIntent, animId: c.scene.animId }))
	const reportPairs = plan.perSlide.map((e) => ({ intent: e.intent, animId: e.animId }))
	JSON.stringify(injected) === JSON.stringify(reportPairs)
		? ok('report matches injected gestures (no drift)')
		: bad(`report/inject drift: ${JSON.stringify(reportPairs)} vs ${JSON.stringify(injected)}`)

	// dialect bias is reflected + flagged in the report
	const narrated = planPresenterGestures(
		{ presenter: { model, clipMap }, slides: [sl('This is the most critical point.', 'data')] },
		{ worldPresenter: { model, persona: 'narrator' } },
	)
	eq(narrated.perSlide[0].intent, 'talk', 'narrator dialect biases emphasize -> talk in the report')
	narrated.perSlide[0].biased ? ok('report flags a dialect-biased gesture') : bad('biased flag missing')
}
{
	// no presenter active -> null (appliedDefaults shows only the world persona note)
	const plan = planPresenterGestures({ slides: [sl('hello')] }, {})
	plan === null ? ok('no presenter -> null plan') : bad('plan should be null with no presenter model')
}

// The declared presenter stage is also the semantic exclusion lane consumed by
// the layout engine. Growth and travel may never make the native model escape it.
console.log('presenter stage/lane geometry:')
for (const stage of ['left', 'right', 'corner']) {
	const spec = {
		presenter: {
			model: 'gen://trellis/rigged3d/stage-contract',
			stage,
			choreography: 'keynote',
			travelPath: stage === 'left' ? 'left' : 'right',
			clipMap: { talk: 0, emphasize: 1, point: 2, bow: 3 },
		},
		slides: Array.from({ length: 4 }, (_, index) => sl(
			index === 3 ? 'Thank you, in conclusion.' : `This is the most critical point ${index + 1}.`,
			index === 3 ? 'closer' : 'data',
		)),
	}
	const expanded = expandPresenterDirective(spec, {})
	const badFrames = expanded.slides.flatMap((slide, index) => {
		const presenter = slide.content.find(item => item?.name === 'presenter')
		const zone = slide.presenterZone
		if (!presenter || !zone) return [{ index, reason: 'missing presenter or zone' }]
		const b = presenter.bbox
		const outside = b.x < zone.x0 - 0.02 || b.x + b.w > zone.x1 + 0.02
		const contentZoneWarning = presenter._choreo?.warnings?.includes('CONTENT_ZONE')
		return outside || contentZoneWarning ? [{ index, bbox: b, zone, warnings: presenter._choreo?.warnings }] : []
	})
	badFrames.length === 0
		? ok(`${stage} presenter stays inside its declared exclusion lane across growth/travel`)
		: bad(`${stage} presenter escaped its exclusion lane: ${JSON.stringify(badFrames)}`)
}

console.log('')
console.log(failed === 0 ? `PASSED: ${passed} passed, 0 failed` : `FAILED: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
