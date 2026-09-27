#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const run = promisify(execFile)
const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)))
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.join(root, 'outputs', 'authoring-principle-corpus', 'finalized-jsonspec-archive', 'foundation-metadata-office', stamp)
await fs.mkdir(outDir, { recursive: true })
const generatedPath = path.join(outDir, 'foundation-metadata-generated.pptx')
const roundtripPath = path.join(outDir, 'foundation-metadata-office-roundtrip.pptx')
const generatedRenderPath = path.join(outDir, 'foundation-metadata-generated.png')
const renderPath = path.join(outDir, 'foundation-metadata-office-roundtrip.png')
const reportPath = path.join(outDir, 'foundation-metadata-office-proof.json')
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const relative = file => path.relative(root, file).replaceAll(path.sep, '/')
const parser = new DOMParser()

function textByLocalName(xml, localName) {
	const nodes = parser.parseFromString(xml, 'application/xml').getElementsByTagNameNS('*', localName)
	return nodes.length ? String(nodes[0].textContent || '') : null
}

async function packageReadback(file) {
	const bytes = await fs.readFile(file)
	const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
	const core = await zip.file('docProps/core.xml').async('string')
	const app = await zip.file('docProps/app.xml').async('string')
	const presentationXml = await zip.file('ppt/presentation.xml').async('string')
	const presentation = parser.parseFromString(presentationXml, 'application/xml')
	const rootNode = presentation.documentElement
	const sections = Array.from(presentation.getElementsByTagNameNS('*', 'section')).map(section => ({
		name: section.getAttribute('name'),
		slideCount: section.getElementsByTagNameNS('*', 'sldId').length,
	}))
	return {
		bytes: bytes.length,
		sha256: sha256(bytes),
		title: textByLocalName(core, 'title'),
		subject: textByLocalName(core, 'subject'),
		author: textByLocalName(core, 'creator'),
		revision: textByLocalName(core, 'revision'),
		company: textByLocalName(app, 'Company'),
		rtlMode: ['1', 'true'].includes(String(rootNode.getAttribute('rtl')).toLowerCase()),
		sections,
	}
}

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'
pptx.title = 'R&D <Overview>'
pptx.subject = 'A&B <Scope>'
pptx.author = 'Jörg & Team'
pptx.company = 'A&B <Co>'
pptx.revision = '7'
pptx.rtlMode = true
pptx.addSection({ title: 'Overview' })
const slide = pptx.addSlide({ sectionTitle: 'Overview' })
slide.background = { color: '17365D' }
slide.addText('Portable metadata', { x: 0.8, y: 0.8, w: 5.6, h: 0.7, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: 'FFFFFF' })
slide.addText('PowerPoint open, SaveCopyAs, reopen, and retained package readback.', { x: 0.8, y: 1.7, w: 8.8, h: 0.6, fontFace: 'Aptos', fontSize: 18, color: 'D9EAF7' })
await pptx.writeFile({ fileName: generatedPath, compression: false })

const generated = await packageReadback(generatedPath)
const auditRun = await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generatedPath], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
const audit = JSON.parse(auditRun.stdout)
assert.equal(audit.status, 'PASS', JSON.stringify(audit))

