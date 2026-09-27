// Batch proof: compile the archived canonical 25-slide JSON spec through the
// public authoring front door, then validate and read the semantic deck back.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const source = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'
const silentVariant = process.argv.includes('--silent')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const raw = await fs.readFile(path.resolve(source))
const spec = JSON.parse(raw)
const canonicalBytes = Buffer.from(`${JSON.stringify(stable(spec))}\n`)
const sourceSha256 = sha256(canonicalBytes)
const executionSpec = silentVariant
	? {
		...spec,
		outputVariant: 'silent-timed-notes',
		selectedOutputVariants: ['silent-timed-notes'],
		narrationPolicy: { ...(spec.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
		slides: (spec.slides || []).map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration })),
	}
	: spec
const executionBytes = Buffer.from(`${JSON.stringify(stable(executionSpec))}\n`)
const executionSha256 = sha256(executionBytes)
let sessionId = null
let rpcId = 0
const parseRpc = text => { const line = String(text).trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
async function rpc(method, params = {}) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) }); if (!sessionId) sessionId = response.headers.get('mcp-session-id'); return parseRpc(await response.text()) }
async function call(name, arguments_) { const result = await rpc('tools/call', { name, arguments: arguments_ }); const text = result?.result?.content?.find(item => item.type === 'text')?.text; const parsed = text ? JSON.parse(text) : result; return parsed }
const unwrap = result => result?.data || result
await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-canonical-native-compile-v1', version: '1' }, capabilities: {} }); await rpc('notifications/initialized')
const upload = unwrap(await call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${executionBytes.toString('base64')}`, fileName: `canonical-25-${executionSha256}.json`, idempotencyKey: `canonical-native-upload-${executionSha256}` }))
const dry = unwrap(await call('betterpptx.deck.generate_from_spec', { specHandle: upload.handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includeCallPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `canonical-native-dry-${executionSha256}-${Date.now()}` }))
const commitRaw = await call('betterpptx.deck.generate_from_spec', { specHandle: upload.handle, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary', validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: `canonical-native-commit-${executionSha256}-${Date.now()}` })
const commit = unwrap(commitRaw)
const deckId = commit.deckId
const validate = deckId ? unwrap(await call('betterpptx.deck.validate', { deckId, detail: 'summary' })) : {}
const quality = deckId ? unwrap(await call('betterpptx.deck.validate_quality', { deckId, profile: 'modern', detail: 'summary' })) : {}
const readback = deckId ? unwrap(await call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'summary' })) : {}
const readbackSpec = readback.spec || readback.authoredInput || readback
const readbackSlides = Array.isArray(readbackSpec?.slides) ? readbackSpec.slides.length : (readback.slideCount || 0)
const readbackObjects = Array.isArray(readbackSpec?.slides) ? readbackSpec.slides.reduce((n, slide) => n + (slide.content?.length || slide.objects?.length || 0), 0) : (readback.objectCount || 0)
const publicLeakage = ![/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].some(pattern => pattern.test(JSON.stringify({ dry, commit, validate, quality, readback })))
const checks = { sourceIs25Slides: spec.slides?.length === 25, dryRunMutationFree: dry.mutationFree === true, committed: Boolean(deckId), validated: validate.ok !== false, qualityReturned: quality && typeof quality === 'object', readbackSlides: readbackSlides === 25, readbackObjectsAtLeastSource: readbackObjects >= (spec.slides?.reduce((n, slide) => n + (slide.content?.length || 0), 0) || 0), sourceIdentityPreserved: dry.specProvenance?.submitted?.rawSubmissionSha256 === executionSha256 || commit.specProvenance?.submitted?.rawSubmissionSha256 === executionSha256, publicLeakage }
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-compile/${stamp}`)
await fs.mkdir(outDir, { recursive: true })
const dryOps = Array.isArray(dry.operations) ? dry.operations.map(op => ({ tool: op.tool, slideIndex: op.slideIndex, slideId: op.slideId, objectName: op.objectName })) : []
const report = { schemaVersion: 'betterpptx.canonical-25-slide-native-compile-proof.v1', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), source: path.basename(source), sourceSha256, executionVariant: silentVariant ? 'silent-timed-notes' : 'canonical-narrated', executionSha256, deckId, dryRun: { phase: dry.phase, mutationFree: dry.mutationFree, slideCount: dry.slideCount, objectCount: dry.objectCount, planDigest: dry.planDigest, operationCount: dryOps.length, firstOperations: dryOps.slice(0, 40), lastOperations: dryOps.slice(-20), firstIndex1Operation: dryOps.findIndex(op => op.slideIndex === 1), firstIndex2Operation: dryOps.findIndex(op => op.slideIndex === 2), firstOperationsBySlide: Array.from({ length: 5 }, (_, slideIndex) => ({ slideIndex, first: dryOps.findIndex(op => op.slideIndex === slideIndex), count: dryOps.filter(op => op.slideIndex === slideIndex).length })) }, commit: { phase: commit.phase, slideCount: commit.slideCount, objectCount: commit.objectCount, deckVersion: commit.deckVersion, ok: commitRaw?.ok, error: commitRaw?.error, code: commitRaw?.code }, validation: { ok: validate.ok, blockingIssues: validate.blockingIssues?.length || 0 }, quality: { ok: quality.ok, blockingIssues: quality.blockingIssues?.length || 0, warnings: quality.warnings?.length || 0 }, readback: { slideCount: readbackSlides, objectCount: readbackObjects, specSha256: sha256(Buffer.from(`${JSON.stringify(stable(readbackSpec))}\n`)) }, checks, externalBoundary: silentVariant ? 'narrated audio synthesis omitted because the local TTS endpoint exceeded its response deadline; native slide compilation remained independently verifiable' : 'preview/save not attempted: authoritative PowerPoint preview infrastructure is required by the public endpoint' }
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
const reportPath = path.join(outDir, 'canonical-25-native-compile-proof.json')
await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ ...report, reportPath: path.relative(process.cwd(), reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes) }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
