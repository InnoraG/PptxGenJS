#!/usr/bin/env node
// Fresh public-client baseline for the global Ribbon/Format-pane option
// program. This reports discoverability versus the full inventory; it does
// not promote catalog presence, preset replay, or schema acceptance to proof.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const matrixPath = arg('--matrix', path.resolve('betterpptx-mcp/preset-decomposition-matrix.json'))
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/global-parameter-baseline/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
let sessionId = null

async function rpc(method, params = {}) {
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

function toolList(result) {
	return result?.result?.tools || []
}

function publicToolResult(result) {
	const text = result?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : result
}

const matrixBytes = fs.readFileSync(matrixPath)
const matrix = JSON.parse(matrixBytes.toString('utf8'))
const rows = Array.isArray(matrix.catalogRows) ? matrix.catalogRows : []
const inventoryByMode = {}
for (const row of rows) inventoryByMode[row.capabilityMode] = (inventoryByMode[row.capabilityMode] || 0) + 1

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-global-parameter-baseline-v1', version: '1' }, capabilities: {} })
await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'mcp-session-id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })
const listed = toolList(await rpc('tools/list'))
const optionTool = listed.find(tool => tool.name === 'betterpptx.options.catalog')
const toolNames = listed.map(tool => tool.name).sort()
const optionResult = publicToolResult(await rpc('tools/call', { name: 'betterpptx.options.catalog', arguments: { format: 'full' } }))
const optionData = optionResult?.data || optionResult || {}
const surfaces = Array.isArray(optionData.surfaces) ? optionData.surfaces : []
const servedByMode = {}
for (const surface of surfaces) servedByMode[surface.capabilityMode] = (servedByMode[surface.capabilityMode] || 0) + 1
const matrixSha256 = crypto.createHash('sha256').update(matrixBytes).digest('hex')
const toolNamesSha256 = crypto.createHash('sha256').update(JSON.stringify(toolNames)).digest('hex')
const checks = {
	servedClientReached: listed.length > 0,
	optionsCatalogReturnedFull: optionResult?.ok === true && optionData.schemaVersion === 'betterpptx.options.catalog.v2',
	fullInventoryPresent: matrix.counts?.catalogRows === 2258 && rows.length === 2258,
	formalUniversalClosureStillZero: true,
	noCoordinateAuthoringLeak: !JSON.stringify(optionTool?.inputSchema || {}).match(/"(?:x|y|w|h|bbox|rect|points)"\s*:/i),
}
const evidence = {
	schemaVersion: 'betterpptx.public-global-parameter-baseline.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_BASELINE_ONLY' : 'FAIL',
	generatedAt: new Date().toISOString(),
	endpoint,
	clientProfile: 'fresh-public-options-catalog-session',
	servedToolCount: listed.length,
	servedToolNamesSha256: toolNamesSha256,
	optionsToolSchema: { name: optionTool?.name || null, schemaVersion: optionData.schemaVersion || null },
	servedSurfaceCount: surfaces.length,
	servedSurfaceIds: surfaces.map(surface => surface.id),
	servedSurfaceCapabilityModes: servedByMode,
	fullInventory: {
		path: path.relative(process.cwd(), matrixPath).replace(/\\/g, '/'),
		sha256: matrixSha256,
		schemaVersion: matrix.schemaVersion,
		catalogRows: rows.length,
		optionSurfaces: matrix.counts?.optionSurfaces ?? matrix.optionSurfaces?.length ?? null,
		capabilityModes: inventoryByMode,
	},
	formalClosure: { closedRows: 0, inventoryRows: 2258, statement: '0/2258; catalog discovery is not proof of continuous/discrete control closure.' },
	checks,
	interpretation: 'The served catalog is a discovery baseline only. The global program remains open across shapes, text, WordArt, fills, lines, effects, 3-D, charts, tables, SmartArt, transitions, animations, media, themes, masters, layouts, and other applicable families. Each row still needs typed parameter contract, preset-plus-override behavior, reset/readback, package/reopen/visual proof, and fresh public-client evidence before closure.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-global-parameter-baseline.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
