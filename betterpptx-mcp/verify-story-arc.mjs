// C1 GATE: deck-level story arc. Deterministic per-slide presenter posture — FULL at opener/closer
// and the climax (interaction slide), RECEDE on data-dense slides. Pure unit run.
// Run: node betterpptx-mcp/verify-story-arc.mjs
import { planStoryArc } from './ir/story-director.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

const S = (id, role, content, interactions) => ({ id, role, content, ...(interactions ? { interactions } : {}) })
const title = { kind: 'title', name: 't', text: 'T' }
const spec = {
	slides: [
		S('s0', 'opener', [title, { kind: 'textbox', name: 'sub' }]),                                   // opener → full
		S('s1', 'body', [title, { kind: 'textbox', name: 'b' }]),                                        // body → full/medium
		S('s2', 'data', [title, { kind: 'chart-panel', name: 'c' }, { kind: 'metric-grid', name: 'm' }]),// dense → recede
		S('s3', 'data', [title, { kind: 'table-panel', name: 'tbl' }]),                                  // has data → recede
		S('s4', 'body', [title, { kind: 'kpi', name: 'k' }], [{ actor: 'joe', verb: 'point-at', target: 'k' }]), // interaction → climax → full
		S('s5', 'closer', [title]),                                                                       // closer → full
	],
}
const arc = planStoryArc(spec)
ok('arc has one entry per slide', Array.isArray(arc) && arc.length === 6)
ok('opener is FULL presence', arc[0].presence === 'full')
ok('data-dense slide RECEDES', arc[2].presence === 'recede' && arc[2].reason.includes('data-dense'))
ok('single-data slide RECEDES', arc[3].presence === 'recede')
ok('interaction slide is the CLIMAX at full presence', arc[4].presence === 'full' && arc[4].isClimax === true && arc[4].energy === 1.0)
ok('closer is FULL presence', arc[5].presence === 'full')
ok('recede slides suggest a smaller scale + more margin', arc[2].scale < 1.0 && arc[2].viewportMargin > 1.2)
ok('recede slides move to a corner stage', arc[2].stage === 'corner')
ok('full slides use center/left, larger scale', arc[0].scale >= 1.0 && ['center', 'left'].includes(arc[0].stage))
ok('bookend symmetry: closer shares the opener stage', arc[5].stage === arc[0].stage)
ok('every entry cites a reason', arc.every(a => typeof a.reason === 'string' && a.reason.length > 5))
// determinism
ok('deterministic (same spec → same arc)', JSON.stringify(planStoryArc(spec)) === JSON.stringify(arc))
// role-independent: first/last slide default to opener/closer even without explicit role
const arc2 = planStoryArc({ slides: [S('a', null, [title]), S('b', null, [{ kind: 'chart-panel', name: 'c' }, { kind: 'chart-panel', name: 'd' }]), S('c', null, [title])] })
ok('first slide defaults to full even with no role', arc2[0].presence === 'full')
ok('last slide defaults to full even with no role', arc2[2].presence === 'full')
ok('middle dense slide recedes even with no role', arc2[1].presence === 'recede')

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
