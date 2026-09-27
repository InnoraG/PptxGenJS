// Native proof for multi-layout template import/readback. The source template
// remains immutable; this script only writes a derived artifact under outputs.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createMcpToolDispatcher, getDeck } from './engine.mjs'

const run = promisify(execFile)
const root = path.resolve('.')
const sourceTemplate = path.resolve('outputs/authoring-principle-corpus/global-extended-option-five-point/theme-master-layout-native/20260825T193206Z/theme-master-layout-native.pptx')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/template-layout-import-native/${stamp}`)
const generated = path.join(outDir, 'template-layout-import-native.pptx')
const roundtrip = path.join(outDir, 'template-layout-import-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Template layout import proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove template import', remember: 'every layout remains editable' },
	visualDesign: { world: 'blueprint', framing: 'template import' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	layouts: [{ name: 'EditorialWide', width: 13.333333, height: 7.5, placeholders: [{ name: 'heroTitle', type: 'title', idx: 0, x: 0.7, y: 0.55, w: 12, h: 0.8 }] }],
	masters: [{ title: 'Editorial Master', placeholders: [{ name: 'heroTitle', type: 'title', idx: 1, x: 0.7, y: 0.55, w: 12, h: 0.8 }] }],
	layoutContract: { allowedLayouts: ['EditorialWide', 'Editorial Master'], defaultLayout: 'EditorialWide', strictLayout: true },
	template: { path: sourceTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'template-slide', title: 'Template import', layoutIntent: 'title-only', layoutName: 'EditorialWide', masterName: 'Editorial Master', content: [{ kind: 'textBox', name: 'title', role: 'title', text: 'Every authored layout remains available.' }] }],
}

const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
if (!result.ok) throw new Error(JSON.stringify(result.error || result))
const deckId = result.data.deckId
const entry = getDeck(deckId)
await entry.pptx.writeFile({ fileName: generated, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const generatedZip = await readZip(generated)
const layoutNames = []
for (const name of Object.keys(generatedZip.files).filter(item => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(item)).sort()) {
	const xml = await text(generatedZip, name)
	const match = xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)
	layoutNames.push({ part: name, name: match?.[1] || null, hasPlaceholder: /<p:ph\b/.test(xml) })
}
const slideRels = await text(generatedZip, 'ppt/slides/_rels/slide1.xml.rels')
const generatedMasterXml = await text(generatedZip, 'ppt/slideMasters/slideMaster1.xml')
const generatedDefaultLayoutXml = await text(generatedZip, 'ppt/slideLayouts/slideLayout1.xml')
const generatedSlideNumberLayoutXml = await text(generatedZip, 'ppt/slideLayouts/slideLayout3.xml')
const generatedBytes = await fs.readFile(generated)
const expectedNames = result.data.templateApplied.nativeTemplateLayouts.map(item => item.name)
const structural = {
	allSourceLayoutsMaterialized: result.data.templateApplied.nativeLayoutCount === expectedNames.length && expectedNames.length === 3,
	nativeMasterCarrierReadback: result.data.templateApplied.nativeTemplateMasters?.length === 1 && result.data.templateApplied.nativeTemplateMasters[0]?.placeholderCount === 1,
	nativeLayoutNames: JSON.stringify(layoutNames.slice(0, expectedNames.length).map(item => item.name)) === JSON.stringify(expectedNames),
	nativeLayoutPlaceholders: layoutNames.filter(item => item.name === 'EditorialWide').every(item => item.hasPlaceholder),
	nativeLayoutBackgroundReference: result.data.templateApplied.nativeTemplateLayouts[0]?.background?.color === 'bg1' && /<p:bgRef\b[^>]*idx="1001"/.test(generatedDefaultLayoutXml),
	nativeSlideNumberCarrier: result.data.templateApplied.nativeTemplateLayouts[2]?.slideNumber?.type === 'sldNum' && /<p:ph\b[^>]*type="sldNum"/.test(generatedSlideNumberLayoutXml),
	nativeMasterSlideNumberCarrier: /<p:ph\b[^>]*type="sldNum"/.test(generatedMasterXml),
	templateRelationshipBindingReadback: result.data.templateApplied.templateRelationshipBindings?.[0]?.layoutNumber === 2 && result.data.templateApplied.templateRelationshipBindings?.[0]?.relationshipId === 'rId1',
	slideUsesSourceLayoutNumber: /slideLayout2\.xml/.test(slideRels),
	packageReadable: Object.keys(generatedZip.files).length > 0,
}

const generatedPath = generated.replace(/'/g, "''")
const roundtripPath = roundtrip.replace(/'/g, "''")
const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtripPath}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide-01.png';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';slideCount=1;png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
let office = { status: 'NOT_RUN' }
try {
	const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
	office = JSON.parse(stdout.trim())
} catch (error) {
	office = { status: 'FAIL', message: String(error?.message || error) }
}

const roundtripExists = await fs.access(roundtrip).then(() => true).catch(() => false)
const roundtripZip = roundtripExists ? await readZip(roundtrip) : null
const roundtripLayoutNames = roundtripZip
	? (await Promise.all(Object.keys(roundtripZip.files).filter(item => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(item)).sort().map(async name => ({ part: name, xml: await text(roundtripZip, name) })))).map(item => ({ part: item.part, name: item.xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)?.[1] || null, hasPlaceholder: /<p:ph\b/.test(item.xml) }))
	: []
const roundtripMasterXml = roundtripZip ? await text(roundtripZip, 'ppt/slideMasters/slideMaster1.xml') : ''
const roundtripDefaultLayoutXml = roundtripZip ? await text(roundtripZip, 'ppt/slideLayouts/slideLayout1.xml') : ''
const roundtripSlideNumberLayoutXml = roundtripZip ? await text(roundtripZip, 'ppt/slideLayouts/slideLayout3.xml') : ''
const pngPath = path.join(outDir, 'roundtrip-slide-01.png')
const renderSha256 = await fs.readFile(pngPath).then(sha256).catch(() => null)
const roundtripBytes = roundtripExists ? await fs.readFile(roundtrip) : null
const checks = {
	...structural,
	officeOpenSaveCopyReopen: office.status === 'PASS',
	roundtripRetainsAllLayouts: expectedNames.every(name => roundtripLayoutNames.some(item => item.name === name)),
	roundtripRetainsPlaceholderCarrier: roundtripLayoutNames.some(item => item.name === 'EditorialWide' && item.hasPlaceholder),
	roundtripRetainsBackgroundReference: /<p:bgRef\b[^>]*idx="1001"/.test(roundtripDefaultLayoutXml),
	roundtripRetainsSlideNumberCarriers: /<p:ph\b[^>]*type="sldNum"/.test(roundtripMasterXml) && /<p:ph\b[^>]*type="sldNum"/.test(roundtripSlideNumberLayoutXml),
	renderedSlide: Boolean(renderSha256),
}
const failures = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
const report = {
	schemaVersion: 'betterpptx.global-template-layout-import-native.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	capabilityFamily: 'template-import-readback-multi-layout',
	sourceTemplate: { file: path.relative(root, sourceTemplate).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(sourceTemplate)) },
	requestedLayouts: expectedNames,
	generated: { file: path.relative(root, generated).replaceAll('\\', '/'), sha256: sha256(generatedBytes), bytes: generatedBytes.length },
	structural,
	office,
	roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), sha256: roundtripBytes ? sha256(roundtripBytes) : null, layouts: roundtripLayoutNames, renderSha256 },
	checks,
	failures,
	interpretation: 'Every authored source slide-layout part is materialized into the editable layout graph and the source package remains the authoritative Office carrier. The proof covers native package structure, multi-layout binding, PowerPoint SaveCopyAs/reopen, retained layout carriers, and a full-size render; universal formal closure remains 0/2258.',
}
const reportPath = path.join(outDir, 'template-layout-import-native-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256, layoutNames, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
