// PowerPoint COM oracle over the generated synthetic treatment and cold E2E PPTX artifacts.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'verify-generated-pptx-com-corpus.ps1')
console.log('GENERATED PPTX POWERPOINT COM REOPEN/RENDER CORPUS:')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
	encoding: 'utf8',
	timeout: 180000,
})
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes('generated-pptx-powerpoint-com-corpus'))
let report = null
try { report = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
if (report) for (const item of report.results || []) console.log(`  ${item.status === 'PASS' ? 'ok  ' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)

const rendered = [
	...Array.from({ length: 4 }, (_, i) => path.join(here, 'outputs', `img7-treatment-com-slide-${i + 1}.png`)),
	path.join(here, 'outputs', 'img12-e2e-com-slide-1.png'),
]
if (rendered.every(file => fs.existsSync(file))) {
	const tiles = await Promise.all(rendered.map(file => sharp(file).resize(320, 180, { fit: 'fill' }).png().toBuffer()))
	await sharp({ create: { width: 960, height: 360, channels: 4, background: '#0b111b' } })
		.composite(tiles.map((input, index) => ({ input, left: (index % 3) * 320, top: Math.floor(index / 3) * 180 })))
		.png().toFile(path.join(here, 'outputs', 'generated-pptx-powerpoint-com-contact-sheet.png'))
}

const passed = Number(report?.checks || 0)
const failed = Number(report?.failures || (run.status === 0 ? 0 : 1))
assert.ok(report, `Generated PPTX COM script did not emit a report. Output: ${output.slice(-2000)}`)
assert.equal(failed, 0)
assert.equal(run.status, 0)
assert.equal(report.hostGated, false)
console.log(`\nPASSED: ${passed} passed, ${failed} failed`)
