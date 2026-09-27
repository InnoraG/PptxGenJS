// D3 GATE: impact accents. A native starburst at the solved contact point for impulse verbs,
// flashes in+out, tagged _synergyAccent, and stripped under reduced/static motion. Pure unit.
// Run: node betterpptx-mcp/verify-impact-accent.mjs
import { impactAccentBlock } from './ir/synergy-effects.mjs'
import { applyMotionPolicy } from './ir/motion-policy.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }

// the helper
const a = impactAccentBlock({ x: 8.4, y: 3.5 }, { tMs: 2640, name: 'joe_impact_0', accentColor: '14B8A6' })
ok('accent is a native shape at the contact point (centered)', a.kind === 'shape' && Math.abs(a.bbox.x + a.bbox.w / 2 - 8.4) < 0.001 && Math.abs(a.bbox.y + a.bbox.h / 2 - 3.5) < 0.001)
ok('accent is tagged _synergyAccent', a._synergyAccent === true)
ok('accent flashes in then out around contact', a.animation.length === 2 && a.animation[0].type === 'entrance' && a.animation[1].type === 'exit' && a.animation[1].delay > a.animation[0].delay)
ok('accent uses the world accent color', a.style.fill === '14B8A6')
ok('accent carries alt text (decorative)', typeof a.altText === 'string')
ok('T8 wire keys (duration/delay ms)', a.animation.every(e => typeof e.delay === 'number' && typeof e.duration === 'number' && !('delayMs' in e)))

// D5 policy: accent survives full, dropped under reduced + static
const slideWith = () => ({ slides: [{ id: 's', content: [
	{ kind: 'title', name: 't', text: 'T' },
	{ kind: 'chart-panel', name: 'c' },
	impactAccentBlock({ x: 8.4, y: 3.5 }, { tMs: 2640, name: 'imp' }),
] }] })
const hasAccent = spec => spec.slides[0].content.some(b => b._synergyAccent)
ok('full: accent kept', hasAccent(applyMotionPolicy(slideWith(), 'full')))
ok('reduced: accent removed', !hasAccent(applyMotionPolicy(slideWith(), 'reduced')))
ok('static: accent removed', !hasAccent(applyMotionPolicy(slideWith(), 'static')))
ok('static: real content (title + chart) preserved', (() => { const s = applyMotionPolicy(slideWith(), 'static'); return s.slides[0].content.some(b => b.kind === 'title') && s.slides[0].content.some(b => b.kind === 'chart-panel') })())

// determinism + non-mutation
const src = slideWith()
const before = JSON.stringify(src)
applyMotionPolicy(src, 'static')
ok('applyMotionPolicy does not mutate input (accent path)', JSON.stringify(src) === before)

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
