// D2 GATE: secondary motion (physical follow-through) in synthesizeEffect — impact squash, post-push
// settle (overshoot+return), knock-over rotation — computed from contact geometry, T8/T9-safe, and
// switchable off for reduced/static. Pure unit. Run: node betterpptx-mcp/verify-secondary-motion.mjs
import { synthesizeEffect } from './ir/synergy-effects.mjs'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + x}`) }
const wireOk = a => a.every(e => typeof e.delay === 'number' && typeof e.duration === 'number' && !('delayMs' in e) && !('durationMs' in e))
const pathOk = a => a.filter(e => e.type === 'motion').every(e => e.pathData && e.motionPathData && e.pathData === e.motionPathData)
const lCount = s => (s.match(/\bL\b/g) || []).length

const contact = { dir: { x: 0.03, y: -1 }, tMs: 2640, distIn: 2.2, durationMs: 600, slideW: 13.333, slideH: 7.5 }

// PUSH with secondary (default)
const push = synthesizeEffect('push', contact)
ok('push: has an impact squash (growShrink) at contact', push.some(e => e.effect === 'growShrink' && Math.abs(e.delay - contact.tMs) <= 20))
ok('push: motion path has a settle (overshoot + return = 2 L segments)', push.some(e => e.type === 'motion' && lCount(e.pathData) === 2))
ok('push: squash fires before/at the fly', push[0].effect === 'growShrink' && push.some(e => e.type === 'motion'))
ok('push: T8 wire keys (duration/delay ms)', wireOk(push))
ok('push: T9 both path keys', pathOk(push))

// PUSH without secondary (reduced/static callers)
const pushFlat = synthesizeEffect('push', contact, { secondaryMotion: false })
ok('push flat: single motion, no squash', pushFlat.length === 1 && pushFlat[0].type === 'motion')
ok('push flat: straight path (1 L segment)', lCount(pushFlat[0].pathData) === 1)

// KNOCK-OVER with secondary
const knock = synthesizeEffect('knock-over', contact)
ok('knock-over: squash + teeter + spin + exit', knock.some(e => e.effect === 'growShrink') && knock.some(e => e.effect === 'teeter') && knock.some(e => e.effect === 'spin') && knock.some(e => e.type === 'exit'))
ok('knock-over: spin fires before the exit fly', (() => { const spin = knock.find(e => e.effect === 'spin'); const fly = knock.find(e => e.type === 'exit'); return spin && fly && spin.delay < fly.delay })())
ok('knock-over: T8 wire keys', wireOk(knock))

// KNOCK-OVER without secondary = the original teeter + exit
const knockFlat = synthesizeEffect('knock-over', contact, { secondaryMotion: false })
ok('knock-over flat: teeter + exit only (no squash/spin)', knockFlat.length === 2 && knockFlat[0].effect === 'teeter' && knockFlat[1].type === 'exit')

// CARRY unchanged
const carry = synthesizeEffect('carry', { segment: { samples: [[0, 6, 4], [500, 7, 4], [1000, 8, 4]], grabMs: 2145, dropMs: 3465 }, slideW: 13.333, slideH: 7.5 })
ok('carry: single grab→drop motion', carry.length === 1 && carry[0].type === 'motion' && carry[0].delay === 2145)
ok('carry: T9 both path keys', pathOk(carry))

// determinism
ok('deterministic (same contact → same effect)', JSON.stringify(synthesizeEffect('push', contact)) === JSON.stringify(push))

console.log(`\n${fail === 0 ? 'PASSED' : 'FAILED'}: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
