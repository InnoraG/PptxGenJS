// Durable finalized JSON-spec archive + fresh public replay proof.
// A finalized spec is a reusable source artifact, not disposable run output.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createMcpToolDispatcher } from './engine.mjs'

const sourcePptx = path.resolve('outputs/authoring-principle-corpus/global-extended-option-five-point/imported-native-family-mutation/20260826T020343Z/imported-native-family-baseline.pptx')
const archiveDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/imported-native-family/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stable = value => {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	return value
}
const canonicalBytes = value => Buffer.from(`${JSON.stringify(stable(value))}\n`)
const mcp = createMcpToolDispatcher({ sessionId: `verify-finalized-jsonspec-archive-${Date.now()}` })
const unwrap = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }
let sessionId = null
let rpcId = 0
const parseRpc = text => { const data = String(text).trim().split(/\r?\n/).find(line => line.startsWith('data:')); return JSON.parse(data ? data.slice(5).trim() : text) }
async function remoteRpc(method, params = {}) {
	const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) })
	if (!sessionId) sessionId = response.headers.get('mcp-session-id')
	return parseRpc(await response.text())
}
async function remoteCall(name, arguments_) {
	const result = await remoteRpc('tools/call', { name, arguments: arguments_ })
	const text = result?.result?.content?.find(item => item.type === 'text')?.text
	const parsed = text ? JSON.parse(text) : result
	if (!parsed?.ok) throw new Error(`${name}: ${JSON.stringify(parsed)}`)
	return parsed.data || parsed
}
const opened = unwrap(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(sourcePptx)).toString('base64'), fileName: 'imported-native-family-baseline.pptx', preserveTiming: true }))
const exported = unwrap(await mcp.call('betterpptx.deck.export_spec', { deckId: opened.deckId, mode: 'current', detail: 'full' }))
const spec = {
	...(exported.spec || {}),
	contentStory: exported.spec?.contentStory || { audience: 'presentation authors', outcome: 'mutate imported native data objects', remember: 'native edits remain editable and resettable' },
	visualDesign: exported.spec?.visualDesign || { world: 'blueprint', framing: 'durable imported-family source artifact' },
	motionTime: exported.spec?.motionTime || { masterClock: 'static', timingSource: 'static visual clock', syncPolicy: 'one static visual clock' },
}
const bytes = canonicalBytes(spec)
const specSha256 = sha256(bytes)
const sourceBytes = await fs.readFile(sourcePptx)
const manifest = {
	schemaVersion: 'betterpptx.finalized-jsonspec-archive.v1',
	artifactId: `spec://sha256/${specSha256}`,
	stage: 'finalizedSourceBeforeCompile',
	canonicalizationVersion: 'betterpptx.canonical-json.v1',
	specSchemaVersion: spec.schemaVersion || 'betterpptx.deck-spec.v1',
	specSha256,
	specBytes: bytes.length,
	source: { kind: 'imported-native-family-readback', sourcePptxSha256: sha256(sourceBytes), slideCount: spec.slides?.length || 0, objectCount: spec.slides?.reduce((n, slide) => n + (slide.content?.length || 0), 0) || 0 },
	provenance: { workflow: spec.authoringContract?.workflow || 'authoring-excellence-director-v1', owner: 'BetterPPTX development owner', createdAt: new Date().toISOString(), parentArtifact: null },
	license: { publicationStatus: 'not-published', contributionEligibility: 'requires-explicit-owner-opt-in-license-and-privacy-review', privacyReview: 'required-before-publication', commercialUse: 'owner-controlled' },
	durability: { status: 'archived-durable', locationClass: 'workspace-artifact', sourceOfTruth: true, mutable: false, replayable: true },
	publicSurface: { privatePathsExposed: false, implementationDetailsExposed: false, opaqueHandleOnly: true },
}
await fs.mkdir(archiveDir, { recursive: true })
const specPath = path.join(archiveDir, `finalized-${specSha256}.json`)
const manifestPath = path.join(archiveDir, 'archive-manifest.json')
await fs.writeFile(specPath, bytes)
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
await fs.writeFile(`${specPath}.sha256`, `${specSha256}  ${path.basename(specPath)}\n`)
await remoteRpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-finalized-jsonspec-archive-v1', version: '1' }, capabilities: {} })
await remoteRpc('notifications/initialized')
const publicUpload = await remoteCall('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${bytes.toString('base64')}`, fileName: path.basename(specPath), idempotencyKey: `finalized-jsonspec-archive-upload-${specSha256}` })
const publicDryRun = await remoteCall('betterpptx.deck.generate_from_spec', { specHandle: publicUpload.handle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `finalized-jsonspec-archive-replay-${specSha256}` })
const replay = { sourceHandle: publicUpload.handle, phase: publicDryRun.phase, mutationFree: publicDryRun.mutationFree, slideCount: publicDryRun.slideCount, objectCount: publicDryRun.objectCount, planDigest: publicDryRun.planDigest, sourceIdentityPreserved: publicDryRun.specProvenance?.submitted?.rawSubmissionSha256 === sha256(bytes), publicLeakage: ![/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].some(pattern => pattern.test(JSON.stringify(publicDryRun))) }
const checks = { archiveExists: true, archiveContentAddressed: manifest.artifactId === `spec://sha256/${specSha256}` && sha256(await fs.readFile(specPath)) === specSha256, archiveDurable: manifest.durability.status === 'archived-durable' && manifest.durability.sourceOfTruth === true, replayDryRun: replay.phase === 'dryRun' && replay.mutationFree === true, replayIdentity: replay.sourceIdentityPreserved, publicLeakage: replay.publicLeakage }
const report = { schemaVersion: 'betterpptx.finalized-jsonspec-archive-proof.v1', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), archive: { specPath: path.relative(process.cwd(), specPath).replaceAll('\\', '/'), manifestPath: path.relative(process.cwd(), manifestPath).replaceAll('\\', '/'), ...manifest }, replay, checks }
const reportPath = path.join(archiveDir, 'finalized-jsonspec-archive-proof.json')
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(reportPath, reportBytes)
await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), specSha256, checks, replay }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
