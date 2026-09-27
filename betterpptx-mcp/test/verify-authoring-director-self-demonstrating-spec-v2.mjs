import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'

const root = path.resolve('betterpptx-mcp')
const outDir = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728')
const pptxPath = process.argv[2] || path.join(outDir, 'betterpptx-authoring-director-self-demonstrating-spec-v2.pptx')
const reportPath = process.argv[3] || path.join(outDir, 'betterpptx-authoring-director-self-demonstrating-spec-v2-package-report.json')
const z = await JSZip.loadAsync(await fs.readFile(pptxPath))
const names = Object.keys(z.files).filter(name => !z.files[name].dir)
const slideNames = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
const slideXml = await Promise.all(slideNames.map(name => z.file(name).async('string')))
const presProps = await z.file('ppt/presProps.xml').async('string')
const media = names.filter(name => /^ppt\/media\//.test(name))
const slide4 = slideXml[3] || ''
const slide5 = slideXml[4] || ''
const checks = {
  packageOpen: true,
  tenSlides: slideNames.length === 10,
  nativeNarrationOnEverySlide: slideXml.filter(xml => /isNarration="1"/.test(xml)).length === 10,
  timingOnEverySlide: slideXml.filter(xml => /<p:timing>/.test(xml)).length === 10,
  audioPayloads: media.filter(name => /\.wav$/i.test(name)).length === 10,
  nativeVideo: media.some(name => /\.mp4$/i.test(name)) && /p14:media|a:videoFile/.test(slide4),
  mutedAvatar: /<p:cMediaNode\b[^>]*\bvol="0"/.test(slide4),
  native3d: media.some(name => /\.glb$/i.test(name)) && /model3d|native-3d-presenter/.test(slide5),
  editableInk: slideXml.some(xml => /editable-ink-highlighter/.test(xml)),
  editableLaser: slideXml.some(xml => /editable-laser-pointer/.test(xml)),
  showNarration: /showNarration="1"/.test(presProps),
  useTimings: /useTimings="1"/.test(presProps),
  noBrokenRelationships: !names.some(name => /\.rels$/.test(name) && /Target=""/.test(name)),
}
const escaped = path.resolve(pptxPath).replace(/'/g, "''")
const comScript = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${escaped}', $false, $false, $false); $n=[int]$p.Slides.Count; $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $n)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comScript], { encoding: 'utf8', timeout: 180000, windowsHide: true })
checks.powerPointComOpen = com.status === 0 && /SLIDES=10/.test(`${com.stdout || ''}\n${com.stderr || ''}`)
const report = { schemaVersion: 'betterpptx.authoring-director.self-demonstrating-spec.v2.package.v1', status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', pptx: path.resolve(pptxPath), slideCount: slideNames.length, checks, media, comOutput: `${com.stdout || ''}\n${com.stderr || ''}`.trim() }
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
