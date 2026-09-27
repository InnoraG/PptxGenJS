#!/usr/bin/env node
// P0 source/provenance guard. Development runs report the current tree without
// pretending it is release evidence; strict release runs fail closed until the
// exact private commit is clean and tied to the maintained private remote.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeGitProvenance } from './export-git-provenance.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const strict = process.argv.includes('--strict') || process.env.BETTERPPTX_SOURCE_PROVENANCE_GATE === '1'
const outArg = process.argv.find(arg => arg.startsWith('--out='))
const outputPath = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(here, 'outputs', 'source-provenance-gate-report.json')

let provenance
const issues = []
try {
	provenance = summarizeGitProvenance({ cwd: repoRoot, remote: 'betterpptx-mcp', matrixGrade: false })
} catch (error) {
	issues.push({ code: 'PROVENANCE_READ_FAILED', message: String(error?.message || error) })
	provenance = null
}

if (!provenance?.gitCommit || !/^[0-9a-f]{40}$/i.test(String(provenance.gitCommit))) {
	issues.push({ code: 'COMMIT_INVALID', message: 'A full 40-character git commit is required.' })
}
if (!provenance?.gitRemote) {
	issues.push({ code: 'PRIVATE_REMOTE_MISSING', message: 'The maintained private betterpptx-mcp remote is missing.' })
}
if (provenance && provenance.gitTreeClean !== true) {
	issues.push({ code: 'TREE_DIRTY', message: `Worktree contains ${provenance.changedFileCount} changed or untracked paths; strict release evidence must use a clean reviewed SHA.` })
}

const report = {
	schemaVersion: 'betterpptx.source-provenance-gate.v1',
	measuredAt: new Date().toISOString(),
	mode: strict ? 'strict-release' : 'report-only',
	status: issues.length ? 'OPEN_SOURCE_PROVENANCE' : 'PASS',
	releaseEligible: issues.length === 0,
	policy: {
	privateRemote: 'betterpptx-mcp',
	cleanTreeRequired: true,
	immutableCommitRequired: true,
	publicEnablementAllowed: false,
	developmentReportMayBeDirty: true,
	noPublicMetadata: true,
	},
	provenance,
	issues,
	next: issues.length
		? 'Freeze and review the exact private commit, rebuild from that clean tree, then rerun strict provenance and all release oracles.'
		: 'Bind this clean private commit to the release manifest and retain the exact build/worker/image hashes.',
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`SOURCE PROVENANCE GATE: ${report.status} mode=${report.mode} commit=${provenance?.gitCommit || 'missing'} changed=${provenance?.changedFileCount ?? 'unknown'}`)
for (const issue of issues) console.log(`FAIL ${issue.code}: ${issue.message}`)
if (strict && issues.length) process.exitCode = 1
