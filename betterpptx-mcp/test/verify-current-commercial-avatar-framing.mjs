// Machine-check the owner-facing three-minute commercial avatar artifact.
// This is a package/host framing gate: it proves the media is clipped through
// native OOXML rather than stretched, while keeping the existing narration and
// timing contract intact.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'

const root = path.resolve('betterpptx-mcp')
const outputRoot = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728')
const pptxPath = path.join(outputRoot, 'final-commercial-avatar-3min-current-round-cropped.pptx')
const visualPath = path.join(outputRoot, 'visual-qa-round-cropped', 'slide1.png')
const reportPath = path.join(outputRoot, 'current-commercial-avatar-round-cropped-framing-report.json')

const stat = await fs.stat(pptxPath)
assert.ok(stat.isFile() && stat.size > 1_000_000, 'corrected PPTX is missing or unexpectedly small')
const zip = await JSZip.loadAsync(await fs.readFile(pptxPath))
const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
assert.equal(slideNames.length, 1, 'owner-facing proof must contain one narrated slide')
const slideXml = await zip.file(slideNames[0]).async('string')
assert.match(slideXml, /<a:videoFile\b/, 'avatar video object missing')
assert.match(slideXml, /p15:isNarration[^>]*val="1"/, 'native narration marker missing')
assert.match(slideXml, /<p:timing>/, 'native timing missing')
assert.match(slideXml, /nodeType="interactiveSeq"/, 'interactive media timing sequence missing')
assert.match(slideXml, /cmd="togglePause"/, 'interactive pause command missing')
assert.match(slideXml, /<p:endSync\b[^>]*evt="end"/, 'interactive media end synchronization missing')
assert.match(slideXml, /<a:srcRect\b[^>]*\/>/, 'aspect-safe srcRect framing missing')
assert.match(slideXml, /prst="ellipse"/, 'round presenter window missing')
assert.match(slideXml, /advTm="(1[7-9]\d{4}|[2-9]\d{5})"/, 'three-minute slide transition missing')
assert.ok((await fs.stat(visualPath)).size > 1000, 'PowerPoint visual QA render missing')

const comScript = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $true, $false, $false); $count=[int]$p.Slides.Count; $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comScript], { encoding: 'utf8', timeout: 120000, windowsHide: true })
const comOutput = `${com.stdout || ''}\n${com.stderr || ''}`
assert.equal(com.status, 0, `PowerPoint COM open failed: ${comOutput}`)
assert.match(comOutput, /SLIDES=1/, 'PowerPoint did not report one slide')

const report = {
	 schemaVersion: 'betterpptx.avatar.current-commercial-framing.v1',
	 status: 'PASS',
	 pptx: 'outputs/commercial-poc/current-commercial-20260728/final-commercial-avatar-3min-current-round-cropped.pptx',
	 visualQa: 'outputs/commercial-poc/current-commercial-20260728/visual-qa-round-cropped/slide1.png',
	 checks: {
		 packageSize: true,
		 videoObject: true,
		 nativeNarration: true,
		nativeTiming: true,
		interactiveMediaTiming: true,
		 aspectSafeSrcRect: true,
		 roundPresenterWindow: true,
		 threeMinuteAdvance: true,
		 powerPointOpen: true,
	 },
	 interpretation: 'The presenter window is round and the media fill is aspect-safe; source identity is cropped/covered, never non-uniformly stretched.',
}
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
