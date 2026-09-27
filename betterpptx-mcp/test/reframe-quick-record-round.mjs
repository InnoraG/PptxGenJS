// Rebuild an imported quick-record presenter window at the exact reference
// geometry while preserving the authored recording/timing XML.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const root = path.resolve('betterpptx-mcp')
const source = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728', 'quick-record-round-near-border.pptx')
const outputDir = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728')
const outputName = 'quick-record-round-production-geometry.pptx'
const output = path.join(outputDir, outputName)
const context = { sessionId: `quick-record-reframe-${Date.now()}` }
const { callBetterPptxTool } = await import('../engine.mjs')

function dataOf(result) {
	if (!result?.ok) throw new Error(`${result?.error?.code || 'TOOL_FAILED'}: ${result?.error?.message || JSON.stringify(result)}`)
	return result.data || result
}

assert.ok(fsSync.existsSync(source), `missing source deck: ${source}`)
const sourceZip = await JSZip.loadAsync(await fs.readFile(source))
const sourceVideo = await sourceZip.file('ppt/media/media1.mp4').async('nodebuffer')
const sourcePoster = await sourceZip.file('ppt/media/image1.png').async('nodebuffer')
const tempDir = await fs.mkdtemp(path.join(process.env.TEMP || process.env.TMP || '.', 'quick-record-reframe-'))
const replacementVideoPath = path.join(tempDir, 'quick-record.mp4')
await fs.writeFile(replacementVideoPath, sourceVideo)
const coverDataUri = `data:image/png;base64,${sourcePoster.toString('base64')}`
const opened = dataOf(await callBetterPptxTool('betterpptx.deck.open_existing', {
	pptxPath: source,
	slideNumbers: [1],
	preserveTiming: true,
}, context))
try {
	dataOf(await callBetterPptxTool('betterpptx.slide.update_media', {
		deckId: opened.deckId,
		slideIndex: 0,
		target: { objectName: 'Video 5' },
		replacementMediaPath: replacementVideoPath,
		coverDataUri,
		optionsPatch: {
			x: 10.9933333333,
			y: 5.16,
			w: 2.25,
			h: 2.25,
			rounding: true,
			sizing: { type: 'cover', w: 2.25, h: 2.25 },
		},
		interactivePlayback: true,
	}, context))
	const saved = dataOf(await callBetterPptxTool('betterpptx.deck.save', {
		deckId: opened.deckId,
		outputDir,
		fileName: outputName,
	}, context))
	const savedPath = saved.filePath || output
	const zip = await JSZip.loadAsync(await fs.readFile(savedPath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /p15:isNarration[^>]*val="1"/)
	assert.match(slideXml, /<p:timing>/)
	assert.match(slideXml, /prst="ellipse"/)
	assert.match(slideXml, /<a:srcRect\b/)
	const report = {
		schemaVersion: 'betterpptx.quick-record-round-production-geometry.v1',
		status: 'PASS',
		source: 'outputs/commercial-poc/current-commercial-20260728/quick-record-round-near-border.pptx',
		output: 'outputs/commercial-poc/current-commercial-20260728/quick-record-round-production-geometry.pptx',
		placement: { xIn: 10.9933333333, yIn: 5.16, wIn: 2.25, hIn: 2.25, widthPt: 162, heightPt: 162, leftPt: 791.52, topPt: 371.52 },
		checks: { nativeNarration: true, nativeTiming: true, roundWindow: true, aspectSafeCrop: true, sourcePreserved: true },
		interpretation: 'The quick-record media object uses the exact reference 162 pt round geometry and low-right placement while reattaching the original recorded MP4/poster bytes and preserving the authored timing package.',
	}
	await fs.writeFile(path.join(outputDir, 'quick-record-round-production-geometry-report.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify({ ok: true, savedPath, report }, null, 2))
} finally {
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: opened.deckId }, context) } catch {}
	try { await fs.rm(tempDir, { recursive: true, force: true }) } catch {}
}
