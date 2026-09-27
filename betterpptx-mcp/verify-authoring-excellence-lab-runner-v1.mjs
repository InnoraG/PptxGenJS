#!/usr/bin/env node
// Targeted guard for the reproducible Authoring Excellence lab runner.
// This is intentionally separate from the release aggregate: it verifies the
// maintainer harness and, when a local evidence run is present, its MCP/COM
// gate record without making ignored local renders a source artifact.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPowerPointExportEvidence } from '../tools/verify-export-native-pptx-png-evidence.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const exists = async file => { try { await fs.access(file); return true } catch { return false } }
const read = async file => (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')
const required = [
	'tools/run-authoring-excellence-lab.ps1',
	'tools/run-authoring-excellence-lab.mjs',
	'tools/run-authoring-excellence-designer-loop.ps1',
	'tools/prepare-visual-inspection-spec.mjs',
	'tools/write-authoring-excellence-designer-review.mjs',
	'tools/export-native-pptx-png.ps1',
	'tools/verify-export-native-pptx-png-evidence.mjs',
	'tools/fixtures/authoring-excellence-cold-seed-pitch/intent.md',
	'tools/fixtures/authoring-excellence-cold-seed-pitch/spec.json',
]
for (const relative of required) if (!await exists(path.join(root, relative))) failures.push(`missing ${relative}`)

const runner = await read(path.join(root, 'tools/run-authoring-excellence-lab.mjs'))
const ps = await read(path.join(root, 'tools/run-authoring-excellence-lab.ps1'))
const fixture = await read(path.join(root, 'tools/fixtures/authoring-excellence-cold-seed-pitch/spec.json'))
for (const forbidden of ['engine.mjs', 'from \'./engine', 'addText(', 'addShape(', 'addImage(']) {
	if (runner.includes(forbidden)) failures.push(`runner contains forbidden escape hatch ${forbidden}`)
}
for (const requiredText of ['betterpptx.help.capabilities', 'betterpptx.help.workflow', 'phase: \'dryRun\'', 'phase: \'commit\'', 'betterpptx.deck.validate_quality', 'betterpptx.deck.save']) {
	if (!runner.includes(requiredText)) failures.push(`runner missing required MCP stage ${requiredText}`)
}
for (const requiredText of ['run-authoring-excellence-lab.mjs', 'export-native-pptx-png.ps1', 'write-authoring-excellence-designer-review.mjs', 'artifactSha256', 'processIsolation', 'com-report.json', 'ledger.jsonl', 'COM_PASS_VISUAL_PENDING', 'certifiesFirstTimeRight = $false', "visual = 'PENDING'"]) {
	if (!ps.includes(requiredText)) failures.push(`PowerShell harness missing ${requiredText}`)
}
if (!runner.includes('TTS_UNREACHABLE')) failures.push('lab runner missing TTS_UNREACHABLE classification')
if (!runner.includes('QUALITY_GATE_FAILED')) failures.push('lab runner missing QUALITY_GATE_FAILED save guard')
if (/"bbox"\s*:|"rect"\s*:|"x"\s*:|"y"\s*:|"w"\s*:|"h"\s*:/.test(fixture)) failures.push('fixture contains authored geometry')

const evidenceRoot = path.join(root, 'outputs', 'authoring-excellence')
const evidenceCandidates = (await exists(evidenceRoot))
	? (await fs.readdir(evidenceRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.startsWith('lab-')).map(entry => entry.name).sort().reverse()
	: []
let evidence = null
if (evidenceCandidates.length) {
	const candidate = path.join(evidenceRoot, evidenceCandidates[0])
	const mcpFile = path.join(candidate, 'mcp-result.json')
	const comFile = path.join(candidate, 'com-report.json')
	if (await exists(mcpFile) && await exists(comFile)) {
		const mcp = JSON.parse(await read(mcpFile))
		const com = JSON.parse(await read(comFile))
		evidence = { run: evidenceCandidates[0], mcpStatus: mcp.status, comStatus: com.status, comSchema: com.schemaVersion, slides: com.slides, exported: com.exported }
		if (mcp.status !== 'mcp-pass') failures.push(`latest lab evidence MCP status is ${mcp.status}`)
		if (com.status !== 'PASS' || com.exported !== com.slides) failures.push(`latest lab evidence COM status/export mismatch: ${JSON.stringify(evidence)}`)
		if (com.schemaVersion === 'authoring-excellence.com-sight.v2') {
			try { verifyPowerPointExportEvidence(comFile) } catch (error) { failures.push(`latest lab evidence provenance failed: ${error.message}`) }
		}
	}
}

if (failures.length) {
	console.error('AUTHORING EXCELLENCE LAB RUNNER: FAIL')
	for (const failure of failures) console.error(`- ${failure}`)
	process.exitCode = 1
} else {
	console.log('AUTHORING EXCELLENCE LAB RUNNER: PASS')
	console.log(JSON.stringify({ staticContract: 'pass', latestEvidence: evidence || 'not-present (static-only pass)' }, null, 2))
}
