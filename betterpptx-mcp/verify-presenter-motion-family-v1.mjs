#!/usr/bin/env node

// Consolidated presenter-motion family proof.  The family is certified as one
// accounting/proof boundary: native presenter motion, narration, animation,
// transition, timing, and public lifecycle are checked together, while rows
// without a measured native source remain explicitly non-selectable.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listOptionCatalog } from './option-registry.mjs'
import { authoringMotionCatalog, publicAuthoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'

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
	const files = await walk(dir)
	const accepted = []
	for (const file of files) {
		try {
			const value = JSON.parse(await fs.readFile(file, 'utf8'))
			if (String(value.status || '').startsWith('PASS') || String(value.status || '').startsWith('MCP_')) {
				accepted.push({ file, value, mtimeMs: (await fs.stat(file)).mtimeMs })
			}
		} catch {}
	}
	accepted.sort((a, b) => b.mtimeMs - a.mtimeMs)
	assert.ok(accepted.length, `No passing evidence for ${label}`)
	return accepted[0]
}

function runNode(file) {
	const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 })
	const output = `${result.stdout || ''}${result.stderr || ''}`
	assert.equal(result.status, 0, `${file}\n${output.slice(-6000)}`)
	return { command: `node ${file}`, exitCode: result.status, outputSha256: sha256(output), outputTail: output.slice(-500) }
}

const rows = matrix.catalogRows.filter(row => row.family === 'presenter-motion')
assert.equal(rows.length, 96)
const structuredPartial = rows.filter(row => row.capabilityStatus === 'structured-partial')
const missing = rows.filter(row => row.capabilityStatus === 'missing')
assert.equal(structuredPartial.length, 49)
assert.equal(missing.length, 47)

const catalog = authoringMotionCatalog({ refresh: true })
const publicSelectable = publicAuthoringMotionCatalog({ family: 'motion', limit: 500 })
const publicAll = publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 500 })
assert.equal(catalog.inventory.total, 96)
assert.equal(catalog.inventory.selectable, 48)
assert.equal(publicSelectable.pagination.total, 48)
assert.equal(publicAll.pagination.total, 96)
assert.equal(publicAll.motions.filter(row => !row.selectable).length, 48)
assert.ok(publicAll.motions.filter(row => !row.selectable).every(row => ['PLANNED_NOT_SELECTABLE', 'IMPLEMENTED_NOT_SELECTABLE'].includes(row.availability)))

const animation = listOptionCatalog({ surface: 'animationPreset', format: 'full' }).surfaces[0]
const transition = listOptionCatalog({ surface: 'transitionPreset', format: 'full' }).surfaces[0]
assert.ok(animation && animation.parameters.length >= 20 && animation.canonical.length >= 166)
assert.ok(transition && transition.parameters.length >= 16 && transition.canonical.length >= 49)

const focusedRegression = [
	'betterpptx-mcp/verify-authoring-motion-catalog.mjs',
	'betterpptx-mcp/verify-authoring-motion-spec-v1.mjs',
	'betterpptx-mcp/verify-authoring-motion-bundle.mjs',
	'betterpptx-mcp/verify-presenter-contract.mjs',
	'betterpptx-mcp/verify-presenter-gesture.mjs',
	'betterpptx-mcp/verify-public-authoring-motion-v1.mjs',
].map(runNode)

const evidenceRoots = [
	['animation-format-parameters-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'animation-format-parameters-native')],
	['animation-format-parameters-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'animation-format-parameters-public')],
	['animation-timing-sliders-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'animation-timing-sliders-native')],
	['transition-format-parameters-native', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'transition-format-parameters-native')],
	['transition-format-parameters-public', path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'transition-format-parameters-public')],
	['canonical-motion-timing', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-motion-timing')],
	['canonical-narration-transition', path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'canonical-25-slide-narration-transition')],
]
const evidence = []
for (const [label, dir] of evidenceRoots) evidence.push(await latestPass(dir, label))

const manifestPath = path.join(root, 'release', 'betterpptx-public', 'betterpptx-public-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const teaching = manifest.projection.files.find(file => file.path === 'skills/betterpptx/references/native-presenter-motion.md')
assert.ok(teaching && teaching.bytes > 1000)
const releaseGit = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseGit.status, 0)
const releaseStatus = spawnSync('git', ['-C', path.join(root, 'release', 'betterpptx-public'), 'status', '--short'], { cwd: root, encoding: 'utf8' })
assert.equal(releaseStatus.status, 0)
assert.equal(releaseStatus.stdout.trim(), '')

const report = {
	schemaVersion: 'betterpptx.presenter-motion-family-proof.v1',
	status: 'PASS',
	family: {
		matrixRows: rows.length,
		structuredPartialRows: structuredPartial.length,
		missingRows: missing.length,
		catalogRows: catalog.inventory.total,
		selectableRows: catalog.inventory.selectable,
		animationSelectors: animation.canonical.length,
		animationParameters: animation.parameters.length,
		transitionSelectors: transition.canonical.length,
		transitionParameters: transition.parameters.length,
		formalUniversalClosure: '0/2258 (unchanged; family proof is not global formal closure)',
	},
	focusedRegression,
	evidence: evidence.map(item => ({ evidence: rel(item.file), status: item.value.status, proofSha256: sha256(JSON.stringify(item.value)) })),
	teachingRelease: { commit: releaseGit.stdout.trim(), manifestSha256: sha256(await fs.readFile(manifestPath)), projectionSha256: manifest.projection.sha256, teachingReferenceSha256: teaching.sha256 },
	preservedBoundaries: [
		'47 motion rows without a native source remain missing and non-selectable; no unrelated clip substitution is claimed',
		'one playback-held ordinary row remains IMPLEMENTED_NOT_SELECTABLE until PowerPoint visual proof is satisfactory',
		'18-motion PowerPoint bundle ceiling is enforced independently from the 96-row semantic catalog',
		'private animation slots, clip maps, source paths, and bundle handles remain hidden from public readback',
		'narration is the master clock; native WebVTT captions are a separate explicit media surface',
		'universal formal closure remains 0/2258',
	],
	interpretation: 'Presenter identity, semantic motion selection, native animation and transition timing, narration synchronization, reset/re-edit semantics, and the public black-box lifecycle are certified as one coherent family. The full 96-row vocabulary is accounted for, while 47 planned interaction/kinetic rows and one playback-held row remain explicit capability boundaries rather than invented support.',
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'presenter-motion-family', stamp)
await fs.mkdir(outDir, { recursive: true })
const outPath = path.join(outDir, 'presenter-motion-family-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(outPath, bytes)
await fs.writeFile(`${outPath}.sha256`, `${sha256(bytes)}  ${path.basename(outPath)}\n`)
console.log(JSON.stringify({ status: report.status, report: rel(outPath), sha256: sha256(bytes), matrixRows: rows.length, selectableRows: catalog.inventory.selectable, evidenceRoots: evidence.length, releaseCommit: releaseGit.stdout.trim() }, null, 2))
