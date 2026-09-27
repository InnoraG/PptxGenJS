import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const latest = (dir, suffix) => fs.readdirSync(dir).filter(name => fs.existsSync(path.join(dir, name, suffix))).sort().at(-1)
const configs = [
  { key: 'characterSpacing', family: 'foundation', label: 'character spacing', rowId: 'cap_5c94a4a3c8c6bee8dde5', sourceDir: 'text-character-spacing', sourceFile: 'text-character-spacing-five-point.pptx', property: 'font-spacing', values: [-100, -25, -8.25, 0, 12.5, 25, 50, 75, 100, -50], tolerance: 0.02 },
  { key: 'lineSpacing', family: 'foundation', label: 'line spacing', rowId: 'cap_e195e5bfb5f77413d7bc', sourceDir: 'text-line-spacing', sourceFile: 'text-line-spacing-five-point.pptx', property: 'line-spacing', values: [8.25, 12, 18, 24, 30, 36, 42, 54, 72, 96], tolerance: 0.02 },
  { key: 'paragraphSpacingBefore', family: 'foundation', label: 'paragraph spacing before', rowId: 'cap_90e80207835fc47aa779', sourceDir: 'text-paragraph-spacing', sourceFile: 'text-paragraph-spacing-five-point.pptx', property: 'paragraph-before', values: [0, 4, 8, 12, 18, 24, 30, 42, 60, 90], tolerance: 0.02 },
  { key: 'paragraphSpacingAfter', family: 'foundation', label: 'paragraph spacing after', rowId: 'cap_87e2e792706583fd5056', sourceDir: 'text-paragraph-spacing', sourceFile: 'text-paragraph-spacing-five-point.pptx', property: 'paragraph-after', values: [0, 4, 8, 12, 18, 24, 30, 42, 60, 90], tolerance: 0.02 },
  { key: 'underline', family: 'foundation', label: 'underline', rowId: 'cap_905bff9036f8fafcc464', sourceDir: 'text-underline', sourceFile: 'text-underline-five-point.pptx', property: 'underline-style', values: [1, 2, 5, 7, 0, 3, 4, 6, 8, 9], tolerance: 0 }
]
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-office-text-controls-mutation', stamp)
fs.mkdirSync(outDir, { recursive: true })
const esc = p => p.replaceAll("'", "''")
const results = []
for (const cfg of configs) {
  const srcBase = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', cfg.sourceDir)
  const sourceStamp = latest(srcBase, cfg.sourceFile)
  const source = path.join(srcBase, sourceStamp, cfg.sourceFile)
  if (!fs.existsSync(source)) throw new Error(`missing source ${source}`)
  const safe = cfg.key.toLowerCase()
  const authored = path.join(outDir, `${safe}-office-authored.pptx`)
  const roundtrip = path.join(outDir, `${safe}-savecopyas.pptx`)
  const vals = cfg.values.join(',')
  const setter = cfg.property === 'font-spacing'
    ? `$font=$shape.TextFrame2.TextRange.Font;$font.Spacing=[single]$vals[$i-1];$actual=[double]$font.Spacing`
    : cfg.property === 'line-spacing'
      ? `$pf=$shape.TextFrame2.TextRange.ParagraphFormat;$pf.LineRuleWithin=-1;$pf.SpaceWithin=[single]$vals[$i-1];$actual=[double]$pf.SpaceWithin`
      : cfg.property === 'paragraph-before'
        ? `$pf=$shape.TextFrame2.TextRange.ParagraphFormat;$pf.SpaceBefore=[single]$vals[$i-1];$actual=[double]$pf.SpaceBefore`
        : cfg.property === 'paragraph-after'
          ? `$pf=$shape.TextFrame2.TextRange.ParagraphFormat;$pf.SpaceAfter=[single]$vals[$i-1];$actual=[double]$pf.SpaceAfter`
          : `$font=$shape.TextFrame2.TextRange.Font;$font.UnderlineStyle=[int]$vals[$i-1];$actual=[int]$font.UnderlineStyle`
  const getter = cfg.property === 'font-spacing'
    ? `$actual=[double]$shape.TextFrame2.TextRange.Font.Spacing`
    : cfg.property === 'line-spacing'
      ? `$actual=[double]$shape.TextFrame2.TextRange.ParagraphFormat.SpaceWithin`
      : cfg.property === 'paragraph-before'
        ? `$actual=[double]$shape.TextFrame2.TextRange.ParagraphFormat.SpaceBefore`
        : cfg.property === 'paragraph-after'
          ? `$actual=[double]$shape.TextFrame2.TextRange.ParagraphFormat.SpaceAfter`
          : `$actual=[int]$shape.TextFrame2.TextRange.Font.UnderlineStyle`
  const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${esc(source)}',$false,$false,$false,$false);$vals=@(${vals});$authRows=@();for($i=1;$i -le [Math]::Min($p.Slides.Count,$vals.Count);$i++){$shape=$p.Slides.Item($i).Shapes.Item(1);${setter};$authRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$vals[$i-1];actual=$actual}};$p.SaveAs('${esc(authored)}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${esc(authored)}',$true,$false,$false,$false);$reopenRows=@();for($i=1;$i -le $authRows.Count;$i++){$shape=$r.Slides.Item($i).Shapes.Item(1);${getter};$png='${esc(outDir)}\\${safe}-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$reopenRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$vals[$i-1];actual=$actual;png=$png}};$r.SaveCopyAs('${esc(roundtrip)}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;slideCount=$reopenRows.Count;authoredRows=$authRows;reopenRows=$reopenRows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
  const office = JSON.parse(stdout.trim())
  const rows = office.reopenRows || []
  const exact = rows.length === cfg.values.length && rows.every(row => cfg.tolerance === 0 ? row.actual === row.requested : Math.abs(row.actual - row.requested) <= cfg.tolerance)
  const pngs = rows.filter(row => fs.existsSync(row.png) && fs.statSync(row.png).size > 0)
  results.push({ ...cfg, source: path.relative(root, source).replaceAll('\\', '/'), authored: path.relative(root, authored).replaceAll('\\', '/'), roundtrip: path.relative(root, roundtrip).replaceAll('\\', '/'), status: office.status === 'PASS' && exact && pngs.length === cfg.values.length ? 'PASS' : 'FAIL', officeVersion: office.officeVersion, slideCount: office.slideCount, authoredRows: office.authoredRows, reopenRows: rows, checks: { officeAuthoredSetter: (office.authoredRows || []).length === cfg.values.length, saveCopyAsReopen: office.status === 'PASS' && office.slideCount === cfg.values.length, retainedValue: exact, renderedNonEmpty: pngs.length === cfg.values.length }, artifacts: { authoredSha256: crypto.createHash('sha256').update(fs.readFileSync(authored)).digest('hex'), roundtripSha256: crypto.createHash('sha256').update(fs.readFileSync(roundtrip)).digest('hex'), renderSha256: pngs.map(row => ({ slide: row.slide, sha256: crypto.createHash('sha256').update(fs.readFileSync(row.png)).digest('hex') })) } })
}
const proof = { schemaVersion: 'betterpptx.g6-office-text-controls-mutation-proof.v1', status: results.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', batch: 'foundation text controls', controls: results, checks: { allOfficeAuthoredSetters: results.every(item => item.checks.officeAuthoredSetter), allSaveCopyAsReopen: results.every(item => item.checks.saveCopyAsReopen), allRetainedValues: results.every(item => item.checks.retainedValue), allRenderedNonEmpty: results.every(item => item.checks.renderedNonEmpty), rowCount: results.length }, boundaries: ['PowerPoint TextRange2 exposes direct Office setters for character spacing, line spacing, paragraph spacing before/after, and underline style.', 'This batch proves Office-authored mutation witnesses only; native/public/reset/readback witnesses remain separately bound per frozen row.'], universalFormalClosure: '2/2258_before_row_binding' }
const out = path.join(outDir, 'g6-office-text-controls-mutation-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, rowCount: results.length, checks: proof.checks }, null, 2))
if (proof.status !== 'PASS') process.exitCode = 1
