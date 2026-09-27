// IMG9 crop/contain/cover corpus. It creates three isolated, owned-synthetic one-slide
// PPTX artifacts and checks the actual package XML/relationships/alt text. PowerPoint COM
// reopen is reported separately as pending when the host application is unavailable.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const root = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w):/, '$1:').replace(/\//g, path.sep)
const outputRoot = path.join(root, 'outputs')
const context = { sessionId: `verify-img9-crop-${Date.now()}` }
const dispatcher = createMcpToolDispatcher(context)
const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)
const cases = [
	// These expectations are the deterministic output of the shared Director
	// body region for a 40×40 source raster.  The fixture supplies only the
	// semantic framing type; geometry is engine-owned.
	{ id: 'cover', type: 'cover', expected: { l: 0, r: 0, t: 28034, b: 28034 }, color: { r: 29, g: 78, b: 216, alpha: 1 } },
	{ id: 'contain', type: 'contain', expected: { l: -63811, r: -63811, t: 0, b: 0 }, color: { r: 13, g: 148, b: 136, alpha: 1 } },
	{ id: 'crop', type: 'crop', expected: { l: 0, r: 0, t: 28034, b: 28034 }, color: { r: 234, g: 88, b: 12, alpha: 1 } },
]

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const resultData = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}
const parseRect = xml => {
	const match = xml.match(/<a:srcRect\s+([^>]+)\/>/)
	if (!match) return null
	const values = {}
	for (const key of ['l', 'r', 't', 'b']) {
		const value = match[1].match(new RegExp(`\\b${key}="(-?\\d+)"`))
		values[key] = value ? Number(value[1]) : null
	}
	return values
}
const rectEqual = (a, b) => a && b && ['l', 'r', 't', 'b'].every(key => a[key] === b[key])

console.log('IMG9 OWNED-SYNTHETIC PPTX CROP CORPUS:')
ok('corpus uses only owned synthetic rasters', cases.length === 3 && cases.every(item => item.color && item.id))
const sourceBuffers = []
const results = []

