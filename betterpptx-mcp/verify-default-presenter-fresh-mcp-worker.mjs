import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import JSZip from 'jszip'
import { inspectMaterialProfile } from './assets/glb-material-profile.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(here, '..', 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'default-presenter-native-gates-20260730', 'fresh-mcp-worker')
await fs.mkdir(outputDir, { recursive: true })

function envelope(response) {
	if (response?.structuredContent) return response.structuredContent
	const text = response?.content?.find(item => item.type === 'text')?.text || '{}'
	try { return JSON.parse(text) } catch { return { ok: false, error: { message: text } } }
}

function requireOk(label, response) {
	const value = envelope(response)
	if (value.ok !== true) throw new Error(`${label} failed: ${JSON.stringify(value)}`)
	return value.data || value
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Louise native 3D presenter — fresh worker matte replay',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	contentStory: { audience: 'engineering', outcome: 'Verify the Louise fallback after a cold MCP worker start', remember: 'The fallback presenter is front-facing, matte, and independently replaceable.' },
	visualDesign: { world: 'editorial', framing: 'presenter-right' },
	motionTime: { masterClock: 'slide', timingSource: 'native-3d-scenes', syncPolicy: 'one governed clock' },
	presenter: { identity: 'louise', enabled: true, faceRotationY: 0 },
	sections: [{ id: 'main', title: 'Presenter', slideIds: ['s1', 's2'] }],
	slides: [
		{ id: 's1', title: 'Louise native 3D presenter', role: 'opener', message: 'Cold-worker Louise fallback verification', layoutIntent: 'title-body', notes: 'Native 3D presenter proof; distinct from talking-head narration.', content: [
			{ kind: 'title', name: 'title', text: 'Louise native 3D presenter' },
			{ kind: 'body', name: 'body', text: 'Louise geometry and matte materials stay intact; Mixamo supplies the native motion.' },
		] },
		{ id: 's2', title: 'Stable choreography', role: 'content', message: 'Cold-worker identity replay', layoutIntent: 'title-body', content: [
			{ kind: 'title', name: 'title', text: 'Stable choreography' },
			{ kind: 'body', name: 'body', text: 'A new worker must materialize the same front-facing matte fallback without reusing a stale in-memory GLB.' },
		] },
	],
}

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: here,
	stderr: 'pipe',
	env: {
		...process.env,
		// This verifier is a local maintainer-owned cold-worker regression, so it may
		// persist the proof into the workspace. The production/public surface remains
		// black-box and returns opaque downloads instead of local paths.
		BETTERPPTX_PUBLIC_BLACK_BOX: '0',
		BETTERPPTX_LOCAL_MAINTAINER: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PREMIUM: '1',
		BETTERPPTX_FORCE_PLAN: 'premium',
	},
})
const client = new Client({ name: 'default-presenter-fresh-worker-gate', version: '1.0.0' }, { capabilities: {} })
let deckId = null
try {
	await client.connect(transport)
	const auth = requireOk('auth.status', await client.callTool({ name: 'betterpptx.auth.status', arguments: {} }))
	const capabilities = requireOk('help.capabilities', await client.callTool({ name: 'betterpptx.help.capabilities', arguments: { intent: 'Native 3D Louise fallback presenter with front-facing matte material and Mixamo motion.', detail: 'summary' } }))
	const dryRun = requireOk('generate_from_spec dryRun', await client.callTool({ name: 'betterpptx.deck.generate_from_spec', arguments: { spec, phase: 'dryRun', plan: 'premium', detail: 'summary', idempotencyKey: 'fresh-worker-louise-matte-dry-20260730' } }))
	const commit = requireOk('generate_from_spec commit', await client.callTool({ name: 'betterpptx.deck.generate_from_spec', arguments: { spec, phase: 'commit', plan: 'premium', detail: 'summary', idempotencyKey: 'fresh-worker-louise-matte-commit-20260730' } }))
	deckId = commit.deckId
	const validate = requireOk('deck.validate', await client.callTool({ name: 'betterpptx.deck.validate', arguments: { deckId, mode: 'strict' } }))
	const design = requireOk('deck.validate_design', await client.callTool({ name: 'betterpptx.deck.validate_design', arguments: { deckId, profile: 'modern' } }))
	const accessibility = requireOk('deck.validate_accessibility', await client.callTool({ name: 'betterpptx.deck.validate_accessibility', arguments: { deckId, mode: 'strict' } }))
	const quality = requireOk('deck.validate_quality', await client.callTool({ name: 'betterpptx.deck.validate_quality', arguments: { deckId, mode: 'strict', profile: 'modern', accessibilityMode: 'strict' } }))
	const saved = requireOk('deck.save', await client.callTool({ name: 'betterpptx.deck.save', arguments: { deckId, outputDir, fileName: 'default-presenter-louise-fresh-worker-matte-proof.pptx', outputFormat: 'pptx', idempotencyKey: 'fresh-worker-louise-matte-save-20260730' } }))
	// Metadata is not delivery proof. Inspect the GLB bytes that actually reached
	// the saved PPTX so a stale in-memory/durable registration cannot pass merely
	// because the source manifest says "matte".
	const packageZip = await JSZip.loadAsync(await fs.readFile(saved.filePath))
	const modelParts = Object.keys(packageZip.files).filter(name => /^ppt\/media\/.*\.glb$/i.test(name))
	if (!modelParts.length) throw new Error('Fresh-worker Louise proof contains no embedded GLB model.')
	const embeddedMaterialProfiles = []
	for (const partName of modelParts) {
		const profile = inspectMaterialProfile(await packageZip.file(partName).async('nodebuffer'))
		embeddedMaterialProfiles.push({ partName, profile })
		if (!profile.length || profile.some(material => material.metallicFactor !== 0 || material.roughnessFactor !== 1 || material.hasMetallicRoughnessTexture || material.hasSpecularExtension)) {
			throw new Error(`Embedded presenter material is not matte: ${partName}`)
		}
	}
	const report = {
		schemaVersion: 'betterpptx.default-presenter-fresh-worker-gate.v1',
		status: 'PASS',
		worker: 'fresh stdio MCP process',
		identity: 'louise',
		frontFacingYawDegrees: 0,
		cacheBoundary: 'source-signature plus matte-v2 material-profile invalidation',
		deckId,
		auth: { authenticated: auth.authenticated, plan: auth.plan },
		capabilities: { authoringSurface: capabilities.authoringSurface, recommendedMode: capabilities.recommendedMode },
		dryRun: { ok: true, planDigest: dryRun.planDigest, operationCount: dryRun.operationCount },
		commit: { ok: true, planDigest: commit.planDigest, operationCount: commit.operationCount },
		validation: { package: validate.valid === true, issueCount: validate.issueCount, design: design.ok !== false, accessibilityScore: accessibility.score, quality: quality.ok === true },
		saved: { filePath: saved.filePath, bytes: saved.bytes, slideCount: saved.slideCount, embeddedMaterialProfiles },
	}
	await fs.writeFile(path.join(outputDir, 'fresh-worker-louise-matte-proof.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
	console.log(JSON.stringify(report, null, 2))
} finally {
	try { await client.close() } catch {}
	try { await transport.close() } catch {}
}
