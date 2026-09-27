#!/usr/bin/env node

// Consolidated art-direction proof. Named Worlds are discrete AI-owned
// starting selectors; inline axes prove that the visual system remains open.

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { artDirectionInfo, listArtDirections } from './ir/layout-engine.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(await fs.readFile(path.join(root, 'betterpptx-mcp', 'preset-decomposition-matrix.json'), 'utf8'))
const sha256 = value => createHash('sha256').update(value).digest('hex')

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

function baseSpec(world) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'presentation authors', outcome: 'prove semantic art direction', remember: 'the AI chooses the visual thesis; the engine realizes it' },
		visualDesign: { world, framing: 'native semantic world proof' },
		styleIntent: { artDirection: world, mode: 'dark' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one governed static clock' },
		slides: [{ id: 'world-proof', title: 'Semantic art direction', role: 'proof', layoutIntent: 'title-body', message: 'The selected World controls a coherent visual grammar.', content: [{ kind: 'title', name: 'world-title', text: 'World remains editable' }, { kind: 'body', name: 'world-body', text: 'AI-selected visual thesis with engine-owned deterministic realization.', region: 'body' }] }],
	}
}

const rows = matrix.catalogRows.filter(row => row.family === 'art-direction')
assert.equal(rows.length, 18)
assert.ok(rows.every(row => row.capabilityMode === 'parameterized' && row.capabilityStatus === 'executable-exact-structured'))
const worlds = listArtDirections()
assert.equal(worlds.length, 18)
assert.equal(new Set(worlds.map(world => world.key)).size, 18)
assert.ok(worlds.every(world => world.label && Array.isArray(world.availableModes) && world.availableModes.length >= 1))

const localPlans = worlds.map(world => {
	const spec = baseSpec(world.key)
	const plan = buildSpecOperationPlan(spec)
	const info = artDirectionInfo(spec)
	return { world: world.key, resolved: plan.appliedDefaults?.artDirection, key: info?.key, mode: info?.mode, card: info?.card, planDigest: plan.planDigest }
})
assert.ok(localPlans.every(row => row.resolved === row.world && row.key === row.world && row.card))

const bespokeSpec = baseSpec({ label: 'AI-composed observatory variant', mode: 'dark', palette: ['F4F7FB', '22D3EE', 'A3E635', 'F59E0B', '08111F'], card: 'outline', surface: { fill: 'outline', cornerRadiusPt: 4, elevationPt: 2 }, depth: { shadow: { blurPt: 8, opacity: 0.22 } } })
const bespokePlan = buildSpecOperationPlan(bespokeSpec)
assert.equal(bespokePlan.appliedDefaults?.artDirection, 'bespoke: AI-composed observatory variant')
assert.equal(artDirectionInfo(bespokeSpec)?.key, 'bespoke')

const publicScript = spawnSync(process.execPath, [path.join(root, 'betterpptx-mcp', 'verify-public-authoring-motion-v1.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 })
assert.equal(publicScript.status, 0)
const sharedRouteSmoke = { command: 'node betterpptx-mcp/verify-public-authoring-motion-v1.mjs', exitCode: publicScript.status, outputSha256: sha256(`${publicScript.stdout || ''}${publicScript.stderr || ''}`) }

const { createMcpToolDispatcher } = await import('./engine.mjs')
const mcp = createMcpToolDispatcher({ sessionId: `public-art-direction-${Date.now()}`, clientInfo: { name: 'public-art-direction-verifier', version: '1' }, blackBox: true })
const data = result => result?.data || result
const catalogResult = await mcp.call('betterpptx.authoring.catalog', { family: 'art-direction', limit: 100 })
const catalog = data(catalogResult)
assert.equal(catalogResult.ok, true)
assert.equal(catalog.pagination?.total, 18)
assert.ok((catalog.entries || []).every(entry => entry.family === 'art-direction' && entry.selectable !== false))
const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: baseSpec('observatory'), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
const dry = data(dryResult)
assert.equal(dryResult.ok, true, JSON.stringify(dryResult?.error))
assert.equal(dry.phase, 'dryRun')
assert.equal(dry.mutationFree, true)
assert.equal(dry.appliedDefaults?.artDirection, 'observatory')
const bespokeDryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec: bespokeSpec, phase: 'dryRun', commitMode: 'createNew', detail: 'summary' })
const bespokeDry = data(bespokeDryResult)
assert.equal(bespokeDryResult.ok, true, JSON.stringify(bespokeDryResult?.error))
assert.match(String(bespokeDry.appliedDefaults?.artDirection || ''), /^bespoke:/)
const publicSerialized = JSON.stringify({ catalogResult, dryResult, bespokeDryResult })
// The public product identifier may legitimately appear in the served catalog;
// reject only implementation paths or private asset/dependency fingerprints.
const privateLeakMatch = publicSerialized.match(/[A-Z]:\\\\|node_modules|\.glb\b/i)
assert.equal(privateLeakMatch, null, privateLeakMatch ? `${privateLeakMatch[0]} near ${publicSerialized.slice(Math.max(0, privateLeakMatch.index - 120), privateLeakMatch.index + 240)}` : '')

const evidence = [await latestPass(path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'layouts-themes-masters-family'), 'layouts/themes/masters Office proof')]
const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-art-direction.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
	schemaVersion: 'betterpptx.art-direction-family-proof.v1',
	status: 'PASS',
	family: { matrixRows: rows.length, namedWorlds: worlds.length, capabilityStatus: 'executable-exact-structured', namedWorldBoundary: '18_parameterized-starting-selectors_with_bespoke_semantic_axes_explicit_not_global_slider_closure', formalUniversalClosure: '43/2258 (unchanged; family proof is not global formal closure)' },
	localPlans,
	bespoke: { resolved: bespokePlan.appliedDefaults?.artDirection, planDigest: bespokePlan.planDigest, axes: ['palette', 'card', 'surface', 'depth'] },
	public: { catalogRows: catalog.pagination.total, namedWorld: dry.appliedDefaults?.artDirection, bespokeWorld: bespokeDry.appliedDefaults?.artDirection, dryRunMutationFree: dry.mutationFree, noPrivateLeakage: true },
	sharedRouteSmoke,
	evidence: await Promise.all(evidence.map(async item => ({ evidence: path.relative(root, item.file).replaceAll(path.sep, '/'), status: item.value.status, proofSha256: sha256(await fs.readFile(item.file, 'utf8')) }))),
	teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath, 'utf8')), projectionSha256: manifest.projection?.sha256, teachingReferenceSha256: teaching.sha256 },
	preservedBoundaries: ['named Worlds are parameterized starting selectors, not a row-level formal closure claim', 'bespoke surface/brand/type/depth axes remain semantic overrides where public contract exposes them', 'AI owns visual thesis and World choice; engine owns deterministic realization and factual readback', 'public responses expose semantic World/readback only', 'universal formal closure remains 43/2258'],
	interpretation: 'All 18 art-direction catalog rows are publicly discoverable and exact as parameterized AI-owned World selectors; a bespoke inline World proves the system remains open beyond presets. The existing native/package/Office theme-layout evidence supplies the carrier boundary, and formal universal closure remains tracked separately from this exact family contract.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'art-direction-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'art-direction-family-proof.json')
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ status: report.status, report: path.relative(root, outPath).replaceAll(path.sep, '/'), sha256: sha256(await fs.readFile(outPath, 'utf8')), matrixRows: rows.length, namedWorlds: worlds.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