const quotePs = value => String(value).replaceAll("'", "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$pres=$null;$re=$null;try{$pres=$pp.Presentations.Open2007('${quotePs(generatedPath)}',$true,$false,$false,$false);$pres.Slides.Item(1).Export('${quotePs(generatedRenderPath)}','PNG',1600,900);$pres.SaveCopyAs('${quotePs(roundtripPath)}',24);$pres.Close();$pres=$null;$re=$pp.Presentations.Open2007('${quotePs(roundtripPath)}',$true,$false,$false,$false);$re.Slides.Item(1).Export('${quotePs(renderPath)}','PNG',1600,900);$count=$re.Slides.Count;$re.Close();$re=$null;[ordered]@{status='PASS';method='Presentations.Open2007';openAndRepair=$false;slideCount=$count;saveCopyAs=$true;reopen=$true}|ConvertTo-Json -Compress}finally{if($pres){$pres.Close()};if($re){$re.Close()};if($pp){$pp.Quit()}}`
const officeRun = await run('powershell.exe', ['-NoProfile', '-Command', ps], { cwd: root, maxBuffer: 20 * 1024 * 1024 })
const office = JSON.parse(officeRun.stdout.trim())
const roundtrip = await packageReadback(roundtripPath)
const generatedRenderBytes = await fs.readFile(generatedRenderPath)
const renderBytes = await fs.readFile(renderPath)

for (const actual of [generated, roundtrip]) {
	assert.equal(actual.title, 'R&D <Overview>')
	assert.equal(actual.subject, 'A&B <Scope>')
	assert.equal(actual.author, 'Jörg & Team')
	assert.equal(actual.company, 'A&B <Co>')
	assert.equal(actual.revision, '7')
	assert.equal(actual.rtlMode, true)
	assert.deepEqual(actual.sections, [{ name: 'Overview', slideCount: 1 }])
}
assert.equal(office.status, 'PASS')
assert.equal(office.openAndRepair, false)
assert.equal(office.slideCount, 1)
assert.ok(generatedRenderBytes.length > 1000)
assert.ok(renderBytes.length > 1000)
assert.equal(sha256(renderBytes), sha256(generatedRenderBytes), 'PowerPoint render changed after SaveCopyAs/reopen')

let comparatorRun
try {
	comparatorRun = await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1'),
		'-Reference', generatedPath, '-Generated', roundtripPath, '-Slides', '1',
	], { cwd: root, maxBuffer: 40 * 1024 * 1024 })
} catch (error) {
	comparatorRun = { stdout: String(error.stdout || ''), stderr: String(error.stderr || ''), code: error.code }
}
const comparatorText = comparatorRun.stdout
assert.match(comparatorText, /PowerPoint repair test: PASSED/)
assert.match(comparatorText, /foundation package properties mismatch \(1 differences\)/)
assert.match(comparatorText, /core\.lastModifiedBy:/)
assert.match(comparatorText, /Missing XML Tag: <hiddenFill> \(Ref has 2, Gen has 0\)/)
assert.match(comparatorText, /Missing Attribute: 'creationId' \(Ref has 2, Gen has 0\)/)
assert.match(comparatorText, /TOTAL ISSUES - 2/)
assert.match(comparatorText, /Global Package Issues: 1/)
assert.doesNotMatch(comparatorText, /foundation package properties mismatch \((?!1 differences\))/)

const report = {
	schemaVersion: 'betterpptx.foundation-metadata-office-proof.v1',
	status: 'PASS',
	generatedAt: new Date().toISOString(),
	contract: {
		fields: ['title', 'subject', 'author', 'company', 'revision', 'rtlMode'],
		revision: 'non-negative whole number only',
		xmlText: 'XML 1.0-valid characters only; entities escaped by the package serializer',
		sectionAndBackgroundCombination: true,
	},
	generated: { file: relative(generatedPath), ...generated, auditStatus: audit.status },
	office: {
		...office,
		roundtripFile: relative(roundtripPath),
		generatedRenderFile: relative(generatedRenderPath),
		roundtripRenderFile: relative(renderPath),
		renderSha256: sha256(renderBytes),
		renderExactAfterSaveCopyAs: true,
	},
	roundtrip: { ...roundtrip },
	comparator: {
		status: 'EXPECTED_OFFICE_CANONICALIZATION',
		repairFree: true,
		semanticFoundationReadback: true,
		visualRenderExact: true,
		differences: [
			'Office updates core.lastModifiedBy to the local Office identity while retaining dc:creator.',
			'Office adds creationId/hiddenFill extension payloads during SaveCopyAs.',
		],
	},
	interpretation: 'Portable document metadata, presentation RTL, one authored section, and a visible slide background survived repair-disabled PowerPoint Open2007, SaveCopyAs, reopen, strict package readback, and pixel-identical PowerPoint rendering. The comparator found only the explicitly asserted Office SaveCopyAs canonicalization differences.',
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, report: relative(reportPath), sha256: sha256(await fs.readFile(reportPath)), generated: report.generated.sha256, roundtrip: report.roundtrip.sha256, render: report.office.renderSha256 }, null, 2))
