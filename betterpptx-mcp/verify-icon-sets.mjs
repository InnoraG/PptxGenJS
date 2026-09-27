// Verify the multi-icon-set expansion (Tabler + Iconoir + Phosphor alongside Lucide).
// Provisions the three MIT sets (idempotent — only fetches what's missing), then proves the
// engine resolves + themes them through the REAL public json-spec interface (generate_from_spec).
// Run:  node betterpptx-mcp/verify-icon-sets.mjs   (Windows node → bsdtar handles drive paths.)
import path from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fetchIconSet, libraryRoot } from '../tools/betterpptx-mcp-fetch-online-assets.mjs'

// Assets resolve from BETTERPPTX_ASSETS_ROOT (else cwd). Pin it to the repo root so the engine
// finds demos/betterpptx-online-assets/... no matter where this script is launched from. MUST be
// set before importing engine.mjs (ASSETS_ROOT is read once at module load).
process.env.BETTERPPTX_ASSETS_ROOT = path.resolve(libraryRoot, '..', '..')

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}`) } else { fail++; console.error(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }

const SETS = [
	{ pkg: '@tabler/icons', source: 'tabler', sourceLabel: 'Tabler Icons (outline)', styleSubdir: 'icons/outline', license: 'MIT', homepageFallback: 'https://tabler.io/icons', min: 2000 },
	{ pkg: 'iconoir', source: 'iconoir', sourceLabel: 'Iconoir (regular)', styleSubdir: 'icons/regular', license: 'MIT', homepageFallback: 'https://iconoir.com', min: 1000 },
	{ pkg: '@phosphor-icons/core', source: 'phosphor', sourceLabel: 'Phosphor Icons (regular)', styleSubdir: 'assets/regular', license: 'MIT', homepageFallback: 'https://phosphoricons.com', min: 1000 },
]
const namesOf = dir => existsSync(dir) ? readdirSync(dir).filter(f => /\.svg$/i.test(f)).map(f => f.replace(/\.svg$/i, '')) : []

console.log('PROVISION (idempotent — fetch only what is missing):')
const dirs = {}, nameSets = {}
for (const s of SETS) {
	const dir = path.join(libraryRoot, 'icons', s.source)
	dirs[s.source] = dir
	let names = namesOf(dir)
	if (names.length < s.min) { await fetchIconSet(s); names = namesOf(dir) }
	nameSets[s.source] = new Set(names)
	ok(`${s.source}: >= ${s.min} SVGs on disk`, names.length >= s.min, `${names.length}`)
}

// Recolor concern: Phosphor is FILL-based (fill="currentColor"), the others STROKE-based. The
// resolver themes by replacing `currentColor`, so EVERY set's SVGs must carry that token.
console.log('\nRECOLOR TOKEN (currentColor present so theming works for fill + stroke sets):')
for (const s of SETS) {
	const sample = [...nameSets[s.source]].slice(0, 25)
	let hits = 0
	for (const name of sample) { if (/currentColor/i.test(await readFile(path.join(dirs[s.source], `${name}.svg`), 'utf8'))) hits++ }
	ok(`${s.source}: ${hits}/${sample.length} sampled SVGs use currentColor`, hits === sample.length, `${hits}/${sample.length}`)
}

console.log('\nRESOLVER E2E (real json-spec interface, generate_from_spec phase:commit):')
const { callBetterPptxTool } = await import('./engine.mjs')

// Pick glyphs that exist in a NEW set but NOT in Lucide — resolving them proves the resolver
// reaches past the old hardcoded Lucide dir (not just re-finding a Lucide glyph by coincidence).
const lucideNames = new Set(namesOf(path.join(libraryRoot, 'icons', 'lucide')))
const uniqueTo = (source, prefer) => [...nameSets[source]].find(n => !lucideNames.has(n) && prefer(n)) || [...nameSets[source]].find(n => !lucideNames.has(n))
const tablerOnly = uniqueTo('tabler', n => n.startsWith('brand-'))
const iconoirOnly = uniqueTo('iconoir', () => true)
const phosphorOnly = uniqueTo('phosphor', n => n.endsWith('-logo'))
console.log(`  (probes — tabler:"${tablerOnly}" iconoir:"${iconoirOnly}" phosphor:"${phosphorOnly}")`)

async function resolves(iconRef) {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'icon-verify', audience: 'verify', objective: 'Verify multi-set icon resolution.',
		styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
		theme: { name: 'Verify', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
		slides: [{
			id: 's1', title: 'Icons', role: 'opener', message: 'Icons', layoutIntent: 'title-body',
			content: [{ kind: 'title', name: 't', text: 'Icons' }, { kind: 'icon', name: 'ic', icon: iconRef, bbox: { x: 1, y: 3, w: 1.4, h: 1.4 } }], notes: 'i',
		}],
	}
	const res = await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' })
	const deckId = res?.data?.deckId || res?.deckId
	if (deckId) { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {} }
	return { okFlag: res?.ok === true, err: res?.error?.message || '' }
}

for (const [label, ref] of [
	['tabler bare-name (cross-set exact match)', tablerOnly],
	['iconoir bare-name', iconoirOnly],
	['phosphor set/name (fill-based recolor)', `phosphor/${phosphorOnly}`],
]) {
	const r = await resolves(ref)
	ok(`resolves ${label}: "${ref}"`, r.okFlag, r.err.slice(0, 140))
}
// Control: a glyph in NO set must NOT resolve — guards against false-positive matching.
const ctrl = await resolves('zzzz-not-an-icon-zzzz')
ok('control: nonexistent glyph correctly rejected', ctrl.okFlag === false && /could not resolve/i.test(ctrl.err), ctrl.err.slice(0, 140))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
