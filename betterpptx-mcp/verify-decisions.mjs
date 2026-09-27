// E2 GATE: every planner verdict the AI reads is ACTIONABLE — {code, severity, reason, fix,
// evidence} — never a bare string, and every code the synergy stack emits is registered with a
// fix. Pure unit run. Run: node betterpptx-mcp/verify-decisions.mjs
import { DECISION_REGISTRY, VALID_SEVERITIES, normalizeDecision, normalizeDecisions, assertActionable } from './ir/decisions.mjs'
import { compactWarning } from './ir/spec-compiler.mjs'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }
const here = path.dirname(fileURLToPath(import.meta.url))

// 1. every registry entry is well-formed
let regOk = true
for (const [code, v] of Object.entries(DECISION_REGISTRY)) {
	if (!VALID_SEVERITIES.has(v.severity) || !v.fix || typeof v.fix !== 'string') { regOk = false; console.log('   bad registry entry', code) }
}
ok('registry: every entry has a valid severity + a fix string', regOk)

// 2. normalizeDecision upgrades a raw {code,msg} to the full shape
const n = normalizeDecision({ code: 'UNREACHABLE', msg: 'contact misses target by 0.31in' })
ok('normalize: {code,msg} -> full actionable shape', n.code === 'UNREACHABLE' && n.severity === 'warning' && n.reason.includes('0.31in') && typeof n.fix === 'string')
ok('normalize: reason falls back to the raw msg', n.reason === 'contact misses target by 0.31in')

// 3. an unregistered code is surfaced loudly, never silently dropped
const u = normalizeDecision({ code: 'SOMETHING_NEW', msg: 'x' })
ok('normalize: unregistered code -> UNREGISTERED_DECISION_CODE with a fix', u.code === 'UNREGISTERED_DECISION_CODE' && u.evidence.originalCode === 'SOMETHING_NEW' && u.fix.includes('register'))

// 4. evidence (extra fields) is carried
const e = normalizeDecision({ code: 'FRAME_CLAMPED', msg: 'moved 0.2in', clampedIn: 0.2, framePos: { x: 1, y: 2 } })
ok('normalize: extra fields become evidence', e.evidence && e.evidence.clampedIn === 0.2 && e.evidence.framePos.x === 1)

// 5. assertActionable catches bare/incomplete verdicts
ok('assertActionable: rejects a bare-string-ish verdict', assertActionable([{ code: 'X' }]).ok === false)
ok('assertActionable: accepts a normalized list', assertActionable(normalizeDecisions([{ code: 'UNREACHABLE', msg: 'm' }])).ok === true)

// 5b. compiler/layout diagnostics preserve the same AI-readable reason/fix/evidence
// contract instead of collapsing actionable suggestions into a bare message.
const compact = compactWarning({ code: 'ARRANGE_COLS_OUT_OF_RANGE', severity: 'warning', message: 'Use 2–4 columns.', suggestions: [{ cols: 2 }], received: 1 })
ok('compiler warning readback: reason/fix/evidence are preserved', compact.reason === compact.message && typeof compact.fix === 'string' && compact.evidence?.suggestions?.[0]?.cols === 2)

// 6. EVERY code the synergy + choreography stack emits is registered (grep the sources)
const srcFiles = ['ir/synergy-compiler.mjs', 'ir/synergy-solver.mjs', 'ir/synergy-effects.mjs', 'ir/choreography-engine.mjs', 'ir/timeline-ir.mjs']
const emitted = new Set()
for (const f of srcFiles) {
	const t = fs.readFileSync(path.join(here, f), 'utf8')
	for (const m of t.matchAll(/code:\s*['"]([A-Z_]+)['"]/g)) emitted.add(m[1])
}
const unregistered = [...emitted].filter(c => !DECISION_REGISTRY[c] && c !== 'UNSPECIFIED' && c !== 'UNREGISTERED_DECISION_CODE')
ok(`registry covers every emitted code (${emitted.size} emitted)`, unregistered.length === 0, `unregistered: ${unregistered.join(', ')}`)

// 7. end-to-end: expandInteractions produces a plan whose verdicts are all actionable
const { expandInteractions } = await import('./ir/synergy-compiler.mjs')
const spec = {
	slides: [
		{ id: 's0', content: [{ kind: 'title', name: 't', text: 'x' }], interactions: [{ actor: 'ghost', verb: 'touch', target: 'nope' }] },
		{ id: 's1', content: [{ kind: 'shape', name: 'card', objectName: 'card', bbox: { x: 9, y: 2, w: 1.7, h: 1.1 } }], interactions: [{ actor: 'ghost', verb: 'zap', target: 'card' }] },
	],
}
const out = expandInteractions(spec, { castAssets: {} })
const allVerdicts = (out._synergyPlan || []).flatMap(p => p.verdicts || [])
ok('e2e: expandInteractions emitted verdicts', allVerdicts.length >= 2)
ok('e2e: every plan verdict is fully actionable', assertActionable(allVerdicts).ok === true, JSON.stringify(assertActionable(allVerdicts).issues))
ok('e2e: no verdict is a bare string / missing fix', allVerdicts.every(v => v.code && v.severity && v.reason && v.fix))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
