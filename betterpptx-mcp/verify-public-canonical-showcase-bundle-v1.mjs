#!/usr/bin/env node
// Fresh Role-A/Role-B public-client proof for the durable 25-slide showcase
// source. The harness reads only the supplied source artifact locally; all
// authoring, export, inspection, import, and dry-run operations go through the
// public MCP endpoint.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const sourcePath = arg('--source', path.resolve('outputs/durable-deck-specs/79/790804ca47f029379e8c833a13c90cfaa1837207d25dfe077bdfebc1ef99f899.deck-spec.v1.json'))
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/canonical-25-slide-source-bundle/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex') }
function parseResponse(text) {
	const dataLine = String(text || '').trim().split(/\r?\n/).find(line => line.startsWith('data:'))
	return JSON.parse(dataLine ? dataLine.slice(5).trim() : text)
}

function makeClient(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
				body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
			})
			if (!sessionId) sessionId = response.headers.get('mcp-session-id')
			return parseResponse(await response.text())
		},
		async call(tool, arguments_ = {}) {
			const result = await this.rpc('tools/call', { name: tool, arguments: arguments_ })
			const text = result?.result?.content?.find(item => item.type === 'text')?.text
			return text ? JSON.parse(text) : result
		},
		async initialize() {
			await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
			await this.rpc('notifications/initialized')
		},
	}
}

function assertOk(result, label) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result).slice(0, 1800)}`)
}

if (!fs.existsSync(sourcePath)) throw new Error(`Canonical source artifact is missing: ${sourcePath}`)
const sourceBytes = fs.readFileSync(sourcePath)
const source = JSON.parse(sourceBytes.toString('utf8'))
if (source.schemaVersion !== 'betterpptx.deck-spec.v1' || !Array.isArray(source.slides) || source.slides.length !== 25) throw new Error('The supplied source is not the canonical 25-slide BetterPPTX spec.')

const roleA = makeClient('betterpptx-canonical-showcase-role-a')
await roleA.initialize()
const toolsA = await roleA.rpc('tools/list')
const servedNames = (toolsA?.result?.tools || []).map(tool => tool.name).sort()
const uploaded = await roleA.call('betterpptx.assets.upload', {
	kind: 'jsonSpec',
	data: `data:application/json;base64,${sourceBytes.toString('base64')}`,
	fileName: 'canonical-25-slide-source.json',
})
assertOk(uploaded, 'Role A jsonSpec upload')
const exported = await roleA.call('betterpptx.spec.export_bundle', {
	specHandle: uploaded.data.handle,
	mode: 'authoredInput',
	download: true,
	fileName: 'canonical-25-slide-source',
})
assertOk(exported, 'Role A source bundle export')
if (!exported.data?.artifact?.downloadUrl) throw new Error('The canonical showcase bundle did not publish a download URL.')
const bundleBytes = Buffer.from(await (await fetch(exported.data.artifact.downloadUrl)).arrayBuffer())
const bundleData = `data:application/zip;base64,${bundleBytes.toString('base64')}`

// Role B is a genuinely new MCP session. It receives only the bundle bytes,
// never the original deckId or the Role-A spec handle.
const roleB = makeClient('betterpptx-canonical-showcase-role-b')
await roleB.initialize()
const inspected = await roleB.call('betterpptx.bundle.inspect', { data: bundleData })
assertOk(inspected, 'Role B bundle inspection')
const imported = await roleB.call('betterpptx.bundle.import', { data: bundleData })
assertOk(imported, 'Role B bundle import')
const dryRun = await roleB.call('betterpptx.deck.generate_from_spec', { specHandle: imported.data.specHandle, phase: 'dryRun', commitMode: 'createNew' })
assertOk(dryRun, 'Role B imported-source dryRun')

const evidence = {
	schemaVersion: 'betterpptx.public-canonical-showcase-source-bundle-proof.v1',
	status: 'PASS',
	generatedAt: new Date().toISOString(),
	endpoint,
	source: {
		schemaVersion: source.schemaVersion,
		slideCount: source.slides.length,
		rawSha256: sha256(sourceBytes),
		rawBytes: sourceBytes.length,
		uploadedCanonicalSha256: uploaded.data.canonicalSha256,
		uploadedRawSha256: uploaded.data.rawSha256,
	},
	roleA: {
		servedToolCount: servedNames.length,
		servedToolNamesSha256: sha256(Buffer.from(JSON.stringify(servedNames), 'utf8')),
		compiledThroughPublicPath: false,
		uploadHandleUsed: Boolean(uploaded.data.handle),
		effectiveArtifactSha256: exported.data.sourceArtifact?.sha256 || null,
		bundleSha256: exported.data.bundleSha256,
		sourceDigest: exported.data.sourceDigest,
		bundleBytes: bundleBytes.length,
	},
	roleB: {
		freshSession: true,
		inspectedSourceDigest: inspected.data.sourceDigest,
		memberCount: inspected.data.memberCount,
		boundAssetCount: imported.data.boundAssetCount,
		specHandleReturned: Boolean(imported.data.specHandle),
		importedSpecDigest: imported.data.specDigest,
		dryRunPlanDigest: dryRun.data?.planDigest || dryRun.data?.estimatedPlanDigest || null,
		originalDeckHandleReused: false,
	},
	checks: {
		source25Slides: source.slides.length === 25,
		uploadCanonicalIdentityPresent: Boolean(uploaded.data.canonicalSha256),
		bundleExported: true,
		bundleInspected: inspected.data.sourceDigest === exported.data.sourceDigest,
		bundleImported: true,
		freshRoleBDryRun: Boolean(dryRun.ok),
		noOriginalDeckHandleInRoleB: true,
	},
	privacy: { rawXmlIncluded: false, localPathsIncluded: false, privateImplementationIncluded: false },
	interpretation: 'Role A uploaded the durable 25-slide source through the public MCP and exported it directly as a deterministic source bundle without requiring a narrated compile. A fresh Role B received only the bundle, verified it, imported it, rebound embedded assets, and completed a mutation-free dryRun without the original session handle. This proves canonical showcase source handoff; it does not certify final save, visual parity, or universal 2,258-row capability closure.',
}
if (!Object.values(evidence.checks).every(Boolean)) throw new Error(`Canonical showcase bundle checks failed: ${JSON.stringify(evidence.checks)}`)
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-25-slide-source-bundle-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
