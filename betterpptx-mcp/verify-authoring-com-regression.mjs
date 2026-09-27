#!/usr/bin/env node

// Release-safety wrapper for the maintained COM visual-regression harness.
// Invoke it with a relative output root deliberately: the harness must resolve
// that root before PowerPoint's independent Slide.Export process sees it.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const relativeOutDir = path.join('outputs', 'authoring-excellence', 'regression-suite')
const script = path.join(repoRoot, 'tools', 'run-authoring-com-regression.ps1')
const invoke = executable => spawnSync(executable, ['-NoProfile', '-File', script, '-OutDir', relativeOutDir], {
	cwd: repoRoot,
	encoding: 'utf8',
	timeout: 180000,
})
let run = invoke('pwsh')
if (run.error?.code === 'ENOENT') run = invoke('powershell.exe')
const output = `${run.stdout || ''}${run.stderr || ''}`
if (run.error || run.status !== 0) {
	console.error('AUTHORING COM REGRESSION: FAIL')
	console.error(output.trim() || run.error?.message || `PowerShell exited ${run.status}`)
	process.exit(1)
}
const reportPath = path.join(repoRoot, relativeOutDir, 'regression-result.json')
let report
try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) } catch (error) {
	console.error('AUTHORING COM REGRESSION: FAIL')
	console.error(`Missing or invalid regression report: ${error.message}`)
	process.exit(1)
}
const expectedSlides = { 'apexa-seed-premium': 9, 'board-churn-light': 6, 'sales-review-light': 3 }
const rows = Array.isArray(report.results) ? report.results : []
const valid = report.total === 3 && report.failed === 0 && rows.length === 3 && rows.every(row => row.status === 'pass' && row.slides === expectedSlides[row.name])
if (!valid) {
	console.error('AUTHORING COM REGRESSION: FAIL')
	console.error(JSON.stringify({ report, expectedSlides }, null, 2))
	process.exit(1)
}
console.log(`AUTHORING COM REGRESSION: PASS ${rows.length}/${Object.keys(expectedSlides).length}`)
console.log(JSON.stringify({ total: report.total, failed: report.failed, slides: Object.fromEntries(rows.map(row => [row.name, row.slides])), outputRoot: relativeOutDir }, null, 2))
