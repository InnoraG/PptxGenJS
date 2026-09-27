#!/usr/bin/env node
// Verifies that an authentic uploaded native Record Studio capture can be
// reused through the public semantic JSON-spec front door without
// client-authored geometry. Ordinary media promotion is covered separately by
// the negative avatar-boundary tests and is never accepted by this verifier.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

function fail(message, detail = {}) {
	console.error('SEMANTIC AVATAR REPAIR VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}
function data(label, result) {
	const envelope = result?.structuredContent || (() => {
		try { return JSON.parse(result?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!envelope || envelope.ok !== true) fail(`${label} failed.`, { result, envelope })
	return envelope.data || envelope
}
function strings(value, out = []) {
	if (typeof value === 'string') out.push(value)
	else if (Array.isArray(value)) value.forEach(item => strings(item, out))
	else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out))
	return out
}

const manifest = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/docs/release-safety/G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json'), 'utf8'))
const artifact = manifest.artifacts[0]
const presenterObjectName = artifact.playbackContract?.slides?.[0]?.videoObjectName || 'Native Record Studio Presenter'
const sourceCropPercent = artifact.playbackContract?.talkingHeadFrame?.sourceCropPercent || { left: 0, right: 0, top: 10, bottom: 10 }
const bytes = await fs.readFile(path.resolve(artifact.path))
const cwd = path.dirname(fileURLToPath(import.meta.url))
const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs'], cwd, stderr: 'pipe', env: {
	...process.env, BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_LOCAL_MAINTAINER: '0',
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1',
} })
const client = new Client({ name: 'semantic-avatar-repair-verifier', version: '1' }, { capabilities: {} })
await client.connect(transport)
const opened = data('open_uploaded', await client.callTool({ name: 'betterpptx.deck.open_uploaded', arguments: {
	data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
	fileName: 'uploaded-avatar-reference.pptx', preserveTiming: true,
} }))

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Semantic uploaded-avatar repair',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		geometryAuthority: 'engine',
		placementPolicy: 'semantic-layout-only',
	},
	contentStory: { audience: 'Owner-authenticated presenter review', outcome: 'Reuse the approved media while restoring the governed frame and clock.', remember: 'The engine owns geometry and timing.' },
	visualDesign: { world: 'Quiet review surface', framing: 'Minimal semantic repair of the uploaded deck.' },
	motionTime: { masterClock: 'native narration when present; otherwise measured presenter media', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates presenter media and transition.' },
	styleIntent: { density: 'executive-medium', tone: 'direct', visualSystem: 'quiet review surface', avoid: ['client-authored rectangles', 'duplicate poster images'] },
	slides: [{
		id: 'slide-1',
		slideIndex: 0,
		avatarNarration: { objectName: presenterObjectName, enabled: true, reuseExisting: true },
	}],
}
const dry = data('semantic repair dryRun', await client.callTool({ name: 'betterpptx.deck.generate_from_spec', arguments: {
	deckId: opened.deckId, commitMode: 'patch', phase: 'dryRun', spec, includePatchPlan: true,
} }))
const operations = dry.patchPlan?.operations || dry.billing?.patchEstimate?.operations || []
if (!operations.some(op => op.tool === 'betterpptx.slide.update_media' && op.objectName === presenterObjectName)) {
	fail('Dry-run did not expose the semantic avatar frame operation.', { operations })
}
const forbiddenKeys = new Set(['bbox', 'rect', 'x', 'y', 'w', 'h', 'rawPreservation', 'rawNativePreservation', 'opaqueNative'])
function hasForbiddenKey(value) {
	if (Array.isArray(value)) return value.some(hasForbiddenKey)
	if (!value || typeof value !== 'object') return false
	return Object.entries(value).some(([key, child]) => forbiddenKeys.has(key) || hasForbiddenKey(child))
}
if (hasForbiddenKey(spec)) fail('Verifier spec contained client-authored geometry or raw preservation.')
const committed = data('semantic repair commit', await client.callTool({ name: 'betterpptx.deck.generate_from_spec', arguments: {
	deckId: opened.deckId, commitMode: 'patch', phase: 'commit', spec, billingConfirmed: true,
} }))
const validation = data('validate repaired avatar', await client.callTool({ name: 'betterpptx.deck.validate_avatar_narration', arguments: {
	deckId: opened.deckId,
	contract: {
		requireAutoplay: true,
		requireNativeNarrationMarker: true,
		requireNarrationNotes: true,
		requireBetterPptxNarrationNotes: true,
		talkingHeadFrame: {
				shape: 'ellipse',
				crop: 'centered-cover',
				canonicalWindowIn: { x: 10.993, y: 5.16, w: 2.25, h: 2.25 },
			sourceCropPercent,
				toleranceIn: 0.01,
		},
	},
} }))
if (validation.issues?.length) fail('Semantic repair still has playback/frame issues.', validation)
const publicStrings = strings({ dry, committed, validation })
if (publicStrings.some(value => /(?:[A-Za-z]:\\|\/Users\/|\/tmp\/|node_modules|engine\.mjs|spec-compiler\.mjs|<p:|<a:|<r:)/i.test(value))) {
	fail('Semantic repair response leaked private implementation details.')
}
console.log('SEMANTIC AVATAR REPAIR VERIFY: PASS')
console.log(JSON.stringify({
	openedDeckId: opened.deckId,
	patchOperations: operations.filter(op => op.tool === 'betterpptx.slide.update_media').length,
	patchResults: committed.patchResults?.length || 0,
	validation: { ok: validation.ok, issueCount: validation.issues?.length || 0 },
}, null, 2))
await client.close().catch(() => {})
await transport.close().catch(() => {})
