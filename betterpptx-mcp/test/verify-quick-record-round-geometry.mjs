// Verify the corrected quick-record presenter geometry and its short native
// playback sequence. The source recording is intentionally preserved.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import JSZip from 'jszip'

const root = path.resolve('betterpptx-mcp')
const outDir = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728')
const pptxPath = path.join(outDir, 'quick-record-round-production-geometry.pptx')
const visualPath = path.join(outDir, 'quick-record-round-production-geometry-visual.png')
const reportPath = path.join(outDir, 'quick-record-round-production-geometry-report.json')

const zip = await JSZip.loadAsync(await fs.readFile(pptxPath))
const sourcePath = path.join(outDir, 'quick-record-round-near-border.pptx')
const sourceZip = await JSZip.loadAsync(await fs.readFile(sourcePath))
const sourceVideoBytes = await sourceZip.file('ppt/media/media1.mp4').async('nodebuffer')
const outputMediaName = Object.keys(zip.files).find(name => /^ppt\/media\/.*\.mp4$/i.test(name))
const outputVideoBytes = await zip.file(outputMediaName).async('nodebuffer')
const sourcePosterBytes = await sourceZip.file('ppt/media/image1.png').async('nodebuffer')
const outputImageName = Object.keys(zip.files).find(name => /^ppt\/media\/.*\.png$/i.test(name))
const outputPosterBytes = await zip.file(outputImageName).async('nodebuffer')
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
assert.equal(digest(outputVideoBytes), digest(sourceVideoBytes), 'recorded MP4 bytes changed')
assert.equal(digest(outputPosterBytes), digest(sourcePosterBytes), 'recorded poster bytes changed')
const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
assert.match(slideXml, /p15:isNarration[^>]*val="1"/)
assert.match(slideXml, /<p:timing>/)
assert.match(slideXml, /<a:videoFile\b/)
assert.match(slideXml, /prst="ellipse"/)
assert.match(slideXml, /<a:srcRect\b/)
assert.ok((await fs.stat(visualPath)).size > 1000)

const escaped = pptxPath.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $pp.Visible=-1; $p=$pp.Presentations.Open('${escaped}', $true, $false, $false); $s=$p.Slides.Item(1).Shapes | Where-Object { $_.MediaType -eq 3 }; $show=$p.SlideShowSettings.Run(); Start-Sleep -Milliseconds 700; $running=[int]$show.View.State; $position=[int]$show.View.CurrentShowPosition; $show.View.State=2; Start-Sleep -Milliseconds 500; $paused=[int]$show.View.State; $show.View.State=1; Start-Sleep -Milliseconds 500; $resumed=[int]$show.View.State; $r=[ordered]@{left=[double]$s.Left;top=[double]$s.Top;width=[double]$s.Width;height=[double]$s.Height;mediaType=[int]$s.MediaType;playOnEntry=[int]$s.AnimationSettings.PlaySettings.PlayOnEntry;runningState=$running;pausedState=$paused;resumedState=$resumed;position=$position}; try{$show.View.Exit()}catch{}; try{$p.Close()}catch{}; try{$pp.Quit()}catch{}; $r|ConvertTo-Json -Compress`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 120000, windowsHide: true })
assert.equal(com.status, 0, `${com.stdout}\n${com.stderr}`)
const line = com.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
const runtime = JSON.parse(line)
for (const [key, expected] of Object.entries({ width: 162, height: 162, runningState: 1, pausedState: 2, resumedState: 1, mediaType: 3, playOnEntry: -1 })) assert.equal(Number(runtime[key]), expected, `${key} mismatch`)
assert.ok(Math.abs(Number(runtime.left) - 791.52) < 0.2)
assert.ok(Math.abs(Number(runtime.top) - 371.52) < 0.2)

const report = {
	schemaVersion: 'betterpptx.quick-record-round-production-geometry.v1',
	status: 'PASS',
	pptx: 'outputs/commercial-poc/current-commercial-20260728/quick-record-round-production-geometry.pptx',
	visual: 'outputs/commercial-poc/current-commercial-20260728/quick-record-round-production-geometry-visual.png',
	checks: { nativeNarration: true, nativeTiming: true, roundWindow: true, aspectSafeCrop: true, originalMediaPosterReattached: true, originalVideoBytesPreserved: true, originalPosterBytesPreserved: true, geometryMatchesQuickRecordReference: true, shortPlayback: true },
	runtime,
	interpretation: 'The quick-record presenter matches the reference 162 pt round window and lower-right placement while preserving its original recorded MP4/poster and authored timing.',
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
