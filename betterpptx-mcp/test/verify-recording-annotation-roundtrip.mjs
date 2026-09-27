// Verify that a PowerPoint-authored Record Studio package keeps its native
// annotation payload when opened and saved through BetterPPTX.  This is a
// package/playback gate, not a claim that the engine can synthesize a camera
// capture session without PowerPoint.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const root = path.resolve('betterpptx-mcp')
const source = path.join(root, '..', 'tmp_autonomous_test', 'real-recorded-reference-ink-laser-videoavatar.pptx')
const outputDir = path.join(root, 'outputs', 'commercial-poc', 'recording-import-preservation-test')
const output = path.join(outputDir, 'reference-import-preserved-verifier.pptx')
const reportPath = path.join(outputDir, 'recordstudio-annotation-roundtrip-report.json')
const context = { sessionId: `recording-annotation-roundtrip-${Date.now()}`, accountId: 'innorag', licenseId: 'test' }
const { callBetterPptxTool } = await import('../engine.mjs')

function dataOf(result) {
	if (!result?.ok) throw new Error(`${result?.error?.code || 'TOOL_FAILED'}: ${result?.error?.message || JSON.stringify(result)}`)
	return result.data || result
}

await fs.mkdir(outputDir, { recursive: true })
const opened = dataOf(await callBetterPptxTool('betterpptx.deck.open_existing', {
	pptxPath: source,
	preserveTiming: true,
}, context))
try {
	const saved = dataOf(await callBetterPptxTool('betterpptx.deck.save', {
		deckId: opened.deckId,
		outputDir,
		fileName: path.basename(output),
	}, context))
	const savedPath = saved.filePath || output
	const zip = await JSZip.loadAsync(await fs.readFile(savedPath))
	const names = Object.keys(zip.files)
	assert.ok(names.some(name => /^ppt\/ink\/inkAction\d+\.xml$/.test(name)), 'native ink action package was not preserved')
	for (const slideNumber of [1, 2, 3]) {
		const slideXml = await zip.file(`ppt/slides/slide${slideNumber}.xml`)?.async('string') || ''
		assert.match(slideXml, /<p:timing>/, `slide ${slideNumber} timing missing`)
		assert.match(slideXml, /<p14:media\b/, `slide ${slideNumber} media marker missing`)
		assert.match(slideXml, /p15:isNarration[^>]*val="1"/, `slide ${slideNumber} narration marker missing`)
	}
	const slide2 = await zip.file('ppt/slides/slide2.xml').async('string')
	const slide2Rels = await zip.file('ppt/slides/_rels/slide2.xml.rels').async('string')
	assert.match(slide2, /laserTraceLst/, 'native laser trace list was not preserved')
	assert.match(slide2Rels, /\/inkAction/, 'native ink-action relationship was not preserved')

	const comScript = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${savedPath.replace(/'/g, "''")}', $false, $false, $false); Write-Output ('SLIDES=' + $p.Slides.Count); $p.Close(); $pp.Quit()`
	const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comScript], { encoding: 'utf8', timeout: 180000, windowsHide: true })
	const comOutput = `${com.stdout || ''}\n${com.stderr || ''}`
	assert.equal(com.status, 0, `PowerPoint COM open failed: ${comOutput}`)
	assert.match(comOutput, /SLIDES=3/, 'PowerPoint did not report all imported slides')
	const report = { schemaVersion: 'betterpptx.recordstudio.annotation-roundtrip.v1', ok: true, savedPath, slides: 3, nativeInk: true, nativeLaser: true, nativeNarrationMedia: true, powerPointOpen: true }
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify({ ...report, reportPath }, null, 2))
} finally {
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: opened.deckId }, context) } catch {}
}
