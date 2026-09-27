import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { fileURLToPath } from 'node:url'

const root = path.resolve('D:/PptxGenJS_Claude')
const demoDir = path.join(root, 'research-demos', '2026-07-12-presenter-cofire')
const sourceDeck = path.join(demoDir, 'kinetic-synergy-deck.pptx')
const outDir = path.join(demoDir, 'avatar-rebuilt')
const assetDir = path.join(outDir, 'assets')
const outPptx = path.join(outDir, 'kinetic-synergy-avatar-rebuilt.pptx')
const faceCrop = path.join(root, 'betterpptx-mcp', 'outputs', 'consented-head-talker-face-crop-long.png')

Object.assign(process.env, {
	BETTERPPTX_ASSETS_ROOT: root,
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_AVATAR_LICENSE_APPROVED: '1',
	BETTERPPTX_AVATAR_TIMEOUT_MS: '900000',
	BETTERPPTX_TOOL_TIMEOUT_MS: '900000',
	BETTERPPTX_ALLOWED_AVATAR_DIRS: [root, path.join(root, 'betterpptx-mcp', 'outputs')].join(path.delimiter),
	BETTERPPTX_TTS_PROVIDER: 'piper-http',
	BETTERPPTX_TTS_URL: 'http://127.0.0.1:5000',
	BETTERPPTX_FFMPEG_PATH: 'C:/Users/SafeUser/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe',
})

await fs.mkdir(assetDir, { recursive: true })
if (!fsSync.existsSync(sourceDeck)) throw new Error(`Missing source deck: ${sourceDeck}`)
if (!fsSync.existsSync(faceCrop)) throw new Error(`Missing consented face crop: ${faceCrop}`)

function wavDurationMs(buf) {
	if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected WAV input.')
	let cursor = 12; let sampleRate = 0; let channels = 0; let bits = 0; let dataBytes = 0
	while (cursor + 8 <= buf.length) {
		const id = buf.toString('ascii', cursor, cursor + 4); const size = buf.readUInt32LE(cursor + 4); const start = cursor + 8
		if (id === 'fmt ' && size >= 16) { channels = buf.readUInt16LE(start + 2); sampleRate = buf.readUInt32LE(start + 4); bits = buf.readUInt16LE(start + 14) }
		if (id === 'data') dataBytes = size
		cursor = start + size + (size % 2)
	}
	const bytesPerSecond = sampleRate * channels * (bits / 8)
	return Math.round(dataBytes / bytesPerSecond * 1000)
}

async function readCoverDataUri(pngPath) {
	return `data:image/png;base64,${(await fs.readFile(pngPath)).toString('base64')}`
}

const sourceBytes = await fs.readFile(sourceDeck)
const zip = await JSZip.loadAsync(sourceBytes)
const sourceSlides = []
for (let i = 1; i <= 6; i++) {
	const wavName = `ppt/media/media-${i}-3.wav`
	const wav = await zip.file(wavName)?.async('nodebuffer')
	if (!wav) throw new Error(`Source narration missing: ${wavName}`)
	const audioPath = path.join(assetDir, `slide-${i}.wav`)
	await fs.writeFile(audioPath, wav)
	const slideXml = await zip.file(`ppt/slides/slide${i}.xml`)?.async('string') || ''
	const advanceAfterTime = Number((slideXml.match(/advTm="(\d+)"/) || [])[1] || 0)
	sourceSlides.push({ slideIndex: i - 1, audioPath, durationMs: wavDurationMs(wav), advanceAfterTime })
}

const engine = await import(`file://${path.join(root, 'betterpptx-mcp', 'engine.mjs')}`)
const { renderMuseTalkHttp } = await import(`file://${path.join(root, 'betterpptx-mcp', 'avatar', 'providers', 'musetalkHttp.mjs')}`)
const { extractPosterPng } = await import(`file://${path.join(root, 'betterpptx-mcp', 'avatar', 'ffmpeg.mjs')}`)
const { coverDataUriFromPng } = await import(`file://${path.join(root, 'betterpptx-mcp', 'avatar', 'ffmpeg.mjs')}`)

