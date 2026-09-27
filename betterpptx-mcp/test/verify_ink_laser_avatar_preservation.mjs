import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import JSZip from 'jszip'

const root = path.resolve('D:/PptxGenJS_Claude')
const sourceDeck = path.join(root, 'tmp_autonomous_test', 'Narration_and_timing_without_video_FROZENREFERENCE.pptx')
const outDir = path.join(root, 'tmp_autonomous_test', 'ink-laser-avatar-regression')
const avatarPath = path.join(outDir, 'assets', 'slide-1-avatar.mp4')
const posterPath = path.join(outDir, 'assets', 'slide-1-poster.png')
const outPptx = path.join(outDir, 'Narration_and_timing_without_video_avatar-ink-laser-verified.pptx')
Object.assign(process.env, { BETTERPPTX_ASSETS_ROOT: root, BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_AVATAR_LICENSE_APPROVED: '1', BETTERPPTX_AVATAR_TIMEOUT_MS: '900000', BETTERPPTX_TOOL_TIMEOUT_MS: '900000', BETTERPPTX_FFMPEG_PATH: 'C:/Users/SafeUser/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe', BETTERPPTX_ALLOWED_AVATAR_DIRS: [root, path.join(root, 'betterpptx-mcp', 'outputs')].join(path.delimiter) })
if (!fsSync.existsSync(sourceDeck) || !fsSync.existsSync(avatarPath) || !fsSync.existsSync(posterPath)) throw new Error('Ink/laser regression inputs are missing.')
const sourceBytes = await fs.readFile(sourceDeck)
const sourceZip = await JSZip.loadAsync(sourceBytes)
const cover = `data:image/png;base64,${(await fs.readFile(posterPath)).toString('base64')}`
const engine = await import(`file://${path.join(root, 'betterpptx-mcp', 'engine.mjs')}`)
const opened = await engine.callBetterPptxTool('betterpptx.deck.open_uploaded', { data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${sourceBytes.toString('base64')}`, fileName: path.basename(sourceDeck), preserveTiming: true })
if (!opened?.ok) throw new Error(`open_uploaded failed: ${JSON.stringify(opened)}`)
const deckId = opened.data.deckId
for (let i = 0; i < 5; i++) {
	const slide = engine.getSlide(deckId, i)
	for (const obj of slide._slideObjects || []) {
		if (obj?._type === 'media' && String(obj.mtype || '').toLowerCase() === 'audio') {
			obj.options = obj.options || {}
			obj.options.altText = obj.options.altText || (obj.options.isNarration === true ? 'Narration audio for this slide.' : 'Recorded audio for this slide.')
		}
	}
}
const attached = await engine.callBetterPptxTool('betterpptx.avatar.attach_result', { deckId, slideIndex: 0, avatarAsset: avatarPath, cover, durationMs: 8600, mode: 'videoWithAudio', reuseExistingNarration: true, replaceExistingNarrationWithVideo: true, playTrigger: 'withPrevious', objectName: 'head-talker-avatar', altText: 'Talking-head avatar synchronized to the slide narration.', x: 0.42, y: 5.22, w: 1.78, h: 1.78, paddingMs: 6, startDelayMs: 0 })
if (!attached?.ok) throw new Error(`attach failed: ${JSON.stringify(attached)}`)
const validation = await engine.callBetterPptxTool('betterpptx.deck.validate', { deckId })
const accessibility = await engine.callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId })
const narration = await engine.callBetterPptxTool('betterpptx.deck.validate_narration', { deckId })
const avatarValidation = await engine.callBetterPptxTool('betterpptx.deck.validate_avatar_narration', { deckId })
const saved = await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(outPptx), outputDir: outDir })
if (!saved?.ok || !fsSync.existsSync(outPptx)) throw new Error(`save failed: ${JSON.stringify(saved)}`)
const outputZip = await JSZip.loadAsync(await fs.readFile(outPptx))
const sourceInk = sourceZip.file(/ppt\/ink\/.*\.xml$/).sort((a, b) => a.name.localeCompare(b.name))
const outputInk = outputZip.file(/ppt\/ink\/.*\.xml$/).sort((a, b) => a.name.localeCompare(b.name))
const hashes = async files => Object.fromEntries(await Promise.all(files.map(async f => [f.name, crypto.createHash('sha256').update(await f.async('nodebuffer')).digest('hex')])))
const sourceHashes = await hashes(sourceInk); const outputHashes = await hashes(outputInk)
const inkLaserPreserved = JSON.stringify(sourceHashes) === JSON.stringify(outputHashes)
try { await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {}
console.log(JSON.stringify({ ok: inkLaserPreserved && validation?.data?.valid === true && narration?.data?.ok === true && avatarValidation?.data?.ok === true, outPptx, sourceInkParts: Object.keys(sourceHashes), outputInkParts: Object.keys(outputHashes), inkLaserPreserved, checks: { validation, accessibility, narration, avatarValidation } }, null, 2))
