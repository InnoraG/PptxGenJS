#!/usr/bin/env node
// G7 publication-case boundary reconciliation.  This is deliberately
// fail-closed: strong technical evidence may be assembled, but acceptance is
// never inferred without an owner adoption attestation and authoritative
// preview/save evidence.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g7-publication-case-boundary/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const hashFile = file => sha256(fs.readFileSync(file))
const proof = relative => path.resolve(relative)

const evidence = {
	sourceBundle: 'outputs/authoring-principle-corpus/canonical-25-slide-source-bundle/20260826T050751Z/canonical-25-slide-source-bundle-proof.json',
	lifecycleSchemas: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-lifecycle-schemas/20260826T051527Z/canonical-25-lifecycle-schemas-proof.json',
	deliveryModes: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-delivery-modes/20260826T053151Z/canonical-25-delivery-modes-public-proof.json',
	portableRegeneration: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-portable-regeneration/20260826T053712Z/canonical-25-portable-regeneration-public-proof.json',
	cleanBuilds: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-clean-build-reproducibility/20260826T050206Z/canonical-25-clean-build-reproducibility-proof.json',
	lockedInventory: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-locked-dependency-inventory/20260826T051011Z/canonical-25-locked-dependency-inventory.json',
	motion: 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-motion-timing/20260826T044806Z/canonical-25-motion-timing-native-proof.json',
	releaseManifest: 'release/betterpptx-public/betterpptx-public-manifest.json',
	casebook: 'release/betterpptx-public/casebook/casebook-index.v1.json',
}
const loaded = Object.fromEntries(Object.entries(evidence).map(([key, relative]) => [key, { path: relative, exists: fs.existsSync(proof(relative)), value: fs.existsSync(proof(relative)) ? readJson(proof(relative)) : null, sha256: fs.existsSync(proof(relative)) ? hashFile(proof(relative)) : null }]))

function client(name) {
	let sessionId = null
	let requestId = 0
	async function rpc(method, params = {}) {
		const body = JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params })
		const parsed = new URL(endpoint)
		const transport = parsed.protocol === 'https:' ? https : http
		const response = await new Promise((resolve, reject) => {
			const req = transport.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body), ...(sessionId ? { 'mcp-session-id': sessionId } : {}) } })
			req.setTimeout(0); req.once('error', reject); req.once('response', res => { const chunks = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.once('error', reject); res.once('end', () => resolve({ headers: res.headers, text: Buffer.concat(chunks).toString('utf8') })) }); req.end(body)
		})
		if (!sessionId) sessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'] || null
		const text = response.text.trim(); const line = text.split(/\r?\n/).find(value => value.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text)
	}
	return { async initialize() { await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await rpc('notifications/initialized') }, rpc }
}
const roleA = client('betterpptx-public-g7-publication-boundary-role-a')
await roleA.initialize()
const toolsResponse = await roleA.rpc('tools/list')
const servedNames = (toolsResponse?.result?.tools || []).map(tool => tool.name).sort()

