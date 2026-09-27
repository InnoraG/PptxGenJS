import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = process.cwd()
const archiveRoot = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive')
const source = path.join(root, 'outputs', 'authoring-principle-corpus', 'global-extended-option-five-point', 'text-outline', '20260824T141020Z', 'text-outline-five-point.pptx')
if (!fs.existsSync(source)) throw new Error(`native text outline artifact missing: ${source}`)
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + 'Z'
const outDir = path.join(archiveRoot, 'g6-office-text-outline-mutation', stamp)
fs.mkdirSync(outDir, { recursive: true })
const authored = path.join(outDir, 'office-authored-text-outline-mutation.pptx')
const roundtrip = path.join(outDir, 'office-authored-text-outline-savecopyas.pptx')
const esc = p => p.replaceAll("'", "''")
const widths = [0.75, 1.5, 6, 0, 2.25, 1, 3.25, 5.5, 0, 2.75]
const transparency = [0, 0.37125, 1, 0, 0.625, 0.125, 0.625, 1, 0, 0.25375]
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${esc(source)}',$false,$false,$false,$false);$authRows=@();$widths=@(${widths.join(',')});$trans=@(${transparency.join(',')});for($i=1;$i -le $p.Slides.Count;$i++){$shape=$p.Slides.Item($i).Shapes.Item(1);$line=$shape.TextFrame2.TextRange.Font.Line;if($widths[$i-1] -eq 0){$line.Visible=0}else{$line.Visible=-1;$line.Weight=[single]$widths[$i-1];$line.Transparency=[single]$trans[$i-1]};$authRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requestedWidth=[double]$widths[$i-1];requestedTransparency=[double]$trans[$i-1];actualWidth=[double]$line.Weight;actualTransparency=[double]$line.Transparency;visible=[int]$line.Visible}};$p.SaveAs('${esc(authored)}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${esc(authored)}',$true,$false,$false,$false);$reopenRows=@();for($i=1;$i -le $r.Slides.Count;$i++){$shape=$r.Slides.Item($i).Shapes.Item(1);$line=$shape.TextFrame2.TextRange.Font.Line;$png='${esc(outDir)}\\office-slide-'+('{0:D2}' -f $i)+'.png';$r.Slides.Item($i).Export($png,'PNG',1600,900);$reopenRows+=[ordered]@{slide=$i;shapeName=$shape.Name;requestedWidth=[double]$widths[$i-1];requestedTransparency=[double]$trans[$i-1];actualWidth=[double]$line.Weight;actualTransparency=[double]$line.Transparency;visible=[int]$line.Visible;png=$png}};$r.SaveCopyAs('${esc(roundtrip)}',24);$r.Close();$r=$null;[ordered]@{status='PASS';officeVersion=$pp.Version;slideCount=$reopenRows.Count;authoredRows=$authRows;reopenRows=$reopenRows}|ConvertTo-Json -Depth 8}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(stdout.trim())
const rows = office.reopenRows || []
const exact = rows.length === 10 && rows.every(row => row.requestedWidth === 0 ? row.visible === 0 : row.visible !== 0 && Math.abs(row.actualWidth - row.requestedWidth) < 0.02 && Math.abs(row.actualTransparency - row.requestedTransparency) < 0.02)
const pngs = rows.filter(row => fs.existsSync(row.png) && fs.statSync(row.png).size > 0)
const proof = { schemaVersion: 'betterpptx.g6-office-text-outline-mutation-proof.v1', status: office.status === 'PASS' && exact && pngs.length === 10 ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), gate: 'G6', row: { frozenCatalogFamily: 'foundation', frozenCatalogLabel: 'text outline', frozenCatalogId: 'cap_de980017863e62603d8f', controlFamily: 'textOutline.color|textOutline.transparency|textOutline.widthPt', officeCarrier: 'TextRange2.Font.Line', checkpoints: 10 }, office: { version: office.officeVersion, slideCount: office.slideCount, authoredRows: office.authoredRows, reopenRows: rows, saveCopyAs: fs.existsSync(roundtrip) && fs.statSync(roundtrip).size > 0 }, checks: { officeAuthoredSetter: (office.authoredRows || []).length === 10, saveCopyAsReopen: office.status === 'PASS' && office.slideCount === 10, retainedTextOutline: exact, renderedTenNonEmpty: pngs.length === 10 }, evidence: { sourceNativeArtifact: path.relative(root, source).replaceAll('\\', '/'), authoredArtifact: path.relative(root, authored).replaceAll('\\', '/'), roundtripArtifact: path.relative(root, roundtrip).replaceAll('\\', '/'), authoredSha256: crypto.createHash('sha256').update(fs.readFileSync(authored)).digest('hex'), roundtripSha256: crypto.createHash('sha256').update(fs.readFileSync(roundtrip)).digest('hex'), renderSha256: pngs.map(row => ({ slide: row.slide, sha256: crypto.createHash('sha256').update(fs.readFileSync(row.png)).digest('hex') })) }, boundaries: ['PowerPoint TextRange2.Font.Line exposes deterministic visibility, weight, and transparency mutation for ordinary text and WordArt carriers.', 'This Office-authored witness is paired with the native/public outline family proofs; no unrelated row is promoted.'], universalFormalClosure: '1/2258' }
const out = path.join(outDir, 'g6-office-text-outline-mutation-proof.json')
fs.writeFileSync(out, JSON.stringify({ ...proof, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2) + '\n')
const reportSha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
console.log(JSON.stringify({ status: proof.status, reportPath: path.relative(root, out).replaceAll('\\', '/'), reportSha256, checks: proof.checks, universalFormalClosure: proof.universalFormalClosure }, null, 2))
if (proof.status === 'FAIL') process.exitCode = 1
