// Fresh public-client proof for portable JSON-spec intake, provenance, and the
// pre-save archive boundary. The endpoint is exercised only as a black box.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const DEFAULT_SOURCE = path.resolve('tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json')
const DEFAULT_ENDPOINT = 'https://betterpptx.tail070c3a.ts.net/mcp'

function arg(name, fallback) {
	const i = process.argv.indexOf(name)
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]))
	return value
}

const sourcePath = arg('--source', DEFAULT_SOURCE)
const endpoint = arg('--endpoint', DEFAULT_ENDPOINT)
const attemptCommit = process.argv.includes('--commit')
const sourceBytes = fs.readFileSync(sourcePath)
const rawSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex')
const source = JSON.parse(sourceBytes.toString('utf8'))
const sourceSummary = {
	fileName: path.basename(sourcePath),
	rawSha256,
	rawBytes: sourceBytes.length,
	schemaVersion: source.schemaVersion,
	title: source.title,
	slideCount: Array.isArray(source.slides) ? source.slides.length : 0,
	authoringWorkflow: source.authoringContract?.workflow,
}

let sessionId = null
async function rpc(method, params) {
	// A narrated 25-slide commit can legitimately run longer than the default
	// fetch body timeout. Use an explicit no-body-timeout
	// request so a completed server operation is not mistaken for a failure.
	const requestBody = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
	const parsed = new URL(endpoint)
	const client = parsed.protocol === 'https:' ? https : http
	const response = await new Promise((resolve, reject) => {
		const req = client.request(parsed, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'Content-Length': Buffer.byteLength(requestBody),
				...(sessionId ? { 'mcp-session-id': sessionId } : {}),
			},
		})
		req.setTimeout(0)
		req.once('error', reject)
		req.once('response', res => {
			const chunks = []
			res.on('data', chunk => chunks.push(Buffer.from(chunk)))
			res.once('error', reject)
			res.once('end', () => resolve({ headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
		})
		req.end(requestBody)
	})
	if (!sessionId) sessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'] || null
	const text = response.text
	const dataLine = text.trim().split(/\r?\n/).find(line => line.startsWith('data:'))
	const payload = dataLine ? dataLine.slice(5).trim() : text
	return payload ? JSON.parse(payload) : null
}

async function callTool(name, arguments_) {
	const response = await rpc('tools/call', { name, arguments: arguments_ })
	const text = response?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : response
}

function provenance(result) {
	const data = result?.data || result || {}
	const p = data.specProvenance
	if (!p) return null
	const pick = value => value && ({
		artifactId: value.artifactId,
		stage: value.stage,
		specSchemaVersion: value.specSchemaVersion,
		canonicalizationVersion: value.canonicalizationVersion,
		sha256: value.sha256,
		bytes: value.bytes,
		parentSha256: value.parentSha256,
		planDigest: value.planDigest,
		sourceKind: value.sourceKind,
		rawSubmissionSha256: value.rawSubmissionSha256,
		rawBytes: value.rawBytes,
		immutable: value.immutable,
		contentAddressed: value.contentAddressed,
		visibility: value.visibility,
		publicationStatus: value.publicationStatus,
		durability: value.durability,
	})
	return { submitted: pick(p.submitted), effectivePrecompile: pick(p.effectivePrecompile) }
}

function summarizeCommit(result) {
	const data = result?.data || result || {}
	return {
		ok: result?.ok === true,
		phase: data.phase,
		deckIdReturned: Boolean(data.deckId || result?.deckId),
		deckVersion: data.deckVersion,
		error: result?.ok === false ? redact({ code: result.error?.code, message: result.error?.message, details: result.error?.details }) : undefined,
		provenance: provenance(result),
	}
}

await rpc('initialize', {
	protocolVersion: '2024-11-05',
	clientInfo: { name: 'betterpptx-public-jsonspec-intake-v1', version: '1' },
	capabilities: {},
})
await fetch(endpoint, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', 'mcp-session-id': sessionId },
	body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
})

const upload = await callTool('betterpptx.assets.upload', {
	kind: 'jsonSpec',
	data: `data:application/json;base64,${sourceBytes.toString('base64')}`,
	fileName: path.basename(sourcePath),
	idempotencyKey: `jsonspec-intake-${Date.now()}-${crypto.randomUUID()}`,
})
const uploaded = upload?.data || upload || {}
const specHandle = uploaded.handle
const dryRun = specHandle ? await callTool('betterpptx.deck.generate_from_spec', {
	specHandle,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'summary',
	validateAfterCompile: true,
	validationMode: 'strict',
	idempotencyKey: `jsonspec-dryrun-${Date.now()}-${crypto.randomUUID()}`,
}) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
let commit = null
let voices = null
let authoredExport = null
let effectiveExport = null
if (attemptCommit && dryRun?.ok === true && dryData.planId) {
	commit = await callTool('betterpptx.deck.generate_from_spec', {
		specHandle,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'free',
		planId: dryData.planId,
		lockedPlanId: dryData.planId,
		planDigest: dryData.planDigest,
		validateAfterCompile: true,
		validationMode: 'strict',
		saveAfterCommit: false,
		idempotencyKey: `jsonspec-commit-${Date.now()}-${crypto.randomUUID()}`,
	})
	if (commit?.ok === false && commit.error?.code === 'SPEC_COMPILE_FAILED') voices = await callTool('betterpptx.narration.voices', {})
	const committedDeckId = (commit?.data || commit)?.deckId || commit?.deckId
	if (commit?.ok === true && committedDeckId) {
		authoredExport = await callTool('betterpptx.deck.export_spec', {
			deckId: committedDeckId,
			mode: 'authoredInput',
			download: true,
			fileName: `${sourceSummary.fileName.replace(/\.json$/i, '')}-authored-finalized.json`,
			detail: 'summary',
		})
		effectiveExport = await callTool('betterpptx.deck.export_spec', {
			deckId: committedDeckId,
			mode: 'effectivePrecompile',
			download: true,
			fileName: `${sourceSummary.fileName.replace(/\.json$/i, '')}-effective-precompile-finalized.json`,
			detail: 'summary',
		})
	}
}