const sourceBundlePass = loaded.sourceBundle.value?.status === 'PASS' && loaded.sourceBundle.value?.checks?.bundleExported === true && loaded.sourceBundle.value?.checks?.bundleImported === true && loaded.sourceBundle.value?.checks?.freshRoleBDryRun === true
const lifecyclePass = loaded.lifecycleSchemas.value?.status === 'PASS' && loaded.lifecycleSchemas.value?.checks && Object.values(loaded.lifecycleSchemas.value.checks).every(Boolean)
const deliveryPass = loaded.deliveryModes.value?.status === 'PASS' && loaded.deliveryModes.value?.checks && Object.values(loaded.deliveryModes.value.checks).every(Boolean)
const portablePass = loaded.portableRegeneration.value?.status === 'PASS' && loaded.portableRegeneration.value?.checks && Object.values(loaded.portableRegeneration.value.checks).every(Boolean)
const cleanBuildPass = loaded.cleanBuilds.value?.status === 'PASS' && loaded.cleanBuilds.value?.checks && Object.values(loaded.cleanBuilds.value.checks).every(Boolean)
const inventoryPass = loaded.lockedInventory.value?.status === 'PASS' && loaded.lockedInventory.value?.checks && Object.values(loaded.lockedInventory.value.checks).every(Boolean)
const motionPass = loaded.motion.value?.status === 'PASS' && loaded.motion.value?.checks && Object.values(loaded.motion.value.checks).every(Boolean)
const release = loaded.releaseManifest.value || {}
const casebook = loaded.casebook.value || {}
const projectionHashesPass = Array.isArray(release.projection?.files) && release.projection.files.every(item => {
	const file = path.resolve('release/betterpptx-public', item.path)
	return fs.existsSync(file) && hashFile(file) === item.sha256
})
const ownerAdoptionAttestation = null
const authoritativePreviewEvidence = false
const checks = {
	freshRoleADiscovery: servedNames.includes('betterpptx.deck.generate_from_spec') && servedNames.includes('betterpptx.spec.export_bundle') && servedNames.includes('betterpptx.bundle.import'),
	technicalSourceBundle: sourceBundlePass,
	principalSchemas: lifecyclePass,
	deliveryModes: deliveryPass,
	portableRegeneration: portablePass,
	cleanBuildReproducibility: cleanBuildPass,
	lockedDependencyInventory: inventoryPass,
	motionTiming: motionPass,
	publicReleaseProjectionHashBound: projectionHashesPass,
	releaseRemainsDevelopment: release.releaseState === 'development',
	casebookStillFailClosed: casebook.truth?.acceptedCaseCount === 0 && Array.isArray(casebook.acceptedCases) && casebook.acceptedCases.length === 0,
	ownerAdoptionAttestationPresent: ownerAdoptionAttestation !== null,
	authoritativePreviewSaveEvidencePresent: authoritativePreviewEvidence,
}
const technicalEvidenceComplete = Object.entries(checks).filter(([key]) => !['ownerAdoptionAttestationPresent', 'authoritativePreviewSaveEvidencePresent'].includes(key)).every(([, value]) => value)
const status = technicalEvidenceComplete && checks.ownerAdoptionAttestationPresent && checks.authoritativePreviewSaveEvidencePresent ? 'ACCEPTED_PUBLIC_CASE' : technicalEvidenceComplete ? 'BLOCKED_OWNER_ATTESTATION_AND_AUTHORITATIVE_PREVIEW' : 'FAIL_TECHNICAL_EVIDENCE'
const output = {
	schemaVersion: 'betterpptx.g7-publication-case-boundary.v1', status, generatedAt: new Date().toISOString(), endpoint,
	publicSurface: { toolCount: servedNames.length, toolNamesSha256: sha256(JSON.stringify(servedNames)) },
	evidence: Object.fromEntries(Object.entries(loaded).map(([key, item]) => [key, { path: item.path, exists: item.exists, sha256: item.sha256, status: item.value?.status || null }])),
	release: { releaseState: release.releaseState || null, sourceProvenance: release.sourceProvenance || null, projectionFileCount: release.projection?.fileCount || null, projectionSha256: release.projection?.sha256 || null },
	casebook: { acceptedCaseCount: casebook.truth?.acceptedCaseCount ?? null, acceptedCases: Array.isArray(casebook.acceptedCases) ? casebook.acceptedCases.length : null },
	checks,
	publicationDecision: { technicalEvidenceComplete, ownerAdoptionAttestation: 'MISSING_EXTERNAL_OWNER_ATTESTATION', authoritativePreviewSave: 'MISSING_AUTHORITATIVE_PREVIEW_SAVE_EVIDENCE', acceptedCaseMutation: 'NOT_PERFORMED' },
	interpretation: status === 'BLOCKED_OWNER_ATTESTATION_AND_AUTHORITATIVE_PREVIEW' ? 'All assembled technical/source/release evidence is complete and hash-bound, but the case remains development-only. Acceptance is intentionally blocked until the rights holder supplies an authenticated adoption/license/privacy attestation and authoritative preview/save evidence. No accepted-case mutation was performed.' : status === 'ACCEPTED_PUBLIC_CASE' ? 'All technical and owner-controlled publication evidence is complete.' : 'Technical evidence is incomplete; no publication decision is made.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'g7-publication-case-boundary.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...output, evidencePath, evidenceSha256 }, null, 2))
if (status === 'FAIL_TECHNICAL_EVIDENCE') process.exitCode = 1
