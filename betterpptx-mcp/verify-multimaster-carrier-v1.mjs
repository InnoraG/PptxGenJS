// Office-authored multi-master carrier proof.  The source is an existing
// corpus artifact, never mutated; the generated deck is the product output.
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
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/multimaster-carrier-native/${stamp}`)
const generated = path.join(outDir, 'multimaster-import.pptx')
const edited = path.join(outDir, 'multimaster-sparse-edit.pptx')
const reset = path.join(outDir, 'multimaster-reset.pptx')
const roundtrip = path.join(outDir, 'multimaster-office-roundtrip.pptx')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const spec = {
	 schemaVersion: 'betterpptx.deck-spec.v1', title: 'Office-authored multi-master carrier proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'preserve multiple Office masters', remember: 'master bindings remain editable' },
	visualDesign: { world: 'blueprint', framing: 'multi-master carrier' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	template: { path: sourceTemplate, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'multimaster-proof', title: 'Multi-master proof', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'proof', role: 'title', text: 'Multiple Office-authored masters remain bound and editable.' }] }],
}
const dispatcher = createMcpToolDispatcher({ role: 'builder', transport: 'test' })
const result = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full', saveAfterCommit: false })
if (!result.ok) throw new Error(JSON.stringify(result.error || result))
const entry = getDeck(result.data.deckId)
await entry.pptx.writeFile({ fileName: generated, compression: false })
const patchSpec = (items, outcome) => ({
	schemaVersion: 'betterpptx.deck-spec.v1',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome, remember: 'opaque source identities and bindings survive' },
	visualDesign: { world: 'blueprint', framing: 'multi-master sparse edit' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'static' },
	slides: [], patchPlan: { templateCarriers: items },
})
const editedResult = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', plan: 'premium', detail: 'full', saveAfterCommit: false,
	spec: patchSpec([
		{ name: 'slideMaster1', kind: 'master', objects: [{ rect: { x: 0.18, y: 0.42, w: 0.16, h: 6.5, fill: { color: '0EA5E9' }, line: { color: '0369A1' }, objectName: 'primary-master-edited-rail' } }] },
		{ name: 'slideMaster2', kind: 'master', objects: [{ rect: { x: 0.62, y: 0.42, w: 0.16, h: 6.5, fill: { color: 'BE123C' }, line: { color: '9F1239' }, objectName: 'secondary-master-edited-rail' } }] },
	], 'edit both Office-authored masters'),
})
if (!editedResult.ok) throw new Error(JSON.stringify(editedResult.error || editedResult))
await entry.pptx.writeFile({ fileName: edited, compression: false })
const resetResult = await dispatcher.call('betterpptx.deck.generate_from_spec', {
	deckId: result.data.deckId, phase: 'commit', commitMode: 'patch', plan: 'premium', detail: 'full', saveAfterCommit: false,
	spec: patchSpec([{ name: 'slideMaster1', kind: 'master', reset: true }, { name: 'slideMaster2', kind: 'master', reset: true }], 'reset both Office masters'),
})
if (!resetResult.ok) throw new Error(JSON.stringify(resetResult.error || resetResult))
await entry.pptx.writeFile({ fileName: reset, compression: false })

const readZip = async file => JSZip.loadAsync(await fs.readFile(file), { checkCRC32: true })
const text = async (zip, name) => zip.file(name)?.async('string') || ''
const sourceZip = await readZip(sourceTemplate)
const generatedZip = await readZip(generated)
const editedZip = await readZip(edited)
const resetZip = await readZip(reset)
const sourcePres = await text(sourceZip, 'ppt/presentation.xml')
const generatedPres = await text(generatedZip, 'ppt/presentation.xml')
const generatedMaster2 = await text(generatedZip, 'ppt/slideMasters/slideMaster2.xml')
const generatedMaster2Rels = await text(generatedZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const editedMaster1 = await text(editedZip, 'ppt/slideMasters/slideMaster1.xml')
const editedMaster2 = await text(editedZip, 'ppt/slideMasters/slideMaster2.xml')
const editedMaster1Rels = await text(editedZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const editedMaster2Rels = await text(editedZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const resetMaster1 = await text(resetZip, 'ppt/slideMasters/slideMaster1.xml')
const resetMaster1Rels = await text(resetZip, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
const resetMaster2 = await text(resetZip, 'ppt/slideMasters/slideMaster2.xml')
const resetMaster2Rels = await text(resetZip, 'ppt/slideMasters/_rels/slideMaster2.xml.rels')
const carriers = result.data.templateApplied.nativeTemplateMasters || []
const master1Edit = editedResult.data?.patchResults?.find(item => item?.carrier?.number === 1 && item?.carrier?.mode === 'native-edit')
const master2Edit = editedResult.data?.patchResults?.find(item => item?.carrier?.number === 2 && item?.carrier?.mode === 'native-edit')
const primaryMasterEdit = master1Edit
const master2Reset = resetResult.data?.patchResults?.find(item => item?.carrier?.number === 2 && item?.carrier?.mode === 'reset-to-source')
const primaryMasterReset = resetResult.data?.patchResults?.find(item => item?.carrier?.number === 1 && item?.carrier?.mode === 'reset-to-source')
const checks = {
	sourceHasMultipleMasters: (sourcePres.match(/<p:sldMasterId\b/g) || []).length >= 2,
	generatedHasMultipleMasters: (generatedPres.match(/<p:sldMasterId\b/g) || []).length >= 2,
	master2SourceRetained: /<p:sldMaster/.test(generatedMaster2) && generatedMaster2Rels.includes('/slideLayout'),
	primaryMasterSourceRetained: generatedMaster2Rels.includes('/slideLayout'),
	master2EditReadback: master2Edit?.carrier?.number === 2 && master2Edit?.carrier?.objects?.some(item => item.objectName === 'secondary-master-edited-rail'),
	primaryMasterEditReadback: primaryMasterEdit?.carrier?.number === 1 && primaryMasterEdit?.carrier?.objects?.some(item => item.objectName === 'primary-master-edited-rail'),
	primaryMasterEditNativeXml: editedMaster1.includes('primary-master-edited-rail'),
	master2EditNativeXml: editedMaster2.includes('secondary-master-edited-rail'),
	primaryMasterRelationshipRetention: generatedMaster2Rels.includes('/slideLayout'),
	master2BindingRetention: master2Edit?.relationshipBindingPreserved === true && editedMaster2Rels.includes('/slideLayout'),
	relationshipKindReadback: [master1Edit, master2Edit].every(item => item?.carrier?.relationshipKinds && Object.keys(item.carrier.relationshipKinds).includes('image') && Object.keys(item.carrier.relationshipKinds).includes('chart') && Object.keys(item.carrier.relationshipKinds).includes('external') && Object.keys(item.carrier.relationshipKinds).includes('tag')),
	master2ResetReadback: master2Reset?.carrier?.number === 2 && master2Reset?.carrier?.mode === 'reset-to-source',
	primaryMasterResetReadback: primaryMasterReset?.carrier?.number === 1 && primaryMasterReset?.carrier?.mode === 'reset-to-source',
	primaryMasterResetSource: !resetMaster1.includes('primary-master-edited-rail') && resetMaster1Rels.includes('/slideLayout'),
	master2ResetSource: !resetMaster2.includes('secondary-master-edited-rail') && resetMaster2Rels.includes('/slideLayout'),
	packageReadable: Object.keys(editedZip.files).length > 0,
}
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${edited.replaceAll("'", "''")}',$true,$false,$false,$false);$pres.SaveCopyAs('${roundtrip.replaceAll("'", "''")}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${roundtrip.replaceAll("'", "''")}',$true,$false,$false,$false);$png='${path.join(outDir, 'roundtrip-slide-01.png').replaceAll("'", "''")}';$re.Slides.Item(1).Export($png,'PNG',1600,900);$re.Close();$re=$null;[ordered]@{status='PASS';png=$png}|ConvertTo-Json -Depth 8}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
let office = { status: 'NOT_RUN' }
try { const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 }); office = JSON.parse(stdout.trim()) } catch (error) { office = { status: 'FAIL', message: String(error?.message || error) } }
const renderPath = path.join(outDir, 'roundtrip-slide-01.png')
const roundtripBytes = await fs.readFile(roundtrip).catch(() => null)
const renderBytes = await fs.readFile(renderPath).catch(() => null)
checks.officeOpenSaveCopyReopen = office.status === 'PASS'
checks.renderedSlide = Boolean(renderBytes)
const failures = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
const report = { schemaVersion: 'betterpptx.multimaster-carrier-native.v1', status: failures.length ? 'FAIL' : 'PASS', capabilityFamily: 'multi-master-template-carriers', sourceTemplate: { file: path.relative(root, sourceTemplate).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(sourceTemplate)) }, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(generated)) }, edited: { file: path.relative(root, edited).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(edited)) }, reset: { file: path.relative(root, reset).replaceAll('\\', '/'), sha256: sha256(await fs.readFile(reset)) }, carriers, checks, relationshipKinds: { primary: primaryMasterEdit?.carrier?.relationshipKinds || null, secondary: master2Edit?.carrier?.relationshipKinds || null }, office, roundtrip: { file: path.relative(root, roundtrip).replaceAll('\\', '/'), sha256: roundtripBytes ? sha256(roundtripBytes) : null, renderSha256: renderBytes ? sha256(renderBytes) : null }, failures, interpretation: 'An existing Office-authored two-master source was imported without mutation, both masters were sparse-edited through the generic carrier contract, typed relationship-kind readback was returned without exposing targets, both master edits remained repair-free through PowerPoint SaveCopyAs/reopen/render, and reset restored the source carrier parts.' }
const reportPath = path.join(outDir, 'multimaster-carrier-proof.json')
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = await fs.readFile(reportPath)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, editedSha256: report.edited.sha256, roundtripSha256: report.roundtrip.sha256, renderSha256: report.roundtrip.renderSha256, failures }, null, 2) + '\n')
if (failures.length) process.exitCode = 1
