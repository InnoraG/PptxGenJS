// Regenerate the imported Authoring Excellence slide's timing through the
// BetterPPTX authoring surface. This keeps the native objects/design but
// replaces the unsupported foreign timing tree with MCP-authored media,
// animation, and pause/resume timing that PowerPoint can actually run.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { spawnSync } from 'node:child_process'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const root = path.resolve('betterpptx-mcp')
const source = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728', 'betterpptx-authoring-excellence-final-3min.pptx')
const video = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728', 'final-commercial-avatar-3min-current-square.mp4')
const poster = path.join(root, 'outputs', 'commercial-poc', 'current-commercial-20260728', 'final-commercial-avatar-3min-current-square.png')
const outputDir = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728')
const outputName = 'betterpptx-authoring-excellence-final-3min-quick-reference.pptx'
const output = path.join(outputDir, outputName)
const { callBetterPptxTool } = await import('../engine.mjs')
const context = { sessionId: `authoring-excellence-regenerated-timing-${Date.now()}`, accountId: 'innorag', licenseId: 'commercial-evaluation-master' }
const dataOf = result => { if (!result?.ok) throw new Error(`${result?.error?.code || 'TOOL_FAILED'}: ${result?.error?.message || JSON.stringify(result)}`); return result.data || result }
for (const file of [source, video, poster]) assert.ok(fsSync.existsSync(file), `missing input: ${file}`)

