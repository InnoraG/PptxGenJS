#!/usr/bin/env node
// Regression contract for verify-source-provenance-gate.mjs. This test proves
// that development reporting and strict release enforcement are distinct; it
// never turns a dirty local worktree into release evidence.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { summarizeGitProvenance } from './export-git-provenance.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const gate = path.join(here, 'verify-source-provenance-gate.mjs')
const tempOut = path.join(os.tmpdir(), `betterpptx-source-provenance-${process.pid}.json`)
const checks = []
const check = (id, condition, detail) => checks.push({ id, status: condition ? 'PASS' : 'FAIL', detail })

const baseline = summarizeGitProvenance({ cwd: repoRoot, remote: 'betterpptx-mcp', matrixGrade: false })
const reportRun = spawnSync(process.execPath, [gate, `--out=${tempOut}`], { cwd: repoRoot, encoding: 'utf8' })
const report = fs.existsSync(tempOut) ? JSON.parse(fs.readFileSync(tempOut, 'utf8')) : null
check('report-only-exits-zero', reportRun.status === 0, reportRun.stderr || reportRun.stdout)
check('report-only-captures-private-commit', report?.provenance?.gitCommit === baseline.gitCommit, 'Report commit matches the current git HEAD.')
check('report-only-captures-tree-state', report?.provenance?.gitTreeClean === baseline.gitTreeClean && report?.provenance?.changedFileCount === baseline.changedFileCount, 'Report preserves the current clean/dirty state and count.')
check('report-only-never-claims-release', report?.releaseEligible === (baseline.gitTreeClean === true), 'Release eligibility follows clean-tree evidence.')

const strictRun = spawnSync(process.execPath, [gate, '--strict', `--out=${tempOut}`], { cwd: repoRoot, encoding: 'utf8' })
const strictReport = fs.existsSync(tempOut) ? JSON.parse(fs.readFileSync(tempOut, 'utf8')) : null
const expectedStrictExit = baseline.gitTreeClean ? 0 : 1
check('strict-exit-matches-tree-state', strictRun.status === expectedStrictExit, `Expected strict exit ${expectedStrictExit}, received ${strictRun.status}.`)
check('strict-mode-is-labelled', strictReport?.mode === 'strict-release', 'Strict report identifies its release mode.')
check('strict-mode-keeps-public-disabled', strictReport?.policy?.publicEnablementAllowed === false, 'Provenance evidence cannot enable public promotion.')
check('private-remote-is-present', Boolean(report?.provenance?.gitRemote), 'The maintained private remote is recorded.')

try { fs.unlinkSync(tempOut) } catch { /* best effort temp cleanup */ }
const failures = checks.filter(item => item.status === 'FAIL')
console.log(JSON.stringify({ schemaVersion: 'betterpptx.source-provenance-contract.v1', status: failures.length ? 'FAIL' : 'PASS', checks }, null, 2))
console.log(`SOURCE PROVENANCE CONTRACT: ${checks.length - failures.length} passed, ${failures.length} failed`)
if (failures.length) process.exitCode = 1
