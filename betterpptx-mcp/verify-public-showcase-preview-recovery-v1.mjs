#!/usr/bin/env node
// Recover the latest public 25-slide deck from the public recent-deck list
// and complete the preview gate. This deliberately tests structured MCP
// responses (preview includes image blocks) rather than assuming text-only
// tool results.

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
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-25-slide-preview-recovery/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
let sessionId = null

async function rpc(method, params = {}) {
	const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
	const parsed = new URL(endpoint)
	const client = parsed.protocol === 'https:' ? https : http
	const response = await new Promise((resolve, reject) => {
		const request = client.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body), ...(sessionId ? { 'mcp-session-id': sessionId } : {}) } })
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

function leakage(value) {
	const text = JSON.stringify(value)
	return [/D:\\PptxGenJS/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i, /process metadata/i].filter(pattern => pattern.test(text)).map(String)
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-showcase-preview-recovery-v1', version: '1' }, capabilities: {} })
await rpc('notifications/initialized', {})
const recent = dataOf(await callTool('betterpptx.deck.recent', {}))
const candidates = (recent?.decks || []).filter(deck => deck.slideCount === 25 && /Capability Showcase/i.test(String(deck.title || '')))
const deck = candidates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null
const validations = deck ? {
	validate: await callTool('betterpptx.deck.validate', { deckId: deck.deckId, mode: 'strict' }),
	validateDesign: await callTool('betterpptx.deck.validate_design', { deckId: deck.deckId, profile: 'narrated', requireNarration: true, requireMotion: true, requireVisualProof: true }),
	validateAccessibility: await callTool('betterpptx.deck.validate_accessibility', { deckId: deck.deckId, mode: 'strict' }),
	validateNarration: await callTool('betterpptx.deck.validate_narration', { deckId: deck.deckId }),
	validateQuality: await callTool('betterpptx.deck.validate_quality', { deckId: deck.deckId, profile: 'narrated', mode: 'strict', accessibilityMode: 'strict', requireNarration: true, requireMotion: true, requireVisualProof: true }),
} : {}
const previews = []
if (deck) {
	for (const slides of [[...Array(12).keys()], [...Array(12).keys()].map(index => index + 12), [24]]) {
		previews.push(await callTool('betterpptx.deck.preview', { deckId: deck.deckId, slides, width: 1280 }))
	}
}
const previewData = previews.map(dataOf)
const previewed = [...new Set(previewData.flatMap(item => Array.isArray(item?.previewedSlideIndexes) ? item.previewedSlideIndexes : []))].sort((a, b) => a - b)
const complete = previewed.length === 25 && previewed.every((slide, index) => slide === index)
const allPublic = leakage({ recent, validations, previews }).length === 0
const checks = { freshSessionReached: Boolean(sessionId), canonicalDeckFound: Boolean(deck), strictValidationOk: operationOk(validations.validate), designValidationOk: operationOk(validations.validateDesign), accessibilityValidationOk: operationOk(validations.validateAccessibility), narrationValidationOk: operationOk(validations.validateNarration), qualityValidationOk: operationOk(validations.validateQuality), allSlidesPreviewed: complete, publicLeakage: allPublic }
const evidence = {
	schemaVersion: 'betterpptx.public-showcase-preview-recovery-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'BOUNDARY_RECORDED',
	generatedAt: new Date().toISOString(),
	clientProfile: 'fresh-public-session-recovered-session-scoped-deck',
	deck: deck ? { deckId: deck.deckId, deckVersion: deck.deckVersion, title: deck.title, slideCount: deck.slideCount, createdAt: deck.createdAt, saved: deck.saved } : null,
	validation: Object.fromEntries(Object.entries(validations).map(([name, result]) => [name, { ok: operationOk(result), status: dataOf(result).status, issueCount: (dataOf(result).issues || dataOf(result).errors || []).length, failedChecks: (dataOf(result).failed || []).map(item => item.key || item.code).filter(Boolean), blockingIssueCount: Array.isArray(dataOf(result).blockingIssues) ? dataOf(result).blockingIssues.length : 0 }])),
	preview: { calls: previews.length, previewedSlideIndexes: previewed, previewedSlideCount: previewed.length, complete, batches: previewData.map(item => ({ ok: operationOk(item), errorCode: item?.error?.code, errorMessage: item?.error?.message, complete: item?.complete, renderedSlideIndexes: item?.renderedSlideIndexes, remainingSlideIndexes: item?.remainingSlideIndexes, packageSha256: item?.packageSha256 })) },
	checks,
	publicLeakage: leakage({ recent, validations, previews }),
	interpretation: complete ? 'A fresh public session recovered the session-scoped 25-slide deck and rendered all current-version slides. This closes only the fresh preview gate; it does not create a durable source bundle or prove final save.' : 'The public preview gate remains open; no slide certification is promoted.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-showcase-preview-recovery-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
