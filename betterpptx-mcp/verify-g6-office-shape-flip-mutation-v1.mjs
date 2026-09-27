import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import JSZip from 'jszip'

const run = promisify(execFile)
const root = process.cwd()
const source = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'object-flip', '20260824T201634Z', 'object-flip-five-point.pptx')
if (!fs.existsSync(source)) throw new Error(`missing source ${source}`)
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-office-shape-flip-mutation', stamp)
fs.mkdirSync(outDir, { recursive: true })
const esc = p => p.replaceAll("'", "''")
const shapeSlides = [1, 2, 3, 9, 10]
const controls = [
  { key: 'flipH', label: 'flip horizontal', values: [false, true, false, true, null] },
  { key: 'flipV', label: 'flip vertical', values: [false, false, true, true, null] }
]

async function readSlideXforms(file, slides) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const out = []
  for (const slide of slides) {
    const xml = await zip.file(`ppt/slides/slide${slide}.xml`).async('string')
    const match = xml.match(/<p:spPr[\s\S]*?<a:xfrm([\s\S]*?)>[\s\S]*?<\/p:spPr>/)
    const xfrm = match?.[1] || ''
    out.push({ slide, flipH: /flipH="1"/.test(xfrm), flipV: /flipV="1"/.test(xfrm), xfrm: xfrm.trim() })
  }
  return out
}

const results = []
for (const cfg of controls) {
  const authored = path.join(outDir, `office-authored-shape-${cfg.key}.pptx`)
  const roundtrip = path.join(outDir, `office-authored-shape-${cfg.key}-savecopyas.pptx`)
  const vals = cfg.values.map(v => v === null ? '$null' : `$${v ? 'true' : 'false'}`).join(',')
  const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${esc(source)}',$false,$false,$false,$false);$vals=@(${vals});$auth=@();$slides=@(${shapeSlides.join(',')});for($i=0;$i -lt $slides.Count;$i++){$shape=$p.Slides.Item($slides[$i]).Shapes.Item(1);$beforeH=[bool]$shape.HorizontalFlip;$beforeV=[bool]$shape.VerticalFlip;$target=$vals[$i];$before=if('${cfg.key}' -eq 'flipH'){$beforeH}else{$beforeV};if($null -eq $target){if($before){$shape.Flip($(if('${cfg.key}' -eq 'flipH'){0}else{1}))}}elseif([bool]$target -ne $before){$shape.Flip($(if('${cfg.key}' -eq 'flipH'){0}else{1}))};$auth+=[ordered]@{slide=$slides[$i];requested=$target;before=$before;beforeH=$beforeH;beforeV=$beforeV}};$p.SaveAs('${esc(authored)}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${esc(authored)}',$true,$false,$false,$false);$re=@();for($i=0;$i -lt $slides.Count;$i++){$shape=$r.Slides.Item($slides[$i]).Shapes.Item(1);$png='${esc(outDir)}\\shape-${cfg.key}-slide-'+('{0:D2}' -f $slides[$i])+'.png';$r.Slides.Item($slides[$i]).Export($png,'PNG',1600,900);$re+=[ordered]@{slide=$slides[$i];requested=$vals[$i];horizontalFlip=[bool]$shape.HorizontalFlip;verticalFlip=[bool]$shape.VerticalFlip;png=$png}};$r.SaveCopyAs('${esc(roundtrip)}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;authoredRows=$auth;reopenRows=$re}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
  let office
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024, timeout: 45000 })
    office = JSON.parse(stdout.trim())
  } catch (error) {
    const failure = { status: 'FAIL_PRESERVED', control: cfg, error: String(error), generatedAt: new Date().toISOString() }
    fs.writeFileSync(path.join(outDir, `failed-office-shape-${cfg.key}-attempt.json`), JSON.stringify(failure, null, 2) + '\n')
    throw error
  }
  const reopen = office.reopenRows || []
  const xmlRows = await readSlideXforms(roundtrip, shapeSlides)
  const expected = (office.authoredRows || []).map((before, i) => ({ slide: shapeSlides[i], flipH: cfg.key === 'flipH' ? cfg.values[i] === true : before.beforeH, flipV: cfg.key === 'flipV' ? cfg.values[i] === true : before.beforeV }))
  const retained = xmlRows.every((row, i) => row.flipH === expected[i].flipH && row.flipV === expected[i].flipV)
  const renders = reopen.filter(r => fs.existsSync(r.png) && fs.statSync(r.png).size > 0)
  const result = { ...cfg, authored: path.relative(root, authored).replaceAll('\\', '/'), roundtrip: path.relative(root, roundtrip).replaceAll('\\', '/'), status: office.status === 'PASS' && reopen.length === 5 && retained && renders.length === 5 ? 'PASS' : 'FAIL', officeVersion: office.officeVersion, authoredRows: office.authoredRows, reopenRows: reopen, xmlRows, expected, checks: { officeAuthoredSetter: office.status === 'PASS' && (office.authoredRows || []).length === 5, saveCopyAsReopen: office.status === 'PASS' && reopen.length === 5, retainedFlipAttributes: retained, renderedNonEmpty: renders.length === 5 }, artifacts: { authoredSha256: crypto.createHash('sha256').update(fs.readFileSync(authored)).digest('hex'), roundtripSha256: crypto.createHash('sha256').update(fs.readFileSync(roundtrip)).digest('hex'), renderSha256: renders.map(r => ({ slide: r.slide, sha256: crypto.createHash('sha256').update(fs.readFileSync(r.png)).digest('hex') })) } }
  results.push(result)
}
const proof = { schemaVersion: 'betterpptx.g6-office-shape-flip-mutation-proof.v1', status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', controls: results, checks: { allOfficeAuthoredSetters: results.every(r => r.checks.officeAuthoredSetter), allSaveCopyAsReopen: results.every(r => r.checks.saveCopyAsReopen), allRetainedFlipAttributes: results.every(r => r.checks.retainedFlipAttributes), allRenderedNonEmpty: results.every(r => r.checks.renderedNonEmpty) }, boundaries: ['PowerPoint Shape.Flip is used as the deterministic Office-authored setter; XML xfrm flipH/flipV is the retained readback oracle.', 'The null checkpoint is an explicit reset to the native false/default state.'] }
const out = path.join(outDir, 'g6-office-shape-flip-mutation-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, controls: results.length, checks: proof.checks }, null, 2))
if (proof.status !== 'PASS') process.exitCode = 1
