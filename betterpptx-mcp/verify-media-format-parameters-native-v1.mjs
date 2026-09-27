// Native/package/Office proof for the media playback and accessibility contract.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { MEDIA_FORMAT_PARAMETERS, MEDIA_FORMAT_TYPES, MEDIA_FORMAT_SIZING_TYPES, validateMediaFormatOptions } from './media-format-catalog.mjs'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/media-format-parameters-native/${stamp}`)
const generated = path.join(outDir, 'media-format-parameters-native.pptx')
const roundtrip = path.join(outDir, 'powerpoint-savecopyas-roundtrip.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
await fs.mkdir(outDir, { recursive: true })

const wavData = 'audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
const videoPath = path.resolve('demos/common/media/sample.mp4')
const checkpoints = [
	{ id: 'video-frame', label: 'Video cover frame, transparency, and rounded geometry', kind: 'video' },
	{ id: 'audio-caption-volume', label: 'Audio volume, stopped-state, and native WebVTT captions', kind: 'audio' },
	{ id: 'audio-defaults', label: 'Omitted controls restore native defaults', kind: 'audio' },
]

validateMediaFormatOptions({ type: 'video', sizing: { type: 'cover', w: 8, h: 4.5 }, transparency: 12.5, rounding: true, interactivePlayback: false, mediaVolume: 65000 })
const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX media format proof'; pptx.title = 'Native media format parameters'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'

{
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoints[0].label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addMedia({ type: 'video', path: videoPath, extn: 'mp4', objectName: 'media-video-frame', x: 1.1, y: 1.35, w: 10, h: 4.8, sizing: { type: 'cover', w: 10, h: 4.8 }, _sizingSourceW: 1920, _sizingSourceH: 1080, transparency: 12.5, rounding: true, interactivePlayback: false, mediaVolume: 65000, showWhenStopped: true })
	slide.addAnimation('media-video-frame', { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', trigger: 'onClick', duration: 1 })
	slide.addNotes('Media checkpoint video-frame: native cover/crop framing, 12.5 percent preview transparency, rounded frame, disabled interactive sequence, explicit volume, and stopped-frame behavior.')
}
{
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoints[1].label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addMedia({ type: 'audio', data: wavData, extn: 'wav', objectName: 'media-audio-caption', x: 1.1, y: 1.7, w: 10, h: 1.2, transparency: 20, interactivePlayback: false, mediaVolume: 42000, showWhenStopped: true, endOnStopAudio: true, closedCaptionTracks: [{ language: 'en-US', label: 'English', vtt: 'WEBVTT\\n\\n00:00:00.000 --> 00:00:01.000\\nNative caption track\\n', default: true }] })
	slide.addAnimation('media-audio-caption', { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', trigger: 'onClick', duration: 1 })
	slide.addNotes('Media checkpoint audio-caption-volume: native WebVTT track, explicit PowerPoint volume, stopped-frame and end-on-stop behavior.')
}
{
	const slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }
	slide.addText(checkpoints[2].label, { x: 0.65, y: 0.3, w: 11.6, h: 0.45, color: '0F172A', fontSize: 22, bold: true })
	slide.addMedia({ type: 'audio', data: wavData, extn: 'wav', objectName: 'media-audio-defaults', x: 1.1, y: 1.7, w: 10, h: 1.2 })
	slide.addNotes('Media checkpoint audio-defaults: omitted optional playback controls intentionally restore native defaults.')
}
await pptx.writeFile({ fileName: generated, compression: false })

const zip = await JSZip.loadAsync(await fs.readFile(generated), { checkCRC32: true })
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))
const slideXml = await Promise.all(slideFiles.map(name => zip.file(name).async('string')))
const relFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)).sort()
const relXml = await Promise.all(relFiles.map(name => zip.file(name).async('string')))
const generatedRows = [
	{ id: 'video-frame', mediaCarrier: slideXml[0].includes('<a:videoFile'), coverSizing: slideXml[0].includes('<a:srcRect') || slideXml[0].includes('<a:stretch'), transparency: slideXml[0].includes('alphaModFix amt="87500"'), rounded: slideXml[0].includes('prst="ellipse"'), volumeTiming: slideXml[0].includes('vol="65000"'), noPrivateShapePaths: !slideXml[0].includes(videoPath.replaceAll('\\', '/')) },
	{ id: 'audio-caption-volume', mediaCarrier: slideXml[1].includes('<a:audioFile'), captions: slideXml[1].includes('p173:tracksInfo') && relXml.some(xml => xml.includes('/track')), transparency: slideXml[1].includes('alphaModFix amt="80000"'), volumeTiming: slideXml[1].includes('vol="42000"'), stoppedState: slideXml[1].includes('showWhenStopped') || slideXml[1].includes('endOnStopAudio') },
	{ id: 'audio-defaults', mediaCarrier: slideXml[2].includes('<a:audioFile'), noCaptionTracks: !slideXml[2].includes('p173:tracksInfo'), defaultVolume: !slideXml[2].includes('vol="42000"') },
]
const generatedChecks = {
	parameterCatalogComplete: MEDIA_FORMAT_PARAMETERS.length === 12 && MEDIA_FORMAT_PARAMETERS.every(item => item.id && item.semanticPath && item.reset),
	typeCatalogComplete: MEDIA_FORMAT_TYPES.length === 3 && MEDIA_FORMAT_SIZING_TYPES.length === 3,
	allCheckpointsPresent: slideFiles.length === checkpoints.length,
	videoFrame: Object.values(generatedRows[0]).slice(1).every(Boolean),
	audioCaptionVolume: Object.values(generatedRows[1]).slice(1).every(Boolean),
	audioDefaults: Object.values(generatedRows[2]).slice(1).every(Boolean),
}
const packageAudit = JSON.parse((await run(process.execPath, [path.join(root, 'tools', 'audit-pptx-package-integrity.mjs'), generated], { maxBuffer: 20 * 1024 * 1024 })).stdout)
const generatedPath = generated.replace(/'/g, "''"); const roundtripPath = roundtrip.replace(/'/g, "''"); const outPath = outDir.replace(/'/g, "''")
const ps = `$ErrorActionPreference='Stop';$pp=New-Object -ComObject PowerPoint.Application;$p=$null;$r=$null;try{$p=$pp.Presentations.Open2007('${generatedPath}',$true,$false,$false,$false);$p.SaveCopyAs('${roundtripPath}',24);$p.Close();$p=$null;$r=$pp.Presentations.Open2007('${roundtripPath}',$true,$false,$false,$false);$png='${outPath}\\roundtrip-slide.png';$r.Slides.Item(1).Export($png,'PNG',1600,900);$count=$r.Slides.Count;$r.Close();$r=$null;[ordered]@{status='PASS';slideCount=$count;png=$png}|ConvertTo-Json -Depth 4}finally{if($p){$p.Close()};if($r){$r.Close()};if($pp){$pp.Quit()}}`
const office = JSON.parse((await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { maxBuffer: 20 * 1024 * 1024 })).stdout.trim())
const roundtripZip = await JSZip.loadAsync(await fs.readFile(roundtrip), { checkCRC32: true })
const roundtripXml = await Promise.all(slideFiles.map(name => roundtripZip.file(name).async('string')))
const roundtripRows = [
	{ id: 'video-frame', mediaCarrier: roundtripXml[0].includes('<a:videoFile'), rounded: roundtripXml[0].includes('prst="ellipse"'), captions: !roundtripXml[0].includes('p173:tracksInfo') },
	{ id: 'audio-caption-volume', mediaCarrier: roundtripXml[1].includes('<a:audioFile'), captions: roundtripXml[1].includes('p173:tracksInfo'), volumeTiming: roundtripXml[1].includes('vol="42000"') },
	{ id: 'audio-defaults', mediaCarrier: roundtripXml[2].includes('<a:audioFile'), noCaptionTracks: !roundtripXml[2].includes('p173:tracksInfo') },
]
const roundtripRetained = { mediaCarriers: roundtripRows.every(row => row.mediaCarrier), videoRounded: roundtripRows[0].rounded, audioCaptions: roundtripRows[1].captions, audioVolume: roundtripRows[1].volumeTiming, defaultsRemainUncaptioned: roundtripRows[2].noCaptionTracks }
const failures = Object.entries(generatedChecks).filter(([, value]) => !value).map(([key]) => `generated:${key}`)
if (packageAudit.status !== 'PASS' || packageAudit.errors?.length) failures.push('generated:package-audit')
if (office.status !== 'PASS' || office.slideCount !== checkpoints.length) failures.push('office:Open2007-SaveCopyAs-reopen')
if (!Object.values(roundtripRetained).every(Boolean)) failures.push('office:retained-media-carriers')
const generatedBytes = await fs.readFile(generated); const roundtripBytes = await fs.readFile(roundtrip); const renderBytes = await fs.readFile(office.png)
const report = { schemaVersion: 'betterpptx.global-media-format-parameters.v1', status: failures.length ? 'FAIL' : 'PASS', contract: { source: 'mediaPlayback plus native MediaProps', parameterCount: MEDIA_FORMAT_PARAMETERS.length, mediaTypes: MEDIA_FORMAT_TYPES, sizingTypes: MEDIA_FORMAT_SIZING_TYPES, nativeFamilies: ['source', 'framing', 'transparency', 'rounding', 'interactivePlayback', 'volume', 'stopped-state', 'webvtt-captions'], officeBoundary: 'PowerPoint retains the native media relationships, preview geometry, timing volume, and WebVTT track carriers through Open2007/SaveCopyAs/reopen.' }, checkpoints, generated: { file: path.relative(root, generated).replaceAll('\\', '/'), bytes: generatedBytes.length, sha256: sha256(generatedBytes), rows: generatedRows, checks: generatedChecks, packageAudit }, office: { ...office, roundtripFile: path.relative(root, roundtrip).replaceAll('\\', '/'), roundtripSha256: sha256(roundtripBytes), rows: roundtripRows, retained: roundtripRetained, renderSha256: sha256(renderBytes) }, failures, interpretation: 'The media contract exposes native playback, framing, transparency, accessibility, and stopped-state controls without exposing local paths or relationship internals. Caption tracks remain native WebVTT parts and are never represented as slide text.' }
const reportPath = path.join(outDir, 'media-format-parameters-native-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
process.stdout.write(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), generatedSha256: report.generated.sha256, roundtripSha256: report.office.roundtripSha256, renderSha256: report.office.renderSha256, failures }, null, 2) + '\n'); if (failures.length) process.exitCode = 1
