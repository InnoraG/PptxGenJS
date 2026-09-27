import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'

const root = path.resolve('D:/PptxGenJS_Claude')
const sourceDeck = path.join(root, 'tmp_autonomous_test', 'Narration_and_timing_without_video_FROZENREFERENCE.pptx')
const outDir = path.join(root, 'tmp_autonomous_test', 'ink-laser-avatar-regression')
const assetDir = path.join(outDir, 'assets')
const outPptx = path.join(outDir, 'Narration_and_timing_without_video_avatar-regression.pptx')
const faceCrop = path.join(root, 'betterpptx-mcp', 'outputs', 'consented-head-talker-face-crop-long.png')
const ffmpeg = 'C:/Users/SafeUser/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'

Object.assign(process.env, {
	BETTERPPTX_ASSETS_ROOT: root,
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_AVATAR_LICENSE_APPROVED: '1',
	BETTERPPTX_AVATAR_TIMEOUT_MS: '900000', BETTERPPTX_TOOL_TIMEOUT_MS: '900000', BETTERPPTX_FFMPEG_PATH: ffmpeg,
	BETTERPPTX_ALLOWED_AVATAR_DIRS: [root, path.join(root, 'betterpptx-mcp', 'outputs')].join(path.delimiter),
})

await fs.mkdir(assetDir, { recursive: true })
if (!fsSync.existsSync(sourceDeck) || !fsSync.existsSync(faceCrop)) throw new Error('Regression source deck or consented face crop is missing.')

function wavDurationMs(buf) {
	if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected WAV input.')
	let cursor = 12; let sampleRate = 0; let channels = 0; let bits = 0; let dataBytes = 0
	while (cursor + 8 <= buf.length) {
		const id = buf.toString('ascii', cursor, cursor + 4); const size = buf.readUInt32LE(cursor + 4); const start = cursor + 8
		if (id === 'fmt ' && size >= 16) { channels = buf.readUInt16LE(start + 2); sampleRate = buf.readUInt32LE(start + 4); bits = buf.readUInt16LE(start + 14) }
		if (id === 'data') dataBytes = size
		cursor = start + size + (size % 2)
	}
	return Math.round(dataBytes / (sampleRate * channels * (bits / 8)) * 1000)
}

const sourceBytes = await fs.readFile(sourceDeck)
const zip = await JSZip.loadAsync(sourceBytes)
const sourceSlides = []
for (let i = 1; i <= 5; i++) {
	const m4a = await zip.file(`ppt/media/media${i}.m4a`)?.async('nodebuffer')
	if (!m4a) throw new Error(`Missing source narration media${i}.m4a`)
	const m4aPath = path.join(assetDir, `slide-${i}.m4a`); const wavPath = path.join(assetDir, `slide-${i}.wav`)
	await fs.writeFile(m4aPath, m4a)
	execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', m4aPath, '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', wavPath], { stdio: 'inherit' })
	const wav = await fs.readFile(wavPath)
	const slideXml = await zip.file(`ppt/slides/slide${i}.xml`)?.async('string') || ''
	const advanceAfterTime = Number((slideXml.match(/advTm="(\d+)"/) || [])[1] || 0)
	sourceSlides.push({ slideIndex: i - 1, audioPath: wavPath, durationMs: wavDurationMs(wav), advanceAfterTime })
}

const engine = await import(`file://${path.join(root, 'betterpptx-mcp', 'engine.mjs')}`)
const { renderMuseTalkHttp } = await import(`file://${path.join(root, 'betterpptx-mcp', 'avatar', 'providers', 'musetalkHttp.mjs')}`)
const { extractPosterPng } = await import(`file://${path.join(root, 'betterpptx-mcp', 'avatar', 'ffmpeg.mjs')}`)
const coverDataUri = async p => `data:image/png;base64,${(await fs.readFile(p)).toString('base64')}`

const avatarVideos = []
for (const item of sourceSlides) {
	const videoPath = path.join(assetDir, `slide-${item.slideIndex + 1}-avatar.mp4`)
	const posterPath = path.join(assetDir, `slide-${item.slideIndex + 1}-poster.png`)
	if (!fsSync.existsSync(videoPath) || !fsSync.existsSync(posterPath)) {
		console.log(`Rendering ink/laser regression avatar slide ${item.slideIndex + 1} (${item.durationMs} ms)…`)
		const renderDir = path.join(root, 'betterpptx-mcp', 'outputs', 'ink-laser-avatar-regression-render', `s${item.slideIndex + 1}`)
		await fs.mkdir(renderDir, { recursive: true })
		const rendered = await renderMuseTalkHttp({ avatarImagePath: faceCrop, audioPath: item.audioPath, durationMs: item.durationMs, jobDir: renderDir, provider: 'liveportrait-musetalk', quality: 'commercial-master', options: { motionProfile: 'low', mouthProfile: 'default' }, idempotencyKey: `ink-laser-avatar-regression-s${item.slideIndex + 1}` })
		await fs.copyFile(rendered.rawVideoPath, videoPath)
		await extractPosterPng({ inputPath: videoPath, outputPath: posterPath })
	}
	avatarVideos.push({ ...item, videoPath, posterPath, cover: await coverDataUri(posterPath) })
}

const opened = await engine.callBetterPptxTool('betterpptx.deck.open_uploaded', { data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${sourceBytes.toString('base64')}`, fileName: path.basename(sourceDeck), preserveTiming: true })
if (!opened?.ok) throw new Error(`open_uploaded failed: ${JSON.stringify(opened)}`)
const deckId = opened.data.deckId
for (const item of avatarVideos) {
	const attached = await engine.callBetterPptxTool('betterpptx.avatar.attach_result', { deckId, slideIndex: item.slideIndex, avatarAsset: item.videoPath, cover: item.cover, durationMs: item.durationMs, mode: 'mutedVideoPlusNativeAudio', reuseExistingNarration: true, playTrigger: 'withPrevious', objectName: 'head-talker-avatar', altText: 'Talking-head avatar synchronized to the slide narration.', x: 0.42, y: 5.22, w: 1.78, h: 1.78, paddingMs: Math.max(0, item.advanceAfterTime - item.durationMs), startDelayMs: 0 })
	if (!attached?.ok) throw new Error(`attach failed: ${JSON.stringify(attached)}`)
}
const validation = await engine.callBetterPptxTool('betterpptx.deck.validate', { deckId })
const accessibility = await engine.callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId })
const narration = await engine.callBetterPptxTool('betterpptx.deck.validate_narration', { deckId })
const avatarValidation = await engine.callBetterPptxTool('betterpptx.deck.validate_avatar_narration', { deckId })
const saved = await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(outPptx), outputDir: outDir })
if (!saved?.ok || !fsSync.existsSync(outPptx)) throw new Error(`save failed: ${JSON.stringify(saved)}`)
try { await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {}

console.log(JSON.stringify({ ok: true, outPptx, sourceSlides: sourceSlides.map(x => ({ durationMs: x.durationMs, advanceAfterTime: x.advanceAfterTime })), checks: { validation, accessibility, narration, avatarValidation } }, null, 2))
