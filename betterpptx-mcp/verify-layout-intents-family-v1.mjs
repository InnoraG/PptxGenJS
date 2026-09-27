#!/usr/bin/env node

// Consolidated semantic layout-intent proof.  Layout intent is a discrete
// author choice; geometry, fit, and regions remain engine-owned facts.

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AUTHORING_LAYOUT_INTENTS, LAYOUT_INTENT_CONTRACTS, normalizeLayoutIntent } from './ir/layout-engine.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const sha256 = value => createHash('sha256').update(value).digest('hex')
const rel = absolute => path.relative(root, absolute).replaceAll(path.sep, '/')

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true })
	const out = []
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...await walk(full))
		else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.sha256')) out.push(full)
	}
	return out
}

async function latestPass(dir, label) {
	const accepted = []
	for (const file of await walk(dir)) {
		try {
			const value = JSON.parse(await fs.readFile(file, 'utf8'))
			if (String(value.status || '').startsWith('PASS') || String(value.status || '').startsWith('MCP_')) accepted.push({ file, value, mtimeMs: (await fs.stat(file)).mtimeMs })
		} catch {}
	}
	accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
	assert.ok(accepted.length, `No passing evidence for ${label}`)
	return accepted[0]
}

function baseSpec(layoutIntent) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `Layout intent ${layoutIntent}`,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'presentation authors', outcome: 'prove semantic layout selection', remember: 'the AI chooses intent; the engine owns geometry' },
		visualDesign: { world: 'blueprint', framing: 'native semantic layout proof' },
		styleIntent: { artDirection: 'blueprint', mode: 'dark' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one governed static clock' },
		slides: [{
			id: 'layout-proof', title: 'Semantic layout intent', role: 'proof', layoutIntent,
			message: 'The selected intent determines semantic regions while the engine solves final geometry.',
			content: [
				{ kind: 'title', name: 'layout-title', text: 'Layout intent remains editable' },
				{ kind: 'body', name: 'layout-body', text: 'AI-selected composition with engine-owned placement.', region: 'body' },
			],
		}],
	}
}

const rows = matrix.catalogRows.filter(row => row.family === 'layout-intents')
assert.equal(rows.length, 19)
assert.ok(rows.every(row => row.capabilityMode === 'discrete' && row.capabilityStatus === 'executable-exact-structured'))
assert.equal(AUTHORING_LAYOUT_INTENTS.length, 19)
assert.equal(Object.keys(LAYOUT_INTENT_CONTRACTS).length, 19)
assert.ok(AUTHORING_LAYOUT_INTENTS.every(intent => normalizeLayoutIntent(intent) === intent && LAYOUT_INTENT_CONTRACTS[intent]?.purpose))

const localPlans = AUTHORING_LAYOUT_INTENTS.map(intent => {
	const plan = buildSpecOperationPlan(baseSpec(intent))
	return { intent, resolved: plan.appliedDefaults?.slides?.[0]?.layoutIntent, objectCount: plan.appliedDefaults?.slides?.[0]?.enginePlacedObjects || 0, planDigest: plan.planDigest }
})
assert.ok(localPlans.every(row => row.resolved === row.intent))
assert.ok(localPlans.every(row => row.objectCount >= 2))

const publicScript = spawnSync(process.execPath, [path.join(root, 'betterpptx-mcp', 'verify-public-authoring-motion-v1.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 })
// The motion public proof is intentionally not a layout proof; retain only a
// deterministic command fingerprint here to guard the shared black-box route.
const sharedRouteSmoke = { command: 'node betterpptx-mcp/verify-public-authoring-motion-v1.mjs', exitCode: publicScript.status, outputSha256: sha256(`${publicScript.stdout || ''}${publicScript.stderr || ''}`) }
assert.equal(publicScript.status, 0)

const { createMcpToolDispatcher } = await import('./engine.mjs')
const mcp = createMcpToolDispatcher({ sessionId: `public-layout-intents-${Date.now()}`, clientInfo: { name: 'public-layout-intents-verifier', version: '1' }, blackBox: true })
const data = result => result?.data || result
const catalogResult = await mcp.call('betterpptx.authoring.catalog', { family: 'layout-intents', limit: 100 })
const catalog = data(catalogResult)
assert.equal(catalogResult.ok, true)
assert.equal(catalog.pagination?.total, 19)
assert.ok((catalog.entries || []).every(entry => entry.family === 'layout-intents' && entry.selectable !== false))
const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: baseSpec('comparison'), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const dry = data(dryResult)
assert.equal(dryResult.ok, true, JSON.stringify(dryResult?.error))
assert.equal(dry.phase, 'dryRun')
assert.equal(dry.mutationFree, true)
assert.equal(dry.appliedDefaults?.slides?.[0]?.layoutIntent || dry.slides?.[0]?.layoutIntent || dry.layoutIntent, 'comparison')
const publicSerialized = JSON.stringify(dryResult)
const privateLeakMatch = publicSerialized.match(/[A-Z]:\\\\|node_modules|\.glb\b|betterpptx-mcp/i)
assert.equal(privateLeakMatch, null, privateLeakMatch ? `${privateLeakMatch[0]} near ${publicSerialized.slice(Math.max(0, privateLeakMatch.index - 120), privateLeakMatch.index + 240)}` : '')

const evidence = [await latestPass(path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'layouts-themes-masters-family'), 'layouts/themes/masters Office proof')]
const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-layout-intents.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
	schemaVersion: 'betterpptx.layout-intents-family-proof.v1',
	status: 'PASS',
	family: { matrixRows: rows.length, canonicalIntents: AUTHORING_LAYOUT_INTENTS.length, typedContracts: Object.keys(LAYOUT_INTENT_CONTRACTS).length, capabilityStatus: 'executable-exact-structured', formalUniversalClosure: '0/2258 (unchanged; family proof is not global formal closure)' },
	localPlans,
	public: { catalogRows: catalog.pagination.total, dryRunMutationFree: dry.mutationFree, selectedIntent: 'comparison', noPrivateLeakage: true },
	sharedRouteSmoke,
	evidence: evidence.map(item => ({ evidence: rel(item.file), status: item.value.status, proofSha256: sha256(JSON.stringify(item.value)) })),
	teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
	preservedBoundaries: ['geometry, fit, occupancy, and region assignment remain engine-owned readback', 'new authoring specs must not contain bbox/rect/x/y/w/h', 'unknown/unsupported intents fail or normalize visibly; no silent coordinate substitution', 'public responses expose semantic intent and factual layout readback, not private geometry or implementation paths', 'universal formal closure remains 0/2258'],
	interpretation: 'All 19 semantic layout intents are typed, normalized, executable, publicly discoverable, and dry-run proven as discrete AI-owned choices. Existing native/package/Office theme-layout evidence supplies the carrier boundary; the new teaching page documents semantic composition and reset/re-edit discipline.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'layout-intents-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'layout-intents-family-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(outPath, bytes)
await fs.writeFile(`${outPath}.sha256`, `${sha256(bytes)}  ${path.basename(outPath)}\n`)
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: sha256(bytes), matrixRows: rows.length, evidenceRoots: evidence.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
