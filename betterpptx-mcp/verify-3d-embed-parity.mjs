// PARITY GUARD — the 3D playScene clip selector must stay `embedded{animId+1}` across EVERY build artifact.
//
// Why this exists: the playScene animation selects which embedded glTF clip PowerPoint plays via the attrName
// channel `embedded{animId+1}` (0-based animId -> 1-based channel). The source template carries a `{{EMB}}`
// placeholder that the builder substitutes per-animId. On 2026-07-08 the SOURCE fix shipped but the committed
// `dist/node` build stayed stale (template hardcoded `embedded1`, builder never substituted) — so any consumer
// of the per-module node build would have had EVERY animId silently collapse to clip 0, quietly killing
// multi-clip presenters. The MCP engine loads the ES bundle (which was current), so the product path was fine,
// but the drift was invisible. This guard makes that drift a LOUD failure: it proves the selector stays dynamic
// (placeholder + per-animId substitution, never a hardcoded channel) in source, dist/node, AND the ES bundle.
//
// Run: `node betterpptx-mcp/verify-3d-embed-parity.mjs`  (exit 0 = parity holds, nonzero = drift).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
function ok(msg) { passed++; console.log('  ok   ' + msg) }
function bad(msg) { failed++; console.log('  FAIL ' + msg) }
function skip(msg) { console.log('  skip ' + msg) }
function check(cond, msg) { cond ? ok(msg) : bad(msg) }

const REGRESSION = '<p:attrName>embedded1</p:attrName>'   // the exact hardcoded form that must never ship
const PLACEHOLDER = '<p:attrName>{{EMB}}</p:attrName>'    // the dynamic selector, placeholder in position
const SUBST = 'embedded${animId + 1}'                     // the per-animId substitution expression
const JOIN = "split('{{EMB}}')"                           // ...bound to the {{EMB}} placeholder

function readIf(rel) {
	const p = path.join(ROOT, rel)
	return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

// ---- 1) STRUCTURAL: no artifact hardcodes the selector; each carries the dynamic form in position ------
console.log('STRUCTURAL (source + dist/node + bundle):')
const ARTIFACTS = [
	{ label: 'source template', file: 'src/animations-builders/data3DAnimationTemplates.ts', wants: [PLACEHOLDER] },
	{ label: 'source builder', file: 'src/animations-builders/build3DModelAnimation.ts', wants: [JOIN, SUBST] },
	{ label: 'dist/node template', file: 'dist/node/animations-builders/data3DAnimationTemplates.js', wants: [PLACEHOLDER] },
	{ label: 'dist/node builder', file: 'dist/node/animations-builders/build3DModelAnimation.js', wants: [JOIN, SUBST] },
	{ label: 'ES bundle (engine runtime)', file: 'dist/pptxgen.es.js', wants: [PLACEHOLDER, SUBST] },
]
for (const a of ARTIFACTS) {
	const text = readIf(a.file)
	if (text === null) { bad(`${a.label}: MISSING (${a.file}) — rebuild dist (npx gulp nodeTools)`); continue }
	check(!text.includes(REGRESSION), `${a.label}: no hardcoded ${REGRESSION}`)
	for (const w of a.wants) check(text.includes(w), `${a.label}: carries ${w}`)
}

// ---- 2) BEHAVIORAL (template + documented formula): the REAL shipped template, substituted per animId ---
// Extract the actual playScene behaviors template from each data artifact and apply the exact substitution the
// builder documents (`.split('{{EMB}}').join('embedded'+(animId+1))`). Proves the placeholder is in the selector
// position AND the formula yields the right channel — without needing to import compiled modules.
console.log('BEHAVIORAL (real template + substitution formula):')
function extractPlaySceneTemplate(jsOrTs) {
	// grab every `behaviors: "..."` literal; return the one holding the {{EMB}} selector, unescaped.
	const re = /behaviors:\s*"((?:[^"\\]|\\.)*)"/g
	let m
	while ((m = re.exec(jsOrTs)) !== null) {
		if (m[1].includes('{{EMB}}')) return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
	}
	return null
}
for (const [label, file] of [
	['source', 'src/animations-builders/data3DAnimationTemplates.ts'],
	['dist/node', 'dist/node/animations-builders/data3DAnimationTemplates.js'],
]) {
	const text = readIf(file)
	const tpl = text && extractPlaySceneTemplate(text)
	if (!tpl) { bad(`${label}: could not extract playScene behaviors template`); continue }
	for (const animId of [0, 1, 2]) {
		const filled = tpl.split('{{EMB}}').join('embedded' + (animId + 1))
		check(filled.includes(`<p:attrName>embedded${animId + 1}</p:attrName>`), `${label}: animId ${animId} -> embedded${animId + 1}`)
		check(!filled.includes('{{EMB}}'), `${label}: animId ${animId} fully substituted`)
	}
}

// ---- 3) BEHAVIORAL (compiled module) — OPPORTUNISTIC: drive the real dist/node builder if importable --------
// tsc emits extensionless ESM imports, which native Node import() may refuse; when so, SKIP (structural + formula
// above already prove parity) rather than false-fail.
console.log('BEHAVIORAL (dist/node compiled builder, opportunistic):')
try {
	const mod = await import('../dist/node/animations-builders/build3DModelAnimation.js')
	const build = mod.buildPlaySceneAnimation
	if (typeof build !== 'function') { bad('dist/node exports buildPlaySceneAnimation'); }
	else {
		const ctxFor = (animId) => ({
			shapeId: 5,
			animation: { trigger: 'withPrevious', duration: 2000, animId },
			config: { defaultDuration: 2000 },
			ids: { main: 10, set: 11 },
			type: 'motion',
			nodeType: 'withEffect',
		})
		for (const animId of [0, 1, 2]) {
			const xml = build(ctxFor(animId))
			check(xml.includes(`<p:attrName>embedded${animId + 1}</p:attrName>`), `compiled: animId ${animId} -> embedded${animId + 1}`)
			const others = [1, 2, 3].filter((n) => n !== animId + 1)
			check(!others.some((n) => xml.includes(`<p:attrName>embedded${n}</p:attrName>`)), `compiled: animId ${animId} -> ONLY embedded${animId + 1}`)
		}
	}
} catch (err) {
	skip('compiled dist/node import unavailable (extensionless-ESM tsc emit) — structural + formula checks cover parity. ' + (err && err.code || ''))
}

console.log('')
console.log(failed === 0
	? `PARITY OK: ${passed} checks passed — embedded{animId+1} preserved in source, dist/node, and the bundle`
	: `PARITY DRIFT: ${failed} failed / ${passed} passed — rebuild dist (npx gulp nodeTools) and re-check`)
process.exit(failed === 0 ? 0 : 1)