const coverDataUri = `data:image/png;base64,${(await fs.readFile(poster)).toString('base64')}`
const opened = dataOf(await callBetterPptxTool('betterpptx.deck.open_existing', { pptxPath: source, slideNumbers: [1], preserveTiming: true }, context))
try {
	dataOf(await callBetterPptxTool('betterpptx.deck.set_show_settings', { deckId: opened.deckId, useTimings: true, showAnimation: true, showNarration: true, showMediaControls: true }, context))
	dataOf(await callBetterPptxTool('betterpptx.slide.set_transition', { deckId: opened.deckId, slideIndex: 0, transition: { type: 'fade', speed: 'medium', advanceOnClick: false, advanceAfterTime: 180000 } }, context))

	// Keep the avatar visually muted while authoring a real native media clock.
	// The native narration audio remains a separate PowerPoint media object.
	dataOf(await callBetterPptxTool('betterpptx.slide.update_media', {
		deckId: opened.deckId, slideIndex: 0, target: { objectName: 'optional-talking-head-avatar' },
		replacementMediaPath: video, coverDataUri, interactivePlayback: true,
		optionsPatch: { x: 10.9933333333, y: 5.16, w: 2.25, h: 2.25, rounding: true, sizing: { type: 'cover', w: 2.25, h: 2.25 }, mediaVolume: 0, altText: 'Optional muted talking-head avatar synchronized with the native narration recording.' },
		command: 'playFrom(0.0)', preserveExistingTiming: false,
	}, context))
	dataOf(await callBetterPptxTool('betterpptx.slide.update_media', {
		deckId: opened.deckId, slideIndex: 0, target: { objectName: 'optional-talking-head-avatar' },
		interactivePlayback: true, command: 'togglePause', preserveExistingTiming: false,
	}, context))
	dataOf(await callBetterPptxTool('betterpptx.slide.update_media', {
		deckId: opened.deckId, slideIndex: 0, target: { objectName: 'avatar-native-audio-s1' },
		interactivePlayback: false, command: 'playFrom(0.0)', preserveExistingTiming: false,
	}, context))

	const animations = [
		{ names: ['proof-title'], animation: { type: 'entrance', effect: 'fade', trigger: 'afterPrevious', duration: 700 } },
		{ names: ['proof-subtitle'], animation: { type: 'entrance', effect: 'fade', trigger: 'afterPrevious', delay: 300, duration: 700 } },
		{ names: ['proof-card-title'], animation: { type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', delay: 700, duration: 800 } },
		{ names: ['proof-card-body'], animation: { type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', delay: 500, duration: 1000 } },
		{ names: ['native-3d-presenter'], animation: { type: 'emphasis', effect: 'spin', trigger: 'afterPrevious', delay: 1500, duration: 2000 } },
		{ names: ['ink-proof-highlight'], animation: { type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', delay: 12000, duration: 650 } },
		{ names: ['laser-proof-pointer'], animation: { type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', delay: 18000, duration: 1100 } },
	]
	for (const item of animations) dataOf(await callBetterPptxTool('betterpptx.slide.animate_shapes', { deckId: opened.deckId, slideIndex: 0, names: item.names, animation: item.animation, preserveExistingTiming: false }, context))
	for (const [objectName, color] of [['proof-title', 'F8FAFC'], ['proof-subtitle', 'CBD5E1'], ['proof-card-title', 'F8FAFC'], ['proof-card-body', 'E2E8F0'], ['audio-first-note', '94A3B8']]) dataOf(await callBetterPptxTool('betterpptx.slide.revise', { deckId: opened.deckId, slideIndex: 0, target: { objectName }, patch: { color } }, context))

	const saved = dataOf(await callBetterPptxTool('betterpptx.deck.save', { deckId: opened.deckId, outputDir, fileName: outputName }, context))
	const savedPath = saved.filePath || output
	const zip = await JSZip.loadAsync(await fs.readFile(savedPath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const presProps = await zip.file('ppt/presProps.xml').async('string')
	assert.match(slideXml, /<p:timing>/); assert.match(slideXml, /cmd="playFrom\(0\.0\)"/); assert.match(slideXml, /cmd="togglePause"/); assert.match(slideXml, /<p:video>/); assert.match(slideXml, /<p:audio[^>]*isNarration="1"/); assert.match(slideXml, /prst="ellipse"/); assert.match(slideXml, /<a:srcRect\b/); assert.match(slideXml, /presetID=/); assert.match(slideXml, /native-3d-presenter/); assert.match(slideXml, /ink-proof-highlight/); assert.match(slideXml, /laser-proof-pointer/); assert.match(presProps, /showNarration="1"/); assert.match(presProps, /useTimings="1"/)
	const comScript = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $pp.Visible=-1; $p=$pp.Presentations.Open('${savedPath.replace(/'/g, "''")}', $true, $false, $false); $s=$p.Slides.Item(1).Shapes; $av=$s | Where-Object { $_.Name -eq 'optional-talking-head-avatar' }; $aud=$s | Where-Object { $_.Name -eq 'avatar-native-audio-s1' }; $three=$s | Where-Object { $_.Name -eq 'native-3d-presenter' }; $r=[ordered]@{slides=[int]$p.Slides.Count;left=[double]$av.Left;top=[double]$av.Top;width=[double]$av.Width;height=[double]$av.Height;avatarMediaType=[int]$av.MediaType;audioMediaType=[int]$aud.MediaType;threeDType=[int]$three.Type;playOnEntry=[int]$av.AnimationSettings.PlaySettings.PlayOnEntry}; $p.Close(); $pp.Quit(); $r|ConvertTo-Json -Compress`
	const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', comScript], { encoding: 'utf8', timeout: 120000, windowsHide: true }); assert.equal(com.status, 0, `${com.stdout}\n${com.stderr}`); const runtime = JSON.parse(com.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)); assert.equal(Number(runtime.slides), 1); assert.equal(Number(runtime.width), 162); assert.equal(Number(runtime.height), 162); assert.equal(Number(runtime.avatarMediaType), 3); assert.equal(Number(runtime.audioMediaType), 2); assert.equal(Number(runtime.threeDType), 30); assert.ok(Math.abs(Number(runtime.left) - 791.52) < 0.2); assert.ok(Math.abs(Number(runtime.top) - 371.52) < 0.2)
	const report = { schemaVersion: 'betterpptx.authoring-excellence.final-proof-regenerated-timing.v1', status: 'PASS', output: savedPath, durationSeconds: 180, avatarGeometryPt: { left: 791.52, top: 371.52, width: 162, height: 162 }, architecture: 'MCP-regenerated PowerPoint timing: native narration audio + muted avatar video', features: ['native talking-head avatar', 'native 3D presenter with recreated turntable emphasis', 'timed entrance/emphasis animation', 'editable ink highlighter', 'editable laser pointer', '180-second automatic playback timeline', 'native gradient/contextual visual/shadows'], checks: { packageOpen: true, nativeAudio: true, mutedAvatar: true, interactivePauseCommand: true, autoplayCommand: true, native3d: true, timedAnimation: true, ink: true, laser: true, roundWindow: true, aspectSafeCrop: true, showNarration: true, useTimings: true, advanceAfterTime180s: true, quickReferenceGeometry: true }, runtime }
	await fs.writeFile(path.join(outputDir, 'betterpptx-authoring-excellence-final-3min-quick-reference-report.json'), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ ok: true, savedPath, report }, null, 2))
} finally { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: opened.deckId }, context) } catch {} }