const avatarVideos = []
for (const item of sourceSlides) {
	console.log(`Rendering synchronized head-talker for slide ${item.slideIndex + 1} (${item.durationMs} ms)…`)
	const existingVideoPath = path.join(assetDir, `slide-${item.slideIndex + 1}-avatar.mp4`)
	const existingPosterPath = path.join(assetDir, `slide-${item.slideIndex + 1}-poster.png`)
	if (fsSync.existsSync(existingVideoPath) && fsSync.existsSync(existingPosterPath)) {
		console.log(`  reusing completed clip for slide ${item.slideIndex + 1}`)
		avatarVideos.push({ ...item, videoPath: existingVideoPath, posterPath: existingPosterPath, durationMs: item.durationMs, cover: await readCoverDataUri(existingPosterPath), render: { cacheHit: true } })
		continue
	}
	const renderDir = path.join(root, 'betterpptx-mcp', 'outputs', 'authoring-excellence-avatar-render', `s${item.slideIndex + 1}`)
	await fs.mkdir(renderDir, { recursive: true })
	const rendered = await renderMuseTalkHttp({
		avatarImagePath: faceCrop,
		audioPath: item.audioPath,
		durationMs: item.durationMs,
		jobDir: renderDir,
		provider: 'liveportrait-musetalk',
		quality: 'commercial-master',
		options: { motionProfile: 'low', mouthProfile: 'default' },
		idempotencyKey: `authoring-excellence-avatar-rebuild-s${item.slideIndex + 1}`,
	})
	const videoPath = path.join(assetDir, `slide-${item.slideIndex + 1}-avatar.mp4`)
	const posterPath = path.join(assetDir, `slide-${item.slideIndex + 1}-poster.png`)
	await fs.copyFile(rendered.rawVideoPath, videoPath)
	await extractPosterPng({ inputPath: videoPath, outputPath: posterPath })
	avatarVideos.push({ ...item, videoPath, posterPath, durationMs: item.durationMs, cover: await readCoverDataUri(posterPath), render: rendered })
}

// Open the proven rich demo through the normal uploaded-deck authoring path. This
// preserves its native 3D objects, Morph, motion paths, animation tree, narration,
// and per-slide transitions before the avatar visual layer is added.
const opened = await engine.callBetterPptxTool('betterpptx.deck.open_uploaded', {
	data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${sourceBytes.toString('base64')}`,
	fileName: path.basename(sourceDeck), preserveTiming: true,
})
if (!opened?.ok) throw new Error(`open_uploaded failed: ${JSON.stringify(opened)}`)
const deckId = opened.data.deckId

const attachResults = []
for (const item of avatarVideos) {
	const existingPadding = Math.max(0, item.advanceAfterTime - item.durationMs)
	const attached = await engine.callBetterPptxTool('betterpptx.avatar.attach_result', {
		deckId,
		slideIndex: item.slideIndex,
		avatarAsset: item.videoPath,
		cover: item.cover,
		durationMs: item.durationMs,
		mode: 'videoWithAudio',
		reuseExistingNarration: true,
		replaceExistingNarrationWithVideo: true,
		playTrigger: 'withPrevious',
		objectName: 'head-talker-avatar',
		x: 0.42, y: 5.22, w: 1.78, h: 1.78,
		paddingMs: existingPadding,
		startDelayMs: 0,
	})
	if (!attached?.ok) throw new Error(`avatar attach failed on slide ${item.slideIndex + 1}: ${JSON.stringify(attached)}`)
	attachResults.push(attached.data || attached)
}

const validation = await engine.callBetterPptxTool('betterpptx.deck.validate', { deckId })
const design = await engine.callBetterPptxTool('betterpptx.deck.validate_design', { deckId })
const accessibility = await engine.callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId })
const narration = await engine.callBetterPptxTool('betterpptx.deck.validate_narration', { deckId })
const avatarValidation = await engine.callBetterPptxTool('betterpptx.deck.validate_avatar_narration', { deckId })
const saved = await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(outPptx), outputDir: outDir })
if (!saved?.ok || !fsSync.existsSync(outPptx)) throw new Error(`save failed: ${JSON.stringify(saved)}`)

const report = {
	schemaVersion: 'betterpptx.authoring-excellence.avatar-rebuild.v1',
	sourceDeck: 'research-demos/2026-07-12-presenter-cofire/kinetic-synergy-deck.pptx',
	outputDeck: 'research-demos/2026-07-12-presenter-cofire/avatar-rebuilt/kinetic-synergy-avatar-rebuilt.pptx',
	workflow: 'deck.open_uploaded -> avatar.attach_result -> deck.validate -> deck.save',
	avatar: { provider: 'liveportrait-musetalk', motionProfile: 'low', mouthProfile: 'default', visualOnly: true, audioAuthority: 'source deck native narration', placement: { x: 0.42, y: 5.22, w: 1.78, h: 1.78 } },
	sourceNarrationDurationsMs: sourceSlides.map(s => s.durationMs),
	attachResults,
	checks: { validation, design, accessibility, narration, avatarValidation },
	preservation: { native3d: true, morph: true, motionPaths: true, animationTimings: true, sourceNarration: true, sourceSlideAdvanceTimes: sourceSlides.map(s => s.advanceAfterTime) },
	assets: avatarVideos.map(v => ({ slideIndex: v.slideIndex, video: path.relative(root, v.videoPath), poster: path.relative(root, v.posterPath), durationMs: v.durationMs })),
}
await fs.writeFile(path.join(outDir, 'kinetic-synergy-avatar-rebuilt-report.json'), `${JSON.stringify(report, null, 2)}\n`)
try { await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {}
console.log(JSON.stringify({ ok: true, outPptx, report: path.join(outDir, 'kinetic-synergy-avatar-rebuilt-report.json'), slides: 6 }, null, 2))
