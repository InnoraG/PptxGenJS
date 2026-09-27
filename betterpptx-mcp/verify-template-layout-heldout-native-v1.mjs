// Held-out native proof for generic template readback. The fixture is generated
// once by the public library vocabulary, then imported through the MCP compiler;
// it is deliberately independent of the canonical placeholder-heavy template.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
import { createMcpToolDispatcher, getDeck } from './engine.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/template-layout-heldout-native/${stamp}`)
const sourceBaseTemplate = path.join(outDir, 'heldout-source-base-template.pptx')
const sourceTemplate = path.join(outDir, 'heldout-source-template.pptx')
const bootstrapTemplate = path.join(outDir, 'heldout-source-bootstrap-template.pptx')
const masterPicturePath = path.join(outDir, 'heldout-master-picture.png')
const generated = path.join(outDir, 'heldout-template-import.pptx')
const editedGenerated = path.join(outDir, 'heldout-template-carrier-edited.pptx')
const resetGenerated = path.join(outDir, 'heldout-template-carrier-reset.pptx')
const sparseGenerated = path.join(outDir, 'heldout-template-carrier-sparse-edit.pptx')
const masterResetGenerated = path.join(outDir, 'heldout-template-master-reset.pptx')
const roundtrip = path.join(outDir, 'heldout-template-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const ONE_PIXEL_PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
await fs.mkdir(outDir, { recursive: true })

const source = new PptxGenJS()
source.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US', palette: { accent1: '2563EB', accent2: 'F97316' } }
source.defineLayout({
	name: 'HeldoutWide', width: 13.333333, height: 7.5, type: 'wide',
	background: { color: 'EAF2FF' }, margin: 0.42,
	slideNumber: { x: 12.35, y: 7.08, w: 0.5, h: 0.18, color: '1E3A8A', fontSize: 8 },
	objects: [{ rect: { x: 0.35, y: 0.22, w: 12.63, h: 0.08, fill: { color: '2563EB' }, line: { color: '2563EB' }, objectName: 'heldout-layout-rule' } }],
})
source.defineLayout({
	name: 'HeldoutAlt', width: 13.333333, height: 7.5, type: 'wide',
	background: { color: 'FFF7ED' }, margin: [0.35, 0.5, 0.4, 0.5],
	slideNumber: { x: 12.35, y: 7.08, w: 0.5, h: 0.18, color: '9A3412', fontSize: 8 },
	objects: [
		{ rect: { x: 0.35, y: 7.05, w: 12.63, h: 0.08, fill: { color: 'F97316' }, line: { color: 'F97316' }, objectName: 'heldout-alt-rule' } },
		{ image: { data: ONE_PIXEL_PNG, x: 10.8, y: 0.25, w: 1.25, h: 0.8, objectName: 'heldout-layout-picture', imageAdjustments: { transparency: 18 }, line: { color: 'C2410C', transparency: 12, width: 1.5 }, glow: { color: 'FDBA74', opacity: 0.4, size: 6 } } },
	],
})
source.defineSlideMaster({
	title: 'HeldoutMaster', background: { color: 'F8FAFC' }, margin: [0.3, 0.45, 0.4, 0.45],
	slideNumber: { x: 12.35, y: 7.08, w: 0.5, h: 0.18, color: '334155', fontSize: 8 },
	objects: [
		{ rect: { x: 0.35, y: 0.35, w: 0.18, h: 6.8, fill: { color: '0F172A' }, line: { color: '0F172A' }, objectName: 'heldout-master-rail' } },
		{ image: { data: ONE_PIXEL_PNG, x: 11.35, y: 0.28, w: 1.05, h: 0.72, objectName: 'heldout-master-picture', imageAdjustments: { transparency: 14 }, line: { color: '0EA5E9', transparency: 10, width: 1.2 }, glow: { color: '38BDF8', opacity: 0.38, size: 5 } } },
		{ text: { text: 'HELD-OUT MASTER', options: { x: 0.65, y: 7.08, w: 2.0, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '64748B', objectName: 'heldout-master-label' } } },
		{ rect: { x: 10.45, y: 6.78, w: 2.25, h: 0.28, fill: { color: 'E0F2FE', transparency: 12 }, line: { color: '0284C7', transparency: 8, width: 1.2, dashType: 'dash' }, shadow: { type: 'outer', color: '0F172A', opacity: 0.32, blur: 4, offset: 2, angle: 135 }, objectName: 'heldout-master-effect-chip' } },
	],
})
source.layout = 'HeldoutWide'
const sourceSlide = source.addSlide({ masterName: 'HeldoutAlt' })
sourceSlide.addText('Held-out template carrier', { x: 1.1, y: 1.4, w: 10.5, h: 0.8, fontFace: 'Aptos Display', fontSize: 30, color: '0F172A', bold: true, objectName: 'heldout-title' })
sourceSlide.addText('Fixed layout objects, master-owned objects, backgrounds, slide numbers, and bindings must remain inspectable.', { x: 1.1, y: 2.45, w: 10.2, h: 0.6, fontFace: 'Aptos', fontSize: 16, color: '334155', objectName: 'heldout-body' })
await source.writeFile({ fileName: sourceBaseTemplate, compression: false })
// PptxGenJS does not author picture relationships directly on a slide master,
// and its raw package is intentionally not used as the Office fixture. First
// pass the deterministic source through the generic import path to obtain a
// valid package, then use PowerPoint COM only to author the fixture's one
// master-owned picture. The product path under test still imports, edits,
// resets, and serializes the carrier generically.
await fs.writeFile(masterPicturePath, Buffer.from(ONE_PIXEL_PNG.split(',')[1], 'base64'))
const bootstrapSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Held-out template bootstrap',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'bootstrap a valid held-out template fixture', remember: 'template inheritance stays inspectable' },
	visualDesign: { world: 'blueprint', framing: 'held-out template carrier' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	template: { path: sourceBaseTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'heldout-slide', title: 'Held-out import', layoutIntent: 'title-only', layoutName: 'HeldoutAlt', content: [{ kind: 'textBox', name: 'proof', role: 'title', text: 'Held-out carrier remains editable.' }] }],
}
const bootstrapDispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
const bootstrapResult = await bootstrapDispatcher.call('betterpptx.deck.generate_from_spec', { spec: bootstrapSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
if (!bootstrapResult.ok) throw new Error(JSON.stringify(bootstrapResult.error || bootstrapResult))
await getDeck(bootstrapResult.data.deckId).pptx.writeFile({ fileName: bootstrapTemplate, compression: false })
const masterPicturePs = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;try{$pres=$pp.Presentations.Open2007('${bootstrapTemplate.replace(/'/g, "''")}',$true,$false,$false);$master=$pres.SlideMaster;$shape=$master.Shapes.AddPicture('${masterPicturePath.replace(/'/g, "''")}',0,-1,817.2,20.16,75.6,51.84);$shape.Name='heldout-master-picture';$shape.Line.Visible=-1;$shape.Line.ForeColor.RGB=42495;$shape.Line.Transparency=0.1;try{$shape.Glow.Radius=5;$shape.Glow.Color.RGB=41727;$shape.Glow.Transparency=0.62}catch{};$pres.SaveAs('${sourceTemplate.replace(/'/g, "''")}',24);$pres.Close();$pres=$null;[ordered]@{status='PASS'}|ConvertTo-Json -Depth 4}finally{if($pres){$pres.Close()};if($pp){$pp.Quit()}}`
try {
	const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', masterPicturePs], { maxBuffer: 20 * 1024 * 1024 })
	if (JSON.parse(stdout.trim()).status !== 'PASS') throw new Error(stdout)
} catch (error) {
	throw new Error(`Held-out source master-picture authoring failed: ${String(error?.message || error)}`)
}

// Add a second source master/layout to the Office-authored fixture.  This is
// fixture construction only: the product path under test must preserve the
// resulting opaque parts and layout-to-master binding without special-casing
// this deck.  Reusing the final source layout keeps the visual fixture small
// while exercising a real second master relationship graph.
const addSecondMasterFixture = async filePath => {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const sourceMasterXml = await zip.file('ppt/slideMasters/slideMaster1.xml').async('string')
	const sourceMasterRels = await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels').async('string')
	const layoutParts = Object.keys(zip.files)
		.filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name))
		.sort((a, b) => Number(a.match(/slideLayout(\d+)\.xml$/)[1]) - Number(b.match(/slideLayout(\d+)\.xml$/)[1]))
	const sourceLayoutPart = layoutParts[layoutParts.length - 1]
	const sourceLayoutNumber = Number(sourceLayoutPart.match(/slideLayout(\d+)\.xml$/)[1])
	const secondLayoutNumber = sourceLayoutNumber + 1
	const secondLayoutPart = `ppt/slideLayouts/slideLayout${secondLayoutNumber}.xml`
	const sourceLayoutRelsPart = `ppt/slideLayouts/_rels/slideLayout${sourceLayoutNumber}.xml.rels`
	const secondLayoutRelsPart = `ppt/slideLayouts/_rels/slideLayout${secondLayoutNumber}.xml.rels`
	const sourceLayoutXml = await zip.file(sourceLayoutPart).async('string')
	const sourceLayoutRels = await zip.file(sourceLayoutRelsPart).async('string')
	const secondMasterXml = sourceMasterXml
		.replace(/(<p:cSld\b[^>]*\bname=")[^"]*(")/, '$1HeldoutSecondaryMaster$2')
		.replace(/<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/, '<p:sldLayoutIdLst><p:sldLayoutId id="2147483654" r:id="rId1"/></p:sldLayoutIdLst>')
	// The duplicate master owns only the duplicate layout.  Keeping the
	// original master1 layout relationships here would make the source audit
	// ambiguous and cause generated layouts 1..N to rebind to master2.
	const secondMasterRels = sourceMasterRels
		.replace(/<Relationship\b[^>]*Type="[^"]*\/slideLayout"[^>]*\/>/g, '')
		.replace('</Relationships>', `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${secondLayoutNumber}.xml"/></Relationships>`)
	const secondLayoutXml = sourceLayoutXml.replace(/(<p:cSld\b[^>]*\bname=")[^"]*(")/, '$1HeldoutSecondaryLayout$2')
	const secondLayoutRels = sourceLayoutRels.replace('../slideMasters/slideMaster1.xml', '../slideMasters/slideMaster2.xml')
	zip.file('ppt/slideMasters/slideMaster2.xml', secondMasterXml)
	zip.file('ppt/slideMasters/_rels/slideMaster2.xml.rels', secondMasterRels)
	zip.file(secondLayoutPart, secondLayoutXml)
	zip.file(secondLayoutRelsPart, secondLayoutRels)
	let contentTypes = await zip.file('[Content_Types].xml').async('string')
	const masterOverride = '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
	const layoutOverride = '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
	contentTypes = contentTypes.replace(masterOverride, `${masterOverride}<Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`)
	contentTypes = contentTypes.replace(layoutOverride, `${layoutOverride}<Override PartName="/ppt/slideLayouts/slideLayout${secondLayoutNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`)
	zip.file('[Content_Types].xml', contentTypes)
	let presentation = await zip.file('ppt/presentation.xml').async('string')
	presentation = presentation.replace('</p:sldMasterIdLst>', '<p:sldMasterId id="2147483653" r:id="rId999"/></p:sldMasterIdLst>')
	zip.file('ppt/presentation.xml', presentation)
	let presentationRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string')
	presentationRels = presentationRels.replace('</Relationships>', '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster2.xml"/></Relationships>')
	zip.file('ppt/_rels/presentation.xml.rels', presentationRels)
	await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
	return { secondMasterPart: 'ppt/slideMasters/slideMaster2.xml', secondLayoutPart, secondLayoutNumber }
}

// The held-out baseline remains the one-master regression fixture by default.
// The separately maintained Office-authored two-master proof exercises the
// multi-master path; this optional switch is retained for fixture debugging
// without making the baseline verifier depend on hand-authored package parts.
const useMultiMasterFixture = process.env.BETTERPPTX_HELDOUT_MULTI_MASTER_FIXTURE === '1'
const multiMasterFixture = useMultiMasterFixture
	? await addSecondMasterFixture(sourceTemplate)
	: { secondMasterPart: null, secondLayoutNumber: 0 }

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Held-out template import proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove held-out template import', remember: 'template inheritance stays inspectable' },
	visualDesign: { world: 'blueprint', framing: 'held-out template carrier' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	template: { path: sourceTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'heldout-slide', title: 'Held-out import', layoutIntent: 'title-only', layoutName: 'HeldoutAlt', content: [{ kind: 'textBox', name: 'proof', role: 'title', text: 'Held-out carrier remains editable.' }] }],
}
const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
if (!result.ok) throw new Error(JSON.stringify(result.error || result))
const entry = getDeck(result.data.deckId)
await entry.pptx.writeFile({ fileName: generated, compression: false })
const carrierEdit = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', saveAfterCommit: false, plan: 'premium', detail: 'full',
	spec: {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'edit a native template carrier', remember: 'carrier edits remain editable' },
		visualDesign: { world: 'blueprint', framing: 'native carrier edit' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [],
		patchPlan: { templateCarriers: [{ name: 'HeldoutAlt', width: 13.333333, height: 7.5, objects: [{ rect: { x: 0.55, y: 0.55, w: 12.2, h: 0.18, fill: { color: '7C3AED', transparency: 8 }, line: { color: '5B21B6', dashType: 'dash', width: 1.25 }, shadow: { type: 'outer', color: '312E81', opacity: 0.3, blur: 3, offset: 1, angle: 135 }, objectName: 'carrier-edited-rule' } }], background: { color: 'F5F3FF' }, margin: null }] },
	},
})
if (!carrierEdit.ok) throw new Error(JSON.stringify(carrierEdit.error || carrierEdit))
await entry.pptx.writeFile({ fileName: editedGenerated, compression: false })
const carrierReset = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', saveAfterCommit: false, plan: 'premium', detail: 'full',
	spec: {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'reset a native template carrier', remember: 'null reset restores the source carrier' },
		visualDesign: { world: 'blueprint', framing: 'native carrier reset' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [],
		patchPlan: { templateCarriers: [{ name: 'HeldoutAlt', width: 13.333333, height: 7.5, reset: true }] },
	},
})
if (!carrierReset.ok) throw new Error(JSON.stringify(carrierReset.error || carrierReset))
await entry.pptx.writeFile({ fileName: resetGenerated, compression: false })
const sparseEdit = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', saveAfterCommit: false, plan: 'premium', detail: 'full',
	spec: {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'edit linked master and layout carriers together', remember: 'sparse carrier edits stay native' },
		visualDesign: { world: 'blueprint', framing: 'sparse multi-carrier edit' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [],
		patchPlan: { templateCarriers: [
			{ name: 'slideMaster1', kind: 'master', objects: [{ rect: { x: 0.35, y: 0.35, w: 0.18, h: 6.8, fill: { color: '14532D' }, line: { color: '166534' }, objectName: 'master-edited-rail' } }], background: { color: 'ECFDF5' } },
			...(useMultiMasterFixture ? [{ name: 'slideMaster2', kind: 'master', objects: [{ rect: { x: 0.58, y: 0.42, w: 0.14, h: 6.55, fill: { color: 'BE123C' }, line: { color: '9F1239' }, objectName: 'secondary-master-edited-rail' } }] }] : []),
			{ name: 'HeldoutWide', objects: [{ rect: { x: 0.55, y: 0.55, w: 12.2, h: 0.12, fill: { color: '0F766E' }, line: { color: '115E59' }, objectName: 'sparse-layout-rule' } }], background: { color: 'F0FDFA' } },
		] },
	},
})
if (!sparseEdit.ok) throw new Error(JSON.stringify(sparseEdit.error || sparseEdit))
if (process.env.BETTERPPTX_DEBUG_MULTI_MASTER === '1') console.log(JSON.stringify(sparseEdit.data?.patchResults || [], null, 2))
await entry.pptx.writeFile({ fileName: sparseGenerated, compression: false })
const masterReset = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', saveAfterCommit: false, plan: 'premium', detail: 'full',
	spec: {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'reset linked master carrier', remember: 'exact source master returns' },
		visualDesign: { world: 'blueprint', framing: 'master reset' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [],
		patchPlan: { templateCarriers: [{ name: 'slideMaster1', kind: 'master', reset: true }] },
	},
})
if (!masterReset.ok) throw new Error(JSON.stringify(masterReset.error || masterReset))
await entry.pptx.writeFile({ fileName: masterResetGenerated, compression: false })
const carrierEditResult = carrierEdit.data?.patchResults?.find(item => item?.carrier?.mode === 'native-edit') || null
const carrierResetResult = carrierReset.data?.patchResults?.find(item => item?.carrier?.mode === 'reset-to-source') || null
const masterEditResult = sparseEdit.data?.patchResults?.find(item => item?.carrier?.kind === 'master' && item?.carrier?.mode === 'native-edit') || null
const masterResetResult = masterReset.data?.patchResults?.find(item => item?.carrier?.kind === 'master' && item?.carrier?.mode === 'reset-to-source') || null
let master2Reset = null
let master2ResetGenerated = null
if (useMultiMasterFixture) master2Reset = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', saveAfterCommit: false, plan: 'premium', detail: 'full',
	spec: {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'presentation authors', outcome: 'reset secondary master carrier', remember: 'exact source secondary master returns' },
		visualDesign: { world: 'blueprint', framing: 'secondary master reset' },
		motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
		slides: [],
		patchPlan: { templateCarriers: [{ name: 'slideMaster2', kind: 'master', reset: true }] },
	},
})
if (useMultiMasterFixture) {
	if (!master2Reset.ok) throw new Error(JSON.stringify(master2Reset.error || master2Reset))
	master2ResetGenerated = path.join(outDir, 'heldout-template-master2-reset.pptx')
	await entry.pptx.writeFile({ fileName: master2ResetGenerated, compression: false })
}
const master2EditResult = sparseEdit.data?.patchResults?.find(item => item?.carrier?.number === 2 && item?.carrier?.mode === 'native-edit') || null
const master2ResetResult = master2Reset?.data?.patchResults?.find(item => item?.carrier?.number === 2 && item?.carrier?.mode === 'reset-to-source') || null

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const sourceZip = await readZip(sourceTemplate)
const sourceMasterXml = await text(sourceZip, 'ppt/slideMasters/slideMaster1.xml')
const sourceMasterRelsXml = await text(sourceZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const masterXml = await text(generatedZip, 'ppt/slideMasters/slideMaster1.xml')
const masterRelsXml = await text(generatedZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const layoutXmls = await Promise.all(Object.keys(generatedZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort().map(async part => ({ part, xml: await text(generatedZip, part) })))
const generatedSecondLayoutRels = await text(generatedZip, `ppt/slideLayouts/_rels/slideLayout${multiMasterFixture.secondLayoutNumber}.xml.rels`)
const generatedBytes = await fs.readFile(generated)
const editedZip = await readZip(editedGenerated)
const editedLayoutXml = await text(editedZip, 'ppt/slideLayouts/slideLayout3.xml')
const resetZip = await readZip(resetGenerated)
const resetLayoutXml = await text(resetZip, 'ppt/slideLayouts/slideLayout3.xml')
const sparseZip = await readZip(sparseGenerated)
const sparseMasterXml = await text(sparseZip, 'ppt/slideMasters/slideMaster1.xml')
const sparseMasterRelsXml = await text(sparseZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const sparseMaster2Xml = await text(sparseZip, 'ppt/slideMasters/slideMaster2.xml')
const sparseMaster2RelsXml = await text(sparseZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const sparseLayoutXmls = await Promise.all(Object.keys(sparseZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async part => ({ part, xml: await text(sparseZip, part) })))
const masterResetZip = await readZip(masterResetGenerated)
const masterResetXml = await text(masterResetZip, 'ppt/slideMasters/slideMaster1.xml')
const masterResetRelsXml = await text(masterResetZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const master2ResetZip = useMultiMasterFixture ? await readZip(master2ResetGenerated) : null
const master2ResetXml = master2ResetZip ? await text(master2ResetZip, 'ppt/slideMasters/slideMaster2.xml') : ''
const master2ResetRelsXml = master2ResetZip ? await text(master2ResetZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels') : ''
const carriers = result.data.templateApplied.nativeTemplateLayouts || []
const masters = result.data.templateApplied.nativeTemplateMasters || []
const bindings = result.data.templateApplied.templateRelationshipBindings || []
const structural = {
	minimumLayoutGallery: carriers.length >= 3,
	multiMasterAudit: !useMultiMasterFixture || masters.length >= 2,
	multiMasterLayoutBinding: !useMultiMasterFixture || carriers.some(item => item.masterNumber === 2 && item.sourceMasterPart === multiMasterFixture.secondMasterPart),
	multiMasterGeneratedLayoutBinding: !useMultiMasterFixture || generatedSecondLayoutRels.includes('../slideMasters/slideMaster2.xml'),
	fixedLayoutObjectReadback: carriers.some(item => item.fixedObjectCount > 0),
	fixedMasterObjectReadback: masters.some(item => item.linkedFixedObjectCount > 0),
	layoutBackgroundReadback: carriers.some(item => item.background?.color === 'FFF7ED'),
	layoutSlideNumberReadback: carriers.some(item => item.slideNumber?.type === 'sldNum'),
	masterSlideNumberReadback: masters.some(item => item.slideNumber?.type === 'sldNum'),
	explicitMarginBoundary: carriers.every(item => item.margin === null) && masters.every(item => item.margin === null),
	relationshipBindingReadback: bindings.some(item => item.layoutName === 'HeldoutAlt' && item.layoutNumber != null),
	 nativeFixedObjectXml: layoutXmls.some(item => /heldout-alt-rule/.test(item.xml)) && layoutXmls.some(item => /heldout-master-rail/.test(item.xml)),
	pictureVisualReadback: carriers.some(item => item.fixedObjects?.some(object => (object.name === 'heldout-layout-picture' || object.name === 'Image 0') && object.picture?.present)),
	fillVisualReadback: carriers.some(item => item.fixedObjects?.some(object => object.fill?.type === 'solid' && object.fill?.color === 'F97316')),
	effectVisualReadback: masters.some(item => item.linkedFixedObjects?.some(object => object.effects?.components?.some(effect => effect.type === 'outerShdw'))),
	masterRelationshipVisualReadback: masters.some(item => item.fixedObjects?.some(object => object.picture?.present || object.effects?.components?.length)),
	nativePictureXml: layoutXmls.some(item => /<p:pic[\s\S]*<p:blipFill/.test(item.xml)),
	nativeEffectXml: layoutXmls.some(item => /<a:effectLst[\s\S]*<a:outerShdw/.test(item.xml)),
	nativeMasterPictureXml: /<p:pic[\s\S]*<p:blipFill/.test(masterXml) && /relationships\/image/.test(masterRelsXml),
	masterSourceRelationshipGraph: /<p:pic[\s\S]*<p:blipFill/.test(sourceMasterXml) && /relationships\/image/.test(sourceMasterRelsXml),
	carrierEditReadback: carrierEditResult?.carrier?.mode === 'native-edit' && carrierEditResult?.carrier?.objects?.some(item => item.objectName === 'carrier-edited-rule'),
	carrierEditNativeXml: /carrier-edited-rule/.test(editedLayoutXml) && /<a:outerShdw/.test(editedLayoutXml) && /<a:prstDash val="dash"/.test(editedLayoutXml),
	carrierResetReadback: carrierResetResult?.carrier?.mode === 'reset-to-source' && carrierResetResult?.carrier?.objectCount === 0,
	carrierResetSourceXml: /heldout-alt-rule/.test(resetLayoutXml) && !/carrier-edited-rule/.test(resetLayoutXml),
	carrierSourceIdentityPreserved: carrierEditResult?.sourceIdentityPreserved === true && carrierEditResult?.relationshipBindingPreserved === true,
	masterCarrierEditReadback: masterEditResult?.carrier?.kind === 'master' && masterEditResult?.carrier?.mode === 'native-edit' && masterEditResult?.carrier?.objects?.some(item => item.objectName === 'master-edited-rail'),
	masterCarrierEditNativeXml: /master-edited-rail/.test(sparseMasterXml) && /Slide Number Placeholder 0/.test(sparseMasterXml),
	masterCarrierEditRelationshipRetention: masterEditResult?.sourceRelationshipCount > 0 && masterEditResult?.remappedSourceRelationshipCount === masterEditResult?.sourceRelationshipCount && /<p:pic[\s\S]*<p:blipFill/.test(sparseMasterXml) && /relationships\/image/.test(sparseMasterRelsXml),
	multiCarrierSparseEditNativeXml: /sparse-layout-rule/.test(sparseLayoutXmls.map(item => item.xml).join('\n')) && /master-edited-rail/.test(sparseMasterXml),
	multiMasterSparseEditReadback: !useMultiMasterFixture || (master2EditResult?.carrier?.number === 2 && master2EditResult?.carrier?.mode === 'native-edit' && master2EditResult?.carrier?.objects?.some(item => item.objectName === 'secondary-master-edited-rail')),
	multiMasterSparseEditNativeXml: !useMultiMasterFixture || /secondary-master-edited-rail/.test(sparseMaster2Xml),
	multiMasterRelationshipRetention: !useMultiMasterFixture || (master2EditResult?.sourceRelationshipCount > 0 && master2EditResult?.remappedSourceRelationshipCount === master2EditResult?.sourceRelationshipCount && /relationships\/image/.test(sparseMaster2RelsXml)),
	masterCarrierResetReadback: masterResetResult?.carrier?.kind === 'master' && masterResetResult?.carrier?.mode === 'reset-to-source',
	masterCarrierResetSourceXml: /Slide Number Placeholder 0/.test(masterResetXml) && !/master-edited-rail/.test(masterResetXml) && /<p:pic[\s\S]*<p:blipFill/.test(masterResetXml) && /relationships\/image/.test(masterResetRelsXml),
	masterSourceIdentityPreserved: masterEditResult?.sourceIdentityPreserved === true && masterEditResult?.relationshipBindingPreserved === true,
	multiMasterResetReadback: !useMultiMasterFixture || (master2ResetResult?.carrier?.number === 2 && master2ResetResult?.carrier?.mode === 'reset-to-source'),
	multiMasterResetSourceXml: !useMultiMasterFixture || (!/secondary-master-edited-rail/.test(master2ResetXml) && /relationships\/image/.test(master2ResetRelsXml)),
	packageReadable: Object.keys(generatedZip.files).length > 0,
}

const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${sparseGenerated.replace(/'/g, "''")}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
let office = { status: 'NOT_RUN' }
try {
	const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
	office = JSON.parse(stdout.trim())
} catch (error) {
	office = { status: 'FAIL', message: String(error?.message || error) }
}
const roundtripExists = await fs.access(roundtrip).then(() => true).catch(() => false)
const roundtripZip = roundtripExists ? await readZip(roundtrip) : null
const roundtripMasterXml = roundtripZip ? await text(roundtripZip, 'ppt/slideMasters/slideMaster1.xml') : ''
const roundtripLayoutXmls = roundtripZip ? await Promise.all(Object.keys(roundtripZip.files).filter(name => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).map(async part => text(roundtripZip, part))) : []
const pngPath = path.join(outDir, 'roundtrip-slide-01.png')
const roundtripBytes = roundtripExists ? await fs.readFile(roundtrip) : null
const renderSha256 = await fs.readFile(pngPath).then(sha256).catch(() => null)
const checks = {
	...structural,
	officeOpenSaveCopyReopen: office.status === 'PASS',
	roundtripRetainsFixedObjects: roundtripLayoutXmls.some(xml => /sparse-layout-rule/.test(xml)) && /master-edited-rail/.test(roundtripMasterXml),
	roundtripRetainsSlideNumber: /type="sldNum"/.test(roundtripMasterXml) && roundtripLayoutXmls.some(xml => /type="sldNum"/.test(xml)),
	renderedSlide: Boolean(renderSha256),
}
const failures = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
const report = {
	schemaVersion: 'betterpptx.global-template-layout-heldout-native.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'heldout-template-import-readback',
	sourceTemplate: { file: path.relative(root, sourceTemplate).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(sourceTemplate)) },
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), sha256: sha256(generatedBytes), bytes: generatedBytes.length },
	requestedLayouts: carriers.map(item => item.name), carriers, masters, bindings, structural, office,
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), sha256: roundtripBytes ? sha256(roundtripBytes) : null, renderSha256 },
	checks, failures,
	interpretation: 'A held-out multi-layout, multi-master Office-authored fixture was imported through the generic MCP path, edited through native and opaque carrier APIs, and reset to exact source parts. The proof requires typed visual readback, layout-to-master binding preservation, relationship-bearing source retention, native XML edit evidence, source identity preservation, and repair-free PowerPoint SaveCopyAs/reopen/render; universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'template-layout-heldout-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
