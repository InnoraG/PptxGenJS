// Fresh-session proof that a previously archived public JSON-spec handle can
// be replayed without re-uploading the source or exposing private paths.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const sourcePath = arg('--source', path.resolve('tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'))
const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-json-spec-replay/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
const sourceBytes = fs.readFileSync(sourcePath)
const rawSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex')
const sourceHandle = `asset://locked/uploaded-jsonspec/${rawSha256}.json`
let sessionId = null

async function rpc(method, params) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
	})
	if (!sessionId) sessionId = response.headers.get('mcp-session-id')
	const text = await response.text()
	const dataLine = text.trim().split(/\r?\n/).find(line => line.startsWith('data:'))
	return JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
}

async function callTool(name, arguments_) {
	const response = await rpc('tools/call', { name, arguments: arguments_ })
	const text = response?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : response
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-jsonspec-replay-v1', version: '1' }, capabilities: {} })
await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'mcp-session-id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })
const dryRun = await callTool('betterpptx.deck.generate_from_spec', {
	specHandle: sourceHandle,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'summary',
	validateAfterCompile: true,
	validationMode: 'strict',
	idempotencyKey: `jsonspec-replay-${Date.now()}-${crypto.randomUUID()}`,
})
const data = dryRun?.data || dryRun || {}
const returnedText = JSON.stringify(dryRun)
const publicLeakage = [/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i, /process metadata/i].filter(pattern => pattern.test(returnedText)).map(String)
const checks = {
	dryRunOk: dryRun?.ok === true,
	mutationFree: data.phase === 'dryRun' && data.mutationFree === true && !data.deckId,
	sourceIdentityPreserved: data.specProvenance?.submitted?.rawSubmissionSha256 === rawSha256 && data.specProvenance?.submitted?.sourceKind === 'uploaded-jsonspec',
	canonicalIdentityPreserved: data.specProvenance?.submitted?.sha256 === '790804ca47f029379e8c833a13c90cfaa1837207d25dfe077bdfebc1ef99f899',
	workflowPreserved: data.authoringContract?.workflow === 'authoring-excellence-director-v1' && data.handshake?.firstTimeRightContractVersion === 'authoring-excellence.first-time-right.v2',
	publicLeakage: publicLeakage.length === 0,
}
const evidence = {
	schemaVersion: 'betterpptx.public-jsonspec-replay-proof.v1',
	status: Object.values(checks).every(value => value === true) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	clientProfile: 'fresh-session-after-service-restart',
	source: { fileName: path.basename(sourcePath), rawSha256, rawBytes: sourceBytes.length, sourceHandle },
	dryRun: { phase: data.phase, mutationFree: data.mutationFree, slideCount: data.slideCount, objectCount: data.objectCount, planDigest: data.planDigest, submitted: data.specProvenance?.submitted, effectivePrecompile: data.specProvenance?.effectivePrecompile },
	checks,
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-jsonspec-replay-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
