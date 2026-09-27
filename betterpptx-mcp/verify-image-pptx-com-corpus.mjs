// IMG9 host-level PowerPoint oracle. This is intentionally separate from the
// package/XML corpus: it proves the actual Microsoft PowerPoint COM reopen and
// rendering path on the owner development host.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'verify-image-pptx-com-corpus.ps1')
console.log('IMG9 POWERPOINT COM REOPEN/RENDER CORPUS:')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
	encoding: 'utf8',
	timeout: 180000,
})
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes('img9-powerpoint-com-corpus'))
let report = null
try { report = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
if (report) {
	for (const item of report.results || []) console.log(`  ${item.status === 'PASS' ? 'ok  ' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
	const rendered = ['cover', 'contain', 'crop'].map(id => path.join(here, 'outputs', `img9-crop-corpus-${id}-com.png`))
	if (rendered.every(file => fs.existsSync(file))) {
		const tiles = await Promise.all(rendered.map(file => sharp(file).resize(320, 180, { fit: 'fill' }).png().toBuffer()))
		await sharp({ create: { width: 960, height: 180, channels: 4, background: '#0b111b' } })
			.composite(tiles.map((input, index) => ({ input, left: index * 320, top: 0 })))
			.png().toFile(path.join(here, 'outputs', 'img9-powerpoint-com-contact-sheet.png'))
	}
}
const passed = Number(report?.checks || 0)
const failed = Number(report?.failures || (run.status === 0 ? 0 : 1))
const valid = run.status === 0 && report?.hostGated === false && failed === 0 && passed >= 22
assert.ok(report, `PowerPoint COM script did not emit a report. Output: ${output.slice(-2000)}`)
assert.equal(failed, 0)
assert.equal(run.status, 0)
assert.equal(report.hostGated, false)
console.log(`\n${valid ? 'PASSED' : 'FAILED'}: ${passed} passed, ${failed} failed`)
if (!valid) process.exit(1)
