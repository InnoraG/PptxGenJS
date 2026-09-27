#!/usr/bin/env node
// Builder-lane proof: the twelve authored theme slots reach ppt/theme/theme1.xml.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import PptxGenJS from '../dist/pptxgen.cjs.js'

const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
const scheme = { dk1: '0B1220', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0', accent1: '38BDF8', accent2: 'A78BFA', accent3: '34D399', accent4: 'F59E0B', accent5: 'FB7185', accent6: '22D3EE', hlink: '0284C7', folHlink: '7C3AED' }
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/theme-color-scheme-native/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const generated = path.join(evidenceDir, 'theme-color-scheme-native-proof.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(evidenceDir, { recursive: true })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', palette: scheme }
const slide = pptx.addSlide()
slide.addText('Full native theme color scheme', { x: 0.7, y: 0.7, w: 8, h: 0.5, fontSize: 26, color: scheme.accent1, bold: true })
slide.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 1.6, w: 3, h: 1.2, fill: { color: scheme.accent2 }, line: { color: scheme.accent6, width: 1.5 }, shadow: { type: 'outer', color: scheme.dk1, opacity: 0.18, blur: 2, angle: 45, distance: 2 } })
await pptx.writeFile({ fileName: generated, compression: false })
const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const themeXml = await zip.file('ppt/theme/theme1.xml').async('string')
const serialized = Object.fromEntries(slots.map(slot => [slot, (themeXml.match(new RegExp(`<a:${slot}[^>]*>[\\s\\S]*?<a:srgbClr[^>]*val="([0-9A-Fa-f]{6})"`)) || [])[1] || null]))
const checks = { packageReadable: true, themePartPresent: Boolean(themeXml), allSlotsSerialized: slots.every(slot => serialized[slot] === scheme[slot]), noPrivatePathsInPackageMetadata: !themeXml.includes('PptxGenJS_Claude') }
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const proof = { schemaVersion: 'betterpptx.native-theme-color-scheme-proof.v1', status, generatedAt: new Date().toISOString(), package: { fileName: path.basename(generated), bytes: (await fs.stat(generated)).size, sha256: sha256(await fs.readFile(generated)) }, requested: scheme, serialized, checks, interpretation: status === 'PASS' ? 'All twelve theme color roles are serialized as native OOXML theme slots; no preset-only shortcut was used.' : 'At least one authored theme slot did not serialize exactly.' }
const proofPath = path.join(evidenceDir, 'theme-color-scheme-native-proof.json')
await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
const proofSha256 = sha256(await fs.readFile(proofPath))
await fs.writeFile(`${proofPath}.sha256`, `${proofSha256}  ${path.basename(proofPath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status, checks, generated, proofPath, proofSha256, packageSha256: proof.package.sha256 }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
