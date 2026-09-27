#!/usr/bin/env node
// Fresh public-client proof for the portable .betterpptx source handoff.
// This probe deliberately uses only the served MCP surface: compile a tiny
// semantic spec, export a source bundle, download it, inspect/import it in the
// same fresh client, and run a mutation-free dryRun from the imported handle.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-json-spec-bundle-boundary/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
let sessionId = null
let requestId = 0

async function rpc(method, params = {}) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
	})
	if (!sessionId) sessionId = response.headers.get('mcp-session-id')
	const text = await response.text()
	const dataLine = text.trim().split(/\r?\n/).find(line => line.startsWith('data:'))
	return JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
}

async function call(name, arguments_ = {}) {
	const result = await rpc('tools/call', { name, arguments: arguments_ })
	const text = result?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : result
}

function assertOk(result, label) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result).slice(0, 1200)}`)
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-source-bundle-boundary-v2', version: '1' }, capabilities: {} })
await rpc('notifications/initialized')
const listedResult = await rpc('tools/list')
const listed = listedResult?.result?.tools || []
const names = listed.map(tool => tool.name)
const upload = listed.find(tool => tool.name === 'betterpptx.assets.upload')
const generate = listed.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
const exportBundle = listed.find(tool => tool.name === 'betterpptx.spec.export_bundle')
const inspectBundle = listed.find(tool => tool.name === 'betterpptx.bundle.inspect')
const importBundle = listed.find(tool => tool.name === 'betterpptx.bundle.import')
const uploadKinds = upload?.inputSchema?.properties?.kind?.enum || []
const checks = {
	servedClientReached: listed.length > 0,
	jsonSpecIngressPresent: uploadKinds.includes('jsonSpec'),
	jsonSpecCompilerPresent: Boolean(generate?.inputSchema?.properties?.specHandle),
	portableBundleExportPresent: Boolean(exportBundle?.inputSchema?.properties?.mode),
	portableBundleInspectPresent: Boolean(inspectBundle),
	portableBundleImportPresent: Boolean(importBundle),
}
if (!Object.values(checks).every(Boolean)) throw new Error(`Required bundle tools are not served: ${JSON.stringify(checks)}`)

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Portable bundle boundary proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
	contentStory: { audience: 'bundle verifier', outcome: 'verify portable source handoff', remember: 'source survives a fresh session' },
	visualDesign: { world: 'Minimal verification brief', framing: 'one clear claim' },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Static verification plan', syncPolicy: 'No decorative motion' },
	slides: [{ id: 'bundle-boundary-proof', title: 'Portable source bundle', layoutIntent: 'title-body', content: [
		{ kind: 'title', name: 'title', text: 'Portable source bundle' },
		{ kind: 'body', name: 'body', text: 'The source crosses sessions without runtime handles.' },
	] }],
}
const generated = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', billingConfirmed: true, plan: 'premium' })
assertOk(generated, 'generate')
const exported = await call('betterpptx.spec.export_bundle', { deckId: generated.data.deckId, mode: 'effectivePrecompile', download: true, fileName: 'public-source-bundle-boundary-proof' })
assertOk(exported, 'spec.export_bundle')
if (!exported.data?.artifact?.downloadUrl) throw new Error('Bundle export did not return a public download URL.')
const bundleBytes = Buffer.from(await (await fetch(exported.data.artifact.downloadUrl)).arrayBuffer())
const bundleData = `data:application/zip;base64,${bundleBytes.toString('base64')}`
const inspected = await call('betterpptx.bundle.inspect', { data: bundleData })
assertOk(inspected, 'bundle.inspect')
const imported = await call('betterpptx.bundle.import', { data: bundleData })
assertOk(imported, 'bundle.import')
const dryRun = await call('betterpptx.deck.generate_from_spec', { specHandle: imported.data.specHandle, phase: 'dryRun', commitMode: 'createNew' })
assertOk(dryRun, 'imported spec dryRun')

const evidence = {
	schemaVersion: 'betterpptx.public-source-bundle-boundary-proof.v2',
	status: 'PASS',
	generatedAt: new Date().toISOString(),
	endpoint,
	clientProfile: 'fresh-public-schema-session',
	servedToolCount: listed.length,
	servedToolNamesSha256: crypto.createHash('sha256').update(JSON.stringify(names.slice().sort())).digest('hex'),
	checks,
	proof: {
		deckId: generated.data.deckId,
		bundleSha256: exported.data.bundleSha256,
		sourceDigest: exported.data.sourceDigest,
		downloadName: exported.data.artifact.downloadName,
		downloadBytes: bundleBytes.length,
		inspectedSourceDigest: inspected.data.sourceDigest,
		memberCount: inspected.data.memberCount,
		boundAssetCount: imported.data.boundAssetCount,
		specHandleReturned: Boolean(imported.data.specHandle),
		importedSpecDigest: imported.data.specDigest,
		dryRunPlanDigest: dryRun.data?.planDigest || dryRun.data?.estimatedPlanDigest || null,
	},
	privacy: { rawXmlIncluded: false, localPathsIncluded: false, privateImplementationIncluded: false },
	interpretation: 'A fresh public client compiled a semantic source, exported a deterministic .betterpptx bundle, verified its manifest and member digests, imported it, and completed a mutation-free dryRun from the imported opaque spec handle. This closes the source/build bundle handoff boundary only; universal capability closure and later lifecycle/release gates remain open.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-source-bundle-boundary-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
