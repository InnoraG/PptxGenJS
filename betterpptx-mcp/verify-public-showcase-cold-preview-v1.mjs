#!/usr/bin/env node
// Fresh public-client compile/validation/preview proof for the canonical
// 25-slide source. A session-only deck handle is used only for this run; the
// durable source identity remains the separately archived JSON-spec handle.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const sourcePath = arg('--source', path.resolve('tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'))
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-25-slide-cold-preview/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
const sourceBytes = fs.readFileSync(sourcePath)
const rawSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex')
const source = JSON.parse(sourceBytes.toString('utf8'))
const sourceHandle = `asset://locked/uploaded-jsonspec/${rawSha256}.json`
let sessionId = null

async function rpc(method, params = {}) {
	const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
	const parsed = new URL(endpoint)
	const client = parsed.protocol === 'https:' ? https : http
	const response = await new Promise((resolve, reject) => {
		const request = client.request(parsed, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body), ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
		})
		request.setTimeout(0)
		request.once('error', reject)
		request.once('response', res => {
			const chunks = []
			res.on('data', chunk => chunks.push(Buffer.from(chunk)))
			res.once('error', reject)
			res.once('end', () => resolve({ headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
		})
		request.end(body)
	})
	if (!sessionId) sessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'] || null
	const line = response.text.trim().split(/\r?\n/).find(item => item.startsWith('data:'))
	return JSON.parse(line ? line.slice(5).trim() : response.text)
}

async function callTool(name, arguments_) {
	const response = await rpc('tools/call', { name, arguments: arguments_ })
	const structured = response?.result?.structuredContent
	if (structured !== undefined) return structured
	const text = response?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : response
}

function dataOf(result) {
	return result?.data || result || {}
}

function operationOk(result) {
	if (result?.ok !== true) return false
	return typeof result?.data?.ok === 'boolean' ? result.data.ok : true
}

function publicLeakage(value) {
	const text = JSON.stringify(value)
	return [/D:\\PptxGenJS/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i, /process metadata/i].filter(pattern => pattern.test(text)).map(String)
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-showcase-cold-preview-v1', version: '1' }, capabilities: {} })
await rpc('notifications/initialized', {})
const dryRun = await callTool('betterpptx.deck.generate_from_spec', {
	specHandle: sourceHandle,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'summary',
	validateAfterCompile: true,
	validationMode: 'strict',
	idempotencyKey: `showcase-cold-preview-dry-${Date.now()}-${crypto.randomUUID()}`,
})
const dryData = dataOf(dryRun)
const commit = dryRun?.ok === true && dryData.planId
	? await callTool('betterpptx.deck.generate_from_spec', {
		specHandle: sourceHandle,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'free',
		planId: dryData.planId,
		lockedPlanId: dryData.planId,
		planDigest: dryData.planDigest,
		validateAfterCompile: true,
		validationMode: 'strict',
		saveAfterCommit: false,
		idempotencyKey: `showcase-cold-preview-commit-${Date.now()}-${crypto.randomUUID()}`,
	})
	: null
const commitData = dataOf(commit)
const deckId = commitData.deckId || commit?.deckId || null
const validations = {}
const validationCalls = deckId ? [
	['validate', { deckId, mode: 'strict' }],
	['validate_design', { deckId, profile: 'narrated', requireNarration: true, requireMotion: true, requireVisualProof: true }],
	['validate_accessibility', { deckId, mode: 'strict' }],
	['validate_quality', { deckId, profile: 'narrated', mode: 'strict', accessibilityMode: 'strict', requireNarration: true, requireMotion: true, requireVisualProof: true }],
] : []
for (const [shortName, args] of validationCalls) validations[shortName] = await callTool(`betterpptx.deck.${shortName}`, args)
const previews = []
if (deckId) {
	for (const slides of [[...Array(12).keys()], [...Array(12).keys()].map(index => index + 12), [24]]) {
		previews.push(await callTool('betterpptx.deck.preview', { deckId, slides, width: 1280 }))
	}
}
const previewData = previews.map(dataOf)
const previewed = [...new Set(previewData.flatMap(item => Array.isArray(item.previewedSlideIndexes) ? item.previewedSlideIndexes : []))].sort((a, b) => a - b)
const allPreviewed = previewed.length === source.slides.length && previewed.every((slide, index) => slide === index)
const leakage = publicLeakage({ dryRun, commit, validations, previews })
const checks = {
	dryRunOk: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	commitOk: commit?.ok === true && Boolean(deckId),
	slideCount: commitData.slideCount === source.slides.length || dryData.slideCount === source.slides.length,
	allSlidesPreviewed: allPreviewed,
	publicLeakage: leakage.length === 0,
}
const evidence = {
	schemaVersion: 'betterpptx.public-showcase-cold-preview-proof.v1',
	status: Object.values(checks).every(value => value === true) ? 'PASS' : 'BOUNDARY_RECORDED',
	generatedAt: new Date().toISOString(),
	clientProfile: 'fresh-public-cold-client',
	source: { fileName: path.basename(sourcePath), rawSha256, rawBytes: sourceBytes.length, sourceHandle, slideCount: source.slides.length },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, planDigest: dryData.planDigest },
	commit: { ok: commit?.ok === true, deckVersion: commitData.deckVersion, slideCount: commitData.slideCount, deckHandleReturned: Boolean(deckId), narrationSegments: commitData.narrationTimeline?.segments?.length ?? null },
	validationStatuses: Object.fromEntries(Object.entries(validations).map(([name, result]) => [name, { ok: operationOk(result), status: dataOf(result).status, issueCount: (dataOf(result).issues || dataOf(result).errors || []).length }])),
	preview: { calls: previews.length, previewedSlideIndexes: previewed, previewedSlideCount: previewed.length, complete: allPreviewed, batchResults: previewData.map(item => ({ ok: operationOk(item), errorCode: item?.error?.code, errorMessage: item?.error?.message, complete: item.complete, renderedSlideIndexes: item.renderedSlideIndexes, remainingSlideIndexes: item.remainingSlideIndexes, packageSha256: item.packageSha256 })) },
	checks,
	publicLeakage: leakage,
	interpretation: allPreviewed ? 'The fresh client compiled, validated, and previewed every current-version slide. This is not a durable bundle proof: the deck handle is session-scoped and source identity remains the separately archived JSON-spec handle.' : 'The fresh client did not reach complete 25-slide preview; retain the result as a boundary and do not promote the showcase slide gate.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-showcase-cold-preview-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
