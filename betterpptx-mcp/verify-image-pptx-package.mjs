// IMG9 package/embedding contract. Uses an owned synthetic raster fixture only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { createMcpToolDispatcher } from './engine.mjs'

// This is a maintainer-local package fixture; public clients still remain black-box.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
const resultData = (label, result) => { if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`); return result.data || result }

const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'IMG9 package fixture', audience: 'verifier', objective: 'accessible image',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
	contentStory: { audience: 'verifier', outcome: 'produce an accessible image package', remember: 'the visual remains editable and accessible' },
	visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and image hierarchy' },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
	theme: { name: 'Fixture', palette: ['0B1220', '2563EB', '14B8A6'], fontFace: 'Aptos' },
	sections: [{ id: 's', title: 'Fixture', slideIds: ['slide-1'] }],
	slides: [{ id: 'slide-1', title: 'Accessible visual', role: 'opener', message: 'A controlled visual', layoutIntent: 'title-body', notes: 'owned synthetic package fixture', content: [
		{ kind: 'title', name: 'slide-title', text: 'Accessible visual', altText: 'Accessible visual' },
		{ kind: 'image', name: 'generated-visual-fixture', image: `data:image/png;base64,${base64}`, region: 'body', altText: 'Illustration for an accessible visual: controlled synthetic fixture' },
	] }],
}

const context = { sessionId: `verify-img-pptx-${Date.now()}` }
const dispatcher = createMcpToolDispatcher(context)
const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)
const generated = resultData('generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' }, context))
const accessibility = resultData('validate_accessibility', await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId: generated.deckId }, context))
const validation = resultData('validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: generated.deckId }, context))
const quality = resultData('validate_quality', await callBetterPptxTool('betterpptx.deck.validate_quality', { deckId: generated.deckId }, context))
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-img-pptx-contract-'))
const saved = resultData('save', await callBetterPptxTool('betterpptx.deck.save', { deckId: generated.deckId, fileName: 'img9-fixture.pptx', outputDir }, context))
const pptxPath = path.join(outputDir, 'img9-fixture.pptx')
const bytes = fs.readFileSync(pptxPath)
const zip = await JSZip.loadAsync(bytes)
const names = Object.keys(zip.files)
const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string') || ''
const contentTypes = await zip.file('[Content_Types].xml')?.async('string') || ''
const relTargets = [...relsXml.matchAll(/Target="([^"]+)"/g)].map(match => match[1]).filter(target => !target.startsWith('http'))
const relTargetsExist = relTargets.every(target => {
	const normalized = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join('ppt/slides', target))
	return names.includes(normalized)
})
ok('generated-style raster is embedded in PPTX media', names.some(name => /^ppt\/media\/image(?:-\d+)+\.(png|jpg|jpeg|webp)$/i.test(name)))
ok('image content type is declared', /image\/png/.test(contentTypes))
ok('alt text is serialized into slide XML', /descr="[^"]*accessible visual[^"]*"/i.test(slideXml))
ok('image relationship target exists', relTargetsExist && /media\/image(?:-\d+)+\.(png|jpg|jpeg|webp)/i.test(relsXml))
ok('package validation passes', validation.valid === true && validation.issueCount === 0)
ok('accessibility validation passes', accessibility.passed === true && accessibility.score === 100)
ok('saved artifact is a ZIP/PPTX', bytes.slice(0, 2).toString('hex') === '504b' && names.includes('ppt/presentation.xml'))
ok('raw GLB/FBX export is absent', !names.some(name => /\.(glb|fbx)$/i.test(name)))
try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: generated.deckId }, context) } catch {}
try { fs.rmSync(outputDir, { recursive: true, force: true }) } catch {}
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
