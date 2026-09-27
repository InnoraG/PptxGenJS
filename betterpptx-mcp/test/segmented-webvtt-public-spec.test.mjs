import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-segmented-vtt-'))
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_OUT_DIR: outputDir, BETTERPPTX_DOWNLOAD_ROOT: outputDir,
})

const { createMcpToolDispatcher } = await import('../engine.mjs')
const dispatcher = createMcpToolDispatcher({ sessionId: `segmented-vtt-${Date.now()}`, blackBox: false })
const dataOf = (result, label) => { assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`); return result.data || result }

function wavData(durationMs = 1000) {
	const rate = 8000
	const samples = Math.round(rate * durationMs / 1000)
	const bytes = Buffer.alloc(44 + samples * 2)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
	bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40)
	return `data:audio/wav;base64,${bytes.toString('base64')}`
}

function spec() {
	const phrases = ['The signal appears.', 'The value becomes visible.', 'The decision is yours.']
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Vertical captioned motion proof', layout: 'LAYOUT_VERTICAL',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		styleIntent: { artDirection: 'editorial', mode: 'dark' },
		deliveryExperience: { mode: 'narrated-autoplay', requireMotion: true, requireCaptions: true },
		autoplay: { enabled: true, loop: false, secondsPerSlide: 4.5 },
		slides: [{
			id: 'vertical-reveal', title: 'A better presentation moves',
			content: [
				{ kind: 'textBox', name: 'hero', text: 'IDEAS\nIN MOTION', rect: { x: 0.55, y: 1.15, w: 6.4, h: 2.0 }, style: { fontSize: 46, bold: true, color: 'F8FAFC' } },
				{ kind: 'shape', name: 'signal', shapeName: 'ellipse', rect: { x: 2.85, y: 4.55, w: 1.8, h: 1.8 }, style: { fill: { color: '9DFF8F' }, line: { color: '9DFF8F' } } },
				{ kind: 'textBox', name: 'takeaway', text: 'NATIVE • EDITABLE • CAPTIONED', rect: { x: 0.6, y: 10.9, w: 6.3, h: 0.6 }, style: { fontSize: 20, bold: true, color: 'C5D5E8' } },
			],
			timeline: [{ target: 'signal', type: 'emphasis', effect: 'pulse', trigger: 'withPrevious', delay: 1400, duration: 400 }],
			narration: {
				segments: phrases.map((script, index) => ({
					script, audio: { data: wavData(), durationMs: 1000, extn: 'wav' }, gapAfterMs: index < 2 ? 200 : 0,
					closedCaptionTracks: [{ language: 'en-US', label: 'English', default: true, vtt: `WEBVTT\n\n00:00:00.000 --> 00:00:00.850\n${script}\n` }],
				})),
				paddingMs: 500,
			},
		}],
	}
}

test.after(async () => fs.rm(outputDir, { recursive: true, force: true }))

test('preflight reports a missing segment track and rejects a whole-slide track', async () => {
	const missing = spec()
	delete missing.slides[0].narration.segments[1].closedCaptionTracks
	const missingResult = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: missing, phase: 'dryRun', commitMode: 'createNew' })
	assert.equal(missingResult.ok, false)
	assert.match(JSON.stringify(missingResult.error), /WEBVTT_CAPTIONS_REQUIRED/)
	const misplaced = spec()
	misplaced.slides[0].narration.closedCaptionTracks = [{ language: 'en-US', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:00.850\nWrong scope\n' }]
	const misplacedResult = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: misplaced, phase: 'dryRun', commitMode: 'createNew' })
	assert.equal(misplacedResult.ok, false)
	assert.match(JSON.stringify(misplacedResult.error), /NARRATION_SEGMENT_CAPTION_SCOPE_REQUIRED/)
})

test('exact vertical narrated motion spec saves three native clip-local WebVTT tracks', { timeout: 120000 }, async () => {
	let deckId
	try {
		const source = spec()
		const dryRun = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'dryRun', commitMode: 'createNew', detail: 'summary' }), 'dryRun')
		assert.equal(dryRun.errors?.length || 0, 0)
		const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'summary' }), 'commit')
		deckId = committed.deckId
		const nativeAudit = dataOf(await dispatcher.call('betterpptx.deck.validate_native_visuals', { deckId }), 'native audit')
		assert.equal(nativeAudit.packageAudit.ok, true, JSON.stringify(nativeAudit.packageAudit.carrierDeficits))
		assert.equal(nativeAudit.packageAudit.inventoryReconciliation.narrationMediaCarrierCount, 3)
		assert.equal(nativeAudit.packageAudit.inventoryReconciliation.expectedNarrationMediaCarrierCount, 3)
		assert.equal(nativeAudit.packageAudit.inventoryReconciliation.unexplainedCarrierCount, 0)
		assert.equal(nativeAudit.packageAudit.inventoryReconciliation.missingNarrationMedia.length, 0)
		assert.deepEqual(nativeAudit.packageAudit.objectEvidence.filter(item => item.origin === 'ai-authored-narration-media').map(item => item.objectName), [
			'vertical-reveal.narration.audio-seg1', 'vertical-reveal.narration.audio-seg2', 'vertical-reveal.narration.audio-seg3',
		])
		const quality = dataOf(await dispatcher.call('betterpptx.deck.validate_quality', { deckId, profile: 'static', mode: 'strict', minScore: 0, accessibilityMode: 'basic', requireNarration: true, requireMotion: true, requireVisualProof: false, requireExpressive3D: false }), 'validate_quality')
		assert.equal(quality.ok, true, JSON.stringify(quality.blockingIssues || quality.failed))
		const saved = dataOf(await dispatcher.call('betterpptx.deck.save', { deckId, outputDir, fileName: 'vertical-captioned-motion.pptx' }), 'save')
		const savedBytes = await fs.readFile(saved.filePath)
		if (process.env.BETTERPPTX_CAPTION_QA_DIR) {
			await fs.mkdir(process.env.BETTERPPTX_CAPTION_QA_DIR, { recursive: true })
			await fs.copyFile(saved.filePath, path.join(process.env.BETTERPPTX_CAPTION_QA_DIR, 'vertical-captioned-motion.pptx'))
		}
		const zip = await JSZip.loadAsync(savedBytes)
		const names = Object.keys(zip.files)
		const vttNames = names.filter(name => /^ppt\/media\/.*\.vtt$/i.test(name))
		assert.equal(vttNames.length, 3, 'each narration clip owns one VTT package part')
		const vtts = await Promise.all(vttNames.map(name => zip.file(name).async('string')))
		for (const phrase of ['The signal appears.', 'The value becomes visible.', 'The decision is yours.']) assert.ok(vtts.some(vtt => vtt.includes(phrase)))
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
		assert.equal((slideXml.match(/<p173:track\b/g) || []).length, 3)
		assert.equal((rels.match(/2017\/04\/relationships\/track/g) || []).length, 3)
		assert.equal((slideXml.match(/<p:audio\b/g) || []).length, 3)
		assert.match(slideXml, /isNarration/)
		assert.match(slideXml, /advClick="0"/)
		assert.match(slideXml, /advTm=/)
		const presentationXml = await zip.file('ppt/presentation.xml').async('string')
		const slideSize = presentationXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
		assert.ok(slideSize)
		assert.equal(Number(slideSize[1]), 6858000)
		assert.ok(Math.abs(Number(slideSize[2]) / 914400 - 13.333) < 0.001)
	} finally {
		if (deckId) await dispatcher.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
