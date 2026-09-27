import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const source = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'object-rotation', '20260824T193934Z', 'object-rotation-five-point.pptx')
if (!fs.existsSync(source)) throw new Error(`native rotation artifact missing: ${source}`)
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-office-rotation-mutation', stamp)
fs.mkdirSync(outDir, { recursive: true })
const authored = path.join(outDir, 'office-authored-rotation-mutation.pptx')
const roundtrip = path.join(outDir, 'office-authored-rotation-savecopyas.pptx')
const psPath = p => p.replaceAll("'", "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${psPath(source)}',$false,$false,$false,$false);$targets=@(0,15,30,45,60,75,90,105,120,135);$authRows=@();for($i=1;$i -le $p.Slides.Count;$i++){if($p.Slides.Item($i).Shapes.Count -lt 1){throw \"slide $i has no shape for Office mutation\"};$shape=$p.Slides.Item($i).Shapes.Item(1);$shape.Rotation=[single]$targets[$i-1];$authRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$targets[$i-1];actual=[double]$shape.Rotation}};$p.SaveAs('${psPath(authored)}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${psPath(authored)}',$true,$false,$false,$false);$reopenRows=@();for($i=1;$i -le $r.Slides.Count;$i++){$shape=$r.Slides.Item($i).Shapes.Item(1);$png='${psPath(outDir)}\\office-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$reopenRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$targets[$i-1];actual=[double]$shape.Rotation;png=$png}};$r.SaveCopyAs('${psPath(roundtrip)}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;slideCount=$reopenRows.Count;authoredRows=$authRows;reopenRows=$reopenRows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(stdout.trim())
const rows = office.reopenRows || []
const exact = rows.length === 10 && rows.every(row => Math.abs(row.actual - row.requested) < 0.01)
const pngs = rows.filter(row => fs.existsSync(row.png) && fs.statSync(row.png).size > 0)
const proof = {
  schemaVersion: 'betterpptx.g6-office-rotation-mutation-proof.v1',
  status: office.status === 'PASS' && exact && pngs.length === 10 ? 'PASS' : 'FAIL',
  generatedAt: new Date().toISOString(),
  gate: 'G6',
  row: { frozenCatalogFamily: 'foundation', frozenCatalogLabel: 'rotation', frozenCatalogId: 'cap_a110570f7caeb8b6230b', controlId: 'shape.transform.rotation', officeCarrier: 'Shape.Rotation', checkpoints: 10 },
  office: { version: office.officeVersion, slideCount: office.slideCount, authoredRows: office.authoredRows, reopenRows: rows, saveCopyAs: fs.existsSync(roundtrip) && fs.statSync(roundtrip).size > 0 },
  checks: { officeAuthoredSetter: (office.authoredRows || []).length === 10 && (office.authoredRows || []).every(row => Math.abs(row.actual - row.requested) < 0.01), saveCopyAsReopen: office.status === 'PASS' && office.slideCount === 10, retainedRotation: exact, renderedTenNonEmpty: pngs.length === 10 },
  evidence: { sourceNativeArtifact: path.relative(root, source).replaceAll('\\', '/'), authoredArtifact: path.relative(root, authored).replaceAll('\\', '/'), roundtripArtifact: path.relative(root, roundtrip).replaceAll('\\', '/'), authoredSha256: crypto.createHash('sha256').update(fs.readFileSync(authored)).digest('hex'), roundtripSha256: crypto.createHash('sha256').update(fs.readFileSync(roundtrip)).digest('hex'), renderSha256: pngs.map(row => ({ slide: row.slide, sha256: crypto.createHash('sha256').update(fs.readFileSync(row.png)).digest('hex') })) },
  boundaries: ['Office Shape.Rotation setter is available and retained across SaveCopyAs/reopen for this generic transform row.', 'This is one frozen catalog-row witness and does not promote unrelated rows or change universal closure until the full row proof aggregator passes.'],
  universalFormalClosure: '0/2258'
}
const out = path.join(outDir, 'g6-office-rotation-mutation-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, checks: proof.checks, universalFormalClosure: proof.universalFormalClosure }, null, 2))
if (proof.status === 'FAIL') process.exitCode = 1
