// Verify the Timeline IR foundation (A2a slice 1): master-clock budget derivation, track/decision
// shapes, L6 + ceiling + budget validation, the T8/T9-safe wire adapter, and the two consumer
// fixes (choreography-engine custom paths now carry pathData; synergy-compiler dwell follows
// narration). Pure unit run — no engine, no network. Run: node betterpptx-mcp/verify-timeline-ir.mjs
import { narrationBudgetMs, createTimeline, addTrack, decision, validateTimeline, wireCue, CLIP_CEILING } from './ir/timeline-ir.mjs'
import { compile, CLIP_CEILING as CHOREO_CEILING } from './ir/choreography-engine.mjs'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`) }

// ── narrationBudgetMs: the master clock ─────────────────────────────────────
ok('no narration → 5000 floor (behavior-compatible)', narrationBudgetMs({}) === 5000)
ok('authored expectedDurationMs wins', narrationBudgetMs({ narration: { timing: { expectedDurationMs: 12000 }, text: 'two words' } }) === 12000)
ok('authored + paddingMs', narrationBudgetMs({ narration: { timing: { expectedDurationMs: 12000, paddingMs: 500 } } }) === 12500)
ok('measured durationMs + default padding', narrationBudgetMs({ narration: { durationMs: 9000 } }) === 9600)
ok('segments sum (durations + gaps) + padding', narrationBudgetMs({ narration: { segments: [{ durationMs: 3000 }, { gapMs: 1000, durationMs: 2000 }] } }) === 6600)
const est = narrationBudgetMs({ narration: { text: 'a nineteen word sentence that keeps going and going with more and more words until exactly nineteen are here' } })
ok('text estimate = words × 400 + padding (19 words → 8200)', est === 8200, String(est))
ok('floor clamps short narration up', narrationBudgetMs({ narration: { text: 'hi' } }) === 5000)
ok('cap clamps runaway narration', narrationBudgetMs({ narration: { durationMs: 400000 } }) === 45000)

// ── tracks, decisions, validation ───────────────────────────────────────────
const tl = createTimeline({ slideId: 's1', budgetMs: 8000 })
addTrack(tl, { kind: 'gesture', actor: 'joe', name: 'greet', startMs: 0, durationMs: 3000, animId: 2 })
addTrack(tl, { kind: 'interaction', actor: 'joe', name: 'point', startMs: 4000, durationMs: 3000, animId: 3 })
let v = validateTimeline(tl)
ok('sequenced same-actor tracks validate ok', v.ok === true && tl.decisions.length === 0)

addTrack(tl, { kind: 'interaction', actor: 'joe', name: 'overlap', startMs: 4500, durationMs: 2000, animId: 5 })
v = validateTimeline(tl)
ok('overlapping same-actor 3D tracks → MULTI_3D_SCENE error (L6)', v.ok === false && tl.decisions.some(d => d.code === 'MULTI_3D_SCENE' && d.severity === 'error'))
ok('decision carries the actionable shape {code,severity,reason,fix,evidence}', tl.decisions.every(d => d.code && d.severity && d.reason && d.fix !== undefined))

const tl2 = createTimeline({ budgetMs: 5000 })
addTrack(tl2, { kind: 'gesture', actor: 'a', name: 'late', startMs: 4000, durationMs: 3000, animId: CLIP_CEILING })
v = validateTimeline(tl2)
ok('animId ≥ 18 → CLIP_CEILING error', tl2.decisions.some(d => d.code === 'CLIP_CEILING' && d.severity === 'error'))
ok('past-budget track → BUDGET_OVERRUN warning (not error)', tl2.decisions.some(d => d.code === 'BUDGET_OVERRUN' && d.severity === 'warning') && v.ok === false)

let threw = false
try { addTrack(tl2, { kind: 'nonsense' }) } catch { threw = true }
ok('unknown track kind throws', threw)

// ── wireCue: T8 + T9 guards ─────────────────────────────────────────────────
const motion = wireCue({ kind: 'effect', startMs: 2640, durationMs: 600, payload: { pathData: 'M 0 0 L 0.1 -0.2 E' } })
ok('T9: custom path emits BOTH pathData and motionPathData', motion.pathData === 'M 0 0 L 0.1 -0.2 E' && motion.motionPathData === motion.pathData && motion.type === 'motion')
ok('T8: wire keys are duration/delay in ms', motion.delay === 2640 && motion.duration === 600 && !('durationMs' in motion) && !('delayMs' in motion))
threw = false
try { wireCue({ kind: 'effect', payload: { durationMs: 500 } }) } catch { threw = true }
ok('T8: *Ms payload keys are rejected loudly', threw)
const plain = wireCue({ kind: 'effect', startMs: 0, durationMs: 400, payload: { type: 'emphasis', effect: 'pulse' } })
ok('non-path cue passes payload through with wire timing', plain.duration === 400 && plain.effect === 'pulse' && !('delay' in plain))

// ── consumer fixes ──────────────────────────────────────────────────────────
ok('ceilings agree (timeline-ir == choreography-engine == 18)', CLIP_CEILING === 18 && CHOREO_CEILING === 18)
const compiled = compile({
	slide: { w: 13.333, h: 7.5, durationMs: 5000 },
	presenter: {
		name: 'p', animId: 0, bbox: { x: 1, y: 1, w: 4, h: 4 }, clipDurationMs: 2500,
		motion: { waypoints: [{ dxIn: 2.0, dyIn: -1.0 }], startMs: 0, durationMs: 1200 },
	},
	content: [],
})
const moveCue = (compiled.cues || []).map(c => c.animation).find(a => a && (a.pathData || a.motionPathData))
ok('T9 fix live in choreography-engine: compiled waypoint move carries pathData', Boolean(moveCue && moveCue.pathData && moveCue.pathData === moveCue.motionPathData), JSON.stringify(moveCue || {}).slice(0, 160))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
