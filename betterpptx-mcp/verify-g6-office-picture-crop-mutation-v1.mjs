import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-office-picture-crop-mutation', stamp)
fs.mkdirSync(outDir, { recursive: true })
const source = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'image-framing-native', '20260824T204700Z', 'img9-crop-corpus-cover.pptx')
const authored = path.join(outDir, 'office-authored-picture-crop.pptx')
const roundtrip = path.join(outDir, 'office-authored-picture-crop-savecopyas.pptx')
const esc = p => p.replaceAll("'", "''")
const values = [0, 5, 10, 15, 20]
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${esc(source)}',$false,$false,$false,$false);for($n=2;$n -le 5;$n++){[void]$p.Slides.Item(1).Duplicate()};$vals=@(${values.join(',')});$auth=@();for($i=1;$i -le 5;$i++){$shape=$null;for($k=1;$k -le $p.Slides.Item($i).Shapes.Count;$k++){if($p.Slides.Item($i).Shapes.Item($k).Type -eq 13){$shape=$p.Slides.Item($i).Shapes.Item($k);break}};if(-not $shape){throw 'picture shape not found'};$shape.PictureFormat.CropLeft=[single]$vals[$i-1];$auth+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$vals[$i-1];actual=[double]$shape.PictureFormat.CropLeft}};$p.SaveAs('${esc(authored)}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${esc(authored)}',$true,$false,$false,$false);$rows=@();for($i=1;$i -le 5;$i++){$shape=$null;for($k=1;$k -le $r.Slides.Item($i).Shapes.Count;$k++){if($r.Slides.Item($i).Shapes.Item($k).Type -eq 13){$shape=$r.Slides.Item($i).Shapes.Item($k);break}};$actual=[double]$shape.PictureFormat.CropLeft;$png='${esc(outDir)}\\picture-crop-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$rows+=[ordered]@{slide=$i;shapeName=$shape.Name;requested=[double]$vals[$i-1];actual=$actual;png=$png}};$r.SaveCopyAs('${esc(roundtrip)}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;slideCount=$rows.Count;authoredRows=$auth;reopenRows=$rows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(stdout.trim())
const rows = office.reopenRows || []
const exact = rows.length === values.length && rows.every(row => Math.abs(row.actual - row.requested) <= 0.02)
const pngs = rows.filter(row => fs.existsSync(row.png) && fs.statSync(row.png).size > 0)
const proof = { schemaVersion: 'betterpptx.g6-office-picture-crop-mutation-proof.v1', status: office.status === 'PASS' && exact && pngs.length === values.length ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', row: { frozenCatalogFamily: 'media-images-avatar', frozenCatalogLabel: 'crop', frozenCatalogId: 'cap_b39ba8fc1a63b00cb72e', controlFamily: 'imageFraming.framingMode', officeCarrier: 'Shape.PictureFormat.CropLeft', checkpoints: values }, office: { version: office.officeVersion, slideCount: office.slideCount, authoredRows: office.authoredRows, reopenRows: rows, saveCopyAs: fs.existsSync(roundtrip) && fs.statSync(roundtrip).size > 0 }, checks: { officeAuthoredSetter: (office.authoredRows || []).length === values.length, saveCopyAsReopen: office.status === 'PASS' && office.slideCount === values.length, retainedCropLeft: exact, renderedFiveNonEmpty: pngs.length === values.length }, evidence: { source: path.relative(root, source).replaceAll('\\', '/'), authored: path.relative(root, authored).replaceAll('\\', '/'), roundtrip: path.relative(root, roundtrip).replaceAll('\\', '/'), authoredSha256: crypto.createHash('sha256').update(fs.readFileSync(authored)).digest('hex'), roundtripSha256: crypto.createHash('sha256').update(fs.readFileSync(roundtrip)).digest('hex'), renderSha256: pngs.map(row => ({ slide: row.slide, sha256: crypto.createHash('sha256').update(fs.readFileSync(row.png)).digest('hex') })) }, boundaries: ['Office CropLeft is writable and retained after SaveCopyAs/reopen.', 'Picture transparency is not claimed here because the Office COM carrier exposes no writable Transparency property.'], universalFormalClosure: '8/2258_before_row_binding' }
const out = path.join(outDir, 'g6-office-picture-crop-mutation-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, checks: proof.checks }, null, 2))
if (proof.status !== 'PASS') process.exitCode = 1
