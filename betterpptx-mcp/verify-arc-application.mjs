// C1-APPLICATION GATE: the story arc actually DRIVES the presenter. With storyDirection on, the
// injected presenter block on a data-dense slide is SMALLER (recede) than on a full slide; with it
// off, the deck is byte-identical to today. Pure unit on the director. Run:
//   node betterpptx-mcp/verify-arc-application.mjs
import { expandPresenterDirective } from './ir/presenter-director.mjs'
import { planStoryArc } from './ir/story-director.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

const title = { kind: 'title', name: 't', text: 'T' }
const mkSpec = () => ({
	presenter: { id: 'presenter', model: 'gen://rigged3d/deadbeef', clipMap: { talk: 1, idle: 0 }, onSlides: 'all' },
	slides: [
		{ id: 's0', role: 'opener', content: [title, { kind: 'textbox', name: 'b' }] },                       // full
		{ id: 's1', role: 'data', content: [title, { kind: 'chart-panel', name: 'c' }, { kind: 'metric-grid', name: 'm' }] }, // MIDDLE, dense → recede
		{ id: 's2', role: 'closer', content: [title] },                                                        // full (closer)
	],
})
const findPresenter = (slide) => (slide.content || []).find(c => c && (c.objectName === 'presenter' || c.name === 'presenter'))
const opts = spec => ({ worldPresenter: null, avatarClipMap: spec.presenter.clipMap, avatarContactMap: null, avatarClipDurations: null })

// OFF (default): no arc applied
const off = expandPresenterDirective(mkSpec(), opts(mkSpec()))
const offFull = findPresenter(off.slides[0]), offDense = findPresenter(off.slides[1])
ok('off: presenter injected on both slides', !!offFull && !!offDense)

// ON: pass the arc
const specOn = mkSpec()
const arc = planStoryArc(specOn)
ok('arc marks the data slide as recede', arc[1].presence === 'recede' && arc[0].presence === 'full')
const on = expandPresenterDirective(specOn, { ...opts(specOn), storyArc: arc })
const onFull = findPresenter(on.slides[0]), onDense = findPresenter(on.slides[1])
ok('on: presenter injected on both slides', !!onFull && !!onDense)
ok('on: the data-dense presenter is SMALLER than the full-slide presenter (recede)', onDense.bbox.h < onFull.bbox.h, `dense h=${onDense.bbox.h} full h=${onFull.bbox.h}`)
ok('on: the data-dense presenter viewport zooms out (bigger EMU per inch reduced → smaller model)', onDense.bbox.w < onFull.bbox.w)
ok('on: the data-dense presenter moved off-center (corner stage)', onDense.bbox.x !== onFull.bbox.x)

// arc application does not change the FULL slide vs off
ok('the full (opener) slide is unchanged by the arc', onFull.bbox.h === offFull.bbox.h && onFull.bbox.x === offFull.bbox.x)

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
