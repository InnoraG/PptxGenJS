// C2 GATE (proposed interactions — teamwork doctrine): narration-suggested {verb,target} proposals
// that CITE the phrase, resolve a REAL target, are deterministic, and NEVER auto-inject. Pure unit
// run. Run: node betterpptx-mcp/verify-proposals.mjs
import { proposeInteractions, expandInteractions } from './ir/synergy-compiler.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

const chart = { kind: 'chart-panel', name: 'rev', objectName: 'rev' }
const metric = { kind: 'metric', name: 'kpi', objectName: 'kpi' }
const title = { kind: 'title', name: 't', text: 'T' }
const slide = (id, narr, content, interactions) => ({ id, narration: { text: narr }, content, ...(interactions ? { interactions } : {}) })

const spec = {
	slides: [
		slide('s0', 'Take a look at this chart — revenue tripled.', [title, chart]),           // point-at rev
		slide('s1', 'We removed the legacy cost line entirely.', [title, metric]),              // knock-over kpi
		slide('s2', 'Just some narration with no interaction cue at all here.', [title, chart]), // none
		slide('s3', 'Notice this metric', [title, metric], [{ actor: 'joe', verb: 'touch', target: 'kpi' }]), // author already authored → skip
	],
}
const proposals = proposeInteractions(spec)

ok('proposes for the point-at slide', proposals.some(p => p.slide === 0 && p.verb === 'point-at' && p.target === 'rev'))
ok('proposes for the knock-over slide', proposals.some(p => p.slide === 1 && p.verb === 'knock-over' && p.target === 'kpi'))
ok('no proposal for the cue-free slide', !proposals.some(p => p.slide === 2))
ok('SKIPS a slide the author already authored (respect the author)', !proposals.some(p => p.slide === 3))
ok('every proposal cites the narration phrase', proposals.every(p => /narration phrase "/.test(p.reason)))
ok('every proposal resolves a REAL target object', proposals.every(p => ['rev', 'kpi'].includes(p.target)))
ok('every proposal carries a confidence + an accept instruction', proposals.every(p => typeof p.confidence === 'number' && /slides\[\d+\]\.interactions/.test(p.accept)))
ok('at most one proposal per slide (no spam)', new Set(proposals.map(p => p.slide)).size === proposals.length)

// DETERMINISM: identical spec → identical proposals
ok('deterministic (same spec → same proposals)', JSON.stringify(proposeInteractions(spec)) === JSON.stringify(proposals))

// NEVER auto-injects: the spec's authored interactions are untouched, and expanding a proposal-only
// spec must NOT create interactions from proposals.
const before = JSON.stringify(spec.slides.map(s => s.interactions || null))
const expanded = expandInteractions(spec, { castAssets: {} })
const after = JSON.stringify(spec.slides.map(s => s.interactions || null))
ok('proposals never mutate the input spec', before === after)
ok('proposal-only slides get NO injected interaction (only authored s3 has one)',
	(expanded.slides || []).filter((s, i) => i !== 3).every(s => !(Array.isArray(s.interactions) && s.interactions.length)))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