const returnedText = JSON.stringify({ upload, dryRun, commit, voices, authoredExport, effectiveExport })
const leakagePatterns = [
	/[A-Z]:[\\/][A-Za-z0-9_. -]/i,
	/\\bnode_modules\\b/i,
	/engine\.mjs/i,
	/\\bPptxGenJS\\b/i,
	/\\bprocess metadata\\b/i,
]
const publicLeakage = leakagePatterns.filter(pattern => pattern.test(returnedText)).map(String)
const uploadPass = upload?.ok === true && /^asset:\/\/locked\/uploaded-jsonspec\//.test(String(uploaded.handle || '')) && /^[a-f0-9]{64}$/.test(String(uploaded.canonicalSha256 || '')) && uploaded.rawSha256 === rawSha256
const provenancePass = dryRun?.ok === true && dryData.specProvenance?.submitted?.sha256 === uploaded.canonicalSha256 && dryData.specProvenance?.submitted?.rawSubmissionSha256 === uploaded.rawSha256 && dryData.specProvenance?.submitted?.immutable === true && dryData.specProvenance?.submitted?.contentAddressed === true
const dryRunPass = dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId && dryData.authoringContract?.workflow === 'authoring-excellence-director-v1' && dryData.handshake?.firstTimeRightContractVersion === 'authoring-excellence.first-time-right.v2'
const commitBlockedByVoiceRuntime = commit?.ok === false && commit.error?.code === 'SPEC_COMPILE_FAILED' && commit.error?.details?.errors?.some(error => error.code === 'SYNTHESIS_RUNTIME_UNAVAILABLE') === true
const archiveDescriptor = result => (result?.data || result || {}).specArtifact
const archiveArtifact = result => (result?.data || result || {}).artifact
const durableArchivePass = authoredExport?.ok === true && effectiveExport?.ok === true && archiveDescriptor(authoredExport)?.durability === 'durable-content-addressed' && archiveDescriptor(effectiveExport)?.durability === 'durable-content-addressed' && archiveArtifact(authoredExport)?.state === 'download_ready' && archiveArtifact(effectiveExport)?.state === 'download_ready'
const status = uploadPass && provenancePass && dryRunPass && publicLeakage.length === 0 && (!attemptCommit || (commit?.ok === true && durableArchivePass) || commitBlockedByVoiceRuntime) ? (commitBlockedByVoiceRuntime ? 'PASS_WITH_ARCHIVE_BOUNDARY' : 'PASS') : 'FAIL'

const now = new Date()
const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-json-spec-intake/${stamp}`))
fs.mkdirSync(evidenceDir, { recursive: true })
const evidence = redact({
	schemaVersion: 'betterpptx.public-jsonspec-intake-proof.v1',
	status,
	generatedAt: now.toISOString(),
	endpointProfile: 'fresh-public-client',
	source: sourceSummary,
	upload: {
		ok: upload?.ok === true,
		handle: uploaded.handle,
		kind: uploaded.kind,
		rawSha256: uploaded.rawSha256,
		rawBytes: uploaded.rawBytes,
		canonicalSha256: uploaded.canonicalSha256,
		canonicalBytes: uploaded.canonicalBytes,
		schemaVersion: uploaded.schemaVersion,
		slideCount: uploaded.slideCount,
		next: uploaded.next,
	},
	dryRun: {
		ok: dryRun?.ok === true,
		phase: dryData.phase,
		mutationFree: dryData.mutationFree,
		specDigest: dryData.specDigest,
		planDigest: dryData.planDigest,
		planId: dryData.planId,
		title: dryData.title,
		slideCount: dryData.slideCount,
		objectCount: dryData.objectCount,
		narrationCueCount: dryData.narrationCueLedger?.acceptedCueCount,
		specProvenance: provenance(dryRun),
		authoringWorkflow: dryData.authoringContract?.workflow,
		firstTimeRightContract: dryData.handshake?.firstTimeRightContractVersion,
	},
	commitAttempt: attemptCommit ? summarizeCommit(commit) : { attempted: false },
	finalizedArchive: attemptCommit ? {
		passed: durableArchivePass,
		authoredInput: authoredExport?.ok === true ? { specArtifact: archiveDescriptor(authoredExport), artifact: archiveArtifact(authoredExport), privacy: (authoredExport?.data || authoredExport || {}).privacy } : { ok: authoredExport?.ok === true, error: authoredExport?.error?.code },
		effectivePrecompile: effectiveExport?.ok === true ? { specArtifact: archiveDescriptor(effectiveExport), artifact: archiveArtifact(effectiveExport), privacy: (effectiveExport?.data || effectiveExport || {}).privacy } : { ok: effectiveExport?.ok === true, error: effectiveExport?.error?.code },
	} : { attempted: false },
	narrationRuntime: voices?.data ? { synthesisRuntimeAvailable: voices.data.synthesisRuntimeAvailable, catalogAvailable: voices.data.catalogAvailable, mode: voices.data.mode, productionReady: voices.data.productionReady, synthesisRuntimeReason: voices.data.synthesisRuntimeReason } : undefined,
	checks: { uploadPass, provenancePass, dryRunPass, durableArchivePass, publicLeakage, commitBlockedByVoiceRuntime },
})
const evidencePath = path.join(evidenceDir, 'public-jsonspec-intake-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