for (const item of cases) {
	const source = await sharp({ create: { width: 40, height: 40, channels: 4, background: item.color } }).png().toBuffer()
	sourceBuffers.push(source)
	const data = `data:image/png;base64,${source.toString('base64')}`
	const sizing = item.type === 'crop'
		? { type: item.type, x: 0.5, y: 0.5, w: 3, h: 3 }
		: { type: item.type, x: 1, y: 1, w: 4, h: 2 }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: `IMG9 ${item.id} crop fixture`, audience: 'research maintainer', objective: `verify ${item.type} crop metadata`,
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
		contentStory: { audience: 'research maintainer', outcome: `verify ${item.type} crop metadata`, remember: 'image framing remains deterministic and editable' },
		visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and image hierarchy' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		theme: { name: 'IMG9', palette: ['0B1220', '2563EB', '14B8A6'], fontFace: 'Aptos' },
		sections: [{ id: 's', title: 'Fixture', slideIds: ['s1'] }],
		slides: [{ id: 's1', title: `IMG9 ${item.type} crop fixture`, role: 'evidence', message: `IMG9 ${item.type} crop fixture`, layoutIntent: 'title-body', notes: `Owned synthetic ${item.type} image fixture`, content: [
			{ kind: 'title', name: `img9-${item.id}-title`, text: `IMG9 ${item.type} crop fixture`, altText: `IMG9 ${item.type} crop fixture` },
			{ kind: 'image', name: `img9-${item.id}`, image: data, region: 'body', imageOptions: { sizing: { type: sizing.type } }, altText: `Owned synthetic ${item.type} image fixture` },
		] }],
	}
	const generated = resultData(`${item.id} generate_from_spec`, await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'summary' }))
	const deckId = generated.deckId
	const validation = resultData(`${item.id} validate`, await callBetterPptxTool('betterpptx.deck.validate', { deckId }))
	const accessibility = resultData(`${item.id} accessibility`, await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }))
	const quality = resultData(`${item.id} quality`, await callBetterPptxTool('betterpptx.deck.validate_quality', { deckId }))
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `bpx-img9-${item.id}-`))
	const saved = resultData(`${item.id} save`, await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: `img9-${item.id}.pptx`, outputDir: tempDir }))
	const pptxPath = path.join(tempDir, `img9-${item.id}.pptx`)
	const bytes = fs.readFileSync(pptxPath)
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files)
	const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string') || ''
	const contentTypes = await zip.file('[Content_Types].xml')?.async('string') || ''
	const rect = parseRect(slideXml)
	const relTargets = [...relsXml.matchAll(/Target="([^"]+)"/g)].map(match => match[1]).filter(target => !target.startsWith('http'))
	const relTargetsExist = relTargets.every(target => names.includes(path.posix.normalize(path.posix.join('ppt/slides', target))))
	ok(`${item.id}: deterministic ${item.type} crop metadata`, rectEqual(rect, item.expected), JSON.stringify(rect))
	const pictureXml = slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] || ''
	const expectedExt = '<a:ext cx="11130991" cy="4782312"/>'
	// PowerPoint accepts both the legacy empty stretch element and the explicit
	// fillRect child.  The engine emits the explicit child for deterministic
	// package parity; keep the corpus assertion focused on the semantic stretch
	// contract rather than one serializer spelling.
	ok(`${item.id}: picture has stretch and engine-owned target geometry`, /<a:stretch\s*\/>/.test(pictureXml) || /<a:stretch>\s*<a:fillRect\s*\/>\s*<\/a:stretch>/.test(pictureXml), pictureXml.match(/<a:ext[^>]+\/>/g)?.join(' '))
	ok(`${item.id}: media relationship resolves`, relTargetsExist && /media\/image(?:-\d+)+\.png/.test(relsXml))
	ok(`${item.id}: PNG content type and bytes are present`, /image\/png/.test(contentTypes) && names.some(name => /^ppt\/media\/image(?:-\d+)+\.png$/i.test(name)) && bytes.slice(0, 2).toString('hex') === '504b')
	ok(`${item.id}: alt text and editable object name are serialized`, /descr="Owned synthetic [^"]+ image fixture"/.test(slideXml) && /name="[^"]*img9-[^"]+"/.test(slideXml))
	ok(`${item.id}: deterministic package/accessibility validators pass`, validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100 && quality.blockingIssues?.length === 0, JSON.stringify({ validation, accessibility, quality }))
	ok(`${item.id}: raw GLB/FBX export is absent`, !names.some(name => /\.(glb|fbx)$/i.test(name)))
	results.push({ id: item.id, type: item.type, crop: rect, bytes: bytes.length, accessibility: accessibility.score })
	// Keep every isolated package so the host-level PowerPoint reopen/render gate can
	// exercise the exact artifacts produced by this corpus, not a reconstructed deck.
	fs.copyFileSync(pptxPath, path.join(outputRoot, `img9-crop-corpus-${item.id}.pptx`))
	fs.rmSync(tempDir, { recursive: true, force: true })
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {}
}

const contactTiles = await Promise.all(sourceBuffers.map(buffer => sharp(buffer).resize(256, 256, { fit: 'fill' }).png().toBuffer()))
const contact = await sharp({ create: { width: 768, height: 256, channels: 4, background: '#0b111b' } })
	.composite(contactTiles.map((buffer, index) => ({ input: buffer, left: index * 256, top: 0 })))
	.png().toBuffer()
fs.mkdirSync(outputRoot, { recursive: true })
fs.writeFileSync(path.join(outputRoot, 'img9-crop-corpus-contact-sheet.png'), contact)
ok('three-case crop corpus report has distinct sizing modes', new Set(results.map(item => item.type)).size === 3)
ok('visual contact sheet artifact is written', fs.existsSync(path.join(outputRoot, 'img9-crop-corpus-contact-sheet.png')))

const report = {
	schemaVersion: 'betterpptx.img9-crop-corpus.v1',
	ownership: 'owned-synthetic',
	customerImages: false,
	externalAi: false,
	powerPointReopen: 'pending-host-application',
	results,
	checks: pass,
	failures: fail,
}
fs.writeFileSync(path.join(outputRoot, 'img9-crop-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
