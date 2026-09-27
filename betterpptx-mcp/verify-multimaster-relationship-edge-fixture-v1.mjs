// Relationship-rich multi-master carrier proof.  The fixture is derived from
// an Office-authored two-master source and adds valid chart, custom-XML/tag,
// and external edges to the secondary master before the product import.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { createMcpToolDispatcher, getDeck } from './engine.mjs'

const run = promisify(execFile)
const root = path.resolve('.')
const sourceTemplate = path.resolve('outputs/airtel-source.pptx')
const donorTemplate = path.resolve('outputs/betterpptx_editing_surface_baseline.pptx')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/multimaster-relationship-edge-fixture/${stamp}`)
const fixture = path.join(outDir, 'relationship-rich-source.pptx')
const edited = path.join(outDir, 'relationship-rich-edited.pptx')
const reset = path.join(outDir, 'relationship-rich-reset.pptx')
const roundtrip = path.join(outDir, 'relationship-rich-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

async function makeFixture() {
	const zip = await JSZip.loadAsync(await fs.readFile(sourceTemplate))
	const donor = await JSZip.loadAsync(await fs.readFile(donorTemplate))
	for (const part of ['ppt/charts/chart1.xml', 'ppt/charts/_rels/chart1.xml.rels', 'ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx']) {
		const file = donor.file(part)
		if (file) zip.file(part, await file.async('nodebuffer'))
	}
	const contentTypes = await zip.file('[Content_Types].xml').async('string')
	const additions = [
		!contentTypes.includes('PartName="/ppt/charts/chart1.xml"') ? '<Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' : '',
		!contentTypes.includes('Extension="xlsx"') ? '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>' : '',
	].filter(Boolean).join('')
	if (additions) zip.file('[Content_Types].xml', contentTypes.replace('</Types>', `${additions}</Types>`))
	zip.file('customXml/item1.xml', '<betterpptxTag xmlns="urn:betterpptx:relationship-edge-fixture"><purpose>carrier-preservation</purpose></betterpptxTag>')
	const masterRelsPart = 'ppt/slideMasters/_rels/slideMaster2.xml.rels'
	const masterPart = 'ppt/slideMasters/slideMaster2.xml'
	const rels = await zip.file(masterRelsPart).async('string')
	const edgeRels = [
		'<Relationship Id="rId20" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>',
		'<Relationship Id="rId21" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/betterpptx-edge-fixture" TargetMode="External"/>',
		'<Relationship Id="rId22" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>',
	].join('')
	zip.file(masterRelsPart, rels.replace('</Relationships>', `${edgeRels}</Relationships>`))
	const masterXml = await zip.file(masterPart).async('string')
	const linked = masterXml.replace(/<p:cNvPr([^>]*)\/>/, '<p:cNvPr$1><a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId21"/></p:cNvPr>')
	if (linked === masterXml) throw new Error('Failed to attach the external relationship edge to the source master')
	zip.file(masterPart, linked)
	await fs.writeFile(fixture, await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }))
}
await makeFixture()

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Relationship-rich master carrier proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'preserve chart tag and external master edges', remember: 'relationship graphs remain attached' },
	visualDesign: { world: 'blueprint', framing: 'relationship-rich carrier' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	template: { path: fixture, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'edge-proof', title: 'Relationship-rich master', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'proof', role: 'title', text: 'Chart, tag, and external edges stay attached to the source master.' }] }],
}
const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
const generated = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
if (!generated.ok) throw new Error(JSON.stringify(generated.error || generated))
const entry = getDeck(generated.data.deckId)
await entry.pptx.writeFile({ fileName: path.join(outDir, 'relationship-rich-import.pptx'), compression: false })
const patchSpec = items => ({
	schemaVersion: 'betterpptx.deck-spec.v1', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'sparse-edit relationship-rich masters', remember: 'typed relationship kinds remain retained' },
	visualDesign: { world: 'blueprint', framing: 'relationship-rich sparse edit' }, motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' }, slides: [], patchPlan: { templateCarriers: items },
})
const editedResult = await dispatcher.call('betterpptx.deck.generate_from_spec', { deckId: generated.data.deckId, phase: 'commit', commitMode: 'patch', plan: 'premium', detail: 'full', saveAfterCommit: false, spec: patchSpec([
	{ name: 'slideMaster1', kind: 'master', objects: [{ rect: { x: 0.18, y: 0.42, w: 0.16, h: 6.5, fill: { color: '0EA5E9' }, line: { color: '0369A1' }, objectName: 'edge-primary-rail' } }] },
	{ name: 'slideMaster2', kind: 'master', objects: [{ rect: { x: 0.62, y: 0.42, w: 0.16, h: 6.5, fill: { color: 'BE123C' }, line: { color: '9F1239' }, objectName: 'edge-secondary-rail' } }] },
]) })
if (!editedResult.ok) throw new Error(JSON.stringify(editedResult.error || editedResult))
await entry.pptx.writeFile({ fileName: edited, compression: false })
const resetResult = await dispatcher.call('betterpptx.deck.generate_from_spec', { deckId: generated.data.deckId, phase: 'commit', commitMode: 'patch', plan: 'premium', detail: 'full', saveAfterCommit: false, spec: patchSpec([{ name: 'slideMaster1', kind: 'master', reset: true }, { name: 'slideMaster2', kind: 'master', reset: true }]) })
if (!resetResult.ok) throw new Error(JSON.stringify(resetResult.error || resetResult))
await entry.pptx.writeFile({ fileName: reset, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const sourceZip = await readZip(fixture)
const editedZip = await readZip(edited)
const resetZip = await readZip(reset)
const sourceMaster2Rels = await text(sourceZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const editedMaster2 = await text(editedZip, 'ppt/slideMasters/slideMaster2.xml')
const editedMaster2Rels = await text(editedZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const resetMaster2 = await text(resetZip, 'ppt/slideMasters/slideMaster2.xml')
const resetMaster2Rels = await text(resetZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const primaryEdit = editedResult.data.patchResults.find(item => item.carrier?.number === 1)
const secondaryEdit = editedResult.data.patchResults.find(item => item.carrier?.number === 2)
const secondaryReset = resetResult.data.patchResults.find(item => item.carrier?.number === 2)
const sourceGraph = { chart: /relationships\/chart/.test(sourceMaster2Rels), external: /relationships\/hyperlink/.test(sourceMaster2Rels), tag: /relationships\/customXml/.test(sourceMaster2Rels) }
const checks = {
	sourceGraphComplete: sourceGraph.chart && sourceGraph.external && sourceGraph.tag,
	editedGraphRetained: sourceGraph.chart && sourceGraph.external && sourceGraph.tag && /relationships\/chart/.test(editedMaster2Rels) && /relationships\/hyperlink/.test(editedMaster2Rels) && /relationships\/customXml/.test(editedMaster2Rels),
	editedPrimaryNativeXml: editedMaster2.includes('edge-secondary-rail'),
	typedRelationshipReadback: secondaryEdit?.carrier?.relationshipKinds?.chart >= 1 && secondaryEdit?.carrier?.relationshipKinds?.external >= 1 && secondaryEdit?.carrier?.relationshipKinds?.tag >= 1,
	exactReset: secondaryReset?.carrier?.mode === 'reset-to-source' && resetMaster2 === await text(sourceZip, 'ppt/slideMasters/slideMaster2.xml') && resetMaster2Rels === sourceMaster2Rels && !resetMaster2.includes('edge-secondary-rail'),
	primaryReadback: primaryEdit?.carrier?.mode === 'native-edit' && primaryEdit?.carrier?.objects?.some(item => item.objectName === 'edge-primary-rail'),
	packageReadable: Object.keys(editedZip.files).length > 0,
}
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${edited.replaceAll("'", "''")}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtrip.replaceAll("'", "''")}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtrip.replaceAll("'", "''")}',$true,$false,$false,$false);$png='${path.join(outDir, 'relationship-rich-roundtrip.png').replaceAll("'", "''")}';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
let office = { status: 'NOT_RUN' }
try { const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); office = JSON.parse(stdout.trim()) } catch (error) { office = { status: 'FAIL', message: String(error?.message || error) } }
const renderPath = path.join(outDir, 'relationship-rich-roundtrip.png')
const roundtripBytes = await fs.readFile(roundtrip).catch(() => null)
const renderBytes = await fs.readFile(renderPath).catch(() => null)
checks.officeOpenSaveCopyReopen = office.status === 'PASS'
checks.renderedSlide = Boolean(renderBytes)
const failures = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
const report = { schemaVersion: 'betterpptx.multimaster-relationship-edge-fixture.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'multi-master-relationship-edge-preservation', fixture: { file: path.relative(root, fixture).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(fixture)), sourceGraph }, edited: { file: path.relative(root, edited).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(edited)) }, reset: { file: path.relative(root, reset).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(reset)) }, checks, relationshipKinds: secondaryEdit?.carrier?.relationshipKinds || null, office, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), sha256: roundtripBytes ? sha256(roundtripBytes) : null, renderSha256: renderBytes ? sha256(renderBytes) : null }, failures, interpretation: 'A relationship-rich source fixture derived from an Office-authored two-master deck retained chart, external, and custom-XML/tag relationship edges on the secondary master while both masters were sparsely edited and reset through opaque carriers. No relationship target or private path is returned to the client.' }
const reportPath = path.join(outDir, 'relationship-edge-fixture-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), fixtureSha256: report.fixture.sha256, editedSha256: report.edited.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256: report.roundtrip.renderSha256, relationshipKinds: report.relationshipKinds, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
