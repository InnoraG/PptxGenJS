#!/usr/bin/env node
// Public-MCP proof that an authentic PowerPoint Record Studio capture can be
// opened and saved without being replaced by a newly authored media object.
// The source recording session is the authority: media payloads, native
// narration identity, timing, interactive pause/resume, ink and laser parts
// must survive. This verifier does not synthesize or promote ordinary media.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import JSZip from 'jszip'

const root = path.dirname(fileURLToPath(new URL('../engine.mjs', import.meta.url)))
const workspaceRoot = path.resolve(root, '..')
const source = path.join(workspaceRoot, 'tmp_autonomous_test', 'mostsimple-blank-narration-reference.pptx')
const outputDir = path.join(root, 'outputs', 'g1-native-recordstudio-roundtrip-20260814')
const downloadRoot = path.join(outputDir, 'downloads')
const output = path.join(outputDir, 'mostsimple-blank-narration-reference-mcp-roundtrip.pptx')
const reportPath = path.join(outputDir, 'recordstudio-public-roundtrip-report.json')
await fs.mkdir(downloadRoot, { recursive: true })

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const envelope = (label, result) => {
	const parsed = result?.structuredContent || (() => {
		try { return JSON.parse(result?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!parsed || parsed.ok !== true) throw new Error(`${label} failed: ${JSON.stringify(parsed || result)}`)
	return parsed.data || parsed
}
const localDownloadPath = downloadUrl => {
	const parsed = new URL(downloadUrl)
	const match = parsed.pathname.match(/^\/files\/([^/]+)\/(.+)$/)
	if (!match) throw new Error(`Unexpected public download URL: ${parsed.pathname}`)
	return path.join(downloadRoot, match[1], decodeURIComponent(match[2]))
}
async function packageSignature(file) {
	const bytes = await fs.readFile(file)
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const slideNames = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
	const slides = []
	for (const name of slideNames) {
		const xml = await zip.file(name).async('string')
		slides.push({
			name,
			nativeNarrationObjects: (xml.match(/p15:isNarration\b[^>]*\bval="1"/g) || []).length,
			videoNodes: (xml.match(/<p:video\b/g) || []).length,
			interactivePause: /nodeType="interactiveSeq"/.test(xml) && /cmd="togglePause"/.test(xml),
			nativeTiming: /<p:timing\b/.test(xml),
			contentParts: (xml.match(/<p:contentPart\b/g) || []).length,
			laserTrace: /<p14:laserTraceLst\b/.test(xml),
			transitionAdvanceMs: Number((xml.match(/\badvTm="(\d+)"/) || [])[1] || 0),
		})
	}
	const payloads = []
	for (const name of names.filter(name => /^ppt\/media\//i.test(name)).sort()) {
		const payload = await zip.file(name).async('nodebuffer')
		payloads.push({ name, bytes: payload.length, sha256: sha256(payload) })
	}
	const nativeParts = []
	for (const name of names.filter(name => /^ppt\/ink\//i.test(name)).sort()) {
		const payload = await zip.file(name).async('nodebuffer')
		nativeParts.push({ name, bytes: payload.length, sha256: sha256(payload) })
	}
	const presProps = await zip.file('ppt/presProps.xml')?.async('string') || ''
	return {
		bytes: bytes.length,
		sha256: sha256(bytes),
		slides,
		payloads,
		nativeParts,
		showNarration: /\bshowNarration="1"/.test(presProps),
		showAnimation: /\bshowAnimation="1"/.test(presProps),
		useTimings: /\buseTimings="1"/.test(presProps),
	}
}

const transport = new StdioClientTransport({
	command: process.execPath,
	args: ['server.mjs'],
	cwd: root,
	stderr: 'pipe',
	env: {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
		BETTERPPTX_PREMIUM: '1',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_PUBLIC_BASE: 'http://local.invalid',
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot,
	},
})
const client = new Client({ name: 'native-recordstudio-roundtrip-verifier', version: '1' }, { capabilities: {} })
await client.connect(transport)
try {
	const sourceBytes = await fs.readFile(source)
	const opened = envelope('deck.open_uploaded', await client.callTool({ name: 'betterpptx.deck.open_uploaded', arguments: {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${sourceBytes.toString('base64')}`,
		fileName: 'mostsimple-blank-narration-reference.pptx',
		preserveTiming: true,
		idempotencyKey: 'g1-native-recordstudio-reference-open-20260814-v1',
	} }))
	const saved = envelope('deck.save', await client.callTool({ name: 'betterpptx.deck.save', arguments: {
		deckId: opened.deckId,
		fileName: path.basename(output),
		idempotencyKey: 'g1-native-recordstudio-reference-save-20260814-v1',
	} }))
	assert.ok(saved.downloadUrl, 'public save did not return a download URL')
	await fs.copyFile(localDownloadPath(saved.downloadUrl), output)
	const reference = await packageSignature(source)
	const roundtrip = await packageSignature(output)
	assert.equal(roundtrip.slides.length, reference.slides.length, 'slide count changed')
	assert.deepEqual(roundtrip.payloads.map(item => item.sha256).sort(), reference.payloads.map(item => item.sha256).sort(), 'recorded media/image payload hashes changed')
	assert.deepEqual(roundtrip.nativeParts.map(item => item.sha256).sort(), reference.nativeParts.map(item => item.sha256).sort(), 'native Record Studio ink payload hashes changed')
	assert.deepEqual(roundtrip.slides.map(item => item.nativeNarrationObjects), reference.slides.map(item => item.nativeNarrationObjects), 'native narration identity changed')
	assert.deepEqual(roundtrip.slides.map(item => item.videoNodes), reference.slides.map(item => item.videoNodes), 'native video timing nodes changed')
	assert.deepEqual(roundtrip.slides.map(item => item.interactivePause), reference.slides.map(item => item.interactivePause), 'interactive pause/resume structure changed')
	assert.deepEqual(roundtrip.slides.map(item => item.contentParts), reference.slides.map(item => item.contentParts), 'native Record Studio content parts changed')
	assert.deepEqual(roundtrip.slides.map(item => item.laserTrace), reference.slides.map(item => item.laserTrace), 'native laser traces changed')
	assert.equal(roundtrip.showNarration, reference.showNarration, 'showNarration changed')
	assert.equal(roundtrip.showAnimation, reference.showAnimation, 'showAnimation changed')
	assert.equal(roundtrip.useTimings, reference.useTimings, 'useTimings changed')
	const report = {
		schemaVersion: 'betterpptx.recordstudio.public-roundtrip.v1',
		status: 'PASS',
		source: path.relative(workspaceRoot, source).replaceAll('\\', '/'),
		output: path.relative(workspaceRoot, output).replaceAll('\\', '/'),
		reference,
		roundtrip,
		mediaPayloadsBytePreserved: true,
		nativeRecordStudioSessionPreserved: true,
		ordinaryMediaPromotionUsed: false,
	}
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify({ status: report.status, output: report.output, sourceSha256: reference.sha256, outputSha256: roundtrip.sha256, slides: roundtrip.slides.length, mediaPayloadsBytePreserved: true, nativeRecordStudioSessionPreserved: true }, null, 2))
} finally {
	try { await client.close() } catch {}
}
